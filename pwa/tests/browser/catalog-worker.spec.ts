import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { CatalogInfo, CatalogInspection } from '../../src/storage/catalog/protocol';
import type { CatalogManifest } from '../../src/storage/catalog/manifest';

let fixture: { directory: string; manifest: CatalogManifest };
test.beforeAll(() => {
  fixture = JSON.parse(execFileSync('python', ['scripts/catalog/make-browser-fixture.py'], { encoding: 'utf8' })) as typeof fixture;
});
test.beforeEach(async ({ page, context }) => {
  await context.route('**/catalog-fixtures/**', async route => {
    const relative = new URL(route.request().url()).pathname.split('/catalog-fixtures/')[1]!;
    const path = resolve(fixture.directory, relative);
    if (!path.startsWith(resolve(fixture.directory) + sep)) throw new Error('Fixture traversal');
    await route.fulfill({ status: 200, body: await readFile(path), headers: { 'Content-Type': 'application/octet-stream' } });
  });
  await page.goto('http://127.0.0.1:5173/tests/browser/catalog-worker.html');
  await page.waitForFunction(() => !!window.catalogHarness);
});
async function call<T = unknown>(page: Page, method: string, args: unknown[] = []): Promise<T> {
  const serialized = await page.evaluate(async ({ method, args }) => {
    const harness = window.catalogHarness as unknown as Record<string, (...args: unknown[]) => unknown>;
    return JSON.stringify({ value: await harness[method]!(...JSON.parse(args) as unknown[]) });
  }, { method, args: JSON.stringify(args) });
  return (JSON.parse(serialized) as { value: T }).value;
}
async function ownerReleased(page: Page) {
  await page.waitForFunction(async () => !(await navigator.locks.query()).held?.some(lock => lock.name === 'acquiring-catalog-owner-v1'));
}
test('one catalog owner across real tabs; cooperative close permits a waiting tab', async ({ page, context }) => {
  const first = await call<CatalogInfo>(page, 'open', ['first']);
  expect(first.preservationEnabled).toBe(true); expect(first.sqliteVersion).toBe('3.53.4');
  const second = await context.newPage();
  await second.goto('http://127.0.0.1:5173/tests/browser/catalog-worker.html');
  await second.waitForFunction(() => !!window.catalogHarness);
  await expect(call(second, 'open', ['second'])).rejects.toThrow('another tab');
  await call(page, 'close', ['first']);
  expect((await call<CatalogInfo>(second, 'open', ['second'])).preservationEnabled).toBe(true);
  await call(second, 'close', ['second']);
});

test('streamed real SQLite bundle validates, survives abrupt worker loss and queries offline', async ({ page, context }) => {
  await call(page, 'open', ['owner']);
  const attempt = '12345678-1234-1234-1234-123456789012';
  const staged = await call<CatalogInspection>(page, 'stage', ['owner', attempt, fixture.manifest, 'http://127.0.0.1:5173/catalog-fixtures/']);
  expect(staged.files).toHaveLength(3);
  expect(staged.files.find(file => file.name === 'aural-catalog.db')!.metadata.snapshot_id).toBe(fixture.manifest.sourceSnapshot);
  await expect(call(page, 'stage', ['owner', attempt, fixture.manifest, 'http://127.0.0.1:5173/catalog-fixtures/'])).rejects.toThrow('inspect');
  await call(page, 'terminate', ['owner']); await ownerReleased(page);
  await call(page, 'open', ['reopened']);
  await context.setOffline(true);
  expect(await call(page, 'inspect', ['reopened', attempt, fixture.manifest])).toEqual(staged);
  await call(page, 'close', ['reopened']);
});

test('wrong full database hash or snapshot never accepts a bundle and preserves a prior one', async ({ page }) => {
  await call(page, 'open', ['owner']);
  const first = '12345678-1234-1234-1234-123456789012';
  const good = await call<CatalogInspection>(page, 'stage', ['owner', first, fixture.manifest, 'http://127.0.0.1:5173/catalog-fixtures/']);
  const badHash = structuredClone(fixture.manifest); badHash.files[0]!.checksum = '0'.repeat(64);
  await expect(call(page, 'stage', ['owner', '22345678-1234-1234-1234-123456789012', badHash, 'http://127.0.0.1:5173/catalog-fixtures/'])).rejects.toThrow('checksum');
  const badSnapshot = { ...fixture.manifest, sourceSnapshot: 'a'.repeat(64) };
  await expect(call(page, 'stage', ['owner', '32345678-1234-1234-1234-123456789012', badSnapshot, 'http://127.0.0.1:5173/catalog-fixtures/'])).rejects.toThrow('snapshot');
  expect(await call(page, 'inspect', ['owner', first, fixture.manifest])).toEqual(good);
  await call(page, 'close', ['owner']);
});
