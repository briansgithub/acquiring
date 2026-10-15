import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { CatalogManifest } from '../../src/storage/catalog/manifest';
type Fixture = { directory: string; manifest: CatalogManifest; hash: string };
const fixtures: Fixture[] = [];
let selected: number, corruptManifestHash: boolean, requested: string[];
let gate: ((path: string) => Promise<void>) | undefined;
test.beforeAll(async () => {
  for (const snapshot of ['d','e']) {
    const fixture = JSON.parse(execFileSync('python',['scripts/catalog/make-browser-fixture.py','--snapshot',snapshot.repeat(64)],{encoding:'utf8'})) as Fixture;
    fixture.hash = createHash('sha256').update(await readFile(resolve(fixture.directory,'manifest.json'))).digest('hex'); fixtures.push(fixture);
  }
});
test.beforeEach(async ({ context }) => {
  selected=0;corruptManifestHash=false;requested=[];gate=undefined;
  await context.route('**/catalog-sources.json',route => route.fulfill({status:200,json:{schemaVersion:'acquiring-pwa-catalog-sources-1',catalogs:[{kind:'aural',manifestUrl:`http://127.0.0.1:4173/installer-fixtures/v${selected+1}/manifest.json`,manifestSha256:corruptManifestHash?'0'.repeat(64):fixtures[selected]!.hash}]}}));
  await context.route('**/installer-fixtures/**',async route => {
    const relative=new URL(route.request().url()).pathname.split('/installer-fixtures/')[1]!;
    requested.push(relative);await gate?.(relative);
    const [version,...parts]=relative.split('/'),fixture=fixtures[version==='v2'?1:0]!;
    const path=resolve(fixture.directory,...parts);
    if (!path.startsWith(resolve(fixture.directory)+sep)) throw new Error('Fixture traversal');
    await route.fulfill({status:200,body:await readFile(path),headers:{'Content-Type':'application/octet-stream'}}).catch(() => {});
  });
});
const aural=(page: Page) => page.getByRole('article').filter({has:page.getByRole('heading',{name:'Aural practice',exact:true})});
async function open(page: Page) {
  await page.goto('/settings');await expect(page.getByRole('button',{name:'Download aural practice',exact:true})).toBeEnabled();
}
async function installed(page: Page) {
  await page.getByRole('button',{name:'Download aural practice',exact:true}).click();
  await expect(aural(page).getByText('Downloaded and verified',{exact:true})).toBeVisible();
}
test('product installer verifies real SQLite and a fresh Settings load works offline',async ({ page,context }) => {
  await open(page);await installed(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange',() => resolve(),{once:true})); });
  await context.setOffline(true);await page.reload();
  await expect(aural(page).getByText('Available offline',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();
});
test('pause and page loss retain the retry ID and skip the completed database on resume',async ({ page }) => {
  await open(page);
  let reached!: () => void,release!: () => void;
  const blocked=new Promise<void>(resolve => {reached=resolve;}),proceed=new Promise<void>(resolve => {release=resolve;});
  gate=async path => {if(path.includes('aural-evidence.db')) {reached();await proceed;}};
  let intent: string | null;
  try {
    await page.getByRole('button',{name:'Download aural practice',exact:true}).click();await blocked;
    intent=await page.evaluate(() => localStorage.getItem('acquiring.catalog.attempt.v1.aural'));
    await page.getByRole('button',{name:'Pause aural practice download',exact:true}).click();
    await expect(aural(page).getByText('Download paused. You can resume it here.',{exact:true})).toBeVisible();
  } finally {release();gate=undefined;}
  await page.reload();await expect(page.getByRole('button',{name:'Resume download aural practice',exact:true})).toBeEnabled();requested=[];
  await page.getByRole('button',{name:'Resume download aural practice',exact:true}).click();
  await expect(aural(page).getByText('Downloaded and verified',{exact:true})).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('acquiring.catalog.attempt.v1.aural'))).toBe(intent!);
  expect(requested.some(path => path.includes('aural-catalog.db'))).toBe(false);
});
test('an unverified update never replaces the installed catalog',async ({ page }) => {
  await open(page);await installed(page);selected=1;corruptManifestHash=true;
  await page.getByRole('button',{name:'Refresh catalog availability',exact:true}).click();
  await expect(page.getByRole('button',{name:'Check for update aural practice',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Check for update aural practice',exact:true}).click();
  await expect(aural(page).getByText('The download could not be verified. Your installed catalog is unchanged.',{exact:true})).toBeVisible();
  expect(requested.some(path => path.startsWith('v2/chunks/'))).toBe(false);
  await page.reload();await expect(aural(page).getByText('Available offline',{exact:true})).toBeVisible();
});
test('another tab shows ownership guidance and can retry after the owner closes',async ({ page,context }) => {
  await open(page);const second=await context.newPage();await second.goto('http://127.0.0.1:4173/settings');
  await expect(aural(second).getByText('A catalog is open in another tab. Close that tab, then try again.',{exact:true})).toBeVisible();
  await page.close();await second.getByRole('button',{name:'Refresh catalog availability',exact:true}).click();
  await expect(second.getByRole('button',{name:'Download aural practice',exact:true})).toBeEnabled();
  await expect(aural(second).getByText('A catalog is open in another tab. Close that tab, then try again.',{exact:true})).toHaveCount(0);
});
