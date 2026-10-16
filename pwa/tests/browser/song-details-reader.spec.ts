import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {expect,test,type Page} from '@playwright/test';
import type {CatalogManifest} from '../../src/storage/catalog/manifest';
import type {SongDetails} from '../../src/features/details/reader';
let fixture:{directory:string;manifest:CatalogManifest};
test.beforeAll(()=>{fixture=JSON.parse(execFileSync('python',['scripts/catalog/make-library-browser-fixture.py','--details'],{encoding:'utf8'}));});
async function call<T=unknown>(page:Page,method:string,args:unknown[]=[]):Promise<T>{
  return page.evaluate(async({method,args})=>{
    const harness=window.catalogHarness as unknown as Record<string,(...args:unknown[])=>unknown>;
    return await harness[method]!(...args);
  },{method,args}) as Promise<T>;
}
test('actual SQLite worker reads exact song payloads offline, bounds corrupt/oversized data and preserves user stores',async({page,context},testInfo)=>{
  await context.route('**/details-fixture/**',async route=>{
    const part=new URL(route.request().url()).pathname.split('/details-fixture/')[1]!,path=resolve(fixture.directory,part);
    if(!path.startsWith(resolve(fixture.directory)+sep))throw new Error('Fixture traversal');
    await route.fulfill({status:200,body:await readFile(path)});
  });
  await page.goto('http://127.0.0.1:5173/tests/browser/catalog-worker.html');
  await page.waitForFunction(()=>!!window.catalogHarness);
  await call(page,'open',['details']);
  await expect(call(page,'songDetails',['details','detail-gzip'])).rejects.toThrow('Download the song catalog');
  await call(page,'seedUsers');const users=await call(page,'users');
  const attempt='a2345678-1234-1234-1234-123456789012';
  await call(page,'prepare',['details',attempt,fixture.manifest,'http://127.0.0.1:5173/details-fixture/']);
  await call(page,'activate',['details',attempt]);
  const gzip=await call<SongDetails>(page,'songDetails',['details','detail-gzip']);
  expect(gzip.sourceSnapshot).toBe(fixture.manifest.sourceSnapshot);
  expect(gzip.song.slug).toBe('detail-gzip');expect(gzip.song.title).toBe('Detail_Gzip');
  expect(gzip.sections.map(([id])=>id)).toEqual(['2','10']);
  const raw=await call<SongDetails>(page,'songDetails',['details','detail-raw']);
  expect(raw.sections).toEqual(gzip.sections);
  expect(await call(page,'songDetails',['details',"' OR 1=1 --"])).toBeNull();
  expect(await call(page,'songDetails',['details','DETAIL-GZIP'])).toBeNull();
  await expect(call(page,'songDetails',['details','ghost'])).rejects.toThrow('no downloaded chord data');
  await expect(call(page,'songDetails',['details','detail-oversize'])).rejects.toThrow('browser limit');
  await expect(call(page,'songDetails',['details','detail-broken'])).rejects.toThrow();
  await call(page,'close',['details']);await call(page,'open',['details']);
  await context.setOffline(true);
  expect(await call(page,'songDetails',['details','detail-gzip'])).toEqual(gzip);
  expect(await call(page,'users')).toEqual(users);
  await testInfo.attach('reader-proof',{body:JSON.stringify({sourceSnapshot:gzip.sourceSnapshot,sectionIds:gzip.sections.map(([id])=>id),offline:true,userStoresPreserved:true}),contentType:'application/json'});
  await call(page,'close',['details']);
});
