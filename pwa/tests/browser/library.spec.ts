import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {expect,test,type Page} from '@playwright/test';
import type {CatalogManifest} from '../../src/storage/catalog/manifest';
let fixture:{directory:string;manifest:CatalogManifest;hash:string};
let chunkRequests:string[];
test.beforeAll(async()=>{
  fixture=JSON.parse(execFileSync('python',['scripts/catalog/make-library-browser-fixture.py'],{encoding:'utf8'}));
  fixture.hash=createHash('sha256').update(await readFile(resolve(fixture.directory,'manifest.json'))).digest('hex');
});
test.beforeEach(async({context})=>{
  chunkRequests=[];
  await context.route('**/catalog-sources.json',route=>route.fulfill({status:200,json:{schemaVersion:'acquiring-pwa-catalog-sources-1',catalogs:[{kind:'songs',manifestUrl:'http://127.0.0.1:4173/library-product/manifest.json',manifestSha256:fixture.hash}]}}));
  await context.route('**/library-product/**',async route=>{
    const relative=new URL(route.request().url()).pathname.split('/library-product/')[1]!;
    const path=resolve(fixture.directory,relative);
    if(!path.startsWith(resolve(fixture.directory)+sep))throw new Error('Fixture traversal');
    if(relative.startsWith('chunks/'))chunkRequests.push(relative);
    await route.fulfill({status:200,body:await readFile(path),headers:{'Content-Type':'application/octet-stream'}});
  });
});
const rows=(page:Page)=>page.locator('button[data-song-slug]');
async function install(page:Page,url='/'){
  await page.goto(url);await expect(page.getByRole('heading',{name:'No songs yet',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Download catalogs',exact:true}).click();
  await page.getByRole('button',{name:'Download song library',exact:true}).click();
  await expect(page.getByText('Downloaded and verified',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await expect(rows(page)).toHaveCount(20);
}
test('actual Library installs,pages,opens a song route and restores search/page/scroll/focus on Back',async({page})=>{
  await install(page);
  const search=page.getByRole('searchbox',{name:'Search songs',exact:true});
  await search.fill('ZZ Filler');await expect(rows(page)).toHaveCount(20);
  await page.getByRole('button',{name:'Load more songs',exact:true}).click();await expect(rows(page)).toHaveCount(40);
  const selected=rows(page).nth(25);await selected.scrollIntoViewIfNeeded();const slug=await selected.getAttribute('data-song-slug');
  const before=await page.evaluate(()=>scrollY);expect(before).toBeGreaterThan(0);
  await selected.click();await expect(page).toHaveURL(/\/songs\//);
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await expect(search).toHaveValue('ZZ Filler');await expect(rows(page)).toHaveCount(40);
  await expect.poll(()=>page.evaluate(()=>document.activeElement?.getAttribute('data-song-slug'))).toBe(slug);
  await expect(page.locator('.library-content')).toHaveAttribute('aria-busy','false');
  await expect.poll(async()=>Math.abs((await page.evaluate(()=>scrollY))-before)).toBeLessThan(3);
  await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back',exact:true}).click();await expect(rows(page)).toHaveCount(40);await expect(search).toHaveValue('ZZ Filler');
  await expect(page.locator('.library-content')).toHaveAttribute('aria-busy','false');
  await expect.poll(async()=>Math.abs((await page.evaluate(()=>scrollY))-before)).toBeLessThan(3);
});
test('artist view and browser Back retain draft;unmatched search clears;second tab can retry ownership',async({page,context})=>{
  await install(page);const search=page.getByRole('searchbox',{name:'Search songs',exact:true});
  await search.fill('ALPHA');await expect(rows(page)).toHaveCount(6);
  const card=page.locator('li').filter({has:page.locator('[data-song-slug="a-alpha"]')});
  await card.getByRole('button',{name:/Songs by/}).click();
  await expect(page.getByRole('heading',{name:'Artist-A',exact:true})).toBeVisible();await expect(rows(page)).toHaveCount(1);
  await page.goBack();await expect(search).toHaveValue('ALPHA');await expect(rows(page)).toHaveCount(6);
  await search.fill('No such song 938475');await expect(page.getByRole('heading',{name:'No matching songs.',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Clear search',exact:true}).click();await expect(rows(page)).toHaveCount(20);
  const second=await context.newPage();await second.goto('http://127.0.0.1:4173/');
  await expect(second.getByRole('alert')).toContainText('another tab');
  await page.close();await second.getByRole('button',{name:'Retry',exact:true}).click();await expect(rows(second)).toHaveCount(20);
});
test('fresh offline reload can search installed songs at320px and200percent text',async({page,context})=>{
  await install(page);
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));});
  chunkRequests=[];await context.setOffline(true);await page.reload();await expect(rows(page)).toHaveCount(20);
  await page.setViewportSize({width:320,height:640});await page.evaluate(()=>{document.documentElement.style.fontSize='32px';});
  await page.getByRole('searchbox',{name:'Search songs',exact:true}).fill('ALPHA');await expect(rows(page)).toHaveCount(6);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const sizes=await page.locator('.library-content button,.library-content input').evaluateAll(elements=>elements.map(element=>({width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height})));
  expect(sizes.every(size=>size.width>=44&&size.height>=44)).toBe(true);expect(chunkRequests).toEqual([]);
  await mkdir('.artifacts/pwa-port/library',{recursive:true});await page.screenshot({path:'.artifacts/pwa-port/library/narrow-large.png',fullPage:true});
});

test('development StrictMode releases replayed readers and supports Library remount',async({page})=>{
  await install(page,'http://127.0.0.1:5173/');
  const search=page.getByRole('searchbox',{name:'Search songs',exact:true});
  await search.fill('ALPHA');await expect(rows(page)).toHaveCount(6);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(page.getByText('Available offline',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await expect(search).toHaveValue('ALPHA');await expect(rows(page)).toHaveCount(6);
});
test('Playlists Favorites accordion is empty until a song is starred and hides while search is focused',async({page})=>{
  await install(page);
  await expect(page.getByRole('button',{name:'Collapse Playlists',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Expand Favorites',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Expand Favorites',exact:true}).click();
  await expect(page.getByText('No songs yet. Tap the star on the Playback tab to add one.',{exact:true})).toBeVisible();
  await page.getByRole('searchbox',{name:'Search songs',exact:true}).click();
  await expect(page.getByRole('button',{name:'Collapse Playlists',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Expand Favorites',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Clear search',exact:true}).click();
  await expect(page.getByRole('button',{name:'Collapse Playlists',exact:true})).toBeVisible();
});
test('focused empty search shows Recent Selections in HistoryManager order and not on launch',async({page})=>{
  await install(page);
  await expect(page.getByRole('heading',{name:'Recent Selections',exact:true})).toHaveCount(0);
  await page.getByRole('searchbox',{name:'Search songs',exact:true}).fill('ALPHA');
  await page.locator('[data-song-slug="a-alpha"]').click();
  await expect(page).toHaveURL(/\/songs\//);
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await expect(page.getByRole('searchbox',{name:'Search songs',exact:true})).toHaveValue('ALPHA');
  await expect(page.getByRole('heading',{name:'Recent Selections',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Clear search',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Recent Selections',exact:true})).toHaveCount(0);
  await page.getByRole('searchbox',{name:'Search songs',exact:true}).click();
  await expect(page.locator('[data-recent-selections] [data-song-slug="a-alpha"]')).toBeVisible();
  await page.getByRole('button',{name:'Clear search',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search songs',exact:true}).fill('ALPHA');
  await page.locator('[data-song-slug="b-alpha"]').click();
  await expect(page).toHaveURL(/\/songs\//);
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Clear search',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search songs',exact:true}).click();
  await expect.poll(async()=>page.locator('[data-recent-selections] [data-song-slug]').evaluateAll(els=>els.map(el=>el.getAttribute('data-song-slug')))).toEqual(['b-alpha','a-alpha']);
});
test('All Songs alphabetical groups expand one heading and hide while search is focused',async({page})=>{
  await install(page);
  await expect(page.getByRole('button',{name:'All Songs',exact:true})).toBeVisible();
  await page.getByRole('searchbox',{name:'Search songs',exact:true}).click();
  await expect(page.getByRole('button',{name:'All Songs',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Clear search',exact:true}).click();
  await page.getByRole('button',{name:'All Songs',exact:true}).click();
  await expect(page.getByRole('heading',{name:'All Songs',exact:true})).toBeVisible();
  await expect(page.getByText('Alphabetical',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Expand A',exact:true}).click();
  await expect(page.locator('[data-all-songs] [data-song-slug="a-alpha"]')).toBeVisible();
  await expect(page.locator('[data-all-songs-group="A"] .library-playlist-count')).not.toHaveText('0');
  await page.getByRole('button',{name:'Back to Library',exact:true}).click();
  await expect(rows(page)).toHaveCount(20);
  await expect(page.getByRole('button',{name:'All Songs',exact:true})).toBeVisible();
});
