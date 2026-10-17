import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {expect,test,type Page} from '@playwright/test';
import type {CatalogManifest} from '../../src/storage/catalog/manifest';
let fixture:{directory:string;manifest:CatalogManifest;hash:string};
test.setTimeout(60_000);
test.beforeAll(async()=>{fixture=JSON.parse(execFileSync('python',['scripts/catalog/make-library-browser-fixture.py','--song-screen','--playback-errors','--playback-major'],{encoding:'utf8'}));fixture.hash=createHash('sha256').update(await readFile(resolve(fixture.directory,'manifest.json'))).digest('hex');});
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
    type Item={peak:number;scheduled:number;endedAt:number|null;stops:number;frames:number;hz:number;homeEnergy:Record<number,number>;pcmHash:number};
    const proof:{contexts:AudioContext[];items:Item[]}={contexts:[],items:[]};
    (window as unknown as {playbackProof:typeof proof}).playbackProof=proof;
    const Native=window.AudioContext;
    window.AudioContext=class extends Native {
      constructor(options?:AudioContextOptions){super(options);proof.contexts.push(this);}
      createBufferSource(){
        const source=super.createBufferSource(),start=source.start.bind(source),stop=source.stop.bind(source),context=this;
        const item:Item={peak:0,scheduled:0,endedAt:null,stops:0,frames:0,hz:0,homeEnergy:{},pcmHash:0};
        source.start=(when=0,offset=0,duration?:number)=>{
          const data=source.buffer?.getChannelData(0);if(data){item.frames=data.length;let crossings=0;for(let i=0;i<data.length;i++){item.peak=Math.max(item.peak,Math.abs(data[i]));if(i>0&&data[i-1]<=0&&data[i]>0)crossings++;}item.hz=crossings*context.sampleRate/Math.max(1,data.length-1);}
          if(data){let hash=2166136261;const bits=new Uint32Array(data.buffer,data.byteOffset,data.length);for(const word of bits)hash=Math.imul(hash^word,16777619);item.pcmHash=hash>>>0;}
          if(data&&Math.abs(data.length/context.sampleRate-.45)<.0001){
            // Measure actual mixed PCM, independent of the requested notes or UI labels.
            const first=Math.floor(context.sampleRate*.08),last=Math.min(data.length,Math.floor(context.sampleRate*.35));
            for(const midi of [50,53,54,57,62,65,66,69]){let re=0,im=0;const omega=2*Math.PI*440*2**((midi-69)/12)/context.sampleRate;for(let i=first;i<last;i++){re+=data[i]*Math.cos(omega*i);im+=data[i]*Math.sin(omega*i);}item.homeEnergy[midi]=Math.hypot(re,im)/(last-first);}
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
  const p=(window as unknown as {playbackProof:{contexts:AudioContext[];items:{peak:number;scheduled:number;endedAt:number|null;stops:number;frames:number;hz:number;homeEnergy:Record<number,number>;pcmHash:number}[]}}).playbackProof;
  return {contexts:p.contexts.map(context=>({rate:context.sampleRate,state:context.state,time:context.currentTime})),items:p.items};
});}
async function installAndOpen(page:Page){
  await page.goto('/');await page.getByRole('button',{name:'Download catalogs',exact:true}).click();
  await page.getByRole('button',{name:'Download song library',exact:true}).click();await expect(page.getByText('Downloaded and verified',{exact:true})).toBeVisible({timeout:25_000});
  await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('searchbox',{name:'Search songs',exact:true}).fill('Detail_Gzip');
  await page.locator('[data-song-slug="detail-gzip"]').click();await page.getByRole('button',{name:'Play song',exact:true}).click();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
  await expect(page.getByRole('slider',{name:'Position',exact:true})).toBeEnabled();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('data-playback-phase','stopped');
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
  // Two transport buttons, four ranges and three selects; checkbox uses its44px label.
  expect(await controls.count()).toBe(9);
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
  const view=page.locator('[data-playback-phase]');await expect(view).toHaveAttribute('data-playback-phase','error');
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
  await expect(band.getByRole('button',{name:'Play current chord vi7',exact:true})).toBeVisible();
  const tones=band.getByRole('group',{name:'Chord tones',exact:true}).getByRole('button'),toneLabel=await tones.nth(1).getAttribute('aria-label');
  await tones.nth(1).click();await expect.poll(async()=>(await audio(page)).items.length).toBe(5);const lockedTone=(await audio(page)).items[4].hz;
  await lock.uncheck();await expect(band.getByRole('button',{name:'Play current chord v7',exact:true})).toBeVisible();expect(await tones.nth(1).getAttribute('aria-label')).toBe(toneLabel);
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
  await expect(melody.getByRole('button',{name:/Play previous melody/})).toHaveCount(0);await seek(2);await expect(melody.getByRole('button',{name:'Play previous melody 1̂',exact:true})).toBeVisible();await expect(melody.getByRole('button',{name:'Play melody 1̂',exact:true})).toBeVisible();await lock.check();
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
