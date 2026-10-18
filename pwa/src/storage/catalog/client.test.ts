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

it('routes the bounded aural header response to its request',async()=>{
  const opening=CatalogWorkerClient.open(),worker=workers[0]!;
  worker.onmessage!({data:{type:'result',id:worker.requests[0]!.id,ok:true,value:undefined}});
  const client=await opening,reading=client.auralHeader(),request=worker.requests[1]!;
  expect(request.command).toEqual({kind:'auralHeader'});
  const header={sourceSnapshot:'d'.repeat(64),schemaVersion:'aural-catalog-3',suffixCount:2,supportsModeAnalysis:true,supportsStartGrouping:true,reducedRanges:true};
  worker.onmessage!({data:{type:'result',id:request.id,ok:true,value:header}});
  await expect(reading).resolves.toEqual(header);client.terminate();
});
it('terminates a stalled header owner and rejects all pending reads at30seconds',async()=>{
  vi.useFakeTimers();
  try {
    const opening=CatalogWorkerClient.open(),worker=workers[0]!;
    worker.onmessage!({data:{type:'result',id:worker.requests[0]!.id,ok:true,value:undefined}});
    const client=await opening,first=client.auralHeader(),second=client.info();
    const failures=Promise.all([expect(first).rejects.toMatchObject({code:'TIMEOUT'}),expect(second).rejects.toMatchObject({code:'TIMEOUT'})]);
    await vi.advanceTimersByTimeAsync(30_000);await failures;
    expect(worker.terminate).toHaveBeenCalledTimes(1);await expect(client.auralHeader()).rejects.toMatchObject({code:'CLOSED'});
  } finally {vi.useRealTimers();}
});
