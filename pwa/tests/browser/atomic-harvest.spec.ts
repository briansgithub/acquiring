import {test,expect,type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import type {HarvestCommitRequest,HarvestCommitResult} from '../../src/domain/harvest/commit-harvest';
import type {CatalogManifest} from '../../src/storage/catalog/manifest';
const request:HarvestCommitRequest={operationId:'atomic-op',harvestedAt:42,document:{song:{slug:'fixture__song',artist:'Atomic Artist',title:'Atomic Song',url:'https://www.hooktheory.com/theorytab/view/fixture/song',status:'enriched'},data:JSON.stringify({'10':{songId:'10',numericId:'9007199254740993',sectionName:'Verse',sectionIndex:0,songInfo:'Atomic Song',metadata:{keys:[{scale:'major'},{scale:'natural minor'},{scale:'major'}]},chords:[{root:1,type:5}]}}),sectionCount:1}};
async function call<T=unknown>(page:Page,method:string,args:unknown[]=[]):Promise<T>{return page.evaluate(async({method,args})=>{const h=window.catalogHarness as unknown as Record<string,(...args:unknown[])=>unknown>;return h[method]!(...args);},{method,args}) as Promise<T>;}
async function ready(page:Page){await page.goto('http://127.0.0.1:5173/tests/browser/atomic-harvest.html');await page.waitForFunction(()=>!!window.catalogHarness&&!!window.atomicHarness);await call(page,'seedUsers');}
async function unlocked(page:Page){await page.waitForFunction(async()=>!(await navigator.locks.query()).held?.some(lock=>lock.name==='acquiring-catalog-owner-v1'));}
test('real catalog client commits existing T06 format atomically; cache visibility, duplicate/conflict and catalog ghost precedence',async({page,context})=>{
 const fixture=JSON.parse(execFileSync('python',['scripts/catalog/make-library-browser-fixture.py'],{encoding:'utf8'})) as {directory:string;manifest:CatalogManifest};
 await context.route('**/atomic-fixtures/**',async route=>{const relative=new URL(route.request().url()).pathname.split('/atomic-fixtures/')[1]!;const path=resolve(fixture.directory,relative);if(!path.startsWith(resolve(fixture.directory)+sep))throw new Error('Traversal');await route.fulfill({body:await readFile(path)});});
 await ready(page);const before=await call(page,'users');await call(page,'open',['owner']);
 await call(page,'prepare',['owner','b2345678-1234-1234-1234-123456789012',fixture.manifest,'http://127.0.0.1:5173/atomic-fixtures/']);await call(page,'activate',['owner','b2345678-1234-1234-1234-123456789012']);
 expect((await call<{rows:unknown[]}>(page,'songPage',['owner',{mode:'search',text:'Atomic Song'}])).rows).toEqual([]);
 const first=await call<HarvestCommitResult>(page,'commitHarvest',['owner',request]);expect(first.applied).toBe(true);
 const state=await call<{row:{value:{alphaGroup:string;modes:string}};pending:{operationId:string;sequence:number}[]}>(page,'harvestState',[request.document.song.slug]);
 expect(state.row.value).toMatchObject({alphaGroup:'A',modes:'aeolian\nionian'});expect(state.pending.filter(op=>op.operationId===request.operationId)).toHaveLength(1);
 expect((await call<{rows:{slug:string}[]}>(page,'songPage',['owner',{mode:'search',text:'Atomic Song'}])).rows.map(row=>row.slug)).toEqual(['fixture__song']);
 expect((await call<{slug:string}[]>(page,'songBrowseGroupSongs',['owner','mode','aeolian',''])).map(row=>row.slug)).toEqual(['fixture__song']);
 expect(await call(page,'commitHarvest',['owner',request])).toEqual({...first,applied:false});
 const conflict=structuredClone(request);conflict.document.song.title='Conflicting';await expect(call(page,'commitHarvest',['owner',conflict])).rejects.toThrow();expect(await call(page,'harvestState',[request.document.song.slug])).toEqual(state);
 const newer=structuredClone(request);newer.operationId='newer-op';newer.harvestedAt=43;newer.document.song.title='Updated Atomic';await call(page,'commitHarvest',['owner',newer]);
 expect(await call(page,'commitHarvest',['owner',request])).toEqual({...first,applied:false});
 expect((await call<{song:{title:string}}>(page,'songPayload',['owner','fixture__song'])).song.title).toBe('Updated Atomic');
 const ghost=structuredClone(request);ghost.operationId='ghost-op';ghost.document.song.slug='ghost';ghost.document.song.url='https://www.hooktheory.com/theorytab/view/ghost';await call(page,'commitHarvest',['owner',ghost]);
 expect((await call<{data:null;song:{title:string}}>(page,'songPayload',['owner','ghost']))).toMatchObject({data:null,song:{title:'Alpha Ghost'}});
 await call(page,'terminate',['owner']);await unlocked(page);await call(page,'open',['restart']);
 expect((await call<{song:{title:string}}>(page,'songPayload',['restart','fixture__song'])).song.title).toBe('Updated Atomic');
 expect((await call<{rows:unknown[]}>(page,'users')).rows).toEqual((before as {rows:unknown[]}).rows);await call(page,'close',['restart']);
});
test('real catalog worker transaction failure, cancellation and worker cut roll back BOTH record and receipt; lost response retry is idempotent',async({page})=>{
 test.setTimeout(60_000);await ready(page);const before=await call<{rows:unknown[];pending:unknown[]}>(page,'users');
 await page.evaluate(()=>window.atomicHarness.open());
 const state=()=>call<{row:unknown;pending:{operationId:string;sequence:number}[]}>(page,'harvestState',[request.document.song.slug]);
 await page.evaluate(()=>window.atomicHarness.control('abort'));
 await expect(page.evaluate(request=>window.atomicHarness.call({kind:'commitHarvest',request}),request)).rejects.toThrow();
 expect((await state()).row).toBeNull();expect((await state()).pending).toEqual(before.pending);
 for(const action of ['cancel','cut']) {
  await page.evaluate(()=>window.atomicHarness.control('hold'));
  await page.evaluate(({request,key})=>window.atomicHarness.begin(key,{kind:'commitHarvest',request}),{request,key:action});
  await page.waitForFunction(()=>window.atomicHarness.phase()==='inside-transaction');
  if(action==='cancel') {
   await page.evaluate(()=>window.atomicHarness.cancel());await page.waitForFunction(()=>!!window.atomicHarness.result('cancel'));
   expect(await page.evaluate(()=>window.atomicHarness.result('cancel'))).toMatchObject({error:expect.stringContaining('CANCELLED')});
  }else{await page.evaluate(()=>window.atomicHarness.terminate());await unlocked(page);await page.evaluate(()=>window.atomicHarness.open());}
  expect((await state()).row).toBeNull();expect((await state()).pending).toEqual(before.pending);
 }
 await page.evaluate(()=>window.atomicHarness.control('drop'));
 await page.evaluate(request=>window.atomicHarness.begin('lost',{kind:'commitHarvest',request}),request);
 await page.waitForFunction(()=>window.atomicHarness.phase()==='committed-response-lost');
 const committed=await state();expect(committed.row).not.toBeNull();const receipt=committed.pending.find(op=>op.operationId===request.operationId)!;expect(receipt).toBeTruthy();
 expect(committed.pending).toHaveLength(before.pending.length+1);
 await page.evaluate(()=>window.atomicHarness.terminate());await unlocked(page);await page.evaluate(()=>window.atomicHarness.open());
 expect(await page.evaluate(request=>window.atomicHarness.call({kind:'commitHarvest',request}),request)).toEqual({slug:request.document.song.slug,applied:false,sequence:receipt.sequence});
 expect(await state()).toEqual(committed);expect((await call<{rows:unknown[]}>(page,'users')).rows).toEqual(before.rows);
 await page.evaluate(()=>window.atomicHarness.terminate());
});
