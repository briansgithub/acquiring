import {mkdir,writeFile} from 'node:fs/promises';
import {expect,test,type Page} from '@playwright/test';
const snapshot=(page:Page)=>page.evaluate(()=>window.pcmSinkProof.snapshot());
test.afterEach(async({page},info)=>{
  const evidence=await snapshot(page).catch(()=>null);
  if(evidence){await mkdir(info.outputDir,{recursive:true});await writeFile(info.outputPath('proof.json'),JSON.stringify(evidence,null,2));}
  await page.evaluate(()=>window.pcmSinkProof?.release()).catch(()=>{});
});
for(const rate of [44100,48000])test('actual PCM sink scheduling, selected clock and borrowed lifecycle at'+rate,async({page})=>{
  await page.goto('http://127.0.0.1:5173/tests/browser/audio-sink.html?rate='+rate+(rate===48000?'&clock=context-render':''));
  await expect(page.getByRole('heading',{name:'PCM sink acceptance fixture'})).toBeVisible();
  expect(await page.evaluate(()=>window.pcmSinkProof.tryBegin())).toBe('BLOCKED');
  expect((await snapshot(page)).contexts).toBe(0);
  await page.getByRole('button',{name:'Queue PCM from gesture',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).history.length).toBe(1);
  await expect.poll(async()=>(await snapshot(page)).peak,{intervals:[10,20,30],timeout:2000}).toBeGreaterThan(.005);
  const playing=await snapshot(page);
  expect(playing.errors).toEqual([]);expect(playing.sampleRate).toBe(rate);expect(playing.contexts).toBe(1);
  expect(playing.history[0]).toMatchObject({phase:'scheduled',clock:rate===48000?'context-render':'output-timestamp',queueDrained:false,mappings:2});
  expect(playing.history[0].queuedFrames).toBeLessThanOrEqual(Math.ceil(rate*.2)+4096);
  expect(playing.records).toHaveLength(2);
  for(const record of playing.records){expect(record.frames).toBe(4096);expect(record.first).toBe(-1);expect(record.second).toBe(32767/32768);expect(Math.abs(record.start!*rate-Math.round(record.start!*rate))).toBeLessThan(1e-8);}
  expect(playing.records[1].start!-playing.records[0].start!).toBeCloseTo(4096/rate,12);
  await expect.poll(async()=>(await snapshot(page)).reading?.queueDrained).toBe(true);
  const drained=await snapshot(page);expect(drained.reading?.beat).toBeCloseTo(1+8192/rate,10);
  expect(drained.contextTime).toBeGreaterThan(playing.history[0].playedFrame!/rate);
  await expect.poll(async()=>(await snapshot(page)).records.every(record=>record.ended===1&&record.disconnects>=1)).toBe(true);
  await page.getByRole('button',{name:'Queue PCM from gesture',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).history.length).toBe(2);
  await page.getByRole('button',{name:'Suspend context',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).contextState).toBe('suspended');
  const suspended=await snapshot(page);expect(suspended.application.canRender).toBe(false);expect(suspended.reading?.phase).toBe('idle');
  expect(suspended.records.slice(2).every(record=>record.stops===1&&record.disconnects>=1)).toBe(true);
  expect(await page.evaluate(()=>window.pcmSinkProof.tryBegin())).toBe('BLOCKED');
  await page.getByRole('button',{name:'Queue PCM from gesture',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).history.length).toBe(3);
  expect((await snapshot(page)).contexts).toBe(1);
  await page.getByRole('button',{name:'Flush queue',exact:true}).click();
  expect((await snapshot(page)).reading?.phase).toBe('idle');
  await page.getByRole('button',{name:'Release sink',exact:true}).click();
  const released=await snapshot(page);expect(released.reading?.phase).toBe('released');expect(released.contextState).toBe('running');expect(released.closes).toBe(0);
  expect(await page.evaluate(()=>window.pcmSinkProof.tryBegin())).toBe('RELEASED');
  await page.getByRole('button',{name:'Play with another borrower',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).history.length).toBe(4);
  const borrowed=await snapshot(page);expect(borrowed.contexts).toBe(1);expect(borrowed.closes).toBe(0);expect(borrowed.errors).toEqual([]);
});
