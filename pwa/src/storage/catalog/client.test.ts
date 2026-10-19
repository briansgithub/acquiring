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

function statisticsRequest(){return {range:{sourceSnapshot:'d'.repeat(64),start:0,end:1,length:3},settings:{popularity:true,variety:false,favorites:true},recentSongIds:['A'],favoriteSongIds:['B'],minimumPopularityPercent:50};}
async function opened(){const opening=CatalogWorkerClient.open(),worker=workers[0]!;worker.onmessage!({data:{type:'result',id:worker.requests[0]!.id,ok:true,value:undefined}});return {client:await opening,worker};}
it('snapshots statistics before IPC, ignores unknown fields and routes its own response',async()=>{
  const {client,worker}=await opened(),input=statisticsRequest(),expected=structuredClone(input);
  Object.defineProperty(input,'unknown',{enumerable:true,get(){throw Error('unknown field read');}});
  const reading=client.auralStatistics(input),request=worker.requests[1]!;
  input.range.start=1;input.settings.popularity=false;input.recentSongIds[0]='changed';input.favoriteSongIds.push('C');input.minimumPopularityPercent=0;
  expect(request.command).toEqual({kind:'auralStatistics',request:expected});
  const response={sourceSnapshot:expected.range.sourceSnapshot,range:expected.range,statistics:null};
  worker.onmessage!({data:{type:'result',id:request.id,ok:true,value:response}});
  await expect(reading).resolves.toEqual(response);client.terminate();
});
it('rejects malformed statistics without posting and checks closed ownership before caller getters',async()=>{
  const {client,worker}=await opened(),input=statisticsRequest();input.minimumPopularityPercent=101;
  await expect(client.auralStatistics(input)).rejects.toMatchObject({code:'INVALID_REQUEST'});expect(worker.requests).toHaveLength(1);
  client.terminate();Object.defineProperty(input,'range',{get(){throw Error('closed caller read');}});
  await expect(client.auralStatistics(input)).rejects.toMatchObject({code:'CLOSED'});expect(worker.requests).toHaveLength(1);
});
it('terminates a stalled statistics owner at30seconds and rejects every pending request',async()=>{
  vi.useFakeTimers();
  try {
    const {client,worker}=await opened(),first=client.auralStatistics(statisticsRequest()),second=client.info();
    const failures=Promise.all([expect(first).rejects.toMatchObject({code:'TIMEOUT'}),expect(second).rejects.toMatchObject({code:'TIMEOUT'})]);
    await vi.advanceTimersByTimeAsync(29_999);expect(worker.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);await failures;expect(worker.terminate).toHaveBeenCalledTimes(1);
    await expect(client.auralStatistics(statisticsRequest())).rejects.toMatchObject({code:'CLOSED'});
  }finally{vi.useRealTimers();}
});
