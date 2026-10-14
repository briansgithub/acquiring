import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { CatalogManifest } from '../../src/storage/catalog/manifest';
import type { ActiveCatalog } from '../../src/storage/catalog/protocol';
const fixtures = new Map<string, { directory: string; manifest: CatalogManifest }>();
test.beforeAll(() => {
  for (const defect of ['none','missing-index','wrong-index','missing-payload','nullable-key']) fixtures.set(defect, JSON.parse(execFileSync('python',['scripts/catalog/make-song-browser-fixture.py','--defect',defect],{encoding:'utf8'})) as { directory: string; manifest: CatalogManifest });
});
async function call<T = unknown>(page: Page, method: string, args: unknown[] = []): Promise<T> {
  return page.evaluate(async ({method,args}) => {
    const harness = window.catalogHarness as unknown as Record<string,(...args: unknown[]) => unknown>;
    return await harness[method]!(...args);
  }, {method,args}) as Promise<T>;
}
test('native song schema, indexes and payload floors validate before activation', async ({ page,context }) => {
  await context.route('**/song-fixtures/**',async route => {
    const [name,...parts] = new URL(route.request().url()).pathname.split('/song-fixtures/')[1]!.split('/');
    const fixture=fixtures.get(name!)!,path=resolve(fixture.directory,...parts);
    if (!path.startsWith(resolve(fixture.directory)+sep)) throw new Error('Fixture traversal');
    await route.fulfill({status:200,body:await readFile(path)});
  });
  await page.goto('http://127.0.0.1:5173/tests/browser/catalog-worker.html');
  await page.waitForFunction(() => !!window.catalogHarness);
  await call(page,'open',['owner']);
  const attempt='c2345678-1234-1234-1234-123456789012';
  await call(page,'prepare',['owner',attempt,fixtures.get('none')!.manifest,'http://127.0.0.1:5173/song-fixtures/none/']);
  const good=await call<ActiveCatalog>(page,'activate',['owner',attempt]);
  expect(good.inspection.files[0]!.metadata).toEqual({songCount:'40609',browseRowCount:'40609',playableBrowseRows:'40609'});
  let index=0;
  for (const defect of ['missing-index','wrong-index','missing-payload','nullable-key']) {
    const id=`d2345678-1234-1234-1234-${String(++index).padStart(12,'0')}`;
    await expect(call(page,'prepare',['owner',id,fixtures.get(defect)!.manifest,`http://127.0.0.1:5173/song-fixtures/${defect}/`])).rejects.toThrow(/index|payload|column/);
    await expect(call(page,'activate',['owner',id])).rejects.toThrow('validation');
    expect((await call<ActiveCatalog>(page,'active',['owner','songs'])).inspection).toEqual(good.inspection);
  }
  await call(page,'close',['owner']);
});
