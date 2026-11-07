import {expect,test} from '@playwright/test';
const url='https://www.hooktheory.com/theorytab/view/fixture/song';
const pageHtml='<a class="tb-section-tab" href="#tab-10">verse</a><a class="tb-section-tab" href="#tab-2">Chorus</a><a class="tb-section-tab" href="#tab-10">Outro</a><a class="tb-section-tab" href="#tab-unused">Verse</a>';
const api=JSON.stringify({ID:'9007199254740993',song:'Disposable fixture',jsonData:JSON.stringify({chords:[{root:1,type:5,beat:1,duration:1}],notes:{melody1:[{sd:'1',beat:1}]},keys:[{tonic:'C',scale:'major',beat:1}]})});

test('repo handler runs in actual module Worker with fixture-only HTTP; ordered document and user state preserved',async({page,context})=>{
  const forbidden:string[]=[];
  await context.route(/https:\/\/([^/]+\.)?hooktheory\.com\//,route=>{forbidden.push(route.request().url());return route.abort();});
  await context.route('**/harvest-fixtures/**',route=>route.fulfill({body:route.request().url().endsWith('page.html')?pageHtml:api}));
  await page.goto('http://127.0.0.1:5173/tests/browser/harvest-worker.html');
  await page.waitForFunction(()=>!!window.harvestWorkerHarness&&!!window.catalogHarness);
  await page.evaluate(()=>window.catalogHarness.seedUsers());
  const before=await page.evaluate(()=>window.catalogHarness.users());
  await page.evaluate(url=>window.harvestWorkerHarness.start('first',url),url);
  await page.waitForFunction(()=>!!window.harvestWorkerHarness.result('first'));
  const result=await page.evaluate(()=>window.harvestWorkerHarness.result('first'));
  expect(result!.status).toBe(200);expect(result!.calls).toHaveLength(3);
  expect(await page.evaluate(()=>window.harvestWorkerHarness.decoded('first'))).toEqual([
    {key:'10',name:'Verse',index:0,id:'9007199254740993',chords:[{root:1,type:5,beat:1,duration:1}]},
    {key:'2',name:'Chorus',index:1,id:'9007199254740993',chords:[{root:1,type:5,beat:1,duration:1}]},
    {key:'10#2-1',name:'Outro',index:2,id:'9007199254740993',chords:[{root:1,type:5,beat:1,duration:1}]},
  ]);
  expect(await page.evaluate(()=>window.catalogHarness.users())).toEqual(before);
  expect(forbidden).toEqual([]);
  await page.evaluate(()=>window.harvestWorkerHarness.terminate());
});

test('module-worker cancellation, termination and failed section leave user rows/outbox intact; retry succeeds',async({page,context})=>{
  let mode:'hold'|'fail'|'ok'='hold',entered!:()=>void,release!:()=>void;
  let reached=new Promise<void>(resolve=>{entered=resolve;});
  let gate=new Promise<void>(resolve=>{release=resolve;});
  await context.route('**/harvest-fixtures/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('page.html'))return route.fulfill({body:pageHtml});
    if(path.endsWith('/2')) {
      if(mode==='hold'){entered();await gate;}
      if(mode==='fail')return route.fulfill({body:'invalid fixture API'});
    }
    await route.fulfill({body:api}).catch(()=>{});
  });
  await page.goto('http://127.0.0.1:5173/tests/browser/harvest-worker.html');
  await page.waitForFunction(()=>!!window.harvestWorkerHarness&&!!window.catalogHarness);
  await page.evaluate(()=>window.catalogHarness.seedUsers());
  const before=await page.evaluate(()=>window.catalogHarness.users());
  await page.evaluate(url=>window.harvestWorkerHarness.start('cancel',url),url);await reached;
  await page.evaluate(()=>window.harvestWorkerHarness.cancel('cancel'));
  await page.waitForFunction(()=>!!window.harvestWorkerHarness.result('cancel'));
  expect((await page.evaluate(()=>window.harvestWorkerHarness.result('cancel')))!.status).toBe(499);release();
  reached=new Promise<void>(resolve=>{entered=resolve;});gate=new Promise<void>(resolve=>{release=resolve;});
  await page.evaluate(url=>window.harvestWorkerHarness.start('terminate',url),url);await reached;
  await page.evaluate(()=>window.harvestWorkerHarness.terminate());release();mode='fail';
  await page.evaluate(url=>window.harvestWorkerHarness.start('failed',url),url);
  await page.waitForFunction(()=>!!window.harvestWorkerHarness.result('failed'));
  const failed=await page.evaluate(()=>window.harvestWorkerHarness.result('failed'));
  expect(failed!.status).toBe(502);expect(failed!.body).not.toHaveProperty('data');
  mode='ok';await page.evaluate(url=>window.harvestWorkerHarness.start('retry',url),url);
  await page.waitForFunction(()=>!!window.harvestWorkerHarness.result('retry'));
  expect((await page.evaluate(()=>window.harvestWorkerHarness.result('retry')))!.status).toBe(200);
  expect(await page.evaluate(()=>window.catalogHarness.users())).toEqual(before);
  await page.evaluate(()=>window.harvestWorkerHarness.terminate());
});
