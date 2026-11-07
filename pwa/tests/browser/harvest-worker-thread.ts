/** Disposable fixture adapter only: production URLs are mapped to same-origin test HTTP. */
import {createHarvestHandler} from '../../worker';
const controllers=new Map<string,AbortController>();
const scope=globalThis as unknown as {onmessage:((event:MessageEvent<{kind:string;id:string;url?:string}>)=>void)|null;postMessage:(value:unknown)=>void};
scope.onmessage=({data})=>{
  if(data.kind==='cancel'){controllers.get(data.id)?.abort();return;}
  const controller=new AbortController();controllers.set(data.id,controller);
  const calls:string[]=[];
  const handle=createHarvestHandler(async(url,init)=>{
    calls.push(url);
    const provider=new URL(url);
    const local=provider.hostname==='www.hooktheory.com'?'/harvest-fixtures/page.html':'/harvest-fixtures/api/'+encodeURIComponent(provider.pathname.split('/').at(-1)!);
    return new Response(await (await fetch(local,init)).blob());
  });
  void handle(new Request('https://worker.test/harvest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:data.url}),signal:controller.signal})).then(async response=>{
    scope.postMessage({id:data.id,status:response.status,body:await response.json(),calls});
  }).finally(()=>controllers.delete(data.id));
};
