import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaybackTransport } from './playback-transport';
import { PlaybackIntentKernel } from './playback-intent';
import { PlaybackAudioLayer, PlaybackChordMode, Waveform } from '../synth';
import type { PlaybackConfig, PlaybackTimeline } from '../synth';
import type { ApplicationAudioContextOwner, ApplicationAudioState, AudioContextInvalidationReason } from './contracts';
import type { PlaybackWorkerClient, PlaybackWorkerOperation, PlaybackWorkerSuccess } from './worker-contracts';
import type { AudioPcmQueueSink, PcmSinkPcm, PcmSinkRun, PcmSinkReading } from './sink-contracts';
import { PcmSinkError } from './sink-contracts';

const config:PlaybackConfig={bpm:60,transpose:0,waveform:Waveform.SINE,chordMode:PlaybackChordMode.FULL,melodyGain:1,chordGain:1};
const timeline:PlaybackTimeline={startBeat:1,endBeat:5,events:[{id:1,startBeat:1,endBeat:5,layer:PlaybackAudioLayer.MELODY,fullMidiNotes:[60]}]};
class Worker implements PlaybackWorkerClient {
  operations:PlaybackWorkerOperation[]=[]; released=false; defer=false; active=0; maxActive=0;
  pending:{resolve:(value:PlaybackWorkerSuccess)=>void;reject:(error:Error)=>void;operation:PlaybackWorkerOperation;revision:number}|null=null;
  private timeline=timeline; private config=config; private rate=1000; private beat=1; private id=0;
  execute(operation:PlaybackWorkerOperation,revision:number):Promise<PlaybackWorkerSuccess> {
    this.operations.push(operation); this.active++; this.maxActive=Math.max(this.active,this.maxActive);
    const promise=new Promise<PlaybackWorkerSuccess>((resolve,reject)=>{
      if(operation.kind==='render' && this.defer) this.pending={resolve,reject,operation,revision};
      else resolve(this.calculate(operation,revision));
    });
    return promise.finally(()=>{this.active--;});
  }
  reply():void { const pending=this.pending!; this.pending=null; pending.resolve(this.calculate(pending.operation,pending.revision)); }
  fail():void {const pending=this.pending!;this.pending=null;pending.reject(new Error('fatal worker failure'));}
  release():void {this.released=true;}
  private calculate(operation:PlaybackWorkerOperation,revision:number):PlaybackWorkerSuccess {
    let startBeat=this.beat;
    if(operation.kind==='load') {this.timeline=operation.timeline;this.config=operation.config;this.rate=operation.sampleRate;this.beat=this.timeline.startBeat??1;}
    if(operation.kind==='seek') this.beat=Math.max(this.timeline.startBeat??1,Math.min(this.timeline.endBeat,operation.beat));
    if(operation.kind==='configure') this.config=operation.config;
    if(operation.kind==='render') {
      startBeat=this.beat;
      this.beat+=operation.frameCount*Math.max(0,this.config.bpm)/(60*this.rate);
      if(this.timeline.completionKey!=null) this.beat=Math.min(this.timeline.endBeat,this.beat);
      else {const start=this.timeline.startBeat??1;this.beat=start+(this.beat-start)%(this.timeline.endBeat-start);}
    }
    const position={sampleRate:this.rate,beat:this.beat,beatsPerFrame:Math.max(0,this.config.bpm)/(60*this.rate),
      finished:this.timeline.completionKey!=null && this.beat>=this.timeline.endBeat};
    const identity={version:1 as const,ok:true as const,requestId:++this.id,revision,position};
    return operation.kind==='render' ? {...identity,kind:'pcm',startBeat,pcm:new Int16Array(operation.frameCount).fill(100)} : {...identity,kind:'ack'};
  }
}
class Sink implements AudioPcmQueueSink {
  token:PcmSinkRun|null=null; phase:'idle'|'priming'|'scheduled'='idle'; queued=0;beat=1;full=false;released=false;
  batches:PcmSinkPcm[]=[]; starts:number[]=[]; readHook:(()=>void)|undefined;
  private window=timeline; private generation=0;
  begin(revision:number,window:PlaybackTimeline,anchor=window.startBeat??1):PcmSinkRun {
    this.window=window;this.beat=anchor;this.starts.push(anchor);this.phase='priming';
    return this.token={generation:++this.generation,revision,epoch:0,sampleRate:1000};
  }
  enqueue(token:PcmSinkRun,batch:PcmSinkPcm,final=false):void {
    if(this.full) throw new PcmSinkError('QUEUE_FULL','held');
    if(token!==this.token) throw new PcmSinkError('STALE_RUN','stale');
    this.batches.push(batch);this.queued+=batch.pcm.length;
    if(this.queued>=80||final)this.phase='scheduled';
  }
  read():PcmSinkReading {
    this.readHook?.();
    return {run:this.token,phase:this.released?'released':this.phase,clock:this.token?'context-render':null,
      playedFrame:this.token?0:null,beat:this.token?this.beat:null,queuedFrames:this.queued,sources:this.queued?1:0,mappings:this.queued?1:0,
      queueDrained:this.phase==='scheduled' && this.queued===0};
  }
  drain():void {this.queued=0;this.beat=this.window.endBeat;}
  flush():void {this.token=null;this.queued=0;this.phase='idle';}
  release():void {this.released=true;this.flush();}
}
function setup(input=timeline) {
  vi.useFakeTimers();
  let state:ApplicationAudioState={epoch:0,phase:'idle',sampleRate:null,canRender:false};
  const listeners=new Set<(reason:AudioContextInvalidationReason)=>void>();
  const context={state:'running',sampleRate:1000} as AudioContext;
  let resumeResolve:(()=>void)|undefined;
  const owner:ApplicationAudioContextOwner={
    getSnapshot:()=>state,getContext:()=>context,
    resumeFromGesture:vi.fn(()=>{state={...state,phase:'ready',sampleRate:1000,canRender:true};return Promise.resolve(context);}),
    subscribeInvalidation:listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
    release:vi.fn(async()=>{}),
  };
  const clients:Worker[]=[],sink=new Sink();
  const transport=new PlaybackTransport({initialConfig:config,contextOwner:owner,createWorkerClient:()=>{const worker=new Worker();clients.push(worker);return worker;},createSink:()=>sink});
  transport.load(input,false);
  return {transport,owner,clients,sink,listeners,allow(){state={...state,phase:'ready',sampleRate:1000,canRender:true};},
    invalidate(){state={...state,epoch:state.epoch+1,phase:'suspended',canRender:false};for(const listener of [...listeners])listener('lifecycle');},
    deferResume(){owner.resumeFromGesture=vi.fn(()=>new Promise<AudioContext>(resolve=>{resumeResolve=()=>{state={...state,phase:'ready',sampleRate:1000,canRender:true};resolve(context);};}));},
    resolveResume(){resumeResolve!();},
  };
}
const advance=async(ms=10)=>{await vi.advanceTimersByTimeAsync(ms);};
afterEach(()=>{vi.clearAllTimers();vi.restoreAllMocks();vi.useRealTimers();});
describe('bounded playback coordinator',()=>{
  it('creates nothing for paused load, resumes synchronously, pumps one command and publishes selected played beat',async()=>{
    const s=setup();expect(s.clients).toHaveLength(0);expect(s.owner.resumeFromGesture).not.toHaveBeenCalled();
    s.transport.playFromGesture();expect(s.owner.resumeFromGesture).toHaveBeenCalledTimes(1);
    expect(s.transport.getSnapshot().playbackRequested).toBe(true);await advance(50);
    expect(s.clients).toHaveLength(1);expect(s.clients[0].maxActive).toBe(1);
    expect(s.clients[0].operations.slice(0,3).map(x=>x.kind)).toEqual(['load','seek','render']);
    expect(s.sink.batches[0].pcm).toHaveLength(256);expect(s.transport.getSnapshot().beat).toBe(1);
    s.sink.beat=2.25;await advance();expect(s.transport.getSnapshot().beat).toBe(2.25);
    expect(s.transport.pauseForScrub()).toBe(true);expect(s.transport.getSnapshot()).toMatchObject({phase:'paused',beat:2.25,playbackRequested:false});
    expect(s.clients[0].released).toBe(true);expect(vi.getTimerCount()).toBe(0);s.transport.release();
  });
  it('preserves client/queued PCM on positive config and compatible play; config follows computed batch',async()=>{
    const s=setup();s.transport.playFromGesture();await advance(20);const worker=s.clients[0];worker.defer=true;await advance();
    s.transport.updateConfig({...config,bpm:90,melodyGain:.25});const revision=s.transport.getSnapshot().transportRevision;
    s.transport.playFromGesture();worker.reply();await advance(20);
    expect(s.clients).toHaveLength(1);expect(worker.released).toBe(false);expect(s.sink.batches).toHaveLength(1);
    expect(worker.operations.at(-1)?.kind).toBe('configure');
    expect(s.transport.getSnapshot().transportRevision).toBe(revision+1);s.transport.release();
  });
  it('reconciles play queued behind a finishing render before adopting stale final PCM',async()=>{
    const s=setup({...timeline,endBeat:1.08,completionKey:'once'});s.transport.playFromGesture();await advance(20);
    s.clients[0].defer=true;await advance();s.transport.playFromGesture();s.clients[0].reply();await advance(20);
    expect(s.clients[0].released).toBe(true);expect(s.clients).toHaveLength(2);expect(s.sink.batches).toHaveLength(0);
    expect(s.transport.getSnapshot().beat).toBe(1);s.transport.release();
  });
  it('zero BPM reanchors/keeps requested and positive restore creates fresh load+seek without resume',async()=>{
    const s=setup();s.transport.playFromGesture();await advance(50);s.sink.beat=2.25;
    const revision=s.transport.getSnapshot().transportRevision;s.transport.updateConfig({...config,bpm:0});
    expect(s.transport.getSnapshot()).toMatchObject({beat:2.25,phase:'paused',playbackRequested:true,transportRevision:revision});
    expect(vi.getTimerCount()).toBe(0);s.transport.updateConfig({...config,bpm:80});await advance(30);
    expect(s.clients).toHaveLength(2);expect(s.sink.starts.at(-1)).toBe(2.25);
    expect(s.owner.resumeFromGesture).toHaveBeenCalledTimes(1);s.transport.release();
  });
  it('cancels held resume/lifecycle and keeps immediate silent seek target against late promises',async()=>{
    const s=setup();s.deferResume();s.transport.playFromGesture();s.transport.seek(2.25,false);s.invalidate();s.resolveResume();await advance(100);
    expect(s.clients).toHaveLength(0);expect(s.transport.getSnapshot()).toMatchObject({phase:'paused',beat:2.25,playbackRequested:false});
    expect(vi.getTimerCount()).toBe(0);s.transport.release();
  });
  it('holds exactly one QUEUE_FULL batch and completes only after current final tail drains',async()=>{
    const s=setup({...timeline,endBeat:1.08,completionKey:'once'});s.sink.full=true;s.transport.playFromGesture();await advance(100);
    expect(s.transport.getSnapshot()).toMatchObject({renderEnded:true,completion:null,playbackRequested:true});
    expect(s.clients[0].operations.filter(x=>x.kind==='render')).toHaveLength(1);expect(s.sink.batches).toHaveLength(0);
    s.sink.full=false;await advance();expect(s.sink.batches).toHaveLength(1);
    expect(s.transport.getSnapshot().completion).toBeNull();s.sink.drain();await advance();
    const receipt=s.transport.getSnapshot().completion!;
    expect(s.transport.getSnapshot()).toMatchObject({phase:'completed',beat:1.08,playbackRequested:false});
    expect(s.transport.isCurrentCompletion(receipt)).toBe(true);expect(vi.getTimerCount()).toBe(0);
    s.transport.pause();expect(s.transport.isCurrentCompletion(receipt)).toBe(false);s.transport.release();
  });
  it('snapshots original known getters/arrays once, ignores hostile iterators and preserves nested newer commands',()=>{
    const s=setup(),notes=[60],events=[{...timeline.events[0],fullMidiNotes:notes}];let reads=0;
    Object.defineProperty(notes,Symbol.iterator,{get(){throw new Error('must not use caller iterator');}});
    const input={...timeline,events,get endBeat(){reads++;return 5;}};
    s.transport.load(input,false);expect(reads).toBe(1);notes[0]=90;
    const nested={...timeline,get endBeat(){s.transport.seek(3,false);return 5;}};
    expect(()=>s.transport.load(nested,true)).toThrow();expect(s.transport.getSnapshot().beat).toBe(3);s.transport.release();
  });
  it('isolates subscriber failures/reentrancy and prevents sink-read hooks overwriting newer targets',async()=>{
    const s=setup();s.transport.subscribe(()=>{throw new Error('subscriber');});
    const off=s.transport.subscribe(()=>{if(s.transport.getSnapshot().playbackRequested)s.transport.seek(2,false);});
    s.transport.playFromGesture();await advance(50);expect(s.clients).toHaveLength(0);expect(s.transport.getSnapshot().beat).toBe(2);off();
    s.transport.playFromGesture();await advance(50);
    s.sink.readHook=()=>{s.sink.readHook=undefined;s.transport.seek(3,false);};
    expect(()=>s.transport.pause()).toThrow();expect(s.transport.getSnapshot().beat).toBe(3);s.transport.release();
  });
  it('fails a posted worker permanently; new explicit play loads/seeks a fresh client, release borrows context',async()=>{
    const s=setup();s.transport.playFromGesture();await advance(20);s.clients[0].defer=true;await advance();s.clients[0].fail();await advance();
    expect(s.transport.getSnapshot()).toMatchObject({phase:'error',playbackRequested:false});expect(s.clients[0].released).toBe(true);
    s.transport.playFromGesture();await advance(50);expect(s.clients).toHaveLength(2);
    expect(s.clients[1].operations.slice(0,2).map(x=>x.kind)).toEqual(['load','seek']);
    s.transport.release();s.transport.release();expect(s.sink.released).toBe(true);expect(s.listeners.size).toBe(0);
    expect(s.owner.release).not.toHaveBeenCalled();expect(s.transport.getSnapshot().phase).toBe('released');expect(vi.getTimerCount()).toBe(0);
    expect(()=>s.transport.reset()).toThrow();
  });

  it('coalesces positive config while an existing explicit gesture is pending without implicit resume',async()=>{
    const s=setup();s.deferResume();s.transport.playFromGesture();
    s.transport.updateConfig({...config,bpm:80});s.transport.updateConfig({...config,bpm:90});
    expect(s.transport.getSnapshot()).toMatchObject({playbackRequested:true,bpm:90,phase:'buffering'});
    expect(s.owner.resumeFromGesture).toHaveBeenCalledTimes(1);expect(s.clients).toHaveLength(0);
    s.resolveResume();await advance(50);
    const loaded=s.clients[0].operations.find(operation=>operation.kind==='load');
    expect(loaded?.kind==='load' && loaded.config.bpm).toBe(90);
    expect(s.transport.getSnapshot().playbackRequested).toBe(true);s.transport.release();
  });
  it.each(['error','newer','released'] as const)('catches resume continuation errors while preserving%s state',async mode=>{
    const s=setup();s.deferResume();s.transport.playFromGesture();
    const get=s.owner.getSnapshot;
    s.owner.getSnapshot=vi.fn(get).mockImplementationOnce(()=>{
      if(mode==='newer')s.transport.seek(3,false);
      if(mode==='released')s.transport.release();
      throw new Error('owner snapshot threw');
    });
    s.resolveResume();await advance(20);
    if(mode==='error')expect(s.transport.getSnapshot()).toMatchObject({phase:'error',playbackRequested:false,error:'owner snapshot threw'});
    if(mode==='newer')expect(s.transport.getSnapshot()).toMatchObject({phase:'paused',beat:3,playbackRequested:false});
    if(mode==='released')expect(s.transport.getSnapshot().phase).toBe('released');
    expect(s.clients).toHaveLength(0);expect(vi.getTimerCount()).toBe(0);s.transport.release();
  });
  it('reconciles compatible play before adopting an already computed held PCM batch',async()=>{
    const s=setup();s.sink.full=true;s.transport.playFromGesture();await advance(50);
    expect(s.sink.batches).toHaveLength(0);
    const order:string[]=[];
    const original=PlaybackIntentKernel.prototype.observePlayReady;
    vi.spyOn(PlaybackIntentKernel.prototype,'observePlayReady').mockImplementation(function(this:PlaybackIntentKernel,guard,finished){
      order.push('ready');return original.call(this,guard,finished);
    });
    const enqueue=s.sink.enqueue.bind(s.sink);
    vi.spyOn(s.sink,'enqueue').mockImplementation((...args)=>{order.push('enqueue');enqueue(...args);});
    s.transport.playFromGesture();s.sink.full=false;await advance();
    expect(order.slice(0,2)).toEqual(['ready','enqueue']);expect(s.clients).toHaveLength(1);s.transport.release();
  });

});
