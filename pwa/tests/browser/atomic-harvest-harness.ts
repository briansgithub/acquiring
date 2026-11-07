import type {CatalogCommand,CatalogResponse} from '../../src/storage/catalog/protocol';
let worker:Worker|undefined,phase='';
const pending=new Map<string,{resolve:(value:unknown)=>void;reject:(reason:unknown)=>void}>();
const results=new Map<string,unknown>();
function send(command:CatalogCommand|undefined,control?:string):Promise<unknown>{return new Promise((resolve,reject)=>{const id=crypto.randomUUID();pending.set(id,{resolve,reject});worker!.postMessage({id,command,control});});}
export const atomicHarness={
 async open(){worker=new Worker(new URL('./atomic-harvest-thread.ts',import.meta.url),{type:'module'});worker.onmessage=({data}:MessageEvent<CatalogResponse&{phase?:string}>)=>{if(data.phase){phase=data.phase;return;}const entry=pending.get(data.id);if(!entry)return;pending.delete(data.id);if(data.ok)entry.resolve(data.value);else entry.reject(new Error(data.error.code+':'+data.error.message));};return send({kind:'init'});},
 control(mode:string){phase='';return send(undefined,mode);},phase:()=>phase,
 call:send,
 begin(key:string,command:CatalogCommand){results.delete(key);void send(command).then(value=>results.set(key,{value}),error=>results.set(key,{error:String(error)}));},
 result:(key:string)=>results.get(key)??null,
 cancel(){for(const id of pending.keys())worker!.postMessage({id:crypto.randomUUID(),command:{kind:'cancelHarvestCommit',requestId:id}});},
 terminate(){worker!.terminate();worker=undefined;for(const entry of pending.values())entry.reject(new Error('Fixture worker stopped'));pending.clear();},
};
declare global {interface Window{atomicHarness:typeof atomicHarness}}
window.atomicHarness=atomicHarness;
