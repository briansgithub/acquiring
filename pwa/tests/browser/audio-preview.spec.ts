import {mkdir,writeFile} from 'node:fs/promises';
import {expect,test,type Page} from '@playwright/test';
const snapshot=(page:Page)=>page.evaluate(()=>window.audioPreviewProof.snapshot());
const open=async(page:Page,query='')=>{await page.goto('http://127.0.0.1:5173/tests/browser/audio-preview.html'+query);await expect(page.getByRole('heading',{name:'Preview acceptance fixture'})).toBeVisible();};
test.afterEach(async({page},info)=>{
  const evidence=await snapshot(page).catch(()=>null);
  if(evidence){await mkdir(info.outputDir,{recursive:true});await writeFile(info.outputPath('proof.json'),JSON.stringify(evidence,null,2));}
  await page.evaluate(()=>window.audioPreviewProof?.release()).catch(()=>{});
});
for(const rate of [44100,48000])test('real preview render clock,PCM output and natural completion at'+rate,async({page})=>{
  await open(page,'?rate='+rate);expect((await snapshot(page)).contextCount).toBe(0);
  await page.getByRole('button',{name:'Play preview',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).receipts.some(r=>r.kind==='render-started')).toBe(true);
  await expect.poll(async()=>(await snapshot(page)).peak).toBeGreaterThan(.005);
  const active=await snapshot(page),started=active.receipts.find(r=>r.kind==='render-started')!;
  expect(active.contextState).toBe('running');expect(active.sampleRate).toBe(rate);expect(active.renderCalls[0]!.rate).toBe(rate);
  expect(started.contextTime).toBeGreaterThan(started.scheduledTime);expect(started.frameCount).toBe(Math.trunc(rate*.75));expect(started.nonSilent).toBe(true);
  await expect.poll(async()=>(await snapshot(page)).receipts.map(r=>r.kind)).toEqual(['render-started','ended']);
  expect((await snapshot(page)).retained).toBe(0);
  await page.getByRole('button',{name:'Play preview',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).receipts.filter(r=>r.kind==='ended').length).toBe(2);
  expect((await snapshot(page)).contextCount).toBe(1);
});
test('out of order native preparation cannot create an obsolete real audio source',async({page})=>{
  await open(page);await page.getByRole('button',{name:'Prepare old preview',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).delayed).toBe(1);
  await page.getByRole('button',{name:'Play long preview',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).receipts.some(r=>r.requestId==='long-2'&&r.kind==='render-started')).toBe(true);
  await page.evaluate(()=>window.audioPreviewProof.resolveOld());
  await expect.poll(async()=>(await snapshot(page)).delayed).toBe(0);
  const active=await snapshot(page);expect(active.receipts.some(r=>r.requestId.startsWith('old'))).toBe(false);expect(active.sourceCount).toBe(1);expect(active.retained).toBe(1);
  await page.getByRole('button',{name:'Stop preview',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).retained).toBe(0);
  expect((await snapshot(page)).receipts.map(r=>r.kind)).toEqual(['render-started']);
});
// Unproven in this automation: both headless and offscreen headed targets kept every page visible.
// Keep the trusted-event assertion intact for future actual-window/device acceptance.
test.fixme('real tab departure stops preview;return requires a new gesture and release is permanent',async({page,context})=>{
  await open(page);await page.getByRole('button',{name:'Play long preview',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).receipts.length).toBe(1);
  const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();
  await expect.poll(async()=>(await snapshot(page)).state.phase).toBe('idle');
  const away=await snapshot(page);expect(away.retained).toBe(0);expect(away.lifecycle.some(e=>e.trusted&&(e.type==='blur'||e.type==='hidden'))).toBe(true);
  await page.bringToFront();await expect.poll(()=>page.evaluate(()=>document.visibilityState)).toBe('visible');
  const returned=await snapshot(page);
  await expect.poll(async()=>(await snapshot(page)).contextTime).toBeGreaterThan(returned.contextTime+.1);
  expect((await snapshot(page)).receipts).toEqual(away.receipts);expect((await snapshot(page)).retained).toBe(0);
  await page.getByRole('button',{name:'Play long preview',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).receipts.length).toBe(2);
  await page.getByRole('button',{name:'Release audio',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).contextState).toBe('closed');
  const released=await snapshot(page);expect(released.retained).toBe(0);expect(released.state.phase).toBe('released');
  await page.getByRole('button',{name:'Play preview',exact:true}).click();
  expect((await snapshot(page)).receipts).toEqual(released.receipts);expect((await snapshot(page)).contextCount).toBe(1);
  await other.close();
});

test('trusted pagehide retires sources and a fresh document needs a new gesture',async({page})=>{
  await open(page);await page.getByRole('button',{name:'Play long preview',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).receipts.length).toBe(1);
  await page.goto('http://127.0.0.1:5173/tests/browser/audio-preview.html?after-departure');
  await expect(page.getByRole('heading',{name:'Preview acceptance fixture'})).toBeVisible();
  const departure=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('previewDepartureReceipt')!)) as Awaited<ReturnType<typeof snapshot>>;
  expect(departure.lifecycle.some(e=>e.type==='pagehide'&&e.trusted)).toBe(true);
  expect(departure.state.phase).toBe('idle');expect(departure.retained).toBe(0);
  expect(departure.receipts.map(r=>r.kind)).toEqual(['render-started']);
  const fresh=await snapshot(page);expect(fresh.contextCount).toBe(0);expect(fresh.receipts).toEqual([]);expect(fresh.state.phase).toBe('idle');
  await page.getByRole('button',{name:'Play long preview',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).receipts.length).toBe(1);
  await page.getByRole('button',{name:'Release audio',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).contextState).toBe('closed');
  const released=await snapshot(page);expect(released.retained).toBe(0);expect(released.state.phase).toBe('released');
  await page.getByRole('button',{name:'Play preview',exact:true}).click();
  expect((await snapshot(page)).receipts).toEqual(released.receipts);expect((await snapshot(page)).contextCount).toBe(1);
});
