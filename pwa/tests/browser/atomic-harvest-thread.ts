/** Test-only instrumentation around the UNCHANGED real catalog worker module. Never bundled into product. */
import '../../src/storage/catalog/catalog-worker';
const scope=globalThis as unknown as {onmessage:((event:MessageEvent)=>void);postMessage:(value:unknown)=>void};
const dispatch=scope.onmessage,post=scope.postMessage.bind(scope);
let mode='normal',holding=false;
const add=IDBObjectStore.prototype.add;
IDBObjectStore.prototype.add=function(value,key) {
 const request=add.call(this,value,key);
 if(this.name==='operations') {
  const selected=mode;if(selected!=='drop')mode='normal';
  if(selected==='abort'){this.transaction.abort();throw new DOMException('Disposable injected write failure','AbortError');}
  if(selected==='hold') {
   holding=true;post({phase:'inside-transaction'});const tx=this.transaction;
   const keep=()=>{if(!holding)return;try{tx.objectStore('meta').get('fixture-keepalive').onsuccess=keep;}catch{}};keep();
  }
 }
 return request;
};
scope.postMessage=value=>{
 const response=value as {type?:string;ok?:boolean;value?:{slug?:string}};
 if(mode==='drop'&&response.type==='result'&&response.ok&&response.value?.slug){mode='normal';post({phase:'committed-response-lost'});return;}
 post(value);
};
scope.onmessage=event=>{
 if(event.data.control){mode=event.data.control;holding=false;post({id:event.data.id,type:'result',ok:true,value:null});return;}
 dispatch(event);
};
