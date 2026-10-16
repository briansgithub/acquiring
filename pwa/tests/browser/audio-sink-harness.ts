import {ApplicationAudioContext} from '../../src/audio/transport/application-audio-context';
import {PcmQueueSink} from '../../src/audio/transport/pcm-queue-sink';
import type {PcmSinkClock,PcmSinkPcm,PcmSinkReading} from '../../src/audio/transport/sink-contracts';

const query=new URLSearchParams(location.search),rate=Number(query.get('rate'));
const clock=(query.get('clock')??undefined) as PcmSinkClock|undefined;
let context:AudioContext|undefined,analyser:AnalyserNode|undefined,contexts=0,closes=0,revision=0;
const records:{start:number|null;frames:number;first:number;second:number;stops:number;disconnects:number;ended:number}[]=[];
const history:PcmSinkReading[]=[],errors:string[]=[];
const owner=new ApplicationAudioContext({createContext:()=>{
  context=new AudioContext({sampleRate:rate});contexts++;
  analyser=context.createAnalyser();analyser.fftSize=2048;
  const create=context.createBufferSource.bind(context),close=context.close.bind(context);
  context.createBufferSource=()=>{
    const source=create(),record={start:null as number|null,frames:0,first:0,second:0,stops:0,disconnects:0,ended:0};
    records.push(record);source.connect(analyser!);
    const start=source.start.bind(source),stop=source.stop.bind(source),disconnect=source.disconnect.bind(source);
    source.start=(when=0,offset=0,duration?:number)=>{
      record.start=when;record.frames=source.buffer!.length;
      const data=source.buffer!.getChannelData(0);record.first=data[0];record.second=data[1];
      if(duration===undefined)start(when,offset);else start(when,offset,duration);
    };
    source.stop=(when=0)=>{record.stops++;stop(when);};
    source.disconnect=()=>{record.disconnects++;disconnect();};
    source.addEventListener('ended',()=>{record.ended++;});return source;
  };
  context.close=()=>{closes++;return close();};return context;
}});
let sink=new PcmQueueSink({contextOwner:owner,clock});
const timeline={startBeat:1,endBeat:5,completionKey:'sink-proof'};
function code(error:unknown){return (error as {code?:string})?.code??String(error);}
function pcm(requestId:number,startBeat:number):PcmSinkPcm{
  const samples=new Int16Array(4096);
  for(let i=0;i<samples.length;i++)samples[i]=Math.round(Math.sin(2*Math.PI*440*i/rate)*8000);
  samples[0]=-32768;samples[1]=32767;
  return {version:1,ok:true,kind:'pcm',requestId,revision,startBeat,
    position:{sampleRate:rate,beat:startBeat+4096/rate,beatsPerFrame:1/rate,finished:false},pcm:samples};
}
async function queue(){
  try{
    await owner.resumeFromGesture();
    const run=sink.begin(revision,timeline),first=pcm(1,1),second=pcm(2,1+4096/rate);
    sink.enqueue(run,first);sink.enqueue(run,second,true);
    first.pcm.fill(0);second.pcm.fill(0);history.push(sink.read());
  }catch(error){errors.push(code(error));}
}
document.querySelector('#play')!.addEventListener('click',()=>{void queue();});
document.querySelector('#suspend')!.addEventListener('click',()=>{void context?.suspend();});
document.querySelector('#flush')!.addEventListener('click',()=>sink.flush());
document.querySelector('#release')!.addEventListener('click',()=>sink.release());
document.querySelector('#replace')!.addEventListener('click',()=>{
  sink.release();sink=new PcmQueueSink({contextOwner:owner,clock});revision++;void queue();
});
function snapshot(){
  let peak=0,reading:PcmSinkReading|null=null,readError:string|null=null;
  if(analyser){const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);for(const sample of data)peak=Math.max(peak,Math.abs(sample));}
  try{reading=sink.read();}catch(error){readError=code(error);}
  return {application:owner.getSnapshot(),contextState:context?.state??null,sampleRate:context?.sampleRate??null,
    contextTime:context?.currentTime??0,contexts,closes,reading,readError,peak,
    records:records.map(record=>({...record})),history:[...history],errors:[...errors]};
}
const proof={snapshot,tryBegin:()=>{try{sink.begin(revision,timeline);return 'accepted';}catch(error){return code(error);}},
  release:async()=>{sink.release();await owner.release();}};
declare global{interface Window{pcmSinkProof:typeof proof}}
window.pcmSinkProof=proof;
