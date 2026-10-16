import {expect,it,vi} from 'vitest';
import {CatalogError} from '../../storage/catalog/protocol';
import {SongDetailController,type SongReaderClient} from './controller';
import type {SongPayload} from '../../storage/catalog/detail-query';
const payload=():SongPayload=>({sourceSnapshot:'s',song:{slug:'slug',artist:null,title:'Title',url:'https://example.test',status:'complete'},data:new TextEncoder().encode('{}')});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return {promise,resolve};}
function reader(value:()=>Promise<SongPayload|null>){let closes=0;return {songPayload:value,terminate:()=>{closes++;},get closes(){return closes;}};}
it('starts one lookup, publishes ready and releases ownership without waiting for route departure',async()=>{
  const client=reader(async()=>payload());let opens=0;
  const c=new SongDetailController('slug',async()=>{opens++;return client;});
  const first=c.start();expect(c.start()).toBe(first);await first;
  expect(opens).toBe(1);expect(c.getSnapshot().phase).toBe('ready');expect(client.closes).toBe(1);
  c.dispose();expect(client.closes).toBe(1);expect(c.closed).toBe(true);
});
it('abort/dispose during open terminates a late client without a stale publication',async()=>{
  const opening=deferred<SongReaderClient>(),client=reader(async()=>payload());let signal!:AbortSignal;
  const c=new SongDetailController('slug',async input=>{signal=input;return opening.promise;});
  let publications=0;c.subscribe(()=>{publications++;});const pending=c.start();c.dispose();
  expect(signal.aborted).toBe(true);opening.resolve(client);await pending;
  expect(client.closes).toBe(1);expect(publications).toBe(1);expect(c.getSnapshot().phase).toBe('loading');
});
it('new retry wins over old pending payload and closes each reader',async()=>{
  const old=deferred<SongPayload|null>(),first=reader(()=>old.promise),second=reader(async()=>({...payload(),sourceSnapshot:'new'}));
  let count=0;const c=new SongDetailController('slug',async()=>count++===0?first:second);
  const initial=c.start();await Promise.resolve();await c.retry();
  expect(c.getSnapshot().details?.sourceSnapshot).toBe('new');old.resolve(payload());await initial;
  expect(c.getSnapshot().details?.sourceSnapshot).toBe('new');expect(first.closes).toBeGreaterThanOrEqual(1);expect(second.closes).toBe(1);
});
it('distinguishes missing/download/busy and can retry after an error',async()=>{
  const missing=new SongDetailController('slug',async()=>reader(async()=>null));await missing.start();expect(missing.getSnapshot().phase).toBe('missing');
  for(const [code,phase,message] of [['NOT_INSTALLED','download','Download'],['BUSY','error','another tab'],['PAYLOAD_MISSING','error','no downloaded'],['LIMIT','error','size supported']]){
    let fail=true;const c=new SongDetailController('slug',async()=>{if(fail)throw new CatalogError(code,'fixture');return reader(async()=>payload());});
    await c.start();expect(c.getSnapshot().phase).toBe(phase);expect(c.getSnapshot().message).toContain(message);
    fail=false;await c.retry();expect(c.getSnapshot().phase).toBe('ready');c.dispose();
  }
});

it('bounds same-page BUSY handoff retries and cancels a waiting retry on disposal',async()=>{
  vi.useFakeTimers();
  try {
    let count=0;const client=reader(async()=>payload());
    const c=new SongDetailController('slug',async()=>{if(++count<3)throw new CatalogError('BUSY','departing reader');return client;});
    const pending=c.start();await vi.runAllTimersAsync();await pending;
    expect(count).toBe(3);expect(c.getSnapshot().phase).toBe('ready');expect(client.closes).toBe(1);
    let blockedCalls=0;const blocked=new SongDetailController('slug',async()=>{blockedCalls++;throw new CatalogError('BUSY','other tab');});
    const full=blocked.start();await vi.runAllTimersAsync();await full;
    expect(blockedCalls).toBe(6);expect(blocked.getSnapshot()).toMatchObject({phase:'error',message:expect.stringContaining('another tab')});
    let cancelledCalls=0;const cancel=new SongDetailController('slug',async()=>{cancelledCalls++;throw new CatalogError('BUSY','departing reader');});
    const waiting=cancel.start();await Promise.resolve();cancel.dispose();await vi.runAllTimersAsync();await waiting;
    expect(cancelledCalls).toBe(1);expect(vi.getTimerCount()).toBe(0);
  }finally{vi.useRealTimers();}
});
