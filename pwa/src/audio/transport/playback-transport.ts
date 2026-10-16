import { STREAM_LIMITS } from '../synth';
import type { PlaybackConfig, PlaybackTimeline, PlaybackTimelineEvent } from '../synth';
import { getApplicationAudioContextOwner } from './application-audio-context';
import type { ApplicationAudioContextOwner } from './contracts';
import { PlaybackIntentKernel } from './playback-intent';
import type { PlaybackIntentGuard } from './intent-contracts';
import { PcmWorkerClient } from './pcm-worker-client';
import { snapshotWorkerOperation } from './pcm-worker-session';
import type { PlaybackWorkerClient, PlaybackWorkerOperation, PlaybackWorkerSuccess } from './worker-contracts';
import { PcmQueueSink } from './pcm-queue-sink';
import { PcmSinkError } from './sink-contracts';
import type { AudioPcmQueueSink, PcmSinkRun, PcmSinkPcm, PcmSinkClock } from './sink-contracts';
import { PLAYBACK_TRANSPORT_LIMITS as LIMITS } from './transport-contracts';
import type { AudioPlaybackTransport, PlaybackTransportOptions, PlaybackTransportState } from './transport-contracts';

function configCopy(input: PlaybackConfig): PlaybackConfig {
  const { bpm, transpose, waveform, chordMode, melodyGain, chordGain, arpeggiateCycles } = input;
  const operation = snapshotWorkerOperation({ kind:'configure',config:{ bpm,transpose,waveform,chordMode,melodyGain,chordGain,arpeggiateCycles } });
  if (operation.kind!=='configure') throw new RangeError('Invalid config');
  return operation.config;
}
function timelineCopy(input: PlaybackTimeline, config: PlaybackConfig): PlaybackTimeline {
  const { startBeat,endBeat,completionKey,events:callerEvents }=input;
  if (!Array.isArray(callerEvents)) throw new RangeError('Invalid events');
  const length=callerEvents.length;
  if (!Number.isInteger(length) || length<0 || length>STREAM_LIMITS.events) throw new RangeError('Event limit');
  const events: PlaybackTimelineEvent[]=[];
  for (let i=0;i<length;i++) {
    const { id,startBeat,endBeat,layer,fullMidiNotes:callerNotes,rootMidiNote }=callerEvents[i];
    if (!Array.isArray(callerNotes)) throw new RangeError('Invalid notes');
    const count=callerNotes.length;
    if (!Number.isInteger(count) || count<0 || count>STREAM_LIMITS.notesPerEvent) throw new RangeError('Note limit');
    const fullMidiNotes:number[]=[];
    for (let n=0;n<count;n++) fullMidiNotes.push(callerNotes[n]);
    events.push({ id,startBeat,endBeat,layer,fullMidiNotes,rootMidiNote });
  }
  // Structural helper only; the actual renderer rate is supplied after gesture permission.
  const operation=snapshotWorkerOperation({ kind:'load',sampleRate:1000,timeline:{startBeat,endBeat,completionKey,events},config });
  if (operation.kind!=='load') throw new RangeError('Invalid timeline');
  return operation.timeline;
}
interface AudioRun {
  readonly id:number; readonly epoch:number; readonly rate:number; readonly client:PlaybackWorkerClient;
  readonly sinkRun:PcmSinkRun; readonly anchor:number;
  clock:PcmSinkClock|null; loaded:boolean; positioned:boolean; pending:PlaybackWorkerOperation['kind']|null;
  applied:PlaybackConfig|null; held:PcmSinkPcm|null; finished:boolean; finalEnqueued:boolean;
}

/** Bounded orchestration only. Native public intent is separate from audio run identity. */
export class PlaybackTransport implements AudioPlaybackTransport {
  private readonly owner:ApplicationAudioContextOwner;
  private readonly kernel:PlaybackIntentKernel;
  private readonly unsubscribe:()=>void;
  private readonly workerFactory:()=>PlaybackWorkerClient;
  private readonly sinkFactory:(owner:ApplicationAudioContextOwner)=>AudioPcmQueueSink;
  private config:PlaybackConfig;
  private timeline:PlaybackTimeline|null=null;
  private sink:AudioPcmQueueSink|null=null;
  private run:AudioRun|null=null;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private state:PlaybackTransportState;
  private readonly listeners=new Set<()=>void>();
  private serial=0;
  private generation=0;
  private gesture=0;
  private pendingPlay=false;
  private resuming:number|null=null;
  private released=false;
  private blocked=false;
  constructor(options:PlaybackTransportOptions) {
    this.config=configCopy(options.initialConfig);
    this.kernel=new PlaybackIntentKernel(this.config.bpm);
    this.owner=options.contextOwner ?? getApplicationAudioContextOwner();
    this.workerFactory=options.createWorkerClient ?? (()=>new PcmWorkerClient());
    this.sinkFactory=options.createSink ?? (owner=>new PcmQueueSink({contextOwner:owner}));
    this.state=Object.freeze({...this.kernel.getSnapshot(),clock:null});
    this.unsubscribe=this.owner.subscribeInvalidation(()=>this.invalidated());
  }
  getSnapshot=():PlaybackTransportState=>this.state;
  subscribe(listener:()=>void):()=>void {
    if (this.released) return ()=>{};
    this.listeners.add(listener); return ()=>{this.listeners.delete(listener);};
  }
  load(input:PlaybackTimeline,continuePlaying:boolean):void {
    const serial=this.check(), timeline=timelineCopy(input,this.config);
    this.unchanged(serial);
    this.kernel.load(timeline,continuePlaying); this.timeline=timeline;
    this.semantic(); this.continueIfAllowed();
  }
  playFromGesture():void {
    const previous=this.check(); this.capturePlayed(); this.unchanged(previous);
    const before=this.kernel.getSnapshot();
    this.kernel.play(); this.pendingPlay=true;
    const restart=before.renderEnded || before.phase==='completed' || this.kernel.getSnapshot().beat!==before.beat;
    ++this.serial; const gesture=++this.gesture; this.resuming=gesture;
    this.blocked=false;
    if (restart) this.stopAudio();
    this.publish();
    if (this.released || gesture!==this.gesture) return;
    let resumed:Promise<AudioContext>;
    try { resumed=this.owner.resumeFromGesture(); }
    catch { if(gesture===this.gesture && !this.released){this.resuming=null;this.fail(null,'Audio gesture blocked',true);} return; }
    void Promise.resolve(resumed).then(()=>{
      if (this.released || gesture!==this.gesture || !this.kernel.getSnapshot().playbackRequested) return;
      this.resuming=null; this.continueIfAllowed();
    },()=>{
      if (!this.released && gesture===this.gesture) {this.resuming=null;this.fail(null,'Audio gesture blocked',true);}
    }).catch(error=>{
      if(!this.released && gesture===this.gesture) {this.resuming=null;this.fail(null,error instanceof Error?error.message:'Audio resume failed');}
    });
  }
  pause():void { const serial=this.check(); this.capturePlayed(); this.unchanged(serial); this.kernel.pause(); this.semantic(); }
  pauseForScrub():boolean {
    const serial=this.check(); this.capturePlayed(); this.unchanged(serial); const resume=this.kernel.pauseForScrub(); this.semantic(); return resume;
  }
  seek(beat:number,resume:boolean):void { this.check(); this.kernel.seek(beat,resume); this.semantic(); this.continueIfAllowed(); }
  reset():void { this.check(); this.kernel.reset(); this.semantic(); }
  updateConfig(input:PlaybackConfig):void {
    const serial=this.check(), config=configCopy(input);
    this.unchanged(serial);
    if (config.bpm<=0) this.capturePlayed();
    this.unchanged(serial);
    this.kernel.updateTempo(config.bpm); this.config=config; ++this.serial; this.blocked=false;
    if (this.kernel.getSnapshot().bpm<=0) { this.stopAudio(); this.publish(); }
    else { this.publish(); this.continueIfAllowed(); }
  }
  isCurrentCompletion(completion:PlaybackIntentGuard):boolean { return this.kernel.isCurrentCompletion(completion); }
  release():void {
    if (this.released) return;
    this.released=true; ++this.serial; ++this.gesture; this.pendingPlay=false; this.resuming=null;
    this.kernel.release(); this.stopAudio();
    const sink=this.sink; this.sink=null;
    try { sink?.release(); } catch { /* Permanent release survives borrower cleanup errors. */ }
    try { this.unsubscribe(); } catch { /* Already unsubscribed. */ }
    this.publish(); this.listeners.clear();
  }
  private check():number { if(this.released) throw new Error('Transport released'); return this.serial; }
  private unchanged(serial:number):void { this.check(); if(serial!==this.serial) throw new Error('Transport changed during input snapshot'); }
  private currentCommand(serial:number):boolean { return !this.released && this.serial===serial; }
  private guard():PlaybackIntentGuard {
    const state=this.kernel.getSnapshot();
    return {transportRevision:state.transportRevision,completionKey:state.window?.completionKey ?? null};
  }
  private semantic():void {
    ++this.serial; ++this.gesture; this.pendingPlay=false; this.resuming=null; this.blocked=false;
    const serial=this.serial; this.stopAudio();
    if(this.currentCommand(serial)) this.publish();
  }
  private stopAudio():void {
    clearTimeout(this.timer); this.timer=undefined;
    const run=this.run; this.run=null;
    try { this.sink?.flush(); } catch { /* Run identity was invalidated first. */ }
    try { run?.client.release(); } catch { /* Cleanup ends with only the retired client. */ }
  }
  private invalidated():void {
    if(this.released) return;
    this.kernel.pauseForLifecycle(); this.semantic();
    if(this.owner.getSnapshot().phase==='blocked') this.fail(null,'Audio permission blocked',true);
  }
  private capturePlayed():void {
    const run=this.run;
    if(!run || !this.sink) return;
    try {
      const reading=this.sink.read();
      if(this.run===run && reading.run===run.sinkRun && reading.phase==='scheduled' && reading.beat!==null)
        this.kernel.observePlayed(this.guard(),reading.beat);
    } catch { /* Lifecycle may already have invalidated the selected head. */ }
  }
  private continueIfAllowed():void {
    if(this.released) return;
    const state=this.kernel.getSnapshot();
    if(!state.playbackRequested || state.bpm<=0 || !this.timeline) return;
    if(!this.owner.getSnapshot().canRender) {
      if(this.resuming!==null) return;
      this.fail(null,'A new foreground audio gesture is required',true); return;
    }
    this.schedule();
  }
  private schedule():void {
    const state=this.kernel.getSnapshot();
    if(this.released || this.timer!==undefined || !state.playbackRequested || state.bpm<=0 || !this.timeline) return;
    this.timer=setTimeout(()=>{this.timer=undefined;this.tick();},LIMITS.pollMs);
  }
  private tick():void {
    if(this.released) return;
    let run=this.run; const tickSerial=this.serial;
    try {
      const intent=this.kernel.getSnapshot();
      if(!intent.playbackRequested || intent.bpm<=0 || !this.timeline) return;
      const permission=this.owner.getSnapshot();
      if(!run && !this.currentCommand(tickSerial)) return;
      if(!permission.canRender) {this.fail(run,'Audio permission lost',true);return;}
      if(!run) {
        const serial=this.serial, context=this.owner.getContext();
        if(!this.currentCommand(serial)) return;
        if(context.state!=='running' || context.sampleRate!==permission.sampleRate) throw new Error('Context not ready');
        if(!Number.isSafeInteger(this.generation+1)) throw new Error('Audio revision exhausted');
        if(!this.sink) {
          const sink=this.sinkFactory(this.owner);
          if(!this.currentCommand(serial)) {sink.release();return;}
          this.sink=sink;
        }
        const id=++this.generation, anchor=this.kernel.getSnapshot().beat;
        const sinkRun=this.sink.begin(id,this.timeline,anchor);
        if(!this.currentCommand(serial)) {return;}
        const client=this.workerFactory();
        if(!this.currentCommand(serial)) {client.release();return;}
        run={id,epoch:permission.epoch,rate:context.sampleRate,client,sinkRun,anchor,
          clock:null,loaded:false,positioned:false,pending:null,applied:null,held:null,finished:false,finalEnqueued:false};
        this.run=run;
      }
      if(!this.valid(run)) return;
      const reading=this.sink!.read();
      if(!this.valid(run)) return;
      run.clock=reading.clock;
      if(reading.phase==='scheduled' && reading.beat!==null) this.kernel.observePlayed(this.guard(),reading.beat);
      if(run.finalEnqueued && run.finished && reading.queueDrained && reading.beat!==null) {
        this.kernel.observeFinalDrained(this.guard(),reading.beat); this.publish(); return;
      }
      this.publish();
      if(!this.valid(run)) return;
      if(run.pending) {this.schedule();return;}
      if(run.held) {
        if(this.pendingPlay) {
          const finished=run.held.position.finished;
          this.kernel.observePlayReady(this.guard(),finished); this.pendingPlay=false;
          if(finished) {this.stopAudio();this.publish();this.schedule();return;}
        }
        try {
          this.sink!.enqueue(run.sinkRun,run.held,run.held.position.finished);
          if(!this.valid(run)) return;
          run.finalEnqueued=run.held.position.finished; run.held=null;
        } catch(error) {if(!(error instanceof PcmSinkError) || error.code!=='QUEUE_FULL') throw error;}
        this.schedule(); return;
      }
      if(!run.loaded) {this.execute(run,{kind:'load',sampleRate:run.rate,timeline:this.timeline,config:this.config});return;}
      if(!run.positioned) {this.execute(run,{kind:'seek',beat:run.anchor});return;}
      if(this.pendingPlay) {
        this.kernel.observePlayReady(this.guard(),run.finished); this.pendingPlay=false;
        if(run.finished) {this.stopAudio();this.publish();this.schedule();return;}
      }
      if(run.applied!==this.config) {this.execute(run,{kind:'configure',config:this.config});return;}
      if((!run.finished || !run.finalEnqueued) && reading.queuedFrames<Math.ceil(run.rate*LIMITS.targetMs/1000)) {
        const frameCount=Math.min(LIMITS.batchMax,Math.max(LIMITS.batchMin,Math.ceil(run.rate*LIMITS.batchMs/1000/LIMITS.batchMin)*LIMITS.batchMin));
        this.execute(run,{kind:'render',frameCount});return;
      }
      this.schedule();
    } catch(error) {if(run || this.currentCommand(tickSerial))this.fail(run,error instanceof Error ? error.message : 'Playback failed');}
  }
  private valid(run:AudioRun):boolean {
    if(this.released || this.run!==run) return false;
    const permission=this.owner.getSnapshot();
    if(this.run!==run || this.released) return false;
    if(!permission.canRender || permission.epoch!==run.epoch || permission.sampleRate!==run.rate) {
      this.fail(run,'Audio foreground epoch invalidated',true);return false;
    }
    return true;
  }
  private execute(run:AudioRun,operation:PlaybackWorkerOperation):void {
    if(!this.valid(run)) return;
    run.pending=operation.kind;
    let promise:Promise<PlaybackWorkerSuccess>;
    try {promise=run.client.execute(operation,run.id);}
    catch(error) {this.fail(run,error instanceof Error ? error.message:'Worker failed');return;}
    void Promise.resolve(promise).then(response=>{
      if(!this.valid(run)) return;
      run.pending=null; run.finished=response.position.finished;
      if(operation.kind==='load') {run.loaded=true;run.applied=operation.config;}
      if(operation.kind==='seek') run.positioned=true;
      if(operation.kind==='configure') run.applied=operation.config;
      if(response.kind==='pcm') {
        if(this.pendingPlay) {
          this.kernel.observePlayReady(this.guard(),run.finished); this.pendingPlay=false;
          if(run.finished) {this.stopAudio();this.publish();this.schedule();return;}
        }
        run.held=response;
        if(run.finished) this.kernel.observeRenderEnded(this.guard());
      }
      this.publish(); if(this.valid(run)) this.schedule();
    },error=>{
      if(this.run===run && !this.released) this.fail(run,error instanceof Error ? error.message:'Worker failed');
    }).catch(error=>{if(this.run===run && !this.released)this.fail(run,error instanceof Error?error.message:'Playback failed');});
    this.schedule();
  }
  private fail(run:AudioRun|null,message:string,blocked=false):void {
    if(this.released || run && this.run!==run) return;
    this.kernel.observeError(this.guard(),message.slice(0,1024)); this.blocked=blocked;
    const serial=++this.serial; ++this.gesture; this.pendingPlay=false; this.resuming=null;
    this.stopAudio(); if(this.currentCommand(serial)) this.publish();
  }
  private publish():void {
    const intent=this.kernel.getSnapshot();
    const clock=this.run?.clock ?? null;
    const next=Object.freeze({...intent,phase:this.blocked && intent.phase==='error' ? 'blocked' as const : intent.phase,clock});
    this.state=next;
    for(const listener of [...this.listeners]) {
      if(this.state!==next) break;
      try {listener();} catch { /* Subscribers cannot break transport cleanup. */ }
    }
  }
}
