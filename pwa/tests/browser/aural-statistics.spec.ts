import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {expect,test,type Page} from '@playwright/test';
import type {CatalogManifest} from '../../src/storage/catalog/manifest';
import type {AuralStatisticsRequest,AuralStatisticsResponse} from '../../src/storage/catalog/aural-statistics-runtime-contracts';
import type {AuralCatalogStatistics} from '../../src/domain/catalog/statistics-contracts';
interface Fixture {directory:string;manifest:CatalogManifest;request:AuralStatisticsRequest;expected:AuralCatalogStatistics|null;nativeProbe:string;browserVariant:string|null}
let fixtures:Record<string,Fixture>;
const base='http://127.0.0.1:5173/aural-statistics-fixtures/';
test.beforeAll(()=>{
  fixtures={};
  for(const [i,probe]of ['threshold-None','threshold-50','per-song-not-global','all-six-sections','reverse','prototype-and-nul','empty','favorite-duplicates'].entries())
    fixtures[probe]=JSON.parse(execFileSync('python',['scripts/catalog/make-aural-statistics-browser-fixture.py','--probe',probe,'--snapshot',(i+1).toString(16).repeat(64)],{encoding:'utf8'})) as Fixture;
  fixtures.bad=JSON.parse(execFileSync('python',['scripts/catalog/make-aural-statistics-browser-fixture.py','--probe','threshold-None','--snapshot','9'.repeat(64),'--variant','bad-confidence'],{encoding:'utf8'})) as Fixture;
});
test.beforeEach(async({page,context})=>{
  await context.route('**/aural-statistics-fixtures/**',async route=>{
    const [name,...parts]=new URL(route.request().url()).pathname.split('/aural-statistics-fixtures/')[1]!.split('/'),fixture=fixtures[name!]!;
    const path=resolve(fixture.directory,parts.join('/'));if(!path.startsWith(resolve(fixture.directory)+sep))throw new Error('Fixture traversal');
    await route.fulfill({status:200,body:await readFile(path),headers:{'Content-Type':'application/octet-stream'}});
  });
  await page.goto('http://127.0.0.1:5173/tests/browser/catalog-worker.html');await page.waitForFunction(()=>!!window.catalogHarness);
});
async function call<T=unknown>(page:Page,method:string,args:unknown[]=[]):Promise<T>{
  return page.evaluate(async({method,args})=>{const h=window.catalogHarness as unknown as Record<string,(...a:unknown[])=>Promise<unknown>>;return h[method]!(...args);},{method,args}) as Promise<T>;
}
async function install(page:Page,name:string,id:string){const f=fixtures[name]!;await call(page,'prepare',['owner',id,f.manifest,base+name+'/']);await call(page,'activate',['owner',id]);}
async function failure(page:Page,request:AuralStatisticsRequest):Promise<string|undefined>{
  return page.evaluate(async request=>{try{await window.catalogHarness.auralStatistics('owner',request);return undefined;}catch(error){return (error as {code?:string}).code;}},request);
}
function matches(actual:AuralStatisticsResponse,f:Fixture){
  expect(actual.sourceSnapshot).toBe(f.request.range.sourceSnapshot);expect(actual.range).toEqual(f.request.range);
  if(f.expected===null){expect(actual.statistics).toBeNull();return;}
  expect(actual.statistics).not.toBeNull();const {score,...counts}=actual.statistics!,{score:expectedScore,...expectedCounts}=f.expected;
  expect(counts).toEqual(expectedCounts);expect(Math.abs(score-expectedScore)).toBeLessThanOrEqual(Math.max(1e-12,Math.abs(expectedScore)*2e-14));
}
test('actual SQLite WASM statistics match eight unchanged native examples across counts and factors',async({page},info)=>{
  test.setTimeout(60_000);await call(page,'seedUsers');const users=await call(page,'users');await call(page,'open',['owner']);const proof:unknown[]=[];
  for(const [i,name]of ['threshold-None','threshold-50','per-song-not-global','all-six-sections','reverse','prototype-and-nul','empty','favorite-duplicates'].entries()){
    const id=(i+1).toString(16)+'1234567-1234-1234-1234-123456789012';await install(page,name,id);const f=fixtures[name]!;
    const before=await call(page,'info',['owner']),actual=await call<AuralStatisticsResponse>(page,'auralStatistics',['owner',f.request]);matches(actual,f);
    expect(await call(page,'info',['owner'])).toEqual(before);expect(await call(page,'users')).toEqual(users);proof.push({probe:f.nativeProbe,actual,expected:f.expected});
  }
  await call(page,'close',['owner']);await writeFile(info.outputPath('proof.json'),JSON.stringify({actualNativeExamples:proof,exactCounts:true,scoreAbsoluteTolerance:1e-12,scoreRelativeTolerance:2e-14,filesAndUsersPreserved:true},null,2));
});
test('statistics reject missing catalog and stale snapshot after activation without rebinding',async({page},info)=>{
  await call(page,'open',['owner']);expect(await failure(page,fixtures['threshold-None']!.request)).toBe('NOT_INSTALLED');
  await install(page,'threshold-None','a1234567-1234-1234-1234-123456789012');matches(await call(page,'auralStatistics',['owner',fixtures['threshold-None']!.request]),fixtures['threshold-None']!);
  await install(page,'threshold-50','b1234567-1234-1234-1234-123456789012');expect(await failure(page,fixtures['threshold-None']!.request)).toBe('STALE_SNAPSHOT');
  const f=fixtures['threshold-50']!;expect(await failure(page,{...f.request,range:{...f.request.range,end:10000}})).toBe('LIMIT');
  expect(await failure(page,{...f.request,minimumPopularityPercent:101})).toBe('INVALID_REQUEST');matches(await call(page,'auralStatistics',['owner',f.request]),f);await call(page,'close',['owner']);
  await writeFile(info.outputPath('proof.json'),JSON.stringify({notInstalled:true,staleRejected:true,noSilentRebind:true,rangeBudgetRefused:true,invalidPercentRefused:true,newSnapshotReadable:true}));
});
test('malformed popularity confidence refuses statistics and preserves catalog and users for valid retry',async({page},info)=>{
  await call(page,'seedUsers');const users=await call(page,'users');await call(page,'open',['owner']);await install(page,'bad','c1234567-1234-1234-1234-123456789012');
  const before=await call(page,'info',['owner']);expect(await failure(page,fixtures.bad!.request)).toBe('INTEGRITY');expect(await call(page,'info',['owner'])).toEqual(before);expect(await call(page,'users')).toEqual(users);
  await install(page,'threshold-None','d1234567-1234-1234-1234-123456789012');matches(await call(page,'auralStatistics',['owner',fixtures['threshold-None']!.request]),fixtures['threshold-None']!);expect(await call(page,'users')).toEqual(users);await call(page,'close',['owner']);
  await writeFile(info.outputPath('proof.json'),JSON.stringify({browserOnlyConfidenceRefusal:true,filesUsersOutboxPreserved:true,validRetry:true}));
});
test('statistics request-start termination recovers offline in a new owner and queued close waits',async({page,context},info)=>{
  await call(page,'seedUsers');const users=await call(page,'users');await call(page,'open',['owner']);await install(page,'threshold-None','e1234567-1234-1234-1234-123456789012');const f=fixtures['threshold-None']!;
  await page.evaluate(request=>{window.catalogHarness.beginAuralStatistics('owner',request);window.catalogHarness.terminate('owner');},f.request);
  await page.waitForFunction(()=>window.catalogHarness.auralStatisticsState().done);expect(await call(page,'auralStatisticsState')).toMatchObject({done:true,code:'CLOSED'});
  await page.waitForFunction(async()=>!(await navigator.locks.query()).held?.some(lock=>lock.name==='acquiring-catalog-owner-v1'));
  await call(page,'open',['owner']);await context.setOffline(true);matches(await call(page,'auralStatistics',['owner',f.request]),f);expect(await call(page,'users')).toEqual(users);
  const completed=await page.evaluate(async request=>{window.catalogHarness.beginAuralStatistics('owner',request);await window.catalogHarness.close('owner');return window.catalogHarness.auralStatisticsState();},f.request);
  expect(completed.done).toBe(true);expect(completed.code).toBeUndefined();matches(completed.value as AuralStatisticsResponse,f);await context.setOffline(false);
  await writeFile(info.outputPath('proof.json'),JSON.stringify({requestStartCut:true,pendingRejected:true,newOwnerOfflineNativeStats:true,queuedCloseWaited:true,usersOutboxPreserved:true}));
});
