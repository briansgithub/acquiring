import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {expect,test,type Page} from '@playwright/test';
import type {CatalogManifest} from '../../src/storage/catalog/manifest';
import type {AuralCatalogTargetQuery} from '../../src/storage/catalog/aural-target-query-contracts';
interface Fixture {directory:string;manifest:CatalogManifest;request:AuralCatalogTargetQuery;expected:unknown}
let fixtures:Record<string,Fixture>;
const base='http://127.0.0.1:5173/aural-target-fixtures/';
test.beforeAll(()=>{
  fixtures=Object.fromEntries([['good','default-varyingBass','a'],['bass','bass-view-roman','b'],['broken','modern-decodes-invalid-source-key','c'],['zero','zero-length-unchecked-end','d'],['short','positions-shorter-than-tokens','e']].map(([name,probe,snapshot])=>[name,JSON.parse(execFileSync('python',['scripts/catalog/make-aural-target-browser-fixture.py','--probe',probe!,'--snapshot',snapshot!.repeat(64)],{encoding:'utf8'})) as Fixture]));
  for(const [name,snapshot,textCase]of [['nulHeader','f','nul-header'],['nulKey','1','nul-key'],['largeText','2','large-metadata']])
    fixtures[name!]=JSON.parse(execFileSync('python',['scripts/catalog/make-aural-target-browser-fixture.py','--probe','default-varyingBass','--snapshot',snapshot!.repeat(64),'--text-case',textCase!],{encoding:'utf8'})) as Fixture;
});
test.beforeEach(async({page,context})=>{
  await context.route('**/aural-target-fixtures/**',async route=>{
    const [name,...parts]=new URL(route.request().url()).pathname.split('/aural-target-fixtures/')[1]!.split('/'),fixture=fixtures[name!]!;
    const path=resolve(fixture.directory,parts.join('/'));if(!path.startsWith(resolve(fixture.directory)+sep))throw new Error('Fixture traversal');
    await route.fulfill({status:200,body:await readFile(path),headers:{'Content-Type':'application/octet-stream'}});
  });
  await page.goto('http://127.0.0.1:5173/tests/browser/catalog-worker.html');await page.waitForFunction(()=>!!window.catalogHarness);
});
async function call<T=unknown>(page:Page,method:string,args:unknown[]=[]):Promise<T>{
  return page.evaluate(async({method,args})=>{const h=window.catalogHarness as unknown as Record<string,(...a:unknown[])=>Promise<unknown>>;return h[method]!(...args);},{method,args}) as Promise<T>;
}
async function install(page:Page,name:string,id:string){const f=fixtures[name]!;await call(page,'prepare',['owner',id,f.manifest,base+name+'/']);await call(page,'activate',['owner',id]);}
async function failure(page:Page,query:AuralCatalogTargetQuery):Promise<string|undefined>{
  return page.evaluate(async query=>{try{await window.catalogHarness.auralTarget('owner',query);return undefined;}catch(error){return (error as {code?:string}).code;}},query);
}
test('actual WASM run/gzip/typed decoder/native identity returns exact degree, roman and empty targets',async({page},info)=>{
  await call(page,'open',['owner']);const proof:unknown[]=[];
  for(const [name,id]of [['good','a1234567-1234-1234-1234-123456789012'],['bass','b1234567-1234-1234-1234-123456789012'],['zero','c1234567-1234-1234-1234-123456789012']]){
    await install(page,name!,id!);const f=fixtures[name!]!,target=await call(page,'auralTarget',['owner',f.request]);expect(target).toEqual(f.expected);proof.push({name,target});
  }
  await call(page,'close',['owner']);await writeFile(info.outputPath('proof.json'),JSON.stringify({actualNativeTargets:proof},null,2));
});
test('stale rank requests reject after update and never rebind to new catalog',async({page},info)=>{
  await call(page,'open',['owner']);await install(page,'good','d1234567-1234-1234-1234-123456789012');
  expect(await call(page,'auralTarget',['owner',fixtures.good!.request])).toEqual(fixtures.good!.expected);
  await install(page,'bass','e1234567-1234-1234-1234-123456789012');
  expect(await failure(page,fixtures.good!.request)).toBe('STALE_SNAPSHOT');expect(await failure(page,{...fixtures.bass!.request,length:-1})).toBe('INVALID_REQUEST');
  expect(await call(page,'auralTarget',['owner',fixtures.bass!.request])).toEqual(fixtures.bass!.expected);await call(page,'close',['owner']);
  await writeFile(info.outputPath('proof.json'),JSON.stringify({staleRejected:true,invalidSpanRejected:true,newSnapshotRead:true}));
});
test('native key and independent position-bound failures preserve files/users and allow valid retry',async({page},info)=>{
  await call(page,'seedUsers');const users=await call(page,'users');await call(page,'open',['owner']);
  for(const [name,id,code]of [['broken','f1234567-1234-1234-1234-123456789012','INTEGRITY'],['short','01234567-1234-1234-1234-123456789012','INVALID_REQUEST']]){
    await install(page,name!,id!);const before=await call(page,'info',['owner']);expect(await failure(page,fixtures[name!]!.request)).toBe(code);
    expect(await call(page,'info',['owner'])).toEqual(before);expect(await call(page,'users')).toEqual(users);
  }
  await install(page,'good','11234567-1234-1234-1234-123456789012');expect(await call(page,'auralTarget',['owner',fixtures.good!.request])).toEqual(fixtures.good!.expected);await call(page,'close',['owner']);
  await writeFile(info.outputPath('proof.json'),JSON.stringify({bothKeysValidated:true,positionSliceBounded:true,filesUsersOutboxPreserved:true,validRetry:true}));
});
test('request-start worker cut rejects pending client and preserves a readable catalog after reopen',async({page},info)=>{
  await call(page,'open',['owner']);await install(page,'good','21234567-1234-1234-1234-123456789012');
  await page.evaluate(query=>{window.catalogHarness.beginAuralTarget('owner',query);window.catalogHarness.terminate('owner');},fixtures.good!.request);
  await page.waitForFunction(()=>window.catalogHarness.auralTargetState().done);expect(await call(page,'auralTargetState')).toMatchObject({done:true,code:'CLOSED'});
  await page.waitForFunction(async()=>!(await navigator.locks.query()).held?.some(lock=>lock.name==='acquiring-catalog-owner-v1'));
  await call(page,'open',['owner']);expect(await call(page,'auralTarget',['owner',fixtures.good!.request])).toEqual(fixtures.good!.expected);
  // Real command queue: closing waits for the earlier target promise before releasing its DB owner.
  const completed=await page.evaluate(async query=>{window.catalogHarness.beginAuralTarget('owner',query);await window.catalogHarness.close('owner');return window.catalogHarness.auralTargetState();},fixtures.good!.request);
  expect(completed).toMatchObject({done:true,value:fixtures.good!.expected});
  await writeFile(info.outputPath('proof.json'),JSON.stringify({requestStartCut:true,pendingRejected:true,reopenedNativeTarget:true,queuedCloseWaited:true}));
});

test('actual WASM preserves NUL metadata and refuses whole NUL key JSON and byte-oversized text',async({page},info)=>{
  await call(page,'seedUsers');const users=await call(page,'users');await call(page,'open',['owner']);
  await install(page,'nulHeader','31234567-1234-1234-1234-123456789012');
  const header=await call<{reducedRanges:boolean}>(page,'auralHeader',['owner']);expect(header.reducedRanges).toBe(false);
  expect(await call(page,'auralTarget',['owner',fixtures.nulHeader!.request])).toEqual(fixtures.nulHeader!.expected);
  for(const [name,id,code]of [['nulKey','41234567-1234-1234-1234-123456789012','INTEGRITY'],['largeText','51234567-1234-1234-1234-123456789012','LIMIT']]){
    await install(page,name!,id!);const before=await call(page,'info',['owner']);expect(await failure(page,fixtures[name!]!.request)).toBe(code);
    expect(await call(page,'info',['owner'])).toEqual(before);expect(await call(page,'users')).toEqual(users);
  }
  await install(page,'good','61234567-1234-1234-1234-123456789012');expect(await call(page,'auralTarget',['owner',fixtures.good!.request])).toEqual(fixtures.good!.expected);
  await call(page,'close',['owner']);await writeFile(info.outputPath('proof.json'),JSON.stringify({exactNulHeaderFlag:true,wholeNulKeyRefused:true,metadataByteCap:true,filesUsersPreserved:true,validRetry:true}));
});
