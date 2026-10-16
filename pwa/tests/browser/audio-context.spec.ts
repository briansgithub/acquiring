import {mkdir,writeFile} from 'node:fs/promises';
import {expect,test,type Page} from '@playwright/test';
const snapshot=(page:Page)=>page.evaluate(()=>window.applicationAudioProof.snapshot());
const open=async(page:Page,query='')=>{
  await page.goto('http://127.0.0.1:5173/tests/browser/audio-context.html'+query);
  await expect(page.getByRole('heading',{name:'Shared audio acceptance fixture'})).toBeVisible();
};
test.afterEach(async({page},info)=>{
  const evidence=await snapshot(page).catch(()=>null);
  if(evidence){await mkdir(info.outputDir,{recursive:true});await writeFile(info.outputPath('proof.json'),JSON.stringify(evidence,null,2));}
  await page.evaluate(()=>window.applicationAudioProof?.release()).catch(()=>{});
});
for(const rate of [44100,48000])test('real shared context retains another borrower and closes permanently at'+rate,async({page})=>{
  await open(page,'?rate='+rate);const fresh=await snapshot(page);expect(fresh.contextCount).toBe(0);expect(fresh.application.canRender).toBe(false);
  await page.getByRole('button',{name:'Play first preview',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).receipts.some(r=>r.requestId==='first-1'&&r.kind==='render-started')).toBe(true);
  await expect.poll(async()=>(await snapshot(page)).peak).toBeGreaterThan(.005);
  await page.getByRole('button',{name:'Release first preview',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).first.phase).toBe('released');
  const releasedFirst=await snapshot(page);expect(releasedFirst.closeCount).toBe(0);expect(releasedFirst.contextState).toBe('running');
  await page.getByRole('button',{name:'Play second preview',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).receipts.some(r=>r.requestId==='second-2'&&r.kind==='render-started')).toBe(true);
  await expect.poll(async()=>(await snapshot(page)).peak).toBeGreaterThan(.005);
  const second=await snapshot(page);expect(second.contextCount).toBe(1);expect(second.sampleRate).toBe(rate);expect(second.application.sampleRate).toBe(rate);expect(second.application.canRender).toBe(true);
  await page.getByRole('button',{name:'Release application audio',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).contextState).toBe('closed');
  await expect.poll(async()=>(await snapshot(page)).retained).toBe(0);
  const released=await snapshot(page);expect(released.application.phase).toBe('released');expect(released.application.canRender).toBe(false);expect(released.closeCount).toBe(1);
  await page.getByRole('button',{name:'Play second preview',exact:true}).click();
  const attempted=await snapshot(page);expect(attempted.contextCount).toBe(1);expect(attempted.sourceCount).toBe(released.sourceCount);expect(attempted.receipts).toEqual(released.receipts);
});
test('actual context suspension invalidates permission and another explicit gesture is required',async({page})=>{
  await open(page);await page.getByRole('button',{name:'Play second preview',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).receipts.some(r=>r.kind==='render-started')).toBe(true);
  const playing=await snapshot(page);
  await page.getByRole('button',{name:'Suspend context',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).contextState).toBe('suspended');
  await expect.poll(async()=>(await snapshot(page)).retained).toBe(0);
  const suspended=await snapshot(page);expect(suspended.application.canRender).toBe(false);expect(suspended.application.epoch).toBeGreaterThan(playing.application.epoch);
  expect(suspended.receipts.map(r=>r.kind)).toEqual(['render-started']);
  await page.getByRole('button',{name:'Play second preview',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).receipts.filter(r=>r.kind==='render-started').length).toBe(2);
  const resumed=await snapshot(page);expect(resumed.application.canRender).toBe(true);expect(resumed.contextCount).toBe(1);
});
test('trusted navigation invalidates shared permission and retires every borrower',async({page})=>{
  await open(page);await page.getByRole('button',{name:'Play second preview',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).receipts.some(r=>r.kind==='render-started')).toBe(true);
  const playing=await snapshot(page);
  await page.goto('http://127.0.0.1:5173/tests/browser/audio-context.html?returned');
  const departed=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('applicationAudioDeparture')!)) as Awaited<ReturnType<typeof snapshot>>;
  expect(departed.lifecycle.some(event=>event.type==='pagehide'&&event.trusted)).toBe(true);
  expect(departed.application.canRender).toBe(false);expect(departed.application.epoch).toBeGreaterThan(playing.application.epoch);
  expect(departed.retained).toBe(0);expect(departed.receipts.map(r=>r.kind)).toEqual(['render-started']);
  const fresh=await snapshot(page);expect(fresh.contextCount).toBe(0);expect(fresh.application.canRender).toBe(false);expect(fresh.receipts).toEqual([]);
});
