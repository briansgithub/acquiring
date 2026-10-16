import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {expect,test,type Page} from '@playwright/test';
import type {CatalogManifest} from '../../src/storage/catalog/manifest';
let fixture:{directory:string;manifest:CatalogManifest;hash:string};
// Actual40k-row catalog verification is bounded setup, not a5s performance requirement.
test.setTimeout(60_000);
test.beforeAll(async()=>{fixture=JSON.parse(execFileSync('python',['scripts/catalog/make-library-browser-fixture.py','--song-screen'],{encoding:'utf8'}));fixture.hash=createHash('sha256').update(await readFile(resolve(fixture.directory,'manifest.json'))).digest('hex');});
test.beforeEach(async({context})=>{
  await context.route('**/catalog-sources.json',route=>route.fulfill({status:200,json:{schemaVersion:'acquiring-pwa-catalog-sources-1',catalogs:[{kind:'songs',manifestUrl:new URL('/song-product/manifest.json',route.request().url()).href,manifestSha256:fixture.hash}]}}));
  await context.route('**/song-product/**',async route=>{
    const relative=new URL(route.request().url()).pathname.split('/song-product/')[1]!,path=resolve(fixture.directory,relative);
    if(!path.startsWith(resolve(fixture.directory)+sep))throw new Error('Fixture traversal');
    await route.fulfill({status:200,body:await readFile(path)});
  });
});
async function install(page:Page,origin='http://127.0.0.1:4173'){
  await page.goto(origin+'/');await page.getByRole('button',{name:'Download catalogs',exact:true}).click();
  await page.getByRole('button',{name:'Download song library',exact:true}).click();await expect(page.getByText('Downloaded and verified',{exact:true})).toBeVisible({timeout:25_000});
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search songs',exact:true}).fill('Detail_Gzip');
  await page.locator('[data-song-slug="detail-gzip"]').click();await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
}
test('product Song Info/Chords reads offline, previews on actual audio clock, preserves section/tab and releases borrowed output',async({page,context},testInfo)=>{
  await page.addInitScript(()=>{
    type Item={peak:number;scheduled:number;endedAt:number|null;stops:number};
    const proof:{contexts:AudioContext[];items:Item[]}={contexts:[],items:[]};
    (window as unknown as {songAudioProof:typeof proof}).songAudioProof=proof;
    const Native=window.AudioContext;
    window.AudioContext=class extends Native {
      constructor(options?:AudioContextOptions){super(options);proof.contexts.push(this);}
      createBufferSource(){
        const source=super.createBufferSource(),start=source.start.bind(source),stop=source.stop.bind(source),context=this;
        const item:Item={peak:0,scheduled:0,endedAt:null,stops:0};
        source.start=(when=0,offset=0,duration?:number)=>{
          const data=source.buffer?.getChannelData(0);if(data)for(const sample of data)item.peak=Math.max(item.peak,Math.abs(sample));
          item.scheduled=when;proof.items.push(item);source.addEventListener('ended',()=>{item.endedAt=context.currentTime;});
          if(duration===undefined)start(when,offset);else start(when,offset,duration);
        };
        source.stop=(when=0)=>{item.stops++;stop(when);};return source;
      }
    };
  });
  await install(page);
  await expect(page.getByText('90 BPM',{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Open original source'})).toHaveAttribute('href','https://example.test/');
  await page.getByRole('button',{name:'Chords',exact:true}).click();
  await expect(page.getByText('Scale: C, D, E, F, G, A, B',{exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Chord tones',exact:true})).toHaveCount(0);
  await expect(page.getByText('I → V7 ×1',{exact:true})).toBeVisible();
  await page.getByRole('checkbox',{name:'Root only transitions'}).check();await expect(page.getByText('1 → 5 ×1',{exact:true})).toBeVisible();
  await page.getByRole('checkbox',{name:'Root only transitions'}).uncheck();
  await page.getByRole('button',{name:'Preview I',exact:true}).click();
  const audio=()=>page.evaluate(()=>{
    const proof=(window as unknown as {songAudioProof:{contexts:AudioContext[];items:{peak:number;scheduled:number;endedAt:number|null;stops:number}[]}}).songAudioProof;
    return {count:proof.contexts.length,state:proof.contexts[0]?.state,time:proof.contexts[0]?.currentTime,items:proof.items};
  });
  await expect.poll(async()=>(await audio()).items[0]?.endedAt??0).toBeGreaterThan(0);
  const first=await audio();expect(first.count).toBe(1);expect(first.items[0]!.peak).toBeGreaterThan(.001);expect(first.items[0]!.endedAt!).toBeGreaterThan(first.items[0]!.scheduled);
  await expect(page.getByRole('button',{name:'Preview I',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('region',{name:'Chord tones',exact:true}).getByRole('button')).toHaveCount(3);
  await page.getByRole('button',{name:'Preview chord tone 3\u0302',exact:true}).click();
  await expect.poll(async()=>(await audio()).items[1]?.endedAt??0).toBeGreaterThan(0);
  expect((await audio()).items[1]!.peak).toBeGreaterThan(.001);expect((await audio()).count).toBe(1);
  await page.getByRole('button',{name:'Preview I',exact:true}).click();await page.getByRole('combobox',{name:'Section',exact:true}).selectOption('10');
  await expect.poll(async()=>(await audio()).items[2]?.stops??0).toBeGreaterThan(0);
  await expect(page.getByRole('region',{name:'Chord tones',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Preview IV',exact:true})).toBeVisible();
  await page.getByRole('checkbox',{name:'Letter names'}).check();await expect(page.getByRole('button',{name:'Preview F',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByRole('searchbox',{name:'Search songs',exact:true})).toHaveValue('Detail_Gzip');
  await page.locator('[data-song-slug="detail-gzip"]').click();await expect(page.getByRole('combobox',{name:'Section',exact:true})).toHaveValue('10');
  await expect(page.getByRole('button',{name:'Preview F',exact:true})).toBeVisible();await page.getByRole('button',{name:'Preview F',exact:true}).click();
  expect((await audio()).count).toBe(1);
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));});
  await context.setOffline(true);await page.reload();await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
  await page.setViewportSize({width:320,height:640});await page.evaluate(()=>{document.documentElement.style.fontSize='32px';});
  await page.getByRole('button',{name:'Chords',exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const path=testInfo.outputPath('song-narrow.png');await mkdir(resolve(path,'..'),{recursive:true});await page.screenshot({path,fullPage:true});
  await testInfo.attach('audio-proof',{body:JSON.stringify(first),contentType:'application/json'});
});
test('development StrictMode song readers remount and missing direct links offer a usable download path',async({page})=>{
  await page.goto('http://127.0.0.1:5173/songs/detail-gzip');
  await expect(page.getByRole('heading',{name:'Song library needed',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Download catalogs',exact:true}).click();await page.getByRole('button',{name:'Download song library',exact:true}).click();
  await expect(page.getByText('Downloaded and verified',{exact:true})).toBeVisible({timeout:25_000});await page.getByRole('button',{name:'Back',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByRole('searchbox',{name:'Search songs',exact:true})).toBeVisible();
  await page.goto('http://127.0.0.1:5173/songs/missing-song');await expect(page.getByRole('heading',{name:'Song unavailable',exact:true})).toBeVisible();
});
