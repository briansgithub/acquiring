import {PcmWorkerClient} from '../../src/audio/transport';
import {PlaybackPcmRenderer,PlaybackAudioLayer,PlaybackChordMode,Waveform,type PlaybackConfig} from '../../src/audio/synth';
import type {PlaybackWorkerPort,PlaybackWorkerSuccess} from '../../src/audio/transport/worker-contracts';
const timeline={startBeat:1,endBeat:1.1,events:[{id:1,startBeat:1,endBeat:1.1,layer:PlaybackAudioLayer.CHORD,fullMidiNotes:[60,64,67],rootMidiNote:48}]};
const initial:PlaybackConfig={bpm:90,transpose:0,waveform:Waveform.SINE,chordMode:PlaybackChordMode.FULL,melodyGain:1,chordGain:.7};
async function run(){
  let workers=0,terminations=0;
  const createWorker=():PlaybackWorkerPort=>{
    const worker=new Worker(new URL('../../src/audio/transport/pcm-worker.ts',import.meta.url),{type:'module'});workers++;
    const stop=worker.terminate.bind(worker);worker.terminate=()=>{terminations++;stop();};return worker;
  };
  const client=new PcmWorkerClient({createWorker});let revision=0;
  const reference=new PlaybackPcmRenderer(timeline,initial,48000);
  const ack=await client.execute({kind:'load',sampleRate:48000,timeline,config:initial},revision);
  const observations:{frames:number;maximumDifference:number;beat:number;finished:boolean}[]=[];
  function compare(response:PlaybackWorkerSuccess,frames:number){
    if(response.kind!=='pcm')throw new Error('Missing PCM response');
    const expected=new Int16Array(frames);for(let i=0;i<frames;i+=256)reference.renderAudioInto(expected.subarray(i,Math.min(i+256,frames)));
    let maximumDifference=0;response.pcm.forEach((value,index)=>{maximumDifference=Math.max(maximumDifference,Math.abs(value-expected[index]));});
    if(response.position.beat!==reference.currentBeat||response.position.finished!==reference.finished)throw new Error('Position mismatch');
    observations.push({frames,maximumDifference,beat:response.position.beat,finished:response.position.finished});
  }
  try {
    for(const frames of [256,257,4096])compare(await client.execute({kind:'render',frameCount:frames},revision),frames);
    const changed={...initial,bpm:180,chordGain:.2,transpose:12};reference.updateConfig(changed);
    await client.execute({kind:'configure',config:changed},++revision);compare(await client.execute({kind:'render',frameCount:4096},revision),4096);
    reference.seek(1.05);await client.execute({kind:'seek',beat:1.05},++revision);compare(await client.execute({kind:'render',frameCount:513},revision),513);
  } finally {client.release();client.release();}
  const abortClient=new PcmWorkerClient({createWorker}),abort=new AbortController();
  const pending=abortClient.execute({kind:'load',sampleRate:48000,timeline,config:initial},0,{signal:abort.signal});abort.abort();
  let abortCode='',reuseCode='';
  try{await pending;}catch(error){abortCode=(error as {code:string}).code;}
  try{await abortClient.execute({kind:'load',sampleRate:48000,timeline,config:initial},0);}catch(error){reuseCode=(error as {code:string}).code;}
  abortClient.release();
  return {ack,observations,workers,terminations,abortCode,reuseCode};
}
declare global{interface Window{pcmWorkerProof:{run:typeof run}}}
window.pcmWorkerProof={run};
