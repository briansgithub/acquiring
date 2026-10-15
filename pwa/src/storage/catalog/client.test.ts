import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CatalogWorkerClient} from './client';
import type {CatalogRequest,CatalogResponse} from './protocol';
const workers:FakeWorker[]=[];
class FakeWorker {
  requests:CatalogRequest[]=[];
  onmessage?: (event:{data:CatalogResponse})=>void;
  terminate=vi.fn();
  constructor(){workers.push(this);}
  postMessage(request:CatalogRequest){this.requests.push(request);}
}
beforeEach(()=>{workers.length=0;vi.stubGlobal('Worker',FakeWorker);});
afterEach(()=>vi.unstubAllGlobals());
it('aborts an initializing worker immediately without waiting for its ownership response',async()=>{
  const lifetime=new AbortController();
  const opening=CatalogWorkerClient.open(undefined,lifetime.signal);
  const rejection=expect(opening).rejects.toMatchObject({code:'CLOSED'});
  expect(workers[0]!.requests[0]!.command.kind).toBe('init');
  lifetime.abort();await rejection;expect(workers[0]!.terminate).toHaveBeenCalledTimes(1);
});
it('does not create an owner when its lifetime has already ended',async()=>{
  const lifetime=new AbortController();lifetime.abort();
  await expect(CatalogWorkerClient.open(undefined,lifetime.signal)).rejects.toMatchObject({code:'CLOSED'});
  expect(workers).toHaveLength(0);
});
it('hands a completed open to its explicit owner and removes the initialization abort listener',async()=>{
  const lifetime=new AbortController(),opening=CatalogWorkerClient.open(undefined,lifetime.signal),worker=workers[0]!;
  worker.onmessage!({data:{type:'result',id:worker.requests[0]!.id,ok:true,value:undefined}});
  const client=await opening;lifetime.abort();expect(worker.terminate).not.toHaveBeenCalled();
  client.terminate();expect(worker.terminate).toHaveBeenCalledTimes(1);
});
