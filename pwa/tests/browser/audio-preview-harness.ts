import {PreviewOwner,type PreviewReceipt} from '../../src/audio/transport';
import {renderStaticSamples,Waveform,type StaticRenderOptions} from '../../src/audio/synth';

const receipts:PreviewReceipt[]=[],sources:AudioBufferSourceNode[]=[],renderCalls:{rate:number;framesMs:number;freqs:readonly number[]}[]=[];
const lifecycle:{type:string;trusted:boolean}[]=[];
let context:AudioContext|undefined,analyser:AnalyserNode|undefined,contextCount=0,serial=0;
const delayed:{resolve:(value:Int16Array|null)=>void;options:StaticRenderOptions}[]=[];
for(const type of ['blur','pagehide'])window.addEventListener(type,event=>lifecycle.push({type,trusted:event.isTrusted}));
document.addEventListener('visibilitychange',event=>lifecycle.push({type:document.hidden?'hidden':'visible',trusted:event.isTrusted}));
const owner=new PreviewOwner({
  createContext:()=>{
    const requested=Number(new URLSearchParams(location.search).get('rate'));
    context=new AudioContext(requested?{sampleRate:requested}:undefined);contextCount++;
    analyser=context.createAnalyser();analyser.fftSize=2048;
    // Analyser output may remain unconnected (W3C WebAudio1.8); the owner's graph still reaches destination.
    const makeGain=context.createGain.bind(context),makeSource=context.createBufferSource.bind(context);
    context.createGain=()=>{const gain=makeGain();gain.connect(analyser!);return gain;};
    context.createBufferSource=()=>{const source=makeSource();sources.push(source);return source;};
    return context;
  },
  render:options=>{
    renderCalls.push({rate:options.sampleRate,framesMs:options.durationMs,freqs:[...options.freqs]});
    if(options.durationMs===1234)return new Promise(resolve=>delayed.push({resolve,options}));
    return renderStaticSamples(options);
  },
  onReceipt:receipt=>receipts.push(receipt),
});
owner.subscribe(()=>{document.querySelector('output')!.textContent=owner.getSnapshot().phase;});
const play=(prefix:string,durationMs:number)=>{void owner.play(prefix+'-'+(++serial),{freqs:[440],durationMs,waveform:Waveform.SINE,gain:.3});};
document.querySelector('#play')!.addEventListener('click',()=>play('normal',750));
document.querySelector('#long')!.addEventListener('click',()=>play('long',3000));
document.querySelector('#old')!.addEventListener('click',()=>play('old',1234));
document.querySelector('#stop')!.addEventListener('click',()=>owner.stop());
document.querySelector('#release')!.addEventListener('click',()=>{void owner.release();});
function snapshot(){
  let peak=0;
  if(analyser){const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);for(const value of samples)peak=Math.max(peak,Math.abs(value));}
  return {state:owner.getSnapshot(),contextCount,contextState:context?.state??null,sampleRate:context?.sampleRate??null,
    contextTime:context?.currentTime??0,outputTimestamp:context?.getOutputTimestamp(),peak,
    retained:sources.filter(source=>source.buffer!==null).length,sourceCount:sources.length,
    receipts:[...receipts],renderCalls:[...renderCalls],lifecycle:[...lifecycle],hidden:document.hidden,delayed:delayed.length};
}
const proof={snapshot,resolveOld:()=>{
  for(const job of delayed.splice(0))job.resolve(renderStaticSamples({...job.options,shouldAbort:()=>false}));
},release:()=>owner.release()};
declare global {interface Window {audioPreviewProof:typeof proof}}
window.audioPreviewProof=proof;

// Registered after the owner: record its cleanup during a genuine browser navigation.
window.addEventListener('pagehide',()=>sessionStorage.setItem('previewDepartureReceipt',JSON.stringify(snapshot())));
