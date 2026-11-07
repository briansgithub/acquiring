import {parseSections} from '../../src/domain/data/payload';
import type {HarvestDocument} from '../../worker';
interface Result {id:string;status:number;body:HarvestDocument|{error:{code:string}};calls:string[]}
let worker:Worker|undefined;
const results=new Map<string,Result>();
function open(){worker=new Worker(new URL('./harvest-worker-thread.ts',import.meta.url),{type:'module'});worker.onmessage=({data}:MessageEvent<Result>)=>results.set(data.id,data);}
export const harvestWorkerHarness={
  start(id:string,url:string){if(!worker)open();worker!.postMessage({kind:'start',id,url});},
  cancel(id:string){worker!.postMessage({kind:'cancel',id});},
  result(id:string){return results.get(id)??null;},
  terminate(){worker?.terminate();worker=undefined;},
  decoded(id:string){const body=results.get(id)!.body as HarvestDocument;return [...parseSections(body.data)].map(([key,value])=>({key,name:value.sectionName,index:value.sectionIndex,id:value.numericId,chords:value.chords}));},
};
declare global {interface Window {harvestWorkerHarness:typeof harvestWorkerHarness}}
window.harvestWorkerHarness=harvestWorkerHarness;
