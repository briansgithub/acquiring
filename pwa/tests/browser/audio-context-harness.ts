import {ApplicationAudioContext,PreviewOwner,type PreviewReceipt} from '../../src/audio/transport';
import {Waveform} from '../../src/audio/synth';

let context:AudioContext|undefined,analyser:AnalyserNode|undefined,count=0,closes=0,serial=0;
const sources:AudioBufferSourceNode[]=[],receipts:PreviewReceipt[]=[],lifecycle:{type:string;trusted:boolean}[]=[];
const shared=new ApplicationAudioContext({createContext:()=>{
  const rate=Number(new URLSearchParams(location.search).get('rate'));
  context=new AudioContext(rate?{sampleRate:rate}:undefined);count++;
  analyser=context.createAnalyser();analyser.fftSize=2048;
  const makeGain=context.createGain.bind(context),makeSource=context.createBufferSource.bind(context),close=context.close.bind(context);
  context.createGain=()=>{const gain=makeGain();gain.connect(analyser!);return gain;};
  context.createBufferSource=()=>{const source=makeSource();sources.push(source);return source;};
  context.close=()=>{closes++;return close();};
  return context;
}});
const first=new PreviewOwner({contextOwner:shared,onReceipt:r=>receipts.push(r)});
const second=new PreviewOwner({contextOwner:shared,onReceipt:r=>receipts.push(r)});
function play(owner:PreviewOwner,name:string){void owner.play(name+'-'+(++serial),{freqs:[440],durationMs:3000,waveform:Waveform.SINE,gain:.3});}
document.querySelector('#first')!.addEventListener('click',()=>play(first,'first'));
document.querySelector('#second')!.addEventListener('click',()=>play(second,'second'));
document.querySelector('#release-first')!.addEventListener('click',()=>{void first.release();});
document.querySelector('#suspend')!.addEventListener('click',()=>{void context?.suspend();});
document.querySelector('#release-app')!.addEventListener('click',()=>{void shared.release();});
for(const type of ['blur','pagehide'])window.addEventListener(type,event=>lifecycle.push({type,trusted:event.isTrusted}));
function snapshot(){
  let peak=0;
  if(analyser){const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);for(const sample of samples)peak=Math.max(peak,Math.abs(sample));}
  return {application:shared.getSnapshot(),first:first.getSnapshot(),second:second.getSnapshot(),contextCount:count,
    contextState:context?.state??null,sampleRate:context?.sampleRate??null,contextTime:context?.currentTime??0,
    closeCount:closes,sourceCount:sources.length,retained:sources.filter(source=>source.buffer!==null).length,
    peak,receipts:[...receipts],lifecycle:[...lifecycle]};
}
const proof={snapshot,release:async()=>{await first.release();await second.release();await shared.release();}};
declare global{interface Window{applicationAudioProof:typeof proof}}
window.applicationAudioProof=proof;
window.addEventListener('pagehide',()=>sessionStorage.setItem('applicationAudioDeparture',JSON.stringify(snapshot())));
