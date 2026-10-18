import {ApplicationAudioContext,PreviewOwner,type PreviewReceipt} from '../../src/audio/transport';
import {Waveform,type StaticRenderOptions} from '../../src/audio/synth';
import {cardIntervalPreviewRequest,renderCardPreview} from '../../src/features/playback/card-preview';

type Segment={frames:number;peak:number;d:number;c:number;dt:number;ct:number;unrelated:number};
type SourceProof={frames:number;rate:number;scheduled:number;stops:number;segments:Segment[];graphPeaks:number[]};
const sources:AudioBufferSourceNode[]=[],items:SourceProof[]=[],receipts:PreviewReceipt[]=[],lifecycle:{type:string;trusted:boolean}[]=[];
const held:{options:StaticRenderOptions;resolve:(value:Int16Array|null)=>void}[]=[];
let context:AudioContext|undefined,analyser:AnalyserNode|undefined,contexts=0,resumes=0,closes=0,serial=0,hold=false;
const hz=(midi:number)=>440*2**((midi-69)/12);
function energy(samples:Float32Array,rate:number,frequency:number){let re=0,im=0;for(let i=0;i<samples.length;i++){const phase=2*Math.PI*frequency*i/rate;re+=samples[i]*Math.cos(phase);im+=samples[i]*Math.sin(phase);}return 2*Math.hypot(re,im)/samples.length;}
function segments(buffer:AudioBuffer):Segment[]{
 const all=buffer.getChannelData(0),size=Math.trunc(buffer.sampleRate*.45),result:Segment[]=[];
 for(let start=0;start<all.length;start+=size){const samples=all.slice(start+2000,Math.min(start+4048,all.length));let peak=0;for(const x of samples)peak=Math.max(peak,Math.abs(x));result.push({frames:Math.min(size,all.length-start),peak,d:energy(samples,buffer.sampleRate,hz(62)),c:energy(samples,buffer.sampleRate,hz(60)),dt:energy(samples,buffer.sampleRate,hz(74)),ct:energy(samples,buffer.sampleRate,hz(72)),unrelated:energy(samples,buffer.sampleRate,hz(76))});}
 return result;
}
const shared=new ApplicationAudioContext({createContext:()=>{
 const rate=Number(new URLSearchParams(location.search).get('rate'));context=new AudioContext({sampleRate:rate});contexts++;
 analyser=context.createAnalyser();analyser.fftSize=2048;
 const makeGain=context.createGain.bind(context),makeSource=context.createBufferSource.bind(context),resume=context.resume.bind(context),close=context.close.bind(context);
 context.resume=()=>{resumes++;return resume();};context.close=()=>{closes++;return close();};
 context.createGain=()=>{const gain=makeGain();gain.connect(analyser!);return gain;};
 context.createBufferSource=()=>{
  const source=makeSource(),start=source.start.bind(source),stop=source.stop.bind(source);sources.push(source);let item:SourceProof|undefined;
  source.start=(when=0,offset=0,duration?:number)=>{const buffer=source.buffer!;item={frames:buffer.length,rate:buffer.sampleRate,scheduled:when||context!.currentTime,stops:0,segments:segments(buffer),graphPeaks:[0,0,0]};items.push(item);if(duration===undefined)start(when,offset);else start(when,offset,duration);};
  source.stop=(when=0)=>{if(item)item.stops++;stop(when);};return source;
 };
 return context;
}});
const interval=new PreviewOwner({contextOwner:shared,onReceipt:r=>receipts.push(r),render:options=>hold?(hold=false,new Promise(resolve=>held.push({options,resolve}))):renderCardPreview(options)});
const normal=new PreviewOwner({contextOwner:shared,onReceipt:r=>receipts.push(r)});
const timer=setInterval(()=>{
 if(!context||!analyser)return;const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);let peak=0;for(const sample of samples)peak=Math.max(peak,Math.abs(sample));
 for(const item of items){const elapsed=context.currentTime-item.scheduled,index=Math.floor(elapsed/.45),within=elapsed-index*.45;if(index>=0&&index<3&&within>.07&&within<.38)item.graphPeaks[index]=Math.max(item.graphPeaks[index],peak);}
},16);
function playInterval(unison=false,transpose=0,prefix='interval'){normal.stop();void interval.play(prefix+'-'+(++serial),cardIntervalPreviewRequest({previousAudioNote:62,currentAudioNote:unison?62:60,transpose,waveform:Waveform.SINE}));}
document.querySelector('#interval')!.addEventListener('click',()=>playInterval());
document.querySelector('#unison')!.addEventListener('click',()=>playInterval(true));
document.querySelector('#transpose')!.addEventListener('click',()=>playInterval(false,12,'transposed'));
document.querySelector('#held')!.addEventListener('click',()=>{hold=true;playInterval(false,0,'held');});
document.querySelector('#static')!.addEventListener('click',()=>{const target=interval.getSnapshot().phase==='released'?normal:interval;void target.play('static-'+(++serial),{freqs:[hz(62)],durationMs:3000,waveform:Waveform.SINE});});
document.querySelector('#stop')!.addEventListener('click',()=>{interval.stop();normal.stop();});
document.querySelector('#release-interval')!.addEventListener('click',()=>{void interval.release();});
document.querySelector('#suspend')!.addEventListener('click',()=>{void context?.suspend();});
document.querySelector('#release')!.addEventListener('click',()=>{void shared.release();});
for(const type of ['pagehide','blur'])window.addEventListener(type,event=>lifecycle.push({type,trusted:event.isTrusted}));
interval.subscribe(()=>{document.querySelector('output')!.textContent=interval.getSnapshot().phase;});
function snapshot(){return {application:shared.getSnapshot(),interval:interval.getSnapshot(),normal:normal.getSnapshot(),contexts,resumes,closes,rate:context?.sampleRate??null,time:context?.currentTime??0,contextState:context?.state??null,retained:sources.filter(s=>s.buffer!==null).length,sourceCount:sources.length,items:items.map(item=>({...item,segments:[...item.segments],graphPeaks:[...item.graphPeaks]})),receipts:[...receipts],held:held.length,lifecycle:[...lifecycle]};}
const proof={snapshot,resolveHeld:()=>{for(const job of held.splice(0))job.resolve(renderCardPreview({...job.options,shouldAbort:()=>false}));},release:async()=>{clearInterval(timer);await interval.release();await normal.release();await shared.release();}};
declare global{interface Window{intervalAudioProof:typeof proof}}
window.intervalAudioProof=proof;
window.addEventListener('pagehide',()=>sessionStorage.setItem('intervalAudioDeparture',JSON.stringify(snapshot())));
