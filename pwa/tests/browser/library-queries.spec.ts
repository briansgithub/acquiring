import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {expect,test,type Page} from '@playwright/test';
import type {CatalogManifest} from '../../src/storage/catalog/manifest';
import type {SongPage,SongPageRequest} from '../../src/storage/catalog/library-queries';
const fixtures=new Map<string,{directory:string;manifest:CatalogManifest}>();
test.beforeAll(()=>{
  for(const variant of ['old','new'])fixtures.set(variant,JSON.parse(execFileSync('python',['scripts/catalog/make-library-browser-fixture.py','--variant',variant],{encoding:'utf8'})));
});
async function call<T=unknown>(page:Page,method:string,args:unknown[]=[]):Promise<T>{
  return page.evaluate(async ({method,args})=>{
    const harness=window.catalogHarness as unknown as Record<string,(...args:unknown[])=>unknown>;
    return await harness[method]!(...args);
  },{method,args}) as Promise<T>;
}
test('native scalar song paging/search/artist parity,reopen and catalog switch',async({page,context})=>{
  await context.route('**/library-fixtures/**',async route=>{
    const [variant,...parts]=new URL(route.request().url()).pathname.split('/library-fixtures/')[1]!.split('/');
    const fixture=fixtures.get(variant!)!,path=resolve(fixture.directory,...parts);
    if(!path.startsWith(resolve(fixture.directory)+sep))throw new Error('Fixture traversal');
    await route.fulfill({status:200,body:await readFile(path)});
  });
  await page.goto('http://127.0.0.1:5173/tests/browser/catalog-worker.html');
  await page.waitForFunction(()=>!!window.catalogHarness);
  await call(page,'open',['reader']);
  const query=(request:SongPageRequest)=>call<SongPage>(page,'songPage',['reader',request]);
  await expect(query({mode:'search',text:'alpha'})).rejects.toThrow('Download the song catalog');
  await call(page,'seedUsers');
  const users=await call(page,'users');
  const id='e2345678-1234-1234-1234-123456789012';
  await call(page,'prepare',['reader',id,fixtures.get('old')!.manifest,'http://127.0.0.1:5173/library-fixtures/old/']);
  await call(page,'activate',['reader',id]);
  const first=await query({mode:'search',text:'ALPHA',limit:2});
  expect(first.rows.map(row=>row.slug)).toEqual(['a-order','n-alpha']);
  expect(first.hasMore).toBe(true);expect(first.nextOffset).toBe(2);
  const second=await query({mode:'search',text:'ALPHA',limit:2,offset:first.nextOffset!});
  expect(second.rows.map(row=>row.slug)).toEqual(['e-alpha','a-alpha']);
  const third=await query({mode:'search',text:'ALPHA',limit:2,offset:second.nextOffset!});
  expect(third.rows.map(row=>row.slug)).toEqual(['b-alpha','c-alpha']);
  expect(third.hasMore).toBe(false);expect(third.nextOffset).toBeNull();
  expect(first.sourceSnapshot).toBe(fixtures.get('old')!.manifest.sourceSnapshot);
  expect(second.sourceSnapshot).toBe(first.sourceSnapshot);
  expect(third.rows.every(row=>row.complexityRating===null)).toBe(true);
  const hyphens=await query({mode:'search',text:' alpha-song '});
  expect(hyphens.rows.map(row=>row.slug)).toEqual(['a-alpha','b-alpha']);
  expect((await query({mode:'search',text:'alpha_song'})).rows.map(row=>row.slug)).toEqual(['a-alpha','b-alpha','c-alpha']);
  expect((await query({mode:'search',text:'%'})).rows).toHaveLength(20);
  expect((await query({mode:'search',text:"' OR 1=1 --"})).rows).toEqual([]);
  const quoted=await query({mode:'search',text:"O'Brien"});
  expect(quoted.rows.map(row=>row.slug)).toEqual(['quote']);
  expect((await query({mode:'search',text:'Ordering'})).rows.map(row=>row.slug)).toEqual(['a-order','z-order','null-title','empty-title']);
  const artist=await query({mode:'artist',text:'Artist A'});
  expect(artist.rows.map(row=>row.slug)).toEqual(['a-alpha']);
  expect(JSON.stringify(artist).length).toBeLessThan(1000);
  expect(Object.keys(artist.rows[0]!)).toEqual(['slug','artist','title','complexityRating']);
  expect((await query({mode:'artist',text:'artist a'})).rows.map(row=>row.slug)).toEqual(['case-artist']);
  for(const bad of [{mode:'search',text:'alpha',limit:101},{mode:'search',text:'alpha',offset:-1},{mode:'sql',text:'DROP TABLE songs'}]){
    await expect(call(page,'songPage',['reader',bad])).rejects.toThrow('Invalid song');
  }
  const bySlugs=await call<{slug:string}[]>(page,'songBrowseBySlugs',['reader',['quote','missing-slug','a-alpha']]);
  expect(bySlugs.map(row=>row.slug).sort()).toEqual(['a-alpha','quote']);
  expect(await call(page,'songBrowseBySlugs',['reader',[]])).toEqual([]);
  await expect(call(page,'songBrowseBySlugs',['reader',['a\0b']])).rejects.toThrow('Invalid song slug');
  await call(page,'close',['reader']);
  await call(page,'open',['reader']);
  expect(await query({mode:'search',text:'ALPHA',limit:2})).toEqual(first);
  const updated='f2345678-1234-1234-1234-123456789012';
  await call(page,'prepare',['reader',updated,fixtures.get('new')!.manifest,'http://127.0.0.1:5173/library-fixtures/new/']);
  await call(page,'activate',['reader',updated]);
  const changed=await query({mode:'artist',text:'Artist A'});
  expect(changed.sourceSnapshot).toBe(fixtures.get('new')!.manifest.sourceSnapshot);
  expect(changed.sourceSnapshot).not.toBe(first.sourceSnapshot);
  expect(changed.rows[0]!.title).toBe('Updated Search');
  expect(await call(page,'users')).toEqual(users);
  await call(page,'close',['reader']);
});
