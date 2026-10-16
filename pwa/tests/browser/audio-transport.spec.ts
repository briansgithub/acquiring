import {mkdir,writeFile} from 'node:fs/promises';
import {expect,test,type Page} from '@playwright/test';
const snapshot=(page:Page)=>page.evaluate(()=>window.transportProof.snapshot());
test.afterEach(async({page},info)=>{
  const evidence=await snapshot(page).catch(()=>null);
  if(evidence){await mkdir(info.outputDir,{recursive:true});await writeFile(info.outputPath('proof.json'),JSON.stringify(evidence,null,2));}
  await page.evaluate(()=>window.transportProof?.release()).catch(()=>{});
});
for(const rate of [44100,48000])test('composed stream controls, final drain and foreground ownership at'+rate,async({page},info)=>{
  const url='http://127.0.0.1:5173/tests/browser/audio-transport.html?rate='+rate;
  await page.goto(url);await expect(page.getByRole('heading',{name:'Streaming transport acceptance fixture'})).toBeVisible();
  expect((await snapshot(page)).contexts).toBe(0);expect((await snapshot(page)).state.playbackRequested).toBe(false);
  await page.getByRole('button',{name:'Play from gesture',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).state.phase).toBe('playing');
  await expect.poll(async()=>(await snapshot(page)).peak).toBeGreaterThan(.005);
  await expect.poll(async()=>(await snapshot(page)).state.beat).toBeGreaterThan(1);
  expect((await snapshot(page)).sampleRate).toBe(rate);
  await page.getByRole('button',{name:'Silent scrub',exact:true}).click();
  const scrubbed=await snapshot(page);expect(scrubbed.lastScrub).toBe(true);
  expect(scrubbed.state).toMatchObject({phase:'paused',beat:2.25,playbackRequested:false});
  await page.waitForTimeout(100);
  const silent=await snapshot(page);expect(silent.state.beat).toBe(2.25);expect(silent.sources.length).toBe(scrubbed.sources.length);
  await page.getByRole('button',{name:'Seek and continue',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).state.phase).toBe('playing');
  await page.getByRole('button',{name:'Zero tempo',exact:true}).click();
  const zero=await snapshot(page);expect(zero.state).toMatchObject({phase:'paused',bpm:0,playbackRequested:true});
  await page.waitForTimeout(50);expect((await snapshot(page)).state.beat).toBe(zero.state.beat);
  expect((await snapshot(page)).sources.length).toBe(zero.sources.length);
  await page.getByRole('button',{name:'Restore tempo',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).state.phase).toBe('playing');expect((await snapshot(page)).contexts).toBe(1);
  await page.getByRole('button',{name:'Suspend context',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).contextState).toBe('suspended');
  const suspended=await snapshot(page);expect(suspended.application.canRender).toBe(false);expect(suspended.state.playbackRequested).toBe(false);
  await page.waitForTimeout(50);expect((await snapshot(page)).sources.length).toBe(suspended.sources.length);
  await page.getByRole('button',{name:'Play from gesture',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).state.phase).toBe('playing');
  await page.getByRole('button',{name:'Play short one shot',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).state.phase).toBe('completed');
  const completed=await snapshot(page);expect(completed.state.beat).toBe(1.08);expect(completed.currentCompletion).toBe(true);
  expect(completed.history.some(state=>state.window?.completionKey==='one-shot'&&state.renderEnded&&state.phase!=='completed')).toBe(true);
  expect(completed.history.some(state=>state.phase==='completed'&&state.completion?.completionKey==='one-shot')).toBe(true);
  await page.getByRole('button',{name:'Release transport',exact:true}).click();
  const released=await snapshot(page);expect(released.state.phase).toBe('released');expect(released.contextState).toBe('running');expect(released.closes).toBe(0);
  await page.getByRole('button',{name:'Play another borrower',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).state.phase).toBe('playing');expect((await snapshot(page)).contexts).toBe(1);
  if(rate===44100){
    await page.goto(url+'&returned');
    const departure=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('transportDeparture')!)) as Awaited<ReturnType<typeof snapshot>>&{trusted:boolean};
    expect(departure.trusted).toBe(true);expect(departure.application.canRender).toBe(false);expect(departure.state.playbackRequested).toBe(false);
    const fresh=await snapshot(page);expect(fresh.contexts).toBe(0);expect(fresh.state.playbackRequested).toBe(false);
    await mkdir(info.outputDir,{recursive:true});await writeFile(info.outputPath('departure.json'),JSON.stringify(departure,null,2));
  }
});
