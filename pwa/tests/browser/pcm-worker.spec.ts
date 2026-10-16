import {expect,test} from '@playwright/test';
test('actual module worker preserves transferred PCM across render/config/seek and terminates posted cancellation',async({page},testInfo)=>{
  await page.goto('http://127.0.0.1:5173/tests/browser/pcm-worker.html');await page.waitForFunction(()=>!!window.pcmWorkerProof);
  const proof=await page.evaluate(()=>window.pcmWorkerProof.run());
  expect(proof.ack).toMatchObject({ok:true,kind:'ack',requestId:1,position:{sampleRate:48000}});
  expect(proof.observations.map(value=>value.frames)).toEqual([256,257,4096,4096,513]);
  expect(proof.observations.every(value=>value.maximumDifference===0)).toBe(true);
  expect(proof.workers).toBe(2);expect(proof.terminations).toBe(2);expect(proof.abortCode).toBe('ABORTED');expect(proof.reuseCode).toBe('RELEASED');
  await testInfo.attach('pcm-worker-proof',{body:JSON.stringify(proof),contentType:'application/json'});
});
