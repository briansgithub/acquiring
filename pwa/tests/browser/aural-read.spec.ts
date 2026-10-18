import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {expect,test,type Page} from '@playwright/test';
import type {CatalogManifest} from '../../src/storage/catalog/manifest';
import type {AuralCatalogHeader} from '../../src/storage/catalog/aural-read-contracts';

interface Fixture {directory:string;manifest:CatalogManifest}
let first:Fixture,second:Fixture,bad:Fixture;
const base='http://127.0.0.1:5173/aural-read-fixtures/';
test.beforeAll(()=>{
  const make=(...args:string[])=>JSON.parse(execFileSync('python',['scripts/catalog/make-aural-read-browser-fixture.py',...args],{encoding:'utf8'})) as Fixture;
  first=make();second=make('--snapshot','e'.repeat(64),'--suffix-count','3');bad=make('--snapshot','f'.repeat(64),'--bad-array');
});
test.beforeEach(async({page,context})=>{
  await context.route('**/aural-read-fixtures/**',async route=>{
    const relative=new URL(route.request().url()).pathname.split('/aural-read-fixtures/')[1]!;
    const fixture=relative.startsWith('v2/')?second:relative.startsWith('bad/')?bad:first;
    const path=resolve(fixture.directory,relative.replace(/^(v1|v2|bad)\//,''));
    if(!path.startsWith(resolve(fixture.directory)+sep))throw new Error('Fixture traversal');
    await route.fulfill({status:200,body:await readFile(path),headers:{'Content-Type':'application/octet-stream'}});
  });
  await page.goto('http://127.0.0.1:5173/tests/browser/catalog-worker.html');await page.waitForFunction(()=>!!window.catalogHarness);
});
async function call<T=unknown>(page:Page,method:string,args:unknown[]=[]):Promise<T> {
  return page.evaluate(async({method,args})=>{
    const harness=window.catalogHarness as unknown as Record<string,(...args:unknown[])=>Promise<unknown>>;
    return harness[method]!(...args);
  },{method,args}) as Promise<T>;
}
async function install(page:Page,name:string,id:string,fixture:Fixture,directory:string){
  await call(page,'prepare',[name,id,fixture.manifest,base+directory+'/']);await call(page,'activate',[name,id]);
}
test('actual WASM header survives new-worker offline read and tracks active snapshot updates',async({page,context},info)=>{
  await call(page,'seedUsers');const users=await call(page,'users');
  await call(page,'open',['owner']);await expect(call(page,'auralHeader',['owner'])).rejects.toThrow('Download');
  await install(page,'owner','a1234567-1234-1234-1234-123456789012',first,'v1');
  const initial=await call<AuralCatalogHeader>(page,'auralHeader',['owner']);
  expect(initial).toEqual({sourceSnapshot:'d'.repeat(64),schemaVersion:'aural-catalog-3',supportsModeAnalysis:true,supportsStartGrouping:true,reducedRanges:true,suffixCount:2});
  await call(page,'terminate',['owner']);
  await page.waitForFunction(async()=>!(await navigator.locks.query()).held?.some(lock=>lock.name==='acquiring-catalog-owner-v1'));
  await call(page,'open',['cold']);await context.setOffline(true);
  expect(await call(page,'auralHeader',['cold'])).toEqual(initial);await context.setOffline(false);
  await install(page,'cold','b1234567-1234-1234-1234-123456789012',second,'v2');
  const updated=await call<AuralCatalogHeader>(page,'auralHeader',['cold']);expect(updated.sourceSnapshot).toBe('e'.repeat(64));expect(updated.suffixCount).toBe(3);
  expect(await call(page,'users')).toEqual(users);await call(page,'close',['cold']);
  await writeFile(info.outputPath('proof.json'),JSON.stringify({initial,updated,newWorkerOfflineRead:true,userStoresPreserved:true},null,2));
});
test('malformed array refuses header without removing installed files or user data',async({page},info)=>{
  await call(page,'seedUsers');const users=await call(page,'users');await call(page,'open',['owner']);
  await install(page,'owner','c1234567-1234-1234-1234-123456789012',bad,'bad');const before=await call(page,'info',['owner']);
  await expect(call(page,'auralHeader',['owner'])).rejects.toThrow('suffix array');
  expect(await call(page,'info',['owner'])).toEqual(before);expect(await call(page,'users')).toEqual(users);
  await install(page,'owner','d1234567-1234-1234-1234-123456789012',first,'v1');
  expect((await call<AuralCatalogHeader>(page,'auralHeader',['owner'])).sourceSnapshot).toBe('d'.repeat(64));await call(page,'close',['owner']);
  await writeFile(info.outputPath('proof.json'),JSON.stringify({malformedRefused:true,filesAndUsersPreserved:true,retryWithNewValidAttempt:true}));
});
test('header read keeps one owner and cooperative close allows the next real tab',async({page,context},info)=>{
  await call(page,'open',['owner']);await install(page,'owner','e1234567-1234-1234-1234-123456789012',first,'v1');
  const header=await call(page,'auralHeader',['owner']),other=await context.newPage();
  await other.goto('http://127.0.0.1:5173/tests/browser/catalog-worker.html');await other.waitForFunction(()=>!!window.catalogHarness);
  await expect(call(other,'open',['second'])).rejects.toThrow('another tab');await call(page,'close',['owner']);
  await call(other,'open',['second']);expect(await call(other,'auralHeader',['second'])).toEqual(header);await call(other,'close',['second']);
  await writeFile(info.outputPath('proof.json'),JSON.stringify({singleOwner:true,closeAndNextTabHeader:true}));
});
