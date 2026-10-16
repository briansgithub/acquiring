import {ApplicationAudioContext} from '../../src/audio/transport/application-audio-context';
import {PlaybackTransport} from '../../src/audio/transport/playback-transport';
import type {PlaybackTransportState} from '../../src/audio/transport/transport-contracts';
import {PlaybackAudioLayer,PlaybackChordMode,Waveform,type PlaybackConfig,type PlaybackTimeline} from '../../src/audio/synth';

const rate=Number(new URLSearchParams(location.search).get('rate'));
let context:AudioContext|undefined,analyser:AnalyserNode|undefined,contexts=0,closes=0,lastScrub:boolean|null=null;
const clockReads:{time:number|undefined;renderTime:number}[]=[];
const sources:{start:number|null;stops:number;ended:boolean}[]=[],history:PlaybackTransportState[]=[];
const owner=new ApplicationAudioContext({createContext:()=>{
  context=new AudioContext({sampleRate:rate});contexts++;
  const timestamp=context.getOutputTimestamp.bind(context);
  context.getOutputTimestamp=()=>{const value=timestamp();clockReads.push({time:value.contextTime,renderTime:context!.currentTime});if(clockReads.length>1024)clockReads.shift();return value;};
  analyser=context.createAnalyser();analyser.fftSize=2048;
  const create=context.createBufferSource.bind(context),close=context.close.bind(context);
  context.createBufferSource=()=>{
    const node=create(),record={start:null as number|null,stops:0,ended:false};sources.push(record);node.connect(analyser!);
    const start=node.start.bind(node),stop=node.stop.bind(node);
    node.start=(when=0,offset=0,duration?:number)=>{record.start=when;if(duration===undefined)start(when,offset);else start(when,offset,duration);};
    node.stop=(when=0)=>{record.stops++;stop(when);};node.addEventListener('ended',()=>{record.ended=true;});return node;
  };
  context.close=()=>{closes++;return close();};return context;
}});
let config:PlaybackConfig={bpm:120,transpose:0,waveform:Waveform.SINE,chordMode:PlaybackChordMode.FULL,melodyGain:1,chordGain:.3};
const loop:PlaybackTimeline={startBeat:1,endBeat:4,events:[{id:1,startBeat:1,endBeat:4,layer:PlaybackAudioLayer.CHORD,fullMidiNotes:[60,64,67],rootMidiNote:48}]};
const once:PlaybackTimeline={startBeat:1,endBeat:1.08,completionKey:'one-shot',events:[{id:2,startBeat:1,endBeat:1.08,layer:PlaybackAudioLayer.CHORD,fullMidiNotes:[60],rootMidiNote:60}]};
function observe(){history.push(transport.getSnapshot());if(history.length>1024)history.shift();}
let transport=new PlaybackTransport({initialConfig:config,contextOwner:owner});
let unsubscribe=transport.subscribe(observe);transport.load(loop,false);observe();
document.querySelector('#play')!.addEventListener('click',()=>transport.playFromGesture());
document.querySelector('#scrub')!.addEventListener('click',()=>{lastScrub=transport.pauseForScrub();transport.seek(2.25,false);});
document.querySelector('#seek')!.addEventListener('click',()=>transport.seek(2.5,true));
document.querySelector('#zero')!.addEventListener('click',()=>{config={...config,bpm:0};transport.updateConfig(config);});
document.querySelector('#restore')!.addEventListener('click',()=>{config={...config,bpm:120,chordGain:.2,transpose:12};transport.updateConfig(config);});
document.querySelector('#once')!.addEventListener('click',()=>transport.load(once,true));
document.querySelector('#suspend')!.addEventListener('click',()=>{void context?.suspend();});
document.querySelector('#release')!.addEventListener('click',()=>transport.release());
document.querySelector('#replace')!.addEventListener('click',()=>{
  unsubscribe();transport.release();transport=new PlaybackTransport({initialConfig:config,contextOwner:owner});
  unsubscribe=transport.subscribe(observe);transport.load(loop,false);transport.playFromGesture();
});
function snapshot(){
  let peak=0;if(analyser){const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);for(const sample of data)peak=Math.max(peak,Math.abs(sample));}
  const state=transport.getSnapshot();
  return {state,application:owner.getSnapshot(),contexts,closes,contextState:context?.state??null,contextTime:context?.currentTime??0,
    sampleRate:context?.sampleRate??null,clockReads:[...clockReads],peak,lastScrub,sources:sources.map(source=>({...source})),history:[...history],
    currentCompletion:state.completion?transport.isCurrentCompletion(state.completion):false};
}
window.addEventListener('pagehide',event=>sessionStorage.setItem('transportDeparture',JSON.stringify({trusted:event.isTrusted,...snapshot()})));
const proof={snapshot,release:async()=>{unsubscribe();transport.release();await owner.release();}};
declare global{interface Window{transportProof:typeof proof}}
window.transportProof=proof;
