import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {expect,test,type Page} from '@playwright/test';
import type {CatalogManifest} from '../../src/storage/catalog/manifest';
let fixture:{directory:string;manifest:CatalogManifest;hash:string};
test.setTimeout(60_000);
test.beforeAll(async()=>{
  fixture=JSON.parse(execFileSync('python',['scripts/catalog/make-library-browser-fixture.py','--song-screen','--playback-errors','--playback-major'],{encoding:'utf8'}));
  fixture.hash=createHash('sha256').update(await readFile(resolve(fixture.directory,'manifest.json'))).digest('hex');
});
test.beforeEach(async({context})=>{
  await context.route('**/catalog-sources.json',route=>route.fulfill({status:200,json:{schemaVersion:'acquiring-pwa-catalog-sources-1',catalogs:[{kind:'songs',manifestUrl:new URL('/playback-product/manifest.json',route.request().url()).href,manifestSha256:fixture.hash}]}}));
  await context.route('**/playback-product/**',async route=>{
    const relative=new URL(route.request().url()).pathname.split('/playback-product/')[1]!,path=resolve(fixture.directory,relative);
    if(!path.startsWith(resolve(fixture.directory)+sep))throw new Error('Fixture traversal');
    await route.fulfill({status:200,body:await readFile(path)});
  });
});

type SyntheticCaptureProof={label:'SYNTHETIC';hz:number};

/** Oscillator 440Hz through product getUserMedia. Not the capture harness page. Not Playwright fake/silent. Not Pixel. */
async function installSyntheticOscillatorCapture(page:Page){
  await page.addInitScript(()=>{
    const native=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async(constraints:MediaStreamConstraints)=>{
      if(!constraints||constraints.audio===false||constraints.audio==null)return native(constraints);
      const ctx=new AudioContext();
      if(ctx.state==='suspended')await ctx.resume();
      const osc=ctx.createOscillator();
      osc.type='sine';
      osc.frequency.value=440;
      const dest=ctx.createMediaStreamDestination();
      osc.connect(dest);
      osc.start();
      (window as unknown as {__acquiringSyntheticCapture:SyntheticCaptureProof&{ctx:AudioContext;osc:OscillatorNode}}).__acquiringSyntheticCapture={label:'SYNTHETIC',hz:440,ctx,osc};
      return dest.stream;
    }});
  });
}

async function openPlayback(page:Page){
  await page.goto('/');
  await page.getByRole('button',{name:'Download catalogs',exact:true}).click();
  await page.getByRole('button',{name:'Download song library',exact:true}).click();
  await expect(page.getByText('Downloaded and verified',{exact:true})).toBeVisible({timeout:25_000});
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search songs',exact:true}).fill('Detail_Gzip');
  await page.locator('[data-song-slug="detail-gzip"]').click();
  await page.getByRole('button',{name:'Play song',exact:true}).click();
  await expect(page.locator('[data-playback-phase]')).toHaveAttribute('aria-busy','false');
  await expect(page.getByRole('slider',{name:'Position',exact:true})).toBeEnabled();
}

async function startMonitoring(page:Page){
  const timeline=page.locator('[data-playback-timeline="visible"]');
  const mic=page.getByRole('button',{name:'Pitch monitoring',exact:true});
  await mic.click();
  await expect(mic).toHaveAttribute('aria-pressed','true');
  await expect.poll(async()=>timeline.getAttribute('data-timeline-halo'),{timeout:8_000}).toBe('true');
  await expect.poll(async()=>timeline.getAttribute('data-timeline-live-estimate'),{timeout:8_000}).toBe('true');
  const proof=await page.evaluate(()=>(window as unknown as {__acquiringSyntheticCapture?:SyntheticCaptureProof}).__acquiringSyntheticCapture);
  expect(proof).toEqual(expect.objectContaining({label:'SYNTHETIC',hz:440}));
  return {timeline,mic};
}

async function scrubToRest(page:Page){
  const position=page.getByRole('slider',{name:'Position',exact:true});
  await position.evaluate(el=>{
    const input=el as HTMLInputElement;
    const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')?.set;
    setter?.call(input,'2');
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await expect.poll(async()=>Number(await position.inputValue())).toBeGreaterThanOrEqual(2);
}

test('SYNTHETIC captured pitch through product Pitch monitoring banks a scored cents badge (not harness; not fake/silent; not Pixel)',async({page,context})=>{
  await context.grantPermissions(['microphone']);
  await installSyntheticOscillatorCapture(page);
  await openPlayback(page);
  const {timeline,mic}=await startMonitoring(page);
  await expect(timeline).toHaveAttribute('data-timeline-scores','');
  await page.waitForTimeout(700);
  await scrubToRest(page);
  await expect.poll(async()=>timeline.getAttribute('data-timeline-scores')??'',{timeout:3_000}).toMatch(/^[+-]?\d+¢$/);
  expect(await timeline.getAttribute('data-timeline-scores')).not.toBe('');
  expect(await timeline.getAttribute('data-timeline-scores')).not.toBe('·');
  await expect(timeline).toHaveAttribute('data-timeline-live-estimate','true');
  await expect(mic).toHaveAttribute('aria-pressed','true');
});

test('SYNTHETIC captured pitch banks Unscored · when the run finishes undersampled (still monitoring; not halo rest 0¢)',async({page,context})=>{
  await context.grantPermissions(['microphone']);
  await installSyntheticOscillatorCapture(page);
  await openPlayback(page);
  const {timeline,mic}=await startMonitoring(page);
  await scrubToRest(page);
  await expect.poll(async()=>timeline.getAttribute('data-timeline-scores')??'',{timeout:3_000}).toBe('·');
  await expect(timeline).toHaveAttribute('data-timeline-live-estimate','true');
  await expect(timeline).not.toHaveAttribute('data-timeline-live-cents','');
  await expect(mic).toHaveAttribute('aria-pressed','true');
});

test('SYNTHETIC singing-dock listen scores slot cents against the current target (not timeline badges; not fake/silent; not Pixel)',async({page,context})=>{
  await context.grantPermissions(['microphone']);
  await installSyntheticOscillatorCapture(page);
  await openPlayback(page);
  await page.getByRole('group',{name:'Melody cards',exact:true}).locator('[data-card-role="current"]').dblclick();
  const slot=page.locator('[data-singing-slot="1"] [data-singing-cents]');
  await expect.poll(async()=>page.locator('[data-singing-dock]').getAttribute('data-mic-state'),{timeout:2_000}).toBe('listening');
  await expect.poll(async()=>slot.getAttribute('data-singing-cents-source'),{timeout:8_000}).toBe('captured');
  await expect(slot).toHaveText(/^[+-]\d+¢$/);
  const before=await slot.textContent();
  const proof=await page.evaluate(()=>(window as unknown as {__acquiringSyntheticCapture?:SyntheticCaptureProof}).__acquiringSyntheticCapture);
  expect(proof).toEqual(expect.objectContaining({label:'SYNTHETIC',hz:440}));
  await expect(page.locator('[data-singing-interval="empty"] output')).toHaveText('—');
  await page.getByRole('button',{name:'Raise singing octave',exact:true}).click();
  await expect.poll(async()=>slot.textContent(),{timeout:3_000}).not.toBe(before);
  await expect(slot).toHaveAttribute('data-singing-cents-source','captured');
  await expect(page.locator('[data-singing-interval="empty"] output')).toHaveText('—');
});
