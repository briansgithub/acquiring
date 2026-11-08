import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {expect,test,type Page} from '@playwright/test';
import type {CatalogManifest} from '../../src/storage/catalog/manifest';
let fixture:{directory:string;manifest:CatalogManifest;hash:string};
test.setTimeout(60_000);
test.beforeAll(async()=>{fixture=JSON.parse(execFileSync('python',['scripts/catalog/make-library-browser-fixture.py','--song-screen','--playback-errors','--playback-major','--playback-title'],{encoding:'utf8'}));fixture.hash=createHash('sha256').update(await readFile(resolve(fixture.directory,'manifest.json'))).digest('hex');});
test.beforeEach(async({context})=>{
  await context.route('**/catalog-sources.json',route=>route.fulfill({status:200,json:{schemaVersion:'acquiring-pwa-catalog-sources-1',catalogs:[{kind:'songs',manifestUrl:new URL('/playback-product/manifest.json',route.request().url()).href,manifestSha256:fixture.hash}]}}));
  await context.route('**/playback-product/**',async route=>{
    const relative=new URL(route.request().url()).pathname.split('/playback-product/')[1]!,path=resolve(fixture.directory,relative);
    if(!path.startsWith(resolve(fixture.directory)+sep))throw new Error('Fixture traversal');
    await route.fulfill({status:200,body:await readFile(path)});
  });
});
async function instrument(page:Page){
  await page.addInitScript(()=>{
    type Item={peak:number;scheduled:number;endedAt:number|null;stops:number;frames:number;hz:number;homeEnergy:Record<number,number>;pcmHash:number;intervalEnergy:Record<number,number>[]};
    const proof:{contexts:AudioContext[];items:Item[]}={contexts:[],items:[]};
    (window as unknown as {playbackProof:typeof proof}).playbackProof=proof;
    const Native=window.AudioContext;
    window.AudioContext=class extends Native {
      constructor(options?:AudioContextOptions){super(options);proof.contexts.push(this);}
      createBufferSource(){
        const source=super.createBufferSource(),start=source.start.bind(source),stop=source.stop.bind(source),context=this;
        const item:Item={peak:0,scheduled:0,endedAt:null,stops:0,frames:0,hz:0,homeEnergy:{},pcmHash:0,intervalEnergy:[]};
        source.start=(when=0,offset=0,duration?:number)=>{
          const data=source.buffer?.getChannelData(0);if(data){item.frames=data.length;let crossings=0;for(let i=0;i<data.length;i++){item.peak=Math.max(item.peak,Math.abs(data[i]));if(i>0&&data[i-1]<=0&&data[i]>0)crossings++;}item.hz=crossings*context.sampleRate/Math.max(1,data.length-1);}
          if(data){let hash=2166136261;const bits=new Uint32Array(data.buffer,data.byteOffset,data.length);for(const word of bits)hash=Math.imul(hash^word,16777619);item.pcmHash=hash>>>0;}
          if(data&&Math.abs(data.length/context.sampleRate-.45)<.0001){
            // Measure actual mixed PCM, independent of the requested notes or UI labels.
            const first=Math.floor(context.sampleRate*.08),last=Math.min(data.length,Math.floor(context.sampleRate*.35));
            for(const midi of [50,53,54,57,62,65,66,69]){let re=0,im=0;const omega=2*Math.PI*440*2**((midi-69)/12)/context.sampleRate;for(let i=first;i<last;i++){re+=data[i]*Math.cos(omega*i);im+=data[i]*Math.sin(omega*i);}item.homeEnergy[midi]=Math.hypot(re,im)/(last-first);}
          }
          if(data&&Math.abs(data.length/context.sampleRate-1.35)<.0001){
            const size=Math.trunc(context.sampleRate*.45);
            for(let stage=0;stage<3;stage++){const energies:Record<number,number>={},first=stage*size+Math.floor(context.sampleRate*.08),last=stage*size+Math.floor(context.sampleRate*.35);
              for(const midi of [48,50,60,62,67,72,74]){let re=0,im=0;const omega=2*Math.PI*440*2**((midi-69)/12)/context.sampleRate;for(let i=first;i<last;i++){re+=data[i]*Math.cos(omega*i);im+=data[i]*Math.sin(omega*i);}energies[midi]=Math.hypot(re,im)/(last-first);}item.intervalEnergy.push(energies);
            }
          }
          item.scheduled=when;proof.items.push(item);source.addEventListener('ended',()=>{item.endedAt=context.currentTime;});
          if(duration===undefined)start(when,offset);else start(when,offset,duration);
        };
        source.stop=(when=0)=>{item.stops++;stop(when);};return source;
      }
    };
  });
}
async function audio(page:Page){return page.evaluate(()=>{
  const p=(window as unknown as {playbackProof:{contexts:AudioContext[];items:{peak:number;scheduled:number;endedAt:number|null;stops:number;frames:number;hz:number;homeEnergy:Record<number,number>;pcmHash:number;intervalEnergy:Record<number,number>[]}[]}}).playbackProof;
  return {contexts:p.contexts.map(context=>({rate:context.sampleRate,state:context.state,time:context.currentTime})),items:p.items};
});}
async function installAndOpen(page:Page,slug='detail-gzip',query='Detail_Gzip'){
  await page.goto('/');await page.getByRole('button',{name:'Download catalogs',exact:true}).click();
  await page.getByRole('button',{name:'Download song library',exact:true}).click();await expect(page.getByText('Downloaded and verified',{exact:true})).toBeVisible({timeout:25_000});
  await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('searchbox',{name:'Search songs',exact:true}).fill(query);
  await page.locator(`[data-song-slug="${slug}"]`).click();await page.getByRole('button',{name:'Play song',exact:true}).click();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
  await expect(page.getByRole('slider',{name:'Position',exact:true})).toBeEnabled();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('data-playback-phase','stopped');
}
/** Chromium Input.dispatchTouchEvent. Emulated browser touch, not page.evaluate PointerEvent, not Pixel. */
async function emulateTouchDrag(page:Page,from:{x:number;y:number},to:{x:number;y:number},steps=8){
  const client=await page.context().newCDPSession(page);
  const point=(x:number,y:number)=>({id:0,x,y,radiusX:1,radiusY:1,force:1});
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(from.x,from.y)]});
  for(let i=1;i<=steps;i++){
    const x=from.x+(to.x-from.x)*i/steps,y=from.y+(to.y-from.y)*i/steps;
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(x,y)]});
  }
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
test('product playback uses real streaming audio and preserves explicit intent across controls and teardown',async({page},testInfo)=>{
  await instrument(page);await installAndOpen(page);
  const view=page.locator('[data-playback-phase]'),position=page.getByRole('slider',{name:'Position',exact:true}),tempo=page.getByRole('slider',{name:'Tempo (%)',exact:true});
  expect((await audio(page)).contexts).toHaveLength(0);
  await tempo.focus();await tempo.press('Home');await tempo.press('ArrowRight');
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(view).toHaveAttribute('data-playback-phase','playing');await expect(view).toHaveAttribute('data-playback-requested','true');
  await expect.poll(async()=>(await audio(page)).items.some(item=>item.peak>.001)).toBe(true);
  await expect.poll(async()=>Number(await position.inputValue())).toBeGreaterThan(1);
  expect((await audio(page)).contexts).toHaveLength(1);
  await page.getByRole('button',{name:'Pause',exact:true}).click();await expect(view).toHaveAttribute('data-playback-phase','paused');
  const pausedCount=(await audio(page)).items.length;await page.waitForTimeout(150);expect((await audio(page)).items).toHaveLength(pausedCount);
  await position.focus();await position.press('End');expect(Number(await position.inputValue())).toBe(Number(await position.getAttribute('max')));
  await position.press('Home');expect(Number(await position.inputValue())).toBe(1);await expect(view).toHaveAttribute('data-playback-requested','false');
  await page.getByRole('button',{name:'Play',exact:true}).click();await expect(view).toHaveAttribute('data-playback-phase','playing');
  await position.focus();await page.keyboard.down('ArrowRight');await expect(view).toHaveAttribute('data-playback-phase','paused');
  const scrubCount=(await audio(page)).items.length;await page.waitForTimeout(150);expect((await audio(page)).items).toHaveLength(scrubCount);
  await page.keyboard.up('ArrowRight');await expect(view).toHaveAttribute('data-playback-phase','playing');
  const bounds=await position.boundingBox();expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x+bounds!.width*.3,bounds!.y+bounds!.height/2);await page.mouse.down();await expect(view).toHaveAttribute('data-playback-phase','paused');
  await page.mouse.move(bounds!.x+bounds!.width*.6,bounds!.y+bounds!.height/2);const pointerCount=(await audio(page)).items.length;
  await page.waitForTimeout(100);expect((await audio(page)).items).toHaveLength(pointerCount);await page.mouse.up();await expect(view).toHaveAttribute('data-playback-phase','playing');
  await position.focus();await page.keyboard.down('ArrowRight');await position.blur();await page.keyboard.up('ArrowRight');
  await expect(view).toHaveAttribute('data-playback-phase','paused');await expect(view).toHaveAttribute('data-playback-requested','false');
  await page.getByRole('button',{name:'Play',exact:true}).click();await expect(view).toHaveAttribute('data-playback-phase','playing');
  await tempo.focus();await tempo.press('Home');await expect(view).toHaveAttribute('data-playback-phase','paused');await expect(view).toHaveAttribute('data-playback-requested','true');
  const zeroBeat=await position.inputValue(),zeroCount=(await audio(page)).items.length;await page.waitForTimeout(150);expect(await position.inputValue()).toBe(zeroBeat);expect((await audio(page)).items).toHaveLength(zeroCount);
  await tempo.press('ArrowRight');await expect(view).toHaveAttribute('data-playback-phase','playing');
  const arp=page.getByRole('combobox',{name:'Arpeggio',exact:true});expect(await arp.locator('option').count()).toBe(8);await arp.selectOption({index:1});const chosen=await arp.inputValue();
  await page.getByRole('checkbox',{name:'Root only',exact:true}).check();await expect(arp).toHaveCount(0);
  await page.getByRole('combobox',{name:'Instrument',exact:true}).selectOption('SINE');
  expect(await page.getByRole('combobox',{name:'Instrument',exact:true}).locator('option').count()).toBe(13);
  const mix=page.getByRole('slider',{name:'Melody mix',exact:true});await mix.focus();await mix.press('End');
  const transpose=page.getByRole('slider',{name:'Transpose',exact:true});await transpose.focus();await transpose.press('End');
  await page.getByRole('combobox',{name:'Section',exact:true}).selectOption('10');
  await expect(view).toHaveAttribute('data-playback-requested','true');await expect(view).toHaveAttribute('data-playback-phase','playing');
  await expect(page.getByRole('checkbox',{name:'Root only',exact:true})).toBeChecked();expect(await transpose.inputValue()).toBe('12');
  expect(await mix.inputValue()).toBe('100');
  await page.getByRole('checkbox',{name:'Root only',exact:true}).uncheck();await expect(arp).toHaveValue(chosen);
  expect((await audio(page)).contexts).toHaveLength(1);
  await page.getByRole('button',{name:'Reset',exact:true}).click();await expect(view).toHaveAttribute('data-playback-phase','stopped');expect(Number(await position.inputValue())).toBe(1);
  await page.getByRole('button',{name:'Play',exact:true}).click();await expect(view).toHaveAttribute('data-playback-phase','playing');
  await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
  const leaving=(await audio(page)).items.length;await page.waitForTimeout(150);expect((await audio(page)).items).toHaveLength(leaving);
  await page.getByRole('button',{name:'Play song',exact:true}).click();await expect(view).toHaveAttribute('data-playback-phase','stopped');await expect(view).toHaveAttribute('data-playback-requested','false');
  expect((await audio(page)).contexts).toHaveLength(1);
  const path=testInfo.outputPath('proof.json');await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,JSON.stringify(await audio(page),null,2));
});
test('playback reloads offline without autoplay and fits narrow large text',async({page,context},testInfo)=>{
  await instrument(page);await installAndOpen(page);
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));});
  await context.setOffline(true);await page.reload();
  const view=page.locator('[data-playback-phase]');await expect(view).toHaveAttribute('aria-busy','false');await expect(page.getByRole('slider',{name:'Position',exact:true})).toBeEnabled();await expect(view).toHaveAttribute('data-playback-phase','stopped');await expect(view).toHaveAttribute('data-playback-requested','false');expect((await audio(page)).contexts).toHaveLength(0);
  await page.setViewportSize({width:320,height:640});await page.evaluate(()=>{document.documentElement.style.fontSize='32px';});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const controls=view.locator('.playback-transport button,.playback-field select,.playback-field input[type=range]');
  // Favorites/Play/Mic/Reset, four ranges and three selects; checkbox uses its 44px label.
  expect(await controls.count()).toBe(11);
  expect(await controls.evaluateAll(elements=>elements.every(element=>{const b=element.getBoundingClientRect();return b.width>=44&&b.height>=44;}))).toBe(true);
  const path=testInfo.outputPath('playback-narrow.png');await mkdir(resolve(path,'..'),{recursive:true});await page.screenshot({path,fullPage:true});
  await page.getByRole('button',{name:'Play',exact:true}).click();await expect.poll(async()=>(await audio(page)).items.some(item=>item.peak>.001)).toBe(true);
});
test('direct playback development StrictMode keeps a fresh readonly owner and offers missing downloads',async({page})=>{
  await page.goto('http://127.0.0.1:5173/playback/detail-gzip');await expect(page.getByRole('heading',{name:'Song library needed',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Download catalogs',exact:true}).click();await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByRole('heading',{name:'Song library needed',exact:true})).toBeVisible();
});

test('unsupported sections remain silent, recover to a valid section, and release recovered owners',async({page})=>{
  await instrument(page);await installAndOpen(page);await page.goto('/playback/playback-bad-first');
  const view=page.locator('[data-playback-phase]');
  await expect(view).toHaveAttribute('aria-busy','false');
  await expect(view).toHaveAttribute('data-playback-phase','error');
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeDisabled();expect((await audio(page)).contexts).toHaveLength(0);
  await page.getByRole('combobox',{name:'Section',exact:true}).selectOption('10');await expect(view).toHaveAttribute('data-playback-phase','stopped');
  await page.getByRole('button',{name:'Play',exact:true}).click();await expect(view).toHaveAttribute('data-playback-phase','playing');
  await expect.poll(async()=>(await audio(page)).items.some(item=>item.peak>.001)).toBe(true);
  await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByRole('searchbox',{name:'Search songs',exact:true})).toBeVisible();
  const count=(await audio(page)).items.length;await page.waitForTimeout(150);expect((await audio(page)).items).toHaveLength(count);
});

test('later unsupported section stays silent until a valid section is selected',async({page})=>{
  await instrument(page);await installAndOpen(page);const view=page.locator('[data-playback-phase]');
  await page.goto('/playback/playback-bad-last');await expect(view).toHaveAttribute('aria-busy','false');await expect(view).toHaveAttribute('data-playback-phase','stopped');
  await page.getByRole('button',{name:'Play',exact:true}).click();await expect(view).toHaveAttribute('data-playback-phase','playing');
  await page.getByRole('combobox',{name:'Section',exact:true}).selectOption('10');await expect(view).toHaveAttribute('data-playback-phase','error');
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeDisabled();
  const tempo=page.getByRole('slider',{name:'Tempo (%)',exact:true});await tempo.focus();await tempo.press('Home');
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeDisabled();
  const invalidCount=(await audio(page)).items.length;await page.waitForTimeout(150);expect((await audio(page)).items).toHaveLength(invalidCount);
  await page.getByRole('combobox',{name:'Section',exact:true}).selectOption('2');await expect(view).toHaveAttribute('data-playback-phase','stopped');await expect(page.getByRole('button',{name:'Play',exact:true})).toBeEnabled();
});

test('current cards use native source keys, written duration and one transpose while sharing audio ownership',async({page},testInfo)=>{
  await instrument(page);await installAndOpen(page);
  const band=page.getByRole('region',{name:'At this beat',exact:true}),view=page.locator('[data-playback-phase]');
  await expect(band.getByLabel('Source key',{exact:true})).toHaveText('C Major');
  const chord=band.getByRole('button',{name:'Play current chord I',exact:true});await expect(chord).toBeVisible();
  const tones=band.getByRole('group',{name:'Chord tones',exact:true}).getByRole('button');await expect(tones).toHaveCount(3);
  expect((await audio(page)).contexts).toHaveLength(0);
  await page.getByRole('combobox',{name:'Instrument',exact:true}).selectOption('SINE');
  const tempo=page.getByRole('slider',{name:'Tempo (%)',exact:true});await tempo.focus();await tempo.press('Home');await page.getByRole('combobox',{name:'Arpeggio',exact:true}).selectOption({index:7});
  await chord.click();await expect.poll(async()=>(await audio(page)).items.length).toBe(1);
  let proof=await audio(page);expect(proof.items[0].peak).toBeGreaterThan(.001);expect(proof.items[0].frames/proof.contexts[0].rate*1000).toBeCloseTo(667,1);
  await tones.first().click();await expect.poll(async()=>(await audio(page)).items.length).toBe(2);proof=await audio(page);
  const firstHz=proof.items[1].hz;expect(firstHz).toBeGreaterThan(50);expect(proof.items[1].frames/proof.contexts[0].rate*1000).toBeCloseTo(450,1);
  const transpose=page.getByRole('slider',{name:'Transpose',exact:true});await transpose.focus();await transpose.press('End');await tones.first().click();await expect.poll(async()=>(await audio(page)).items.length).toBe(3);
  proof=await audio(page);expect(proof.items[2].hz/firstHz).toBeGreaterThan(1.95);expect(proof.items[2].hz/firstHz).toBeLessThan(2.05);expect(proof.contexts).toHaveLength(1);
  await expect(view).toHaveAttribute('data-playback-requested','false');
  await page.getByRole('checkbox',{name:'Root only',exact:true}).check();await expect(band.getByRole('group',{name:'Chord cards',exact:true})).toHaveCount(0);await expect(band.getByRole('group',{name:'Melody cards',exact:true})).toHaveCount(0);
  await expect(band.getByRole('group',{name:'Root cards',exact:true}).getByRole('button')).toHaveCount(1);
  const position=page.getByRole('slider',{name:'Position',exact:true});await position.focus();await position.press('End');await expect.poll(async()=>(await audio(page)).items[2].stops).toBeGreaterThan(0);await expect(band.getByLabel('Source key',{exact:true})).toHaveText('D Minor');await expect(band.getByText('No sounding root',{exact:true})).toBeVisible();
  await position.press('Home');await page.getByRole('checkbox',{name:'Root only',exact:true}).uncheck();
  await expect(band.getByRole('group',{name:'Melody cards',exact:true}).getByRole('button')).toHaveCount(1);
  await band.getByRole('group',{name:'Melody cards',exact:true}).getByRole('button').click();await expect.poll(async()=>(await audio(page)).items.length).toBe(4);
  await page.getByRole('combobox',{name:'Section',exact:true}).selectOption('10');await expect.poll(async()=>(await audio(page)).items[3].stops).toBeGreaterThan(0);await expect(band.getByText('No sounding melody',{exact:true})).toBeVisible();
  await expect(band.getByRole('button',{name:'Play current chord IV',exact:true})).toBeVisible();
  await band.getByRole('button',{name:'Play current chord IV',exact:true}).click();await expect.poll(async()=>(await audio(page)).items.length).toBe(5);await page.getByRole('button',{name:'Reset',exact:true}).click();await expect.poll(async()=>(await audio(page)).items[4].stops).toBeGreaterThan(0);
  await page.setViewportSize({width:320,height:640});await page.evaluate(()=>{document.documentElement.style.fontSize='32px';});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await band.getByRole('button').evaluateAll(elements=>elements.every(element=>{const b=element.getBoundingClientRect();return b.width>=44&&b.height>=44;}))).toBe(true);
  const path=testInfo.outputPath('current-cards-narrow.png');await mkdir(resolve(path,'..'),{recursive:true});await band.screenshot({path});await writeFile(testInfo.outputPath('card-proof.json'),JSON.stringify(await audio(page),null,2));
});

test('musical home references follow the sounding key and preview a minor triad with one transpose',async({page},testInfo)=>{
  await instrument(page);await installAndOpen(page);
  const band=page.getByRole('region',{name:'At this beat',exact:true}),home=band.getByRole('group',{name:'Home references',exact:true});
  const note=home.getByRole('button',{name:'Play scale degree 1',exact:true}),chord=home.getByRole('button',{name:'Play home chord',exact:true});
  expect((await audio(page)).contexts).toHaveLength(0);await page.getByRole('combobox',{name:'Instrument',exact:true}).selectOption('SINE');
  await note.focus();await note.press('Enter');await expect.poll(async()=>(await audio(page)).items.length).toBe(1);
  let proof=await audio(page);const cHz=proof.items[0].hz;expect(cHz).toBeGreaterThan(250);expect(cHz).toBeLessThan(270);
  const position=page.getByRole('slider',{name:'Position',exact:true});await position.focus();await position.press('End');
  await expect(band.getByLabel('Source key',{exact:true})).toHaveText('D Minor');await expect(band.getByText('No sounding chord',{exact:true})).toBeVisible();
  await page.getByRole('checkbox',{name:'Root only',exact:true}).check();await expect(home).toBeVisible();await note.click();await expect.poll(async()=>(await audio(page)).items.length).toBe(2);
  proof=await audio(page);const dHz=proof.items[1].hz;expect(dHz/cHz).toBeGreaterThan(1.1);expect(dHz/cHz).toBeLessThan(1.14);
  const transpose=page.getByRole('slider',{name:'Transpose',exact:true});await transpose.focus();await transpose.press('End');await note.click();await expect.poll(async()=>(await audio(page)).items.length).toBe(3);
  proof=await audio(page);expect(proof.items[2].hz/dHz).toBeGreaterThan(1.95);expect(proof.items[2].hz/dHz).toBeLessThan(2.05);
  await chord.click();await expect.poll(async()=>(await audio(page)).items.length).toBe(4);proof=await audio(page);
  const mixed=proof.items[3];expect(mixed.frames/proof.contexts[0].rate*1000).toBeCloseTo(450,1);
  for(const midi of [62,65,69]){expect(mixed.homeEnergy[midi]).toBeGreaterThan(.001);expect(mixed.homeEnergy[midi]).toBeGreaterThan(mixed.homeEnergy[66]*10);}
  expect(proof.contexts).toHaveLength(1);await expect(page.locator('[data-playback-phase]')).toHaveAttribute('data-playback-requested','false');
  await page.getByRole('button',{name:'Reset',exact:true}).click();await expect.poll(async()=>(await audio(page)).items[3].stops).toBeGreaterThan(0);
  await expect(band.getByLabel('Source key',{exact:true})).toHaveText('C Major');
  const path=testInfo.outputPath('home-proof.json');await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,JSON.stringify(await audio(page),null,2));
});

test('Lock in Major fixes the section context across modulation while preserving written chord and Home audio',async({page},testInfo)=>{
  await instrument(page);await installAndOpen(page);
  const band=page.getByRole('region',{name:'At this beat',exact:true}),lock=band.getByRole('checkbox',{name:'Lock in Major',exact:true});
  await expect(lock).not.toBeChecked();expect((await audio(page)).contexts).toHaveLength(0);
  await page.getByRole('combobox',{name:'Instrument',exact:true}).selectOption('SINE');
  const melody=band.getByRole('group',{name:'Melody cards',exact:true}).getByRole('button'),chord=band.getByRole('button',{name:'Play current chord I',exact:true});
  await melody.click();await expect.poll(async()=>(await audio(page)).items.length).toBe(1);
  await chord.click();await expect.poll(async()=>(await audio(page)).items.length).toBe(2);
  const before=await audio(page);await lock.check();expect((await audio(page)).items).toHaveLength(2);await expect(band.getByLabel('Display key',{exact:true})).toHaveText('Display: C Major');
  await melody.click();await expect.poll(async()=>(await audio(page)).items.length).toBe(3);
  let proof=await audio(page);expect(proof.items[2].pcmHash).toBe(before.items[0].pcmHash);expect(proof.items[2].frames).toBe(before.items[0].frames);
  await chord.click();await expect.poll(async()=>(await audio(page)).items.length).toBe(4);proof=await audio(page);
  expect(proof.items[3].pcmHash).toBe(before.items[1].pcmHash);expect(proof.items[3].frames).toBe(before.items[1].frames);
  const position=page.getByRole('slider',{name:'Position',exact:true});await position.focus();await position.press('Home');for(let i=0;i<100;i++)await position.press('ArrowRight');await expect(position).toHaveValue('2');
  await expect(band.getByLabel('Source key',{exact:true})).toHaveText('Song: D Minor');await expect(band.getByLabel('Display key',{exact:true})).toHaveText('Display: C Major');
  const timeline=page.locator('[data-playback-timeline="visible"]');await expect(timeline).toHaveAttribute('data-timeline-major','true');
  await expect.poll(async()=>timeline.getAttribute('data-timeline-romans')).toContain('vi7');
  await expect(band.getByRole('button',{name:'Play current chord vi7',exact:true})).toBeVisible();
  const tones=band.getByRole('group',{name:'Chord tones',exact:true}).getByRole('button'),toneLabel=await tones.nth(1).getAttribute('aria-label');
  await tones.nth(1).click();await expect.poll(async()=>(await audio(page)).items.length).toBe(5);const lockedTone=(await audio(page)).items[4].hz;
  await lock.uncheck();await expect(timeline).toHaveAttribute('data-timeline-major','false');
  await expect.poll(async()=>timeline.getAttribute('data-timeline-romans')).toContain('v7');
  await expect(band.getByRole('button',{name:'Play current chord v7',exact:true})).toBeVisible();expect(await tones.nth(1).getAttribute('aria-label')).toBe(toneLabel);
  await tones.nth(1).click();await expect.poll(async()=>(await audio(page)).items.length).toBe(6);const sourceTone=(await audio(page)).items[5].hz;
  expect(sourceTone/lockedTone).toBeGreaterThan(1.95);expect(sourceTone/lockedTone).toBeLessThan(2.05);
  await lock.check();await page.getByRole('checkbox',{name:'Root only',exact:true}).check();
  await band.getByRole('button',{name:'Play current root 6̂',exact:true}).click();await expect.poll(async()=>(await audio(page)).items.length).toBe(7);proof=await audio(page);expect(proof.items[6].hz).toBeGreaterThan(210);expect(proof.items[6].hz).toBeLessThan(230);
  await band.getByRole('button',{name:'Play scale degree 1',exact:true}).click();await expect.poll(async()=>(await audio(page)).items.length).toBe(8);proof=await audio(page);expect(proof.items[7].hz).toBeGreaterThan(285);expect(proof.items[7].hz).toBeLessThan(305);
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('data-playback-requested','false');expect(proof.contexts).toHaveLength(1);
  await page.getByRole('combobox',{name:'Section',exact:true}).selectOption('10');await expect(lock).toBeChecked();await expect.poll(async()=>(await audio(page)).items[7].stops).toBeGreaterThan(0);
  await page.setViewportSize({width:320,height:640});await page.evaluate(()=>{document.documentElement.style.fontSize='32px';});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await lock.evaluate(element=>{const r=element.closest('label')!.getBoundingClientRect();return r.width>=44&&r.height>=44;})).toBe(true);
  const path=testInfo.outputPath('major-lock-narrow.png');await mkdir(resolve(path,'..'),{recursive:true});await page.screenshot({path,fullPage:true});await writeFile(testInfo.outputPath('major-lock-proof.json'),JSON.stringify(await audio(page),null,2));
});

test('Major lock keeps root taps in the source register and reanchors only when changing section',async({page},testInfo)=>{
  await instrument(page);await installAndOpen(page);
  await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('searchbox',{name:'Search songs',exact:true}).fill('Playback_Context');
  await page.locator('[data-song-slug="playback-context"]').click();await page.getByRole('button',{name:'Play song',exact:true}).click();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
  await page.getByRole('combobox',{name:'Instrument',exact:true}).selectOption('SINE');await page.getByRole('checkbox',{name:'Root only',exact:true}).check();
  const band=page.getByRole('region',{name:'At this beat',exact:true}),lock=band.getByRole('checkbox',{name:'Lock in Major',exact:true});
  await lock.check();await expect(band.getByLabel('Display key',{exact:true})).toHaveText('Display: D Major');
  const position=page.getByRole('slider',{name:'Position',exact:true});await position.focus();await position.press('Home');for(let i=0;i<100;i++)await position.press('ArrowRight');await expect(position).toHaveValue('2');
  await expect(band.getByLabel('Source key',{exact:true})).toHaveText('Song: C Minor');await expect(band.getByLabel('Display key',{exact:true})).toHaveText('Display: D Major');
  await band.getByRole('button',{name:'Play current root ♭7̂',exact:true}).click();await expect.poll(async()=>(await audio(page)).items.length).toBe(1);
  let proof=await audio(page);expect(proof.items[0].hz).toBeGreaterThan(125);expect(proof.items[0].hz).toBeLessThan(140);
  await lock.uncheck();await band.getByRole('button',{name:'Play current root 1̂',exact:true}).click();await expect.poll(async()=>(await audio(page)).items.length).toBe(2);proof=await audio(page);expect(proof.items[1].pcmHash).toBe(proof.items[0].pcmHash);
  await lock.check();await band.getByRole('button',{name:'Play scale degree 1',exact:true}).click();await expect.poll(async()=>(await audio(page)).items.length).toBe(3);proof=await audio(page);expect(proof.items[2].hz).toBeGreaterThan(250);expect(proof.items[2].hz).toBeLessThan(275);
  await page.getByRole('combobox',{name:'Section',exact:true}).selectOption('10');await expect(lock).toBeChecked();await expect(band.getByLabel('Display key',{exact:true})).toHaveText('Display: Ab Major');await expect.poll(async()=>(await audio(page)).items[2].stops).toBeGreaterThan(0);
  const path=testInfo.outputPath('major-root-proof.json');await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,JSON.stringify(await audio(page),null,2));
});

test('previous pitch cards preserve event keys, written unison and rest barriers with real audio',async({page},testInfo)=>{
  test.setTimeout(90_000);await instrument(page);await installAndOpen(page);
  await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('searchbox',{name:'Search songs',exact:true}).fill('Playback_Context');
  await page.locator('[data-song-slug="playback-context"]').click();await page.getByRole('button',{name:'Play song',exact:true}).click();await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
  const band=page.getByRole('region',{name:'At this beat',exact:true}),melody=band.getByRole('group',{name:'Melody cards',exact:true}),lock=band.getByRole('checkbox',{name:'Lock in Major',exact:true});
  const position=page.getByRole('slider',{name:'Position',exact:true});
  async function seek(beat:number){await position.focus();await position.press('Home');for(let i=0;i<10&&Number(await position.inputValue())<beat;i++)await position.press('PageUp');expect(Number(await position.inputValue())).toBeGreaterThanOrEqual(beat);expect(Number(await position.inputValue())).toBeLessThan(beat+1);}
  await page.getByRole('combobox',{name:'Instrument',exact:true}).selectOption('SINE');
  await expect(melody.getByRole('button',{name:/Play previous melody/})).toHaveCount(0);await seek(2);await expect(melody.getByRole('button',{name:'Play previous melody 1̂',exact:true})).toBeVisible();await expect(melody.getByRole('button',{name:'Play melody 1̂',exact:true})).toBeVisible();
  const timeline=page.locator('[data-playback-timeline="visible"]');const unlockedStaff=await timeline.getAttribute('data-timeline-staff');
  await lock.check();await expect(timeline).toHaveAttribute('data-timeline-major','true');
  await expect.poll(async()=>timeline.getAttribute('data-timeline-staff')).not.toBe(unlockedStaff);
  const previous=melody.getByRole('button',{name:'Play previous melody 1̂',exact:true}),current=melody.getByRole('button',{name:'Play melody ♭7̂',exact:true});
  await expect(previous).toBeVisible();await expect(current).toBeVisible();expect((await previous.boundingBox())!.y).toBeLessThan((await current.boundingBox())!.y);
  expect((await audio(page)).contexts).toHaveLength(0);await previous.focus();await previous.press('Enter');await expect.poll(async()=>(await audio(page)).items.length).toBe(1);await current.click();await expect.poll(async()=>(await audio(page)).items.length).toBe(2);
  let proof=await audio(page);expect(proof.items[0].hz).toBeGreaterThan(285);expect(proof.items[0].hz).toBeLessThan(305);expect(proof.items[1].hz).toBeGreaterThan(250);expect(proof.items[1].hz).toBeLessThan(275);
  await seek(3);const low=melody.getByRole('button',{name:'Play previous melody ♭7̂',exact:true}),high=melody.getByRole('button',{name:'Play melody 4̂',exact:true});
  await expect(low).toBeVisible();await expect(high).toBeVisible();expect((await high.boundingBox())!.y).toBeLessThan((await low.boundingBox())!.y);
  await seek(4);await expect(melody.getByRole('button',{name:/Play previous melody/})).toHaveCount(0);await expect(melody.getByRole('button',{name:'Play melody 4̂',exact:true})).toBeVisible();
  await seek(6);await expect(melody.getByRole('button',{name:/Play previous melody/})).toHaveCount(0);await expect(melody.getByRole('button',{name:'Play melody ♭2̂',exact:true})).toBeVisible();
  await seek(2);await page.getByRole('checkbox',{name:'Root only',exact:true}).check();await expect(band.getByRole('group',{name:'Melody cards',exact:true})).toHaveCount(0);
  const roots=band.getByRole('group',{name:'Root cards',exact:true}),previousRoot=roots.getByRole('button',{name:'Play previous root 1̂',exact:true});await expect(previousRoot).toBeVisible();await previousRoot.click();await expect.poll(async()=>(await audio(page)).items.length).toBe(3);
  proof=await audio(page);expect(proof.items[2].hz).toBeGreaterThan(140);expect(proof.items[2].hz).toBeLessThan(155);
  await seek(3);await expect(roots.getByRole('button',{name:'Play previous root ♭7̂',exact:true})).toBeVisible();await expect(roots.getByRole('button',{name:'Play current root ♭7̂',exact:true})).toBeVisible();
  await roots.getByRole('button',{name:'Play previous root ♭7̂',exact:true}).click();await expect.poll(async()=>(await audio(page)).items.length).toBe(4);proof=await audio(page);expect(proof.items[3].hz).toBeGreaterThan(125);expect(proof.items[3].hz).toBeLessThan(140);await page.getByRole('button',{name:'Reset',exact:true}).click();await expect.poll(async()=>(await audio(page)).items[3].stops).toBeGreaterThan(0);
  await expect(roots.getByRole('button',{name:/Play previous root/})).toHaveCount(0);expect((await audio(page)).contexts).toHaveLength(1);
  await page.getByRole('checkbox',{name:'Root only',exact:true}).uncheck();await seek(2);await page.setViewportSize({width:320,height:640});await page.evaluate(()=>{document.documentElement.style.fontSize='32px';scrollTo(0,0);});
  const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:e.className,r:e.getBoundingClientRect().right})).filter(e=>e.r>innerWidth)}));await mkdir(resolve(testInfo.outputPath('geometry.json'),'..'),{recursive:true});await writeFile(testInfo.outputPath('geometry.json'),JSON.stringify(geometry,null,2));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await melody.getByRole('button').evaluateAll(elements=>elements.every(element=>{const r=element.getBoundingClientRect();return r.width>=44&&r.height>=44;}))).toBe(true);
  const path=testInfo.outputPath('previous-cards-narrow.png');await mkdir(resolve(path,'..'),{recursive:true});await page.screenshot({path,fullPage:true});await writeFile(testInfo.outputPath('previous-card-proof.json'),JSON.stringify(await audio(page),null,2));
});

test('interval cards play native three-stage written pitches with exclusive previews and lifecycle cleanup',async({page},testInfo)=>{
 test.setTimeout(90_000);await instrument(page);await installAndOpen(page);
 await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('searchbox',{name:'Search songs',exact:true}).fill('Playback_Context');await page.locator('[data-song-slug="playback-context"]').click();await page.getByRole('button',{name:'Play song',exact:true}).click();await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
 const band=page.getByRole('region',{name:'At this beat',exact:true}),position=page.getByRole('slider',{name:'Position',exact:true}),melody=band.getByRole('group',{name:'Melody cards',exact:true});
 async function seek(beat:number){await position.focus();await position.press('Home');for(let i=0;i<10&&Number(await position.inputValue())<beat;i++)await position.press('PageUp');expect(Number(await position.inputValue())).toBeGreaterThanOrEqual(beat);expect(Number(await position.inputValue())).toBeLessThan(beat+1);}
 await page.getByRole('combobox',{name:'Instrument',exact:true}).selectOption('SINE');await expect(band.getByRole('button',{name:/Play .* interval /})).toHaveCount(0);await seek(2);
 const interval=melody.getByRole('button',{name:'Play melody interval major second, descending',exact:true});await expect(interval).toBeVisible();expect((await audio(page)).contexts).toHaveLength(0);await interval.focus();await interval.press('Enter');await expect.poll(async()=>(await audio(page)).items.length).toBe(1);
 let proof=await audio(page);const frames=Math.trunc(proof.contexts[0].rate*.45);expect(proof.items[0].frames).toBe(frames*3);const raw=proof.items[0].intervalEnergy;expect(raw).toHaveLength(3);expect(raw[0][62]).toBeGreaterThan(.05);expect(raw[1][60]).toBeGreaterThan(.05);expect(raw[2][62]).toBeGreaterThan(.05);expect(raw[2][60]).toBeGreaterThan(.05);expect(raw[0][50]).toBeLessThan(.02);
 await band.getByRole('checkbox',{name:'Lock in Major',exact:true}).check();await interval.click();await expect.poll(async()=>(await audio(page)).items.length).toBe(2);proof=await audio(page);expect(proof.items[1].pcmHash).toBe(proof.items[0].pcmHash);expect(proof.items[1].frames).toBe(frames*3);
 await melody.getByRole('button',{name:'Play melody ♭7̂',exact:true}).click();await expect.poll(async()=>(await audio(page)).items.length).toBe(3);await expect.poll(async()=>(await audio(page)).items[1].stops).toBeGreaterThan(0);expect((await audio(page)).items[2].frames).toBe(frames);
 await interval.click();await expect.poll(async()=>(await audio(page)).items.length).toBe(4);await expect.poll(async()=>(await audio(page)).items[2].stops).toBeGreaterThan(0);
 await seek(2);await page.getByRole('checkbox',{name:'Root only',exact:true}).check();const roots=band.getByRole('group',{name:'Root cards',exact:true}),rootInterval=roots.getByRole('button',{name:'Play root interval major second, descending',exact:true});await expect(rootInterval).toBeVisible();await rootInterval.click();await expect.poll(async()=>(await audio(page)).items.length).toBe(5);proof=await audio(page);const root=proof.items[4].intervalEnergy;expect(root[0][50]).toBeGreaterThan(.05);expect(root[1][48]).toBeGreaterThan(.05);expect(root[2][50]).toBeGreaterThan(.05);expect(root[2][48]).toBeGreaterThan(.05);expect(root[0][62]).toBeLessThan(.02);
 const transpose=page.getByRole('slider',{name:'Transpose',exact:true});await transpose.focus();await transpose.press('End');await rootInterval.click();await expect.poll(async()=>(await audio(page)).items.length).toBe(6);proof=await audio(page);expect(proof.items[5].intervalEnergy[0][62]).toBeGreaterThan(.05);expect(proof.items[5].intervalEnergy[1][60]).toBeGreaterThan(.05);expect(proof.items[5].intervalEnergy[0][74]).toBeLessThan(.02);
 await page.getByRole('combobox',{name:'Instrument',exact:true}).selectOption('CLARINET');await rootInterval.click();await expect.poll(async()=>(await audio(page)).items.length).toBe(7);proof=await audio(page);expect(proof.items[6].frames).toBe(frames*3);expect(proof.items[6].pcmHash).not.toBe(proof.items[5].pcmHash);await page.getByRole('button',{name:'Reset',exact:true}).click();await expect.poll(async()=>(await audio(page)).items[6].stops).toBeGreaterThan(0);await expect(roots.getByRole('button',{name:/Play root interval /})).toHaveCount(0);
 await seek(3);await expect(roots.getByRole('button',{name:/Play previous root/})).toHaveCount(1);await expect(roots.getByRole('button',{name:/Play root interval /})).toHaveCount(0);await page.getByRole('checkbox',{name:'Root only',exact:true}).uncheck();await seek(4);await expect(melody.getByRole('button',{name:/Play melody interval /})).toHaveCount(0);await seek(6);await expect(melody.getByRole('button',{name:/Play melody interval /})).toHaveCount(0);
 await seek(2);await page.setViewportSize({width:320,height:640});await page.evaluate(()=>{document.documentElement.style.fontSize='32px';scrollTo(0,0);});await expect(interval).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await band.getByRole('button').evaluateAll(elements=>elements.every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44;}))).toBe(true);const image=testInfo.outputPath('interval-cards-narrow.png');await mkdir(resolve(image,'..'),{recursive:true});await page.screenshot({path:image,fullPage:true});
 await interval.click();await expect.poll(async()=>(await audio(page)).items.length).toBe(8);await page.getByRole('combobox',{name:'Section',exact:true}).selectOption('10');await expect.poll(async()=>(await audio(page)).items[7].stops).toBeGreaterThan(0);expect((await audio(page)).contexts).toHaveLength(1);await writeFile(testInfo.outputPath('interval-card-proof.json'),JSON.stringify(await audio(page),null,2));
});

test('visible timeline hides in root-only and singing octave does not start source audio',async({page},testInfo)=>{
  await instrument(page);await installAndOpen(page);
  const timeline=page.locator('[data-playback-timeline="visible"]');
  await expect(timeline).toBeVisible();
  expect(Number(await timeline.getAttribute('data-timeline-melody'))).toBeGreaterThan(0);
  expect(Number(await timeline.getAttribute('data-timeline-chords'))).toBeGreaterThan(0);
  await page.getByRole('checkbox',{name:'Root only',exact:true}).check();
  await expect(page.locator('[data-playback-timeline="hidden"]')).toHaveCount(1);
  await expect(page.locator('[data-playback-timeline="visible"]')).toHaveCount(0);
  await page.getByRole('checkbox',{name:'Root only',exact:true}).uncheck();
  await expect(timeline).toBeVisible();
  expect((await audio(page)).contexts).toHaveLength(0);
  await page.getByRole('button',{name:'Expand Humming Tool',exact:true}).click();
  await expect(page.locator('[data-singing-dock="expanded"]')).toBeVisible();
  await expect(page.getByRole('switch',{name:'Flip-Flop',exact:true})).toBeEnabled();
  await expect(page.locator('[data-singing-interval="empty"]')).toBeVisible();
  await page.getByRole('button',{name:'Raise singing octave',exact:true}).click();
  await expect(page.getByRole('status',{name:'Singing octave',exact:true})).toHaveText('+1');
  expect((await audio(page)).contexts).toHaveLength(0);
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('data-playback-requested','true');
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.setViewportSize({width:320,height:640});
  await page.evaluate(()=>{document.documentElement.style.fontSize='32px';scrollTo(0,0);});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const path=testInfo.outputPath('timeline-octave-narrow.png');await mkdir(resolve(path,'..'),{recursive:true});await page.screenshot({path,fullPage:true});
});

test('singing dock loads card targets without scores and octave persists per song',async({page,context},testInfo)=>{
  await context.grantPermissions(['microphone']);
  await instrument(page);await installAndOpen(page);
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('data-playback-requested','true');
  await page.getByRole('group',{name:'Melody cards',exact:true}).locator('[data-card-role="current"]').dblclick();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('data-playback-requested','false');
  await expect(page.locator('[data-singing-dock="expanded"]')).toBeVisible();
  await expect(page.locator('[data-singing-slot="1"]')).not.toHaveText('—');
  await expect(page.locator('[data-singing-slot="1"] [data-singing-cents]')).toHaveText('+0¢');
  await expect(page.locator('[data-singing-slot="1"] [data-singing-cents]')).toHaveAttribute('data-singing-cents-source','target');
  await expect(page.locator('[data-singing-slot="1"] [data-singing-tape]')).toBeVisible();
  await expect(page.locator('[data-singing-slot="1"] [data-tape-tick="left"]').first()).toBeVisible();
  await expect(page.locator('[data-singing-dock]')).toHaveAttribute('data-preview-owner','shared');
  await expect(page.locator('[data-singing-slot="2"] [data-singing-prompt="record"]')).toHaveText('Double tap to record');
  await expect(page.locator('[data-singing-interval="empty"] output')).toHaveText('—');
  await expect(page.locator('[data-singing-dock]')).toHaveAttribute('data-mic-state','idle');
  await expect(page.locator('[data-singing-dock]')).toHaveAttribute('data-mic-opted-in','false');
  await expect(page.getByRole('button',{name:'Stop microphone',exact:true})).toHaveCount(0);
  await expect.poll(async()=>page.locator('[data-singing-dock]').getAttribute('data-mic-state'),{timeout:2_000}).toBe('listening');
  await expect(page.locator('[data-singing-dock]')).toHaveAttribute('data-mic-opted-in','true');
  await expect(page.getByRole('button',{name:'Stop microphone',exact:true})).toBeVisible();
  await expect(page.locator('[data-singing-slot="1"] [data-singing-remaining]')).toBeVisible();
  await expect(page.locator('[data-singing-slot="1"] [data-singing-cents]')).toHaveAttribute('data-singing-cents-source','target');
  await expect(page.locator('[data-singing-interval="empty"] output')).toHaveText('—');
  await page.getByRole('button',{name:'Stop microphone',exact:true}).click();
  await expect(page.locator('[data-singing-dock]')).toHaveAttribute('data-mic-state','idle');
  await expect(page.locator('[data-singing-dock]')).toHaveAttribute('data-mic-opted-in','true');
  await page.getByRole('button',{name:'Raise singing octave',exact:true}).click();
  await expect(page.getByRole('status',{name:'Singing octave',exact:true})).toHaveText('+1');
  const section=page.getByRole('combobox',{name:'Section',exact:true});
  if(await section.locator('option').count()>1){
    await section.selectOption({index:1});
    await expect(page.getByRole('status',{name:'Singing octave',exact:true})).toHaveText('+1');
  }
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search songs',exact:true}).fill('Playback_Context');
  await page.locator('[data-song-slug="playback-context"]').click();
  await page.getByRole('button',{name:'Play song',exact:true}).click();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
  await page.getByRole('button',{name:'Expand Humming Tool',exact:true}).click();
  await expect(page.getByRole('status',{name:'Singing octave',exact:true})).toHaveText('0');
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search songs',exact:true}).fill('Detail_Gzip');
  await page.locator('[data-song-slug="detail-gzip"]').click();
  await page.getByRole('button',{name:'Play song',exact:true}).click();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
  await page.getByRole('button',{name:'Expand Humming Tool',exact:true}).click();
  await expect.poll(async()=>page.getByRole('status',{name:'Singing octave',exact:true}).textContent()).toBe('+1');
  const image=testInfo.outputPath('singing-dock-narrow.png');await mkdir(resolve(image,'..'),{recursive:true});await page.screenshot({path:image,fullPage:true});
});

test('playback remembers Info round-trip position and resets per-song defaults after leaving the song',async({page},testInfo)=>{
  await instrument(page);await installAndOpen(page);
  const tempo=page.getByRole('slider',{name:'Tempo (%)',exact:true}),transpose=page.getByRole('slider',{name:'Transpose',exact:true});
  const mix=page.getByRole('slider',{name:'Melody mix',exact:true}),position=page.getByRole('slider',{name:'Position',exact:true});
  const lock=page.getByRole('checkbox',{name:'Lock in Major',exact:true}),rootOnly=page.getByRole('checkbox',{name:'Root only',exact:true});
  await tempo.fill('125');await transpose.fill('2');await mix.fill('20');
  await page.getByRole('combobox',{name:'Instrument',exact:true}).selectOption('SINE');
  await page.getByRole('combobox',{name:'Arpeggio',exact:true}).selectOption('4');
  await lock.check();await rootOnly.check();
  await position.focus();await position.press('Home');await position.press('PageUp');
  const rememberedBeat=Number(await position.inputValue());
  expect(rememberedBeat).toBeGreaterThan(1);
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Play song',exact:true}).click();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
  await expect(tempo).toHaveValue('125');await expect(transpose).toHaveValue('2');await expect(mix).toHaveValue('50');
  await expect(page.getByRole('combobox',{name:'Instrument',exact:true})).toHaveValue('SINE');
  await expect(page.getByRole('combobox',{name:'Arpeggio',exact:true})).toHaveValue('4');
  await expect(lock).not.toBeChecked();await expect(rootOnly).not.toBeChecked();
  await expect.poll(async()=>Number(await position.inputValue())).toBeCloseTo(rememberedBeat,2);
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search songs',exact:true}).fill('Detail_Gzip');
  await page.locator('[data-song-slug="detail-gzip"]').click();
  await page.getByRole('button',{name:'Play song',exact:true}).click();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
  await expect(tempo).toHaveValue('100');await expect(transpose).toHaveValue('2');
  await expect(page.getByRole('combobox',{name:'Arpeggio',exact:true})).toHaveValue('3');
  await expect(page.getByRole('combobox',{name:'Instrument',exact:true})).toHaveValue('SINE');
  await expect.poll(async()=>Number(await position.inputValue())).toBeCloseTo(rememberedBeat,2);
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search songs',exact:true}).fill('Playback_Context');
  await page.locator('[data-song-slug="playback-context"]').click();
  await page.getByRole('button',{name:'Play song',exact:true}).click();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
  await expect(page.getByRole('slider',{name:'Tempo (%)',exact:true})).toHaveValue('100');
  await expect(page.getByRole('slider',{name:'Transpose',exact:true})).toHaveValue('2');
  await expect(page.getByRole('combobox',{name:'Instrument',exact:true})).toHaveValue('SINE');
  await expect(page.getByRole('slider',{name:'Position',exact:true})).toHaveValue('1');
  const image=testInfo.outputPath('route-memory-narrow.png');await mkdir(resolve(image,'..'),{recursive:true});await page.screenshot({path:image,fullPage:true});
});

test('playback favorite star persists on T06 Favorites and confirms only a successful add',async({page},testInfo)=>{
  await instrument(page);await installAndOpen(page);
  const star=page.getByRole('button',{name:'Add to Favorites',exact:true});
  await expect(star).toHaveAttribute('aria-pressed','false');
  await star.click();
  await expect(page.getByRole('button',{name:'Remove from Favorites',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-favorited-confirmation]')).toHaveText('Favorited');
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Play song',exact:true}).click();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
  await expect.poll(async()=>page.getByRole('button',{name:'Remove from Favorites',exact:true}).getAttribute('aria-pressed')).toBe('true');
  await expect(page.locator('[data-favorited-confirmation]')).toHaveCount(0);
  await page.getByRole('button',{name:'Remove from Favorites',exact:true}).click();
  await expect(page.getByRole('button',{name:'Add to Favorites',exact:true})).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('[data-favorited-confirmation]')).toHaveCount(0);
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search songs',exact:true}).fill('Playback_Context');
  await page.locator('[data-song-slug="playback-context"]').click();
  await page.getByRole('button',{name:'Play song',exact:true}).click();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
  await expect(page.getByRole('button',{name:'Add to Favorites',exact:true})).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search songs',exact:true}).fill('Detail_Gzip');
  await page.locator('[data-song-slug="detail-gzip"]').click();
  await page.getByRole('button',{name:'Play song',exact:true}).click();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
  await expect(page.getByRole('button',{name:'Add to Favorites',exact:true})).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button',{name:'Add to Favorites',exact:true}).click();
  await expect(page.getByRole('button',{name:'Remove from Favorites',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search songs',exact:true}).fill('Detail_Gzip');
  await page.locator('[data-song-slug="detail-gzip"]').click();
  await page.getByRole('button',{name:'Play song',exact:true}).click();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
  await expect.poll(async()=>page.getByRole('button',{name:'Remove from Favorites',exact:true}).getAttribute('aria-pressed')).toBe('true');
  await page.setViewportSize({width:320,height:640});
  await page.evaluate(()=>{document.documentElement.style.fontSize='32px';scrollTo(0,0);});
  expect(await page.getByRole('button',{name:'Remove from Favorites',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44;})).toBe(true);
  const image=testInfo.outputPath('favorite-star-narrow.png');await mkdir(resolve(image,'..'),{recursive:true});await page.screenshot({path:image,fullPage:true});
});

test('Library Playlists Favorites accordion lists starred songs and can unstar them',async({page},testInfo)=>{
  await instrument(page);await installAndOpen(page);
  await page.getByRole('button',{name:'Add to Favorites',exact:true}).click();
  await expect(page.getByRole('button',{name:'Remove from Favorites',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await expect(page.getByRole('button',{name:'Collapse Playlists',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Expand Favorites',exact:true}).click();
  await expect(page.locator('[data-playlists-section] [data-song-slug="detail-gzip"]')).toBeVisible();
  await expect(page.getByRole('button',{name:'Collapse Favorites',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Remove Detail_Gzip from Favorites',exact:true}).click();
  await expect(page.getByText('No songs yet. Tap the star on the Playback tab to add one.',{exact:true})).toBeVisible();
  await expect(page.locator('[data-playlists-section] [data-song-slug="detail-gzip"]')).toHaveCount(0);
  await page.getByRole('searchbox',{name:'Search songs',exact:true}).fill('Detail_Gzip');
  await expect(page.getByRole('button',{name:'Collapse Playlists',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Clear search',exact:true}).click();
  await expect(page.getByRole('button',{name:'Collapse Playlists',exact:true})).toBeVisible();
  await page.setViewportSize({width:320,height:640});
  await page.evaluate(()=>{document.documentElement.style.fontSize='32px';scrollTo(0,0);});
  const image=testInfo.outputPath('library-favorites-accordion-narrow.png');await mkdir(resolve(image,'..'),{recursive:true});await page.screenshot({path:image,fullPage:true});
});

test('Library Play/Shuffle opens saved queue chrome and Play queue starts playback',async({page},testInfo)=>{
  await instrument(page);await installAndOpen(page);
  await page.getByRole('button',{name:'Add to Favorites',exact:true}).click();
  await expect(page.getByRole('button',{name:'Remove from Favorites',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Expand Favorites',exact:true}).click();
  await expect(page.getByRole('button',{name:'Play playlist',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Shuffle play playlist',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Play playlist',exact:true}).click();
  await expect(page.locator('[data-song-queue-screen]')).toBeVisible();
  await expect(page.getByRole('button',{name:'Play queue',exact:true})).toBeVisible();
  await expect(page.getByRole('switch',{name:'Shuffle',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Save playlist',exact:true})).toBeEnabled();
  await page.getByRole('textbox',{name:'Playlist name',exact:true}).fill('Practice queue');
  await page.getByRole('button',{name:'Save playlist',exact:true}).click();
  await expect(page.getByText('Playlist saved',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Play queue',exact:true}).click();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('[data-song-queue-bar]')).toBeVisible();
  const queuedSection=page.getByRole('combobox',{name:'Section',exact:true});
  const queuedFirst=await queuedSection.inputValue();
  await queuedSection.selectOption({index:1});
  await expect.poll(async()=>queuedSection.inputValue()).not.toBe(queuedFirst);
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('data-queue-section',await queuedSection.inputValue());
  await expect(page.getByText('1 of 1',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Previous song',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Next song',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await expect(page.getByRole('button',{name:'Collapse Playlists',exact:true})).toBeVisible();
  await expect(page.locator('[data-song-queue-screen]')).toHaveCount(0);
  await expect(page.getByText('Practice queue',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Expand Practice queue',exact:true}).click();
  await expect(page.locator('[data-playlists-section] [data-song-slug="detail-gzip"]')).toBeVisible();
  const image=testInfo.outputPath('library-play-shuffle-queue-narrow.png');
  await page.setViewportSize({width:320,height:640});
  await page.evaluate(()=>{document.documentElement.style.fontSize='32px';scrollTo(0,0);});
  await mkdir(resolve(image,'..'),{recursive:true});await page.screenshot({path:image,fullPage:true});
});

test('settings default instrument persists and playback session does not overwrite it',async({page},testInfo)=>{
  await instrument(page);await installAndOpen(page);
  await expect(page.getByRole('combobox',{name:'Instrument',exact:true})).toHaveValue('CLARINET');
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('radio',{name:'Default instrument: Sine',exact:true}).check();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search songs',exact:true}).fill('Detail_Gzip');
  await page.locator('[data-song-slug="detail-gzip"]').click();
  await page.getByRole('button',{name:'Play song',exact:true}).click();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
  await expect(page.getByRole('combobox',{name:'Instrument',exact:true})).toHaveValue('SINE');
  await page.getByRole('combobox',{name:'Instrument',exact:true}).selectOption('FLUTE');
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(page.getByRole('radio',{name:'Default instrument: Sine',exact:true})).toBeChecked();
  await page.getByRole('radio',{name:'Default instrument: Electric Piano',exact:true}).check();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search songs',exact:true}).fill('Detail_Gzip');
  await page.locator('[data-song-slug="detail-gzip"]').click();
  await page.getByRole('button',{name:'Play song',exact:true}).click();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
  await expect(page.getByRole('combobox',{name:'Instrument',exact:true})).toHaveValue('ELECTRIC_PIANO');
  await page.reload();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
  await expect.poll(async()=>page.getByRole('combobox',{name:'Instrument',exact:true}).inputValue()).toBe('ELECTRIC_PIANO');
  const image=testInfo.outputPath('default-instrument-narrow.png');await mkdir(resolve(image,'..'),{recursive:true});await page.screenshot({path:image,fullPage:true});
});

test('timeline tap seeks from the centered playhead without starting playback',async({page},testInfo)=>{
  await instrument(page);await installAndOpen(page);
  await expect(page.getByRole('button',{name:'Pitch monitoring',exact:true})).toHaveAttribute('aria-pressed','false');
  const timeline=page.locator('[data-playback-timeline="visible"]');
  const position=page.getByRole('slider',{name:'Position',exact:true});
  await expect(timeline).toBeVisible();
  expect(Number(await position.inputValue())).toBe(1);
  await expect.poll(async()=>Number(await timeline.getAttribute('data-timeline-playhead'))).toBeGreaterThan(0);
  const playhead=Number(await timeline.getAttribute('data-timeline-playhead'));
  await timeline.click({position:{x:playhead+60,y:20}});
  await expect.poll(async()=>Number(await position.inputValue())).toBeCloseTo(2,1);
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('data-playback-requested','false');
  await expect(page.locator('[data-playback-phase]')).not.toHaveAttribute('data-playback-phase','playing');
  const image=testInfo.outputPath('timeline-tap-narrow.png');await mkdir(resolve(image,'..'),{recursive:true});await page.screenshot({path:image,fullPage:true});
});

test('timeline PointerEvent handler scrubs drag math; not real mouse or touch acceptance',async({page},testInfo)=>{
  await instrument(page);await installAndOpen(page);
  const timeline=page.locator('[data-playback-timeline="visible"]');
  const position=page.getByRole('slider',{name:'Position',exact:true});
  await expect(timeline).toBeVisible();
  await expect.poll(async()=>Number(await timeline.getAttribute('data-timeline-playhead'))).toBeGreaterThan(0);
  const playhead=Number(await timeline.getAttribute('data-timeline-playhead'));
  await timeline.scrollIntoViewIfNeeded();
  await timeline.evaluate((el,x)=>{
    const fire=(type:string,clientX:number,buttons:number)=>{
      const r=el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,composed:true,pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons,clientX,clientY:r.top+20}));
    };
    const r=el.getBoundingClientRect();
    fire('pointerdown',r.left+x,1);
    fire('pointermove',r.left+x-60,1);
  },playhead);
  await expect.poll(async()=>Number(await position.inputValue())).toBeCloseTo(2,1);
  await timeline.evaluate((el,x)=>{
    const r=el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,composed:true,pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons:0,clientX:r.left+x-60,clientY:r.top+20}));
  },playhead);
  await expect.poll(async()=>Number(await position.inputValue())).toBeCloseTo(2,1);
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('data-playback-requested','false');
  await expect(page.locator('[data-playback-phase]')).not.toHaveAttribute('data-playback-phase','playing');
  const image=testInfo.outputPath('timeline-drag-handler-narrow.png');await mkdir(resolve(image,'..'),{recursive:true});await page.screenshot({path:image,fullPage:true});
});

test('real Playwright mouse canvas drag scrubs live opposite the finger without inertia',async({page})=>{
  await instrument(page);await installAndOpen(page);
  const timeline=page.locator('[data-playback-timeline="visible"]');
  const position=page.getByRole('slider',{name:'Position',exact:true});
  await expect(timeline).toBeVisible();
  await expect.poll(async()=>Number(await timeline.getAttribute('data-timeline-playhead'))).toBeGreaterThan(0);
  const playhead=Number(await timeline.getAttribute('data-timeline-playhead'));
  // Cards push the canvas below the fold. Box-before-scroll aims at y≈1204 (elementFromPoint miss, beat 1).
  await timeline.scrollIntoViewIfNeeded();
  const box=await timeline.boundingBox();
  if(!box)throw new Error('timeline bounding box');
  await page.mouse.move(box.x+playhead,box.y+20);
  await page.mouse.down();
  await page.mouse.move(box.x+playhead-60,box.y+20,{steps:8});
  await expect.poll(async()=>Number(await position.inputValue())).toBeCloseTo(2,1);
  await page.mouse.up();
  await expect.poll(async()=>Number(await position.inputValue())).toBeCloseTo(2,1);
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('data-playback-requested','false');
  await expect(page.locator('[data-playback-phase]')).not.toHaveAttribute('data-playback-phase','playing');
});

test.describe('emulated browser touch (Playwright/CDP touch dispatch; not PointerEvent math; not Pixel)',()=>{
  test.use({hasTouch:true});
  test('touchscreen tap seeks from the centered playhead without starting playback',async({page})=>{
    await instrument(page);await installAndOpen(page);
    const timeline=page.locator('[data-playback-timeline="visible"]');
    const position=page.getByRole('slider',{name:'Position',exact:true});
    await expect(timeline).toBeVisible();
    expect(Number(await position.inputValue())).toBe(1);
    await expect.poll(async()=>Number(await timeline.getAttribute('data-timeline-playhead'))).toBeGreaterThan(0);
    const playhead=Number(await timeline.getAttribute('data-timeline-playhead'));
    await timeline.scrollIntoViewIfNeeded();
    const box=await timeline.boundingBox();
    if(!box)throw new Error('timeline bounding box');
    await page.touchscreen.tap(box.x+playhead+60,box.y+20);
    await expect.poll(async()=>Number(await position.inputValue())).toBeCloseTo(2,1);
    await expect(page.locator('[data-playback-phase]')).toHaveAttribute('data-playback-requested','false');
    await expect(page.locator('[data-playback-phase]')).not.toHaveAttribute('data-playback-phase','playing');
  });
  test('CDP touch drag scrubs live opposite the finger without inertia',async({page})=>{
    await instrument(page);await installAndOpen(page);
    const timeline=page.locator('[data-playback-timeline="visible"]');
    const position=page.getByRole('slider',{name:'Position',exact:true});
    await expect(timeline).toBeVisible();
    await expect.poll(async()=>Number(await timeline.getAttribute('data-timeline-playhead'))).toBeGreaterThan(0);
    const playhead=Number(await timeline.getAttribute('data-timeline-playhead'));
    await timeline.scrollIntoViewIfNeeded();
    const box=await timeline.boundingBox();
    if(!box)throw new Error('timeline bounding box');
    await emulateTouchDrag(page,{x:box.x+playhead,y:box.y+20},{x:box.x+playhead-60,y:box.y+20});
    await expect.poll(async()=>Number(await position.inputValue())).toBeCloseTo(2,1);
    await expect(page.locator('[data-playback-phase]')).toHaveAttribute('data-playback-requested','false');
    await expect(page.locator('[data-playback-phase]')).not.toHaveAttribute('data-playback-phase','playing');
  });
});

test.describe('policy A first-listen (Playwright fake/silent getUserMedia; not SYNTHETIC oscillator; not Pixel)',()=>{
  test('card double-click starts listening after 800ms including first permission prompt',async({page,context})=>{
    await context.grantPermissions(['microphone']);
    await instrument(page);await installAndOpen(page);
    await page.getByRole('group',{name:'Melody cards',exact:true}).locator('[data-card-role="current"]').dblclick();
    await expect(page.locator('[data-singing-dock="expanded"]')).toBeVisible();
    await expect(page.locator('[data-singing-dock]')).toHaveAttribute('data-mic-state','idle');
    await expect(page.getByRole('button',{name:'Stop microphone',exact:true})).toHaveCount(0);
    await expect.poll(async()=>page.locator('[data-singing-dock]').getAttribute('data-mic-state'),{timeout:2_000}).toBe('listening');
    await expect(page.locator('[data-singing-dock]')).toHaveAttribute('data-mic-opted-in','true');
    await expect(page.getByRole('button',{name:'Stop microphone',exact:true})).toBeVisible();
    await expect(page.locator('[data-singing-interval="empty"] output')).toHaveText('—');
  });

  test('collapse before 800ms cancels first-load auto-listen',async({page,context})=>{
    await context.grantPermissions(['microphone']);
    await instrument(page);await installAndOpen(page);
    await page.getByRole('group',{name:'Melody cards',exact:true}).locator('[data-card-role="current"]').dblclick();
    await expect(page.locator('[data-singing-dock="expanded"]')).toBeVisible();
    await page.getByRole('button',{name:'Collapse humming tool',exact:true}).click();
    await expect(page.locator('[data-singing-dock="collapsed"]')).toBeVisible();
    await page.waitForTimeout(900);
    await expect(page.locator('[data-singing-dock]')).toHaveAttribute('data-mic-state','idle');
    await expect(page.getByRole('button',{name:'Stop microphone',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'Expand Humming Tool',exact:true}).click();
    await expect(page.locator('[data-singing-dock="expanded"]')).toBeVisible();
    await expect(page.locator('[data-singing-dock]')).toHaveAttribute('data-mic-state','idle');
    await expect(page.locator('[data-singing-slot="1"] [data-singing-prompt="record"]')).toBeVisible();
    await expect(page.locator('[data-singing-slot="1"] [data-singing-cents]')).toHaveCount(0);
    await expect(page.locator('[data-singing-interval="empty"] output')).toHaveText('—');
    await page.waitForTimeout(900);
    await expect(page.locator('[data-singing-dock]')).toHaveAttribute('data-mic-state','idle');
    await expect(page.getByRole('button',{name:'Stop microphone',exact:true})).toHaveCount(0);
  });

  test('Flip-Flop drops local displayed target; disable leaves empty record prompts',async({page,context})=>{
    await context.grantPermissions(['microphone']);
    await instrument(page);await installAndOpen(page);
    await page.getByRole('group',{name:'Melody cards',exact:true}).locator('[data-card-role="current"]').dblclick();
    await expect(page.locator('[data-singing-dock="expanded"]')).toBeVisible();
    await expect(page.locator('[data-singing-slot="1"] [data-singing-degree]')).not.toHaveText('—');
    await page.getByRole('switch',{name:'Flip-Flop',exact:true}).check();
    await page.getByRole('switch',{name:'Flip-Flop',exact:true}).uncheck();
    await expect(page.locator('[data-singing-slot="1"] [data-singing-degree]')).toHaveText('—');
    await expect(page.locator('[data-singing-slot="1"] [data-singing-prompt="record"]')).toBeVisible();
    await expect(page.locator('[data-singing-interval="empty"] output')).toHaveText('—');
    await page.waitForTimeout(900);
    await expect(page.locator('[data-singing-dock]')).toHaveAttribute('data-mic-state','idle');
    await expect(page.getByRole('button',{name:'Stop microphone',exact:true})).toHaveCount(0);
    await expect(page.locator('[data-singing-slot="1"] [data-singing-degree]')).toHaveText('—');
  });

  test('prior explicit slot listen still starts immediately after Stop',async({page,context})=>{
    await context.grantPermissions(['microphone']);
    await instrument(page);await installAndOpen(page);
    await page.getByRole('group',{name:'Melody cards',exact:true}).locator('[data-card-role="current"]').dblclick();
    await expect.poll(async()=>page.locator('[data-singing-dock]').getAttribute('data-mic-state'),{timeout:2_000}).toBe('listening');
    await page.getByRole('button',{name:'Stop microphone',exact:true}).click();
    await expect(page.locator('[data-singing-dock]')).toHaveAttribute('data-mic-state','idle');
    await page.locator('[data-singing-slot="1"]').dblclick();
    await expect(page.locator('[data-singing-dock]')).toHaveAttribute('data-mic-state','listening');
    await expect(page.getByRole('button',{name:'Stop microphone',exact:true})).toBeVisible();
  });
});

test('exclusive PLAYBACK_PERSISTENT vs SINGING_TOOL lease (Playwright fake/silent getUserMedia; not SYNTHETIC oscillator; not Pixel)',async({page,context})=>{
  await context.grantPermissions(['microphone']);
  await instrument(page);await installAndOpen(page);
  const mic=page.getByRole('button',{name:'Pitch monitoring',exact:true});
  const dock=page.locator('[data-singing-dock]');
  await page.getByRole('group',{name:'Melody cards',exact:true}).locator('[data-card-role="current"]').dblclick();
  await expect.poll(async()=>dock.getAttribute('data-mic-state'),{timeout:2_000}).toBe('listening');
  await expect(dock).toHaveAttribute('data-mic-owns','true');
  await mic.click();
  await expect.poll(async()=>dock.getAttribute('data-mic-state'),{timeout:2_000}).toBe('idle');
  await expect(dock).toHaveAttribute('data-mic-owns','false');
  await expect(mic).toHaveAttribute('aria-pressed','true');
  await expect(dock).toHaveAttribute('data-singing-dock','collapsed');
  await expect(page.getByRole('button',{name:'Stop persistent pitch practice',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Expand Humming Tool',exact:true}).click();
  await expect(mic).toHaveAttribute('aria-pressed','false');
  // Native collapse clears ordinary targets; request a new target explicitly, not an obsolete hidden slot.
  await page.getByRole('group',{name:'Melody cards',exact:true}).locator('[data-card-role="current"]').dblclick();
  await expect.poll(async()=>dock.getAttribute('data-mic-state'),{timeout:2_000}).toBe('listening');
  await expect(dock).toHaveAttribute('data-mic-owns','true');
  await expect(mic).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button',{name:'Stop microphone',exact:true}).click();
  await expect(dock).toHaveAttribute('data-mic-state','idle');
  await expect(page.locator('[data-singing-interval="empty"] output')).toHaveText('—');
});

test('policy A first-load permission denial shows Error and stays idle (stubbed getUserMedia; not Pixel)',async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{
      configurable:true,value:async()=>{throw Object.assign(new Error('Permission denied'),{name:'NotAllowedError'});},
    });
  });
  await instrument(page);await installAndOpen(page);
  await page.getByRole('group',{name:'Melody cards',exact:true}).locator('[data-card-role="current"]').dblclick();
  await expect.poll(async()=>page.getByRole('alert').textContent(),{timeout:3_000}).toBe('Permission denied');
  await expect(page.locator('[data-singing-dock]')).toHaveAttribute('data-mic-state','idle');
  await expect(page.locator('[data-singing-interval="empty"] output')).toHaveText('—');
  await expect(page.getByRole('button',{name:'Stop microphone',exact:true})).toHaveCount(0);
});

test('opt-in Pitch monitoring paints native live halo rest 0¢ from capture (Playwright fake/silent getUserMedia; not SYNTHETIC oscillator; not Pixel)',async({page,context})=>{
  await context.grantPermissions(['microphone']);
  await instrument(page);await installAndOpen(page);
  const timeline=page.locator('[data-playback-timeline="visible"]');
  const mic=page.getByRole('button',{name:'Pitch monitoring',exact:true});
  await expect(timeline).toHaveAttribute('data-timeline-halo','false');
  await expect(timeline).toHaveAttribute('data-timeline-live-cents','');
  await expect(timeline).toHaveAttribute('data-timeline-scores','');
  await mic.click();
  await expect(mic).toHaveAttribute('aria-pressed','true');
  await expect.poll(async()=>timeline.getAttribute('data-timeline-halo')).toBe('true');
  await expect(timeline).toHaveAttribute('data-timeline-live-cents','0¢');
  await expect(timeline).toHaveAttribute('data-timeline-live-estimate','false');
  await expect(timeline).toHaveAttribute('data-timeline-scores','');
  await mic.click();
  await expect(mic).toHaveAttribute('aria-pressed','false');
  await expect(timeline).toHaveAttribute('data-timeline-halo','false');
  await expect(timeline).toHaveAttribute('data-timeline-live-cents','');
  await expect(timeline).toHaveAttribute('data-timeline-scores','');
});

// Artificial async delivery gates on actual Playwright fake/silent streams; NOT real permission prompts or trusted-tab proof.
for(const stage of ['permission','worklet'] as const)test('pending capture '+stage+' retires on '+(stage==='permission'?'Stop':'Collapse')+' before late completion',async({page,context})=>{
 await context.grantPermissions(['microphone']);await instrument(page);
 await page.addInitScript(stage=>{
  const streams:MediaStream[]=[],contexts:AudioContext[]=[];let graphs=0,entered=false,release!:()=>void,first=true;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await gum(constraints);streams.push(stream);if(stage==='permission'&&first){first=false;entered=true;await gate;}return stream;};
  const Native=window.AudioContext;
  window.AudioContext=class extends Native{constructor(options?:AudioContextOptions){super(options);if(options?.sampleRate===16000)contexts.push(this);}createMediaStreamSource(stream:MediaStream){graphs++;return super.createMediaStreamSource(stream);}};
  const add=AudioWorklet.prototype.addModule;
  AudioWorklet.prototype.addModule=async function(url,options){await add.call(this,url,options);if(stage==='worklet'&&first){first=false;entered=true;await gate;}};
  (window as unknown as {captureRace:{release:()=>void;snapshot:()=>unknown}}).captureRace={release,snapshot:()=>({entered,graphs,tracks:streams.flatMap(stream=>stream.getTracks().map(track=>track.readyState)),contexts:contexts.map(context=>context.state)})};
 },stage);
 await installAndOpen(page);
 const proof=()=>page.evaluate(()=>(window as unknown as {captureRace:{snapshot:()=>{entered:boolean;graphs:number;tracks:string[];contexts:string[]}}}).captureRace.snapshot());
 await page.getByRole('group',{name:'Melody cards',exact:true}).locator('[data-card-role="current"]').dblclick();
 await expect.poll(async()=>(await proof()).entered).toBe(true);await expect(page.locator('[data-singing-dock]')).toHaveAttribute('data-mic-state','listening');
 if(stage==='permission')await page.getByRole('button',{name:'Stop microphone',exact:true}).click();
 else await page.getByRole('button',{name:'Collapse humming tool',exact:true}).click();
 await expect(page.locator('[data-singing-dock]')).toHaveAttribute('data-mic-state','idle');
 if(stage==='worklet'){await expect.poll(async()=>(await proof()).tracks.every(state=>state==='ended')).toBe(true);await expect.poll(async()=>(await proof()).contexts.every(state=>state==='closed')).toBe(true);}
 await page.evaluate(()=>(window as unknown as {captureRace:{release:()=>void}}).captureRace.release());
 await expect.poll(async()=>(await proof()).tracks.every(state=>state==='ended')).toBe(true);
 expect((await proof()).graphs).toBe(0);if(stage==='permission')expect((await proof()).contexts).toEqual([]);
 await page.waitForTimeout(900);expect((await proof()).graphs).toBe(0);await expect(page.locator('[data-singing-dock]')).toHaveAttribute('data-mic-state','idle');
 if(stage==='worklet')await page.getByRole('button',{name:'Expand Humming Tool',exact:true}).click();
 await page.locator('[data-singing-slot="1"]').dblclick();await expect.poll(async()=>(await proof()).graphs).toBe(1);
 await page.getByRole('button',{name:'Stop microphone',exact:true}).click();await expect.poll(async()=>(await proof()).tracks.every(state=>state==='ended')).toBe(true);
});

// Genuine browser navigation receipts. Fake/silent streams and optional async worklet gate are NOT physical mic/BFCache proof.
async function instrumentCaptureDeparture(page:Page,holdModule=false,synthetic=false,syntheticHz=440){
 await page.addInitScript(({hold,synthetic,hz})=>{
  const streams:MediaStream[]=[],contexts:AudioContext[]=[];let calls=0,graphs=0,modulePending=false,release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async constraints=>{
   calls++;let stream:MediaStream;
   if(synthetic){
    const ctx=new AudioContext();await ctx.resume();const osc=ctx.createOscillator();osc.frequency.value=hz;const dest=ctx.createMediaStreamDestination();osc.connect(dest);osc.start();stream=dest.stream;
    for(const track of stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{stop();try{osc.stop();}catch{}void ctx.close().catch(()=>{});};}
   }else stream=await gum(constraints);
   streams.push(stream);return stream;
  };
  const Native=window.AudioContext;
  window.AudioContext=class extends Native{constructor(options?:AudioContextOptions){super(options);if(options?.sampleRate===16000)contexts.push(this);}createMediaStreamSource(stream:MediaStream){graphs++;return super.createMediaStreamSource(stream);}};
  const add=AudioWorklet.prototype.addModule;
  AudioWorklet.prototype.addModule=async function(url,options){await add.call(this,url,options);if(hold){modulePending=true;await gate;}};
  const autoTimers=new Set<number>(),set=window.setTimeout.bind(window),clear=window.clearTimeout.bind(window);
  window.setTimeout=((handler:TimerHandler,delay?:number,...args:unknown[])=>{let id:number;const callback=delay===800&&typeof handler==='function'?(...values:unknown[])=>{autoTimers.delete(id);return handler.apply(window,values);}:handler;id=set(callback,delay,...args);if(delay===800)autoTimers.add(id);return id;}) as typeof window.setTimeout;
  window.clearTimeout=(id)=>{autoTimers.delete(Number(id));clear(id);};
  const snapshot=()=>({calls,graphs,modulePending,autoTimers:autoTimers.size,tracks:streams.flatMap(stream=>stream.getTracks().map(track=>track.readyState)),contexts:contexts.map(context=>context.state)});
  (window as unknown as {captureDeparture:{snapshot:typeof snapshot;release:()=>void;observe:()=>void}}).captureDeparture={snapshot,release,observe:()=>window.addEventListener('pagehide',event=>{sessionStorage.setItem('capture-departure-proof',JSON.stringify({trusted:event.isTrusted,persisted:event.persisted,capture:snapshot()}));},{once:true})};
 },{hold:holdModule,synthetic,hz:syntheticHz});
}
async function captureDeparture(page:Page){return page.evaluate(()=>(window as unknown as {captureDeparture:{snapshot:()=>{calls:number;graphs:number;modulePending:boolean;autoTimers:number;tracks:string[];contexts:string[]}}}).captureDeparture.snapshot());}
for(const mode of ['active monitoring','armed 800ms singing'] as const)test('product genuine reload pagehide retires '+mode+' and fresh document stays idle',async({page,context},info)=>{
 await context.grantPermissions(['microphone']);await instrument(page);await instrumentCaptureDeparture(page);await installAndOpen(page);
 if(mode==='active monitoring'){
  await page.getByRole('button',{name:'Pitch monitoring',exact:true}).click();await expect.poll(async()=>(await captureDeparture(page)).graphs).toBe(1);
  await page.getByRole('button',{name:'Play',exact:true}).click();await expect(page.locator('[data-playback-phase]')).toHaveAttribute('data-playback-phase','playing');
 }else{
  await page.getByRole('group',{name:'Melody cards',exact:true}).locator('[data-card-role="current"]').dblclick();await expect.poll(async()=>(await captureDeparture(page)).autoTimers).toBeGreaterThan(0);expect((await captureDeparture(page)).calls).toBe(0);
 }
 await page.evaluate(()=>(window as unknown as {captureDeparture:{observe:()=>void}}).captureDeparture.observe());
 await page.reload();await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
 const departure=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('capture-departure-proof')!)) as {trusted:boolean;persisted:boolean;capture:{calls:number;graphs:number;autoTimers:number;tracks:string[];contexts:string[]}};
 expect(departure.trusted).toBe(true);expect(departure.persisted).toBe(false);expect(departure.capture.autoTimers).toBe(0);
 if(mode==='active monitoring'){expect(departure.capture.calls).toBe(1);expect(departure.capture.tracks).not.toHaveLength(0);expect(departure.capture.tracks.every(state=>state==='ended')).toBe(true);expect(departure.capture.contexts.every(state=>state==='closed')).toBe(true);}else expect(departure.capture.calls).toBe(0);
 await expect(page.locator('[data-playback-phase]')).toHaveAttribute('data-playback-requested','false');await expect(page.getByRole('button',{name:'Pitch monitoring',exact:true})).toHaveAttribute('aria-pressed','false');await expect(page.locator('[data-singing-dock="collapsed"]')).toBeVisible();
 await page.waitForTimeout(900);expect((await captureDeparture(page)).calls).toBe(0);expect((await captureDeparture(page)).contexts).toEqual([]);expect((await audio(page)).contexts).toEqual([]);
 await page.getByRole('button',{name:'Pitch monitoring',exact:true}).click();await expect.poll(async()=>(await captureDeparture(page)).graphs).toBe(1);await page.getByRole('button',{name:'Pitch monitoring',exact:true}).click();await expect.poll(async()=>(await captureDeparture(page)).tracks.every(state=>state==='ended')).toBe(true);
 await info.attach('trusted-pagehide-capture.json',{body:JSON.stringify(departure,null,2),contentType:'application/json'});
});
test('product route Back retires pending capture; late worklet cannot revive it or bypass explicit restart',async({page,context},info)=>{
 await context.grantPermissions(['microphone']);await instrument(page);await instrumentCaptureDeparture(page,true);await installAndOpen(page);
 await page.getByRole('group',{name:'Melody cards',exact:true}).locator('[data-card-role="current"]').dblclick();await expect.poll(async()=>(await captureDeparture(page)).modulePending).toBe(true);expect((await captureDeparture(page)).graphs).toBe(0);
 await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
 await expect.poll(async()=>(await captureDeparture(page)).tracks.every(state=>state==='ended')).toBe(true);await expect.poll(async()=>(await captureDeparture(page)).contexts.every(state=>state==='closed')).toBe(true);
 await page.evaluate(()=>(window as unknown as {captureDeparture:{release:()=>void}}).captureDeparture.release());await page.waitForTimeout(900);expect((await captureDeparture(page)).graphs).toBe(0);
 await page.getByRole('button',{name:'Play song',exact:true}).click();await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');await expect(page.locator('[data-singing-dock="collapsed"]')).toBeVisible();await expect(page.getByRole('button',{name:'Pitch monitoring',exact:true})).toHaveAttribute('aria-pressed','false');expect((await captureDeparture(page)).calls).toBe(1);
 await page.getByRole('button',{name:'Pitch monitoring',exact:true}).click();await expect.poll(async()=>(await captureDeparture(page)).graphs).toBe(1);await page.getByRole('button',{name:'Pitch monitoring',exact:true}).click();await expect.poll(async()=>(await captureDeparture(page)).tracks.every(state=>state==='ended')).toBe(true);
 await info.attach('route-capture-retirement.json',{body:JSON.stringify(await captureDeparture(page),null,2),contentType:'application/json'});
});

async function observeSingingExit(page:Page){
 await page.evaluate(()=>{
  type Row={at:number;phase:string;body:boolean;height:number;inert:boolean;hidden:string|null;text:string;mic:string;owns:string;duration:number|string|null;start:number|null;time:number|null};
  const rows:Row[]=[];let frame=0,last='';
  const sample=()=>{
   const dock=document.querySelector<HTMLElement>('[data-singing-dock]'),body=dock?.querySelector<HTMLElement>('[data-singing-body]'),anim=body?.getAnimations()[0];
   if(dock){const row:Row={at:performance.now(),phase:dock.dataset.singingTransition??'',body:!!body,height:body?.getBoundingClientRect().height??0,inert:body?.inert??false,hidden:body?.getAttribute('aria-hidden')??null,text:body?.textContent??'',mic:dock.dataset.micState??'',owns:dock.dataset.micOwns??'',duration:typeof anim?.effect?.getTiming().duration==='number'?Number(anim.effect.getTiming().duration):anim?.effect?String(anim.effect.getTiming().duration):null,start:typeof anim?.startTime==='number'?anim.startTime:null,time:typeof anim?.currentTime==='number'?anim.currentTime:null};const key=JSON.stringify([row.phase,row.body,row.text,row.mic]);if(key!==last||anim?.playState==='running'){rows.push(row);last=key;}}
   frame=requestAnimationFrame(sample);
  };sample();
  (window as unknown as {singingExitProof:{rows:Row[];stop:()=>void}}).singingExitProof={rows,stop:()=>cancelAnimationFrame(frame)};
  window.addEventListener('pagehide',event=>{const body=document.querySelector<HTMLElement>('[data-singing-body]');sessionStorage.setItem('singing-exit-departure',JSON.stringify({trusted:event.isTrusted,persisted:event.persisted,runningAnimations:body?.getAnimations().filter(anim=>anim.playState==='running'||anim.pending).length??0,rows:rows.slice(-60)}));},{once:true});
 });
}
async function singingExitRows(page:Page){return page.evaluate(()=>(window as unknown as {singingExitProof:{rows:{at:number;phase:string;body:boolean;height:number;inert:boolean;hidden:string|null;text:string;mic:string;owns:string;duration:number|string|null;start:number|null;time:number|null}[]}}).singingExitProof.rows);}

test('singing exit SYNTHETIC pitches retain only frozen 300ms visuals; interrupted reopen cannot revive preview or capture',async({page},info)=>{
 await page.emulateMedia({reducedMotion:'no-preference'});await instrument(page);await instrumentCaptureDeparture(page,false,true);await installAndOpen(page);
 const dock=page.locator('[data-singing-dock]'),handle=dock.locator('.singing-dock__handle'),slot1=dock.locator('[data-singing-slot="1"]'),slot2=dock.locator('[data-singing-slot="2"]');
 await page.getByRole('group',{name:'Melody cards',exact:true}).locator('[data-card-role="current"]').dblclick();
 await expect(slot1).toHaveAttribute('data-singing-cents-source','captured');await page.getByRole('button',{name:'Stop microphone',exact:true}).click();
 await slot2.dblclick();await expect(slot2).toHaveAttribute('data-singing-cents-source','captured');await page.getByRole('button',{name:'Stop microphone',exact:true}).click();
 const captured=await dock.locator('.singing-dock__sung').allTextContents();expect(captured).toHaveLength(2);await observeSingingExit(page);
 const beforeInterval=(await audio(page)).items.length;
 await page.getByRole('button',{name:'Sung interval',exact:true}).click();await expect.poll(async()=>(await audio(page)).items.length).toBe(beforeInterval+1);
 await handle.focus();await page.keyboard.press('Space');await page.keyboard.press('Space');
 await expect(dock).toHaveAttribute('data-singing-dock','expanded');await page.waitForTimeout(1100);
 expect(await dock.locator('.singing-dock__sung').allTextContents()).toEqual(captured);expect((await audio(page)).items).toHaveLength(beforeInterval+1);expect((await audio(page)).items.at(-1)!.stops).toBeGreaterThan(0);
 expect((await captureDeparture(page)).calls).toBe(2);await expect(dock).toHaveAttribute('data-mic-state','idle');
 // A pending single tap must be cancelled even when reopen restores the same passive pitch before 300ms.
 const beforeTap=(await audio(page)).items.length;await slot1.click();await handle.focus();await page.keyboard.press('Space');await page.keyboard.press('Space');await page.waitForTimeout(400);expect((await audio(page)).items).toHaveLength(beforeTap);expect(await dock.locator('.singing-dock__sung').allTextContents()).toEqual(captured);
 await handle.focus();await page.keyboard.press('Space');await expect(dock.locator('[data-singing-body]')).toHaveCount(0);
 let rows=await singingExitRows(page);const exits=rows.filter(row=>row.phase==='exiting'&&row.start!==null&&row.time!==null);
 expect(exits.length).toBeGreaterThan(1);expect(exits.every(row=>row.duration===300&&row.inert&&row.hidden==='true'&&row.mic==='idle'&&row.owns==='false')).toBe(true);
 const lastStart=exits.at(-1)!.start!,lastExit=exits.filter(row=>row.start===lastStart);expect(lastExit.every(row=>row.text===lastExit[0]!.text)).toBe(true);expect(lastExit[0]!.height).toBeGreaterThan(lastExit.at(-1)!.height);
 // DOM removal can complete before the next rAF observer sample. Wait for the original completion predicate, not a weaker duration/cleanup assertion.
 await expect.poll(async()=>(await singingExitRows(page)).some(row=>!row.body&&row.at>=lastStart+300),{timeout:1_000}).toBe(true);
 rows=await singingExitRows(page);const completed=rows.find(row=>!row.body&&row.at>=lastStart+300);expect(completed).toBeTruthy();await expect(handle).toBeFocused();
 await handle.click();await expect(slot1.locator('[data-singing-degree]')).toHaveText('—');await expect(dock.locator('.singing-dock__sung')).toHaveCount(0);await page.waitForTimeout(900);expect((await captureDeparture(page)).calls).toBe(2);
 await mkdir(info.outputDir,{recursive:true});await writeFile(info.outputPath('synthetic-singing-exit.json'),JSON.stringify({label:'SYNTHETIC oscillator, not hardware',captured,rows,capture:await captureDeparture(page)},null,2));
});

test('singing exit genuine navigation/pagehide cancels exit and armed actions; fresh tool cannot resurrect',async({page,context},info)=>{
 await context.grantPermissions(['microphone']);await instrument(page);await instrumentCaptureDeparture(page);await installAndOpen(page);
 const dock=page.locator('[data-singing-dock]');await page.getByRole('group',{name:'Melody cards',exact:true}).locator('[data-card-role="current"]').dblclick();await expect.poll(async()=>(await captureDeparture(page)).graphs).toBe(1);
 await observeSingingExit(page);await dock.locator('.singing-dock__handle').focus();await page.keyboard.press('Space');await expect(dock).toHaveAttribute('data-mic-state','idle');await expect.poll(async()=>(await captureDeparture(page)).tracks.every(state=>state==='ended')).toBe(true);
 await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();await page.waitForTimeout(900);expect((await captureDeparture(page)).calls).toBe(1);expect((await audio(page)).items.filter(item=>item.endedAt===null&&item.stops===0)).toHaveLength(0);
 await page.getByRole('button',{name:'Play song',exact:true}).click();await expect(dock).toHaveAttribute('aria-label','Interval Singing Tool');await expect(dock).toHaveAttribute('data-singing-transition','collapsed');
 await page.getByRole('group',{name:'Melody cards',exact:true}).locator('[data-card-role="current"]').dblclick();await expect.poll(async()=>(await captureDeparture(page)).autoTimers).toBeGreaterThan(0);
 await observeSingingExit(page);await page.evaluate(()=>(window as unknown as {captureDeparture:{observe:()=>void}}).captureDeparture.observe());await dock.locator('.singing-dock__handle').focus();await page.keyboard.press('Space');await page.reload();
 await expect(dock).toHaveAttribute('data-singing-transition','collapsed');await expect(dock.locator('[data-singing-body]')).toHaveCount(0);await page.waitForTimeout(900);expect((await captureDeparture(page)).calls).toBe(0);
 const receipt=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('singing-exit-departure')!)) as {trusted:boolean;runningAnimations:number;rows:unknown[]};expect(receipt.trusted).toBe(true);expect(receipt.runningAnimations).toBe(0);
 const capture=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('capture-departure-proof')!)) as {capture:{autoTimers:number}};expect(capture.capture.autoTimers).toBe(0);
 await mkdir(info.outputDir,{recursive:true});await writeFile(info.outputPath('singing-exit-pagehide.json'),JSON.stringify({receipt,capture},null,2));
});

test('singing exit reduced motion removes visuals immediately and cancels an in-flight normal exit',async({page,context},info)=>{
 await context.grantPermissions(['microphone']);await page.emulateMedia({reducedMotion:'reduce'});await instrument(page);await instrumentCaptureDeparture(page);await installAndOpen(page);
 const dock=page.locator('[data-singing-dock]'),handle=dock.locator('.singing-dock__handle');
 await page.getByRole('group',{name:'Melody cards',exact:true}).locator('[data-card-role="current"]').dblclick();await handle.focus();await page.keyboard.press('Space');await expect(dock.locator('[data-singing-body]')).toHaveCount(0);await expect(handle).toHaveAttribute('aria-expanded','false');await expect(handle).toBeFocused();
 await page.keyboard.press('Space');await expect(dock.locator('[data-singing-slot="1"] [data-singing-degree]')).toHaveText('—');await page.waitForTimeout(900);expect((await captureDeparture(page)).calls).toBe(0);
 await page.emulateMedia({reducedMotion:'no-preference'});await observeSingingExit(page);await handle.focus();await page.keyboard.press('Space');await page.emulateMedia({reducedMotion:'reduce'});await expect(dock.locator('[data-singing-body]')).toHaveCount(0);await page.keyboard.press('Space');await page.waitForTimeout(400);await expect(dock).toHaveAttribute('data-singing-dock','expanded');expect((await captureDeparture(page)).calls).toBe(0);
 await mkdir(info.outputDir,{recursive:true});await writeFile(info.outputPath('singing-reduced-motion.json'),JSON.stringify({rows:await singingExitRows(page),capture:await captureDeparture(page)},null,2));
});


// Native owner handoff: genuine product UI, actual fake/silent browser streams. Not physical permission/device proof.
test('persistent collapsed Stop and expand handoff cancel armed ordinary singing without stale 800ms restart',async({page,context},info)=>{
 await context.grantPermissions(['microphone']);await instrument(page);await instrumentCaptureDeparture(page);await installAndOpen(page);
 const mic=page.getByRole('button',{name:'Pitch monitoring',exact:true}),dock=page.locator('[data-singing-dock]');
 const stop=page.getByRole('button',{name:'Stop persistent pitch practice',exact:true});
 await page.getByRole('group',{name:'Melody cards',exact:true}).locator('[data-card-role="current"]').dblclick();
 expect((await captureDeparture(page)).autoTimers).toBe(1);
 await mic.click();
 await expect(dock).toHaveAttribute('data-singing-dock','collapsed');await expect(dock).toHaveAttribute('data-mic-state','idle');await expect(dock).toHaveAttribute('data-mic-owns','false');await expect(stop).toBeVisible();
 await expect.poll(async()=>(await captureDeparture(page)).graphs).toBe(1);
 await page.waitForTimeout(900);expect((await captureDeparture(page)).calls).toBe(1);expect((await captureDeparture(page)).autoTimers).toBe(0);await expect(mic).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Expand Humming Tool',exact:true}).click();
 await expect(mic).toHaveAttribute('aria-pressed','false');await expect(stop).toHaveCount(0);await expect.poll(async()=>(await captureDeparture(page)).tracks.every(state=>state==='ended')).toBe(true);
 await page.getByRole('button',{name:'Collapse humming tool',exact:true}).click();await page.getByRole('button',{name:'Expand Humming Tool',exact:true}).click();
 await page.waitForTimeout(900);expect((await captureDeparture(page)).calls).toBe(1);await expect(dock).toHaveAttribute('data-mic-state','idle');
 await mic.click();await expect(dock).toHaveAttribute('data-singing-dock','collapsed');await expect(stop).toBeVisible();await expect.poll(async()=>(await captureDeparture(page)).graphs).toBe(2);
 await stop.click();await expect(mic).toHaveAttribute('aria-pressed','false');await expect(stop).toHaveCount(0);await expect(dock).toHaveAttribute('data-singing-dock','collapsed');
 await expect.poll(async()=>(await captureDeparture(page)).tracks.every(state=>state==='ended')).toBe(true);await expect.poll(async()=>(await captureDeparture(page)).contexts.every(state=>state==='closed')).toBe(true);
 await page.waitForTimeout(900);expect((await captureDeparture(page)).calls).toBe(2);
 await info.attach('persistent-owner-handoff.json',{body:JSON.stringify(await captureDeparture(page)),contentType:'application/json'});
});

async function gatePersistentPermission(page:Page){
 await page.addInitScript(()=>{
  const streams:MediaStream[]=[],contexts:AudioContext[]=[];let calls=0,graphs=0,pending=false,release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;}),gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async constraints=>{calls++;const stream=await gum(constraints);streams.push(stream);if(calls===1){pending=true;await gate;pending=false;}return stream;};
  const Native=window.AudioContext;
  window.AudioContext=class extends Native{constructor(options?:AudioContextOptions){super(options);if(options?.sampleRate===16000)contexts.push(this);}createMediaStreamSource(stream:MediaStream){graphs++;return super.createMediaStreamSource(stream);}};
  (window as unknown as {persistentPermission:{release:()=>void;snapshot:()=>unknown}}).persistentPermission={release,snapshot:()=>({pending,calls,graphs,tracks:streams.map(stream=>stream.getTracks().map(track=>track.readyState)),contexts:contexts.map(context=>context.state)})};
 });
}
async function pendingPersistent(page:Page){return page.evaluate(()=>(window as unknown as {persistentPermission:{snapshot:()=>{pending:boolean;calls:number;graphs:number;tracks:string[][];contexts:string[]}}}).persistentPermission.snapshot());}
for(const action of ['Stop','rapid reopen','singing owner switch'] as const)test('persistent pending permission '+action+' discards late delivery without reviving capture',async({page,context},info)=>{
 await context.grantPermissions(['microphone']);await instrument(page);await gatePersistentPermission(page);await installAndOpen(page);
 const mic=page.getByRole('button',{name:'Pitch monitoring',exact:true}),dock=page.locator('[data-singing-dock]');
 await mic.click();await expect.poll(async()=>(await pendingPersistent(page)).pending).toBe(true);
 await expect(page.getByRole('button',{name:'Stop persistent pitch practice',exact:true})).toBeVisible();
 if(action==='Stop')await page.getByRole('button',{name:'Stop persistent pitch practice',exact:true}).click();
 else{
  await page.getByRole('button',{name:'Expand Humming Tool',exact:true}).click();
  if(action==='rapid reopen'){
   await page.getByRole('button',{name:'Collapse humming tool',exact:true}).click();await page.getByRole('button',{name:'Expand Humming Tool',exact:true}).click();
  }else{
   await page.locator('[data-singing-slot="1"]').dblclick();await expect(dock).toHaveAttribute('data-mic-state','recording');await expect(dock).toHaveAttribute('data-mic-owns','true');
  }
 }
 await expect(mic).toHaveAttribute('aria-pressed','false');expect((await pendingPersistent(page)).graphs).toBe(0);expect((await pendingPersistent(page)).contexts).toEqual([]);
 await page.evaluate(()=>(window as unknown as {persistentPermission:{release:()=>void}}).persistentPermission.release());
 await expect.poll(async()=>(await pendingPersistent(page)).tracks[0]?.every(state=>state==='ended')).toBe(true);
 if(action==='singing owner switch'){
  await expect.poll(async()=>(await pendingPersistent(page)).graphs).toBe(1);await expect(dock).toHaveAttribute('data-mic-owns','true');await expect(dock).toHaveAttribute('data-mic-state','recording');
  expect((await pendingPersistent(page)).calls).toBe(2);expect((await pendingPersistent(page)).tracks[1]?.every(state=>state==='live')).toBe(true);
  await page.getByRole('button',{name:'Stop microphone',exact:true}).click();
 }else{
  await page.waitForTimeout(900);expect((await pendingPersistent(page)).graphs).toBe(0);expect((await pendingPersistent(page)).calls).toBe(1);
  await mic.click();await expect.poll(async()=>(await pendingPersistent(page)).graphs).toBe(1);await page.getByRole('button',{name:'Stop persistent pitch practice',exact:true}).click();
 }
 await expect.poll(async()=>(await pendingPersistent(page)).tracks.flat().every(state=>state==='ended')).toBe(true);
 await expect.poll(async()=>(await pendingPersistent(page)).contexts.every(state=>state==='closed')).toBe(true);
 await expect(mic).toHaveAttribute('aria-pressed','false');await page.waitForTimeout(900);expect((await pendingPersistent(page)).calls).toBe(2);
 await info.attach('pending-persistent-'+action+'.json',{body:JSON.stringify(await pendingPersistent(page)),contentType:'application/json'});
});

for(const departure of ['Back','reload'] as const)test('persistent pending worklet '+departure+' retires lease and cannot resume without explicit opt-in',async({page,context},info)=>{
 await context.grantPermissions(['microphone']);await instrument(page);await instrumentCaptureDeparture(page,true);await installAndOpen(page);
 await page.getByRole('button',{name:'Pitch monitoring',exact:true}).click();await expect.poll(async()=>(await captureDeparture(page)).modulePending).toBe(true);
 if(departure==='Back'){
  await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByRole('button',{name:'Play song',exact:true})).toBeVisible();
  await expect.poll(async()=>(await captureDeparture(page)).tracks.every(state=>state==='ended')).toBe(true);
  await expect.poll(async()=>(await captureDeparture(page)).contexts.every(state=>state==='closed')).toBe(true);
  await page.evaluate(()=>(window as unknown as {captureDeparture:{release:()=>void}}).captureDeparture.release());
  await page.waitForTimeout(900);expect((await captureDeparture(page)).graphs).toBe(0);
  await page.getByRole('button',{name:'Play song',exact:true}).click();await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
  await expect(page.getByRole('button',{name:'Pitch monitoring',exact:true})).toHaveAttribute('aria-pressed','false');await expect(page.getByRole('button',{name:'Stop persistent pitch practice',exact:true})).toHaveCount(0);
  await info.attach('pending-persistent-Back.json',{body:JSON.stringify(await captureDeparture(page)),contentType:'application/json'});
 }else{
  await page.evaluate(()=>(window as unknown as {captureDeparture:{observe:()=>void}}).captureDeparture.observe());
  await page.reload();await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
  const receipt=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('capture-departure-proof')!));
  expect(receipt.trusted).toBe(true);expect(receipt.persisted).toBe(false);expect(receipt.capture.graphs).toBe(0);expect(receipt.capture.tracks.every((state:string)=>state==='ended')).toBe(true);expect(receipt.capture.contexts.every((state:string)=>state==='closed')).toBe(true);
  await page.waitForTimeout(900);expect((await captureDeparture(page)).calls).toBe(0);await expect(page.getByRole('button',{name:'Pitch monitoring',exact:true})).toHaveAttribute('aria-pressed','false');await expect(page.getByRole('button',{name:'Stop persistent pitch practice',exact:true})).toHaveCount(0);
  await info.attach('pending-persistent-pagehide.json',{body:JSON.stringify(receipt),contentType:'application/json'});
 }
});


test('singing tape uses first section signature, not modulation/display/transpose or captured-pitch spelling (SYNTHETIC, not Pixel)',async({page},info)=>{
 await instrument(page);await instrumentCaptureDeparture(page,false,true,466.1637615);await installAndOpen(page,'playback-context','Playback_Context');
 const dock=page.locator('[data-singing-dock]'),slot1=page.locator('[data-singing-slot="1"]'),slot2=page.locator('[data-singing-slot="2"]');
 await page.getByRole('button',{name:'Expand Humming Tool',exact:true}).click();expect((await captureDeparture(page)).calls).toBe(0);
 for(const slot of [slot1,slot2]){
  await slot.dblclick();await expect(slot).toHaveAttribute('data-singing-cents-source','captured',{timeout:6_000});await expect(dock).toHaveAttribute('data-mic-state','idle');
  await expect(slot.locator('.singing-dock__sung')).toHaveText('B♭4');
  await expect(slot.locator('[data-tape-center] .singing-dock__tape-label')).toHaveText('A♯');
 }
 const captured=await dock.locator('.singing-dock__sung').allTextContents();
 const position=page.getByRole('slider',{name:'Position',exact:true});await position.focus();await position.press('End');await expect(page.getByLabel('Source key',{exact:true})).toContainText('C Minor');
 // The section begins in D major; later C minor, display lock, manual transpose and target octave do not change its tape signature.
 await page.getByRole('checkbox',{name:'Lock in Major',exact:true}).check();
 const transpose=page.getByRole('slider',{name:'Transpose',exact:true});await transpose.focus();await transpose.press('End');await page.getByRole('button',{name:'Raise singing octave',exact:true}).click();
 for(const slot of [slot1,slot2])await expect(slot.locator('[data-tape-center] .singing-dock__tape-label')).toHaveText('A♯');
 expect(await dock.locator('.singing-dock__sung').allTextContents()).toEqual(captured);expect((await captureDeparture(page)).calls).toBe(2);
 await page.getByRole('button',{name:'Collapse humming tool',exact:true}).click();await expect(dock.locator('[data-singing-body]')).toHaveCount(0);
 await page.getByRole('combobox',{name:'Section',exact:true}).selectOption('10');await page.getByRole('button',{name:'Expand Humming Tool',exact:true}).click();
 expect((await captureDeparture(page)).calls).toBe(2);await slot1.dblclick();await expect(slot1).toHaveAttribute('data-singing-cents-source','captured',{timeout:6_000});await expect(dock).toHaveAttribute('data-mic-state','idle');
 await expect(slot1.locator('[data-tape-center] .singing-dock__tape-label')).toHaveText('B♭');await expect(slot1.locator('.singing-dock__sung')).toHaveText('B♭4');
 expect((await captureDeparture(page)).calls).toBe(3);await expect.poll(async()=>(await captureDeparture(page)).tracks.every(state=>state==='ended')).toBe(true);await expect.poll(async()=>(await captureDeparture(page)).contexts.every(state=>state==='closed')).toBe(true);
 await info.attach('singing-tape-section-signature.json',{body:JSON.stringify({label:'SYNTHETIC A#4/Bb4; not physical microphone',firstSectionLabels:'A♯',secondSectionLabel:await slot1.locator('[data-tape-center] .singing-dock__tape-label').textContent(),captured,capture:await captureDeparture(page)}),contentType:'application/json'});
});


async function rootSeek(page:Page,beat:number){
 const position=page.getByRole('slider',{name:'Position',exact:true});await position.focus();await position.press('Home');
 for(let i=0;i<Math.round((beat-1)*100);i++)await position.press('ArrowRight');
 await expect.poll(async()=>Number(await position.inputValue())).toBeCloseTo(beat,2);
}

test('N01 SYNTHETIC root monitoring integrates source/context targets, once-only transpose/octave, gauge and resets (not Pixel)',async({page},info)=>{
 test.setTimeout(90_000);
 await instrument(page);await instrumentCaptureDeparture(page,false,true);await installAndOpen(page,'playback-context','Playback_Context');
 const rootOnly=page.getByRole('checkbox',{name:'Root only',exact:true}),mic=page.getByRole('button',{name:'Pitch monitoring',exact:true});
 const gauge=page.locator('[data-root-pitch-gauge]'),stop=page.getByRole('button',{name:'Stop persistent pitch practice',exact:true});
 await rootOnly.check();await expect(gauge).toHaveCount(0);expect((await captureDeparture(page)).calls).toBe(0);
 // Native expanded dock cancels persistent, so configure the target octave before explicit Mic.
 await page.getByRole('button',{name:'Expand Humming Tool',exact:true}).click();await page.getByRole('button',{name:'Raise singing octave',exact:true}).click();await page.getByRole('button',{name:'Collapse humming tool',exact:true}).click();
 const transpose=page.getByRole('slider',{name:'Transpose',exact:true});await transpose.focus();await transpose.press('Home');for(let i=0;i<19;i++)await transpose.press('ArrowRight');await expect(transpose).toHaveValue('7');
 await mic.click();await expect(stop).toBeVisible();await expect(gauge).toHaveAttribute('data-target-midi','69');await expect(gauge).toHaveAttribute('data-root-estimate','true');
 await expect.poll(async()=>Math.abs(Number(await gauge.getAttribute('data-root-cents'))),{timeout:8_000}).toBeLessThan(15);
 await expect(gauge.locator('[data-root-bar]')).toHaveCSS('background-color','rgb(76, 175, 80)');expect((await captureDeparture(page)).calls).toBe(1);
 await rootSeek(page,2);await expect(gauge).toHaveAttribute('data-target-midi','67');await expect.poll(async()=>Math.abs(Number(await gauge.getAttribute('data-root-cents'))-200)).toBeLessThan(20);
 await transpose.focus();await transpose.press('ArrowLeft');await expect(gauge).toHaveAttribute('data-target-midi','66');await expect(gauge.locator('[data-root-pinned="sharp"]')).toBeVisible();
 await page.getByRole('checkbox',{name:'Lock in Major',exact:true}).check();await expect(gauge).toHaveAttribute('data-target-midi','78');await expect(gauge.locator('[data-root-pinned="flat"]')).toBeVisible();expect((await captureDeparture(page)).calls).toBe(1);
 await rootSeek(page,4);await expect(gauge).toHaveCount(0);await expect(mic).toHaveAttribute('aria-pressed','true');await expect(stop).toBeVisible();
 await stop.click();await mic.click();await expect(stop).toBeVisible();await expect(gauge).toHaveCount(0);await expect.poll(async()=>(await captureDeparture(page)).calls).toBe(2); // explicit no-target latch
 await rootSeek(page,5);await expect(gauge).toHaveAttribute('data-target-midi','73');expect((await captureDeparture(page)).calls).toBe(2);
 await page.getByRole('combobox',{name:'Section',exact:true}).selectOption('10');await expect(mic).toHaveAttribute('aria-pressed','false');await expect(gauge).toHaveCount(0);await expect(stop).toHaveCount(0);
 await expect.poll(async()=>(await captureDeparture(page)).tracks.every(state=>state==='ended')).toBe(true);await page.waitForTimeout(900);expect((await captureDeparture(page)).calls).toBe(2);
 await mic.click();await expect(gauge).toHaveAttribute('data-target-midi','74');await expect.poll(async()=>(await captureDeparture(page)).calls).toBe(3);
 await rootOnly.uncheck();await expect(mic).toHaveAttribute('aria-pressed','false');await expect(gauge).toHaveCount(0);await expect.poll(async()=>(await captureDeparture(page)).tracks.every(state=>state==='ended')).toBe(true);
 await mic.click();await expect(mic).toHaveAttribute('aria-pressed','true');await expect.poll(async()=>(await captureDeparture(page)).calls).toBe(4);
 await rootOnly.check();await expect(mic).toHaveAttribute('aria-pressed','false');await expect(gauge).toHaveCount(0);await expect(stop).toHaveCount(0);await page.waitForTimeout(900);expect((await captureDeparture(page)).calls).toBe(4);
 await expect.poll(async()=>(await captureDeparture(page)).tracks.every(state=>state==='ended')).toBe(true);await expect.poll(async()=>(await captureDeparture(page)).contexts.every(state=>state==='closed')).toBe(true);
 await info.attach('N01-root-target-gauge.json',{body:JSON.stringify({label:'SYNTHETIC440Hz, not hardware',targets:[69,67,66,78,73,74],capture:await captureDeparture(page)}),contentType:'application/json'});
});

for(const reset of ['mode','section'] as const)test('N01 root pending permission '+reset+' reset discards late capture and requires fresh opt-in',async({page,context},info)=>{
 await context.grantPermissions(['microphone']);await instrument(page);await gatePersistentPermission(page);await installAndOpen(page);
 const mode=page.getByRole('checkbox',{name:'Root only',exact:true}),mic=page.getByRole('button',{name:'Pitch monitoring',exact:true}),gauge=page.locator('[data-root-pitch-gauge]');
 await mode.check();await mic.click();await expect.poll(async()=>(await pendingPersistent(page)).pending).toBe(true);await expect(gauge).toHaveCount(0);
 if(reset==='mode')await mode.uncheck();else await page.getByRole('combobox',{name:'Section',exact:true}).selectOption('10');
 await expect(mic).toHaveAttribute('aria-pressed','false');await expect(page.getByRole('button',{name:'Stop persistent pitch practice',exact:true})).toHaveCount(0);
 await page.evaluate(()=>(window as unknown as {persistentPermission:{release:()=>void}}).persistentPermission.release());
 await expect.poll(async()=>(await pendingPersistent(page)).tracks[0]?.every(state=>state==='ended')).toBe(true);await page.waitForTimeout(900);expect((await pendingPersistent(page)).graphs).toBe(0);expect((await pendingPersistent(page)).calls).toBe(1);
 await mic.click();await expect.poll(async()=>(await pendingPersistent(page)).graphs).toBe(1);
 if(reset==='section'){await expect(gauge).toHaveAttribute('data-root-estimate','false');await expect(gauge).toContainText('Hum a steady note...');await expect(gauge.locator('[data-root-bar]')).toHaveCount(0);}
 await page.getByRole('button',{name:'Stop persistent pitch practice',exact:true}).click();
 await expect.poll(async()=>(await pendingPersistent(page)).tracks.flat().every(state=>state==='ended')).toBe(true);await expect.poll(async()=>(await pendingPersistent(page)).contexts.every(state=>state==='closed')).toBe(true);
 await info.attach('N01-pending-'+reset+'.json',{body:JSON.stringify(await pendingPersistent(page)),contentType:'application/json'});
});

for(const departure of ['Back','reload'] as const)test('N01 root pending worklet '+departure+' retires monitoring without implicit resume',async({page,context},info)=>{
 await context.grantPermissions(['microphone']);await instrument(page);await instrumentCaptureDeparture(page,true);await installAndOpen(page);
 const mic=page.getByRole('button',{name:'Pitch monitoring',exact:true});await page.getByRole('checkbox',{name:'Root only',exact:true}).check();await mic.click();await expect.poll(async()=>(await captureDeparture(page)).modulePending).toBe(true);await expect(page.locator('[data-root-pitch-gauge]')).toHaveCount(0);
 if(departure==='Back'){
  await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByRole('button',{name:'Play song',exact:true})).toBeVisible();
  await expect.poll(async()=>(await captureDeparture(page)).tracks.every(state=>state==='ended')).toBe(true);await expect.poll(async()=>(await captureDeparture(page)).contexts.every(state=>state==='closed')).toBe(true);
  await page.evaluate(()=>(window as unknown as {captureDeparture:{release:()=>void}}).captureDeparture.release());await page.waitForTimeout(900);expect((await captureDeparture(page)).graphs).toBe(0);
  await page.getByRole('button',{name:'Play song',exact:true}).click();await expect(mic).toHaveAttribute('aria-pressed','false');await expect(page.locator('[data-root-pitch-gauge]')).toHaveCount(0);
  await info.attach('N01-Back.json',{body:JSON.stringify(await captureDeparture(page)),contentType:'application/json'});
 }else{
  await page.evaluate(()=>(window as unknown as {captureDeparture:{observe:()=>void}}).captureDeparture.observe());await page.reload();await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
  const receipt=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('capture-departure-proof')!));expect(receipt.trusted).toBe(true);expect(receipt.persisted).toBe(false);expect(receipt.capture.graphs).toBe(0);expect(receipt.capture.tracks.every((s:string)=>s==='ended')).toBe(true);expect(receipt.capture.contexts.every((s:string)=>s==='closed')).toBe(true);
  await page.waitForTimeout(900);expect((await captureDeparture(page)).calls).toBe(0);await expect(mic).toHaveAttribute('aria-pressed','false');await expect(page.locator('[data-root-pitch-gauge]')).toHaveCount(0);
  await info.attach('N01-pagehide.json',{body:JSON.stringify(receipt),contentType:'application/json'});
 }
});


const longPlaybackTitle=('A very long Playback title — café & melody, with a complete selectable ending. '.repeat(3)).trim()+' by Title Fixture Artist';
/** Retention proof needs only context identity/count; leave native BufferSource.start unwrapped. */
async function observeTitleAudioContexts(page:Page){
 await page.addInitScript(()=>{
  const contexts:AudioContext[]=[],Native=window.AudioContext;
  (window as unknown as {playbackProof:unknown}).playbackProof={contexts,items:[]};
  window.AudioContext=class extends Native{constructor(options?:AudioContextOptions){super(options);contexts.push(this);}};
 });
}
test('N02 long Playback title opens selectable bottom sheet; dismissal retains playing transport and navigation',async({page},info)=>{
 await page.setViewportSize({width:360,height:800});await observeTitleAudioContexts(page);await instrumentCaptureDeparture(page);await installAndOpen(page,'playback-title','A very long Playback title');
 const title=page.getByRole('button',{name:'Playback title',exact:true}),dialog=page.getByRole('dialog',{name:'Full Playback title',exact:true});
 await expect(title).toHaveText('Playback · '+longPlaybackTitle);await expect(title).toHaveCSS('text-overflow','ellipsis');expect(await title.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
 const before=await page.evaluate(()=>({url:location.href,state:history.state,length:history.length}));
 await page.getByRole('button',{name:'Play',exact:true}).click();await expect(page.locator('[data-playback-phase]')).toHaveAttribute('data-playback-requested','true');
 const position=page.getByRole('slider',{name:'Position',exact:true}),beat=Number(await position.inputValue());
 await title.click();await expect(dialog).toBeVisible();await expect(dialog.locator('[data-full-playback-title]')).toHaveText(longPlaybackTitle);
 await expect(page.getByRole('button',{name:'Close full title',exact:true})).toBeFocused();
 await page.keyboard.press('Shift+Tab');await expect(dialog.locator('[aria-label="Selectable title"]')).toBeFocused();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Close full title',exact:true})).toBeFocused();
 await page.waitForTimeout(600);expect(Number(await position.inputValue())).toBeGreaterThan(beat);await expect(page.locator('[data-playback-phase]')).toHaveAttribute('data-playback-requested','true');
 // Actual browser selection, not a scripted Range/selectAll proof.
 const text=dialog.locator('[data-full-playback-title]'),box=(await text.boundingBox())!;
 await page.mouse.click(box.x+8,box.y+10,{clickCount:3});await expect.poll(()=>page.evaluate(()=>getSelection()?.toString().trim())).toBe(longPlaybackTitle);
 await page.waitForTimeout(100);expect(await page.evaluate(()=>getSelection()?.toString().trim())).toBe(longPlaybackTitle);
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(title).toBeFocused();
 await title.press('Enter');await expect(dialog).toBeVisible();const bounds=(await dialog.boundingBox())!;await page.mouse.click(5,bounds.y-12);await expect(dialog).toHaveCount(0);await expect(title).toBeFocused();
 await title.press('Space');await expect(dialog).toBeVisible();await page.getByRole('button',{name:'Close full title',exact:true}).press('Enter');await expect(dialog).toHaveCount(0);await expect(title).toBeFocused();
 expect(await page.evaluate(()=>({url:location.href,state:history.state,length:history.length}))).toEqual(before);await expect(page.locator('[data-playback-phase]')).toHaveAttribute('data-playback-requested','true');await expect(page.getByRole('combobox',{name:'Section',exact:true})).toHaveValue('verse');
 expect((await captureDeparture(page)).calls).toBe(0);expect((await audio(page)).contexts).toHaveLength(1);
 await page.getByRole('button',{name:'Pause',exact:true}).click();await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();await expect(dialog).toHaveCount(0);
 await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByRole('heading',{name:'Library',exact:true})).toBeVisible();await expect(title).toHaveCount(0);
 await info.attach('N02-title-transport-navigation.json',{body:JSON.stringify({fullTitle:longPlaybackTitle,before,selection:'native triple-click verified complete text',capture:await captureDeparture(page)}),contentType:'application/json'});
});

test('N02 title sheet wraps at narrow200percent; short/missing-artist title works and root header stays non-actionable',async({page},info)=>{
 await page.setViewportSize({width:320,height:640});await instrumentCaptureDeparture(page);await installAndOpen(page,'playback-title','A very long Playback title');
 await page.evaluate(()=>{document.documentElement.style.fontSize='32px';});
 await page.getByRole('button',{name:'Playback title',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Full Playback title',exact:true});await expect(dialog).toBeVisible();await expect(dialog.locator('[data-full-playback-title]')).toHaveText(longPlaybackTitle);
 const layout=await dialog.evaluate(el=>{const r=el.getBoundingClientRect(),content=el.querySelector('.playback-title-sheet__content')!;return {x:r.x,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight,overflow:content.scrollWidth-content.clientWidth,scrollable:content.scrollHeight>content.clientHeight};});
 expect(layout.x).toBeGreaterThanOrEqual(-1);expect(layout.right).toBeLessThanOrEqual(layout.width+1);expect(layout.bottom).toBeLessThanOrEqual(layout.height+1);expect(layout.overflow).toBeLessThan(2);expect(layout.scrollable).toBe(true);
 await dialog.locator('[aria-label="Selectable title"]').focus();await page.keyboard.press('End');await expect.poll(()=>dialog.locator('[aria-label="Selectable title"]').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 await page.keyboard.press('Escape');await page.getByRole('checkbox',{name:'Root only',exact:true}).check();await expect(page.getByRole('button',{name:'Playback title',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Playback',exact:true,level:1})).toBeVisible();expect((await captureDeparture(page)).calls).toBe(0);
 await page.getByRole('checkbox',{name:'Root only',exact:true}).uncheck();await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('searchbox',{name:'Search songs',exact:true}).fill('Detail Raw');await page.locator('[data-song-slug="detail-raw"]').click();await page.getByRole('button',{name:'Play song',exact:true}).click();await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
 await page.getByRole('button',{name:'Playback title',exact:true}).click();await expect(dialog.locator('[data-full-playback-title]')).toHaveText('Detail Raw');await page.getByRole('button',{name:'Close full title',exact:true}).click();await expect(dialog).toHaveCount(0);expect((await captureDeparture(page)).calls).toBe(0);
 await info.attach('N02-title-narrow.json',{body:JSON.stringify(layout),contentType:'application/json'});
});

test('N02 opening/closing title neither starts capture nor cancels an explicitly enabled monitoring owner',async({page,context},info)=>{
 await context.grantPermissions(['microphone']);await instrumentCaptureDeparture(page);await installAndOpen(page,'playback-title','A very long Playback title');
 const title=page.getByRole('button',{name:'Playback title',exact:true}),dialog=page.getByRole('dialog',{name:'Full Playback title',exact:true}),mic=page.locator('button[aria-label="Pitch monitoring"]');
 await title.click();await page.keyboard.press('Escape');expect((await captureDeparture(page)).calls).toBe(0);
 await mic.click();await expect.poll(async()=>(await captureDeparture(page)).graphs).toBe(1);await title.click();await expect(dialog).toBeVisible();await page.waitForTimeout(900);await expect(mic).toHaveAttribute('aria-pressed','true');expect((await captureDeparture(page)).calls).toBe(1);expect((await captureDeparture(page)).tracks).toContain('live');
 await page.keyboard.press('Escape');await expect(title).toBeFocused();await expect(mic).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'Stop persistent pitch practice',exact:true}).click();
 await expect.poll(async()=>(await captureDeparture(page)).tracks.every(state=>state==='ended')).toBe(true);await expect.poll(async()=>(await captureDeparture(page)).contexts.every(state=>state==='closed')).toBe(true);expect((await captureDeparture(page)).calls).toBe(1);
 await info.attach('N02-title-monitor-owner.json',{body:JSON.stringify(await captureDeparture(page)),contentType:'application/json'});
});
