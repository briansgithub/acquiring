import {expect,test,type Page} from '@playwright/test';

type SyntheticProof={
  label:'SYNTHETIC';
  current:{kind:string;midi?:number;isHeld?:boolean;message?:string}|null;
  starts:number;stops:number;denied:boolean;tracksLive:boolean;
};
const snapshot=(page:Page)=>page.evaluate(()=>(window as unknown as {microphoneCaptureProof:SyntheticProof}).microphoneCaptureProof);

test.describe('SYNTHETIC microphone capture (not real mic / Pixel)',()=>{
  test('synthetic 440Hz oscillator publishes an estimate then stop yields no-signal',async({page})=>{
    await page.goto('http://127.0.0.1:5173/tests/browser/microphone-capture.html');
    await expect(page.getByRole('heading',{name:'Synthetic microphone capture fixture'})).toBeVisible();
    await page.getByRole('button',{name:'Start synthetic capture',exact:true}).click();
    await expect.poll(async()=>(await snapshot(page)).current?.kind,{timeout:8_000}).toBe('estimate');
    const live=await snapshot(page);
    expect(live.label).toBe('SYNTHETIC');
    expect(live.current).toMatchObject({kind:'estimate',isHeld:false});
    if(live.current?.kind==='estimate'){
      expect(live.current.midi).toBeGreaterThan(67);
      expect(live.current.midi).toBeLessThan(71);
    }
    await page.getByRole('button',{name:'Stop capture',exact:true}).click();
    await expect.poll(async()=>(await snapshot(page)).current).toEqual({kind:'no-signal'});
    expect((await snapshot(page)).tracksLive).toBe(false);
  });

  test('permission denial publishes Error and does not invent cents',async({page})=>{
    await page.goto('http://127.0.0.1:5173/tests/browser/microphone-capture.html');
    await page.getByRole('button',{name:'Deny microphone',exact:true}).click();
    await expect.poll(async()=>(await snapshot(page)).current?.kind).toBe('error');
    const denied=await snapshot(page);
    expect(denied.label).toBe('SYNTHETIC');
    expect(denied.current).toMatchObject({kind:'error',message:'Permission denied'});
  });
});
