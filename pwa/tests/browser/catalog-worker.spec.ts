import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { CatalogInfo, CatalogInspection, ActiveCatalog, InstallStatus } from '../../src/storage/catalog/protocol';
import type { CatalogManifest } from '../../src/storage/catalog/manifest';

let fixture: { directory: string; manifest: CatalogManifest };
let update: typeof fixture;
let requested: string[];
let gate: ((relative: string) => Promise<void>) | undefined;
const base = 'http://127.0.0.1:5173/catalog-fixtures/';
test.beforeAll(() => {
  fixture = JSON.parse(execFileSync('python', ['scripts/catalog/make-browser-fixture.py'], { encoding: 'utf8' })) as typeof fixture;
  update = JSON.parse(execFileSync('python', ['scripts/catalog/make-browser-fixture.py', '--snapshot', 'e'.repeat(64)], { encoding: 'utf8' })) as typeof fixture;
});
test.beforeEach(async ({ page, context }) => {
  requested = []; gate = undefined;
  await context.route('**/catalog-fixtures/**', async route => {
    const relative = new URL(route.request().url()).pathname.split('/catalog-fixtures/')[1]!;
    requested.push(relative); await gate?.(relative);
    const selected = relative.startsWith('v2/') ? update : fixture;
    const path = resolve(selected.directory, relative.replace(/^v[12]\//, ''));
    if (!path.startsWith(resolve(selected.directory) + sep)) throw new Error('Fixture traversal');
    await route.fulfill({ status: 200, body: await readFile(path), headers: { 'Content-Type': 'application/octet-stream' } }).catch(() => {});
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


test('cut during a later file resumes receipts and confirms activation in a cold worker', async ({ page, context }) => {
  await call(page, 'open', ['owner']);
  const attempt = '42345678-1234-1234-1234-123456789012';
  let reached!: () => void, release!: () => void;
  const blocked = new Promise<void>(resolve => { reached = resolve; });
  const proceed = new Promise<void>(resolve => { release = resolve; });
  gate = async relative => { if (relative.includes('aural-evidence.db')) { reached(); await proceed; } };
  try {
    await call(page, 'beginPrepare', ['owner', attempt, fixture.manifest, base]);
    await blocked;
    await call(page, 'terminate', ['owner']);
  } finally { release(); gate = undefined; }
  await ownerReleased(page);
  await call(page, 'open', ['resumed']);
  const partial = await call<InstallStatus>(page, 'status', ['resumed', attempt]);
  expect(partial?.phase).toBe('importing');
  expect(partial?.validatedFiles).toEqual(['aural-catalog.db']);
  expect(partial?.verifiedChunks).toContain('aural-catalog.db:0');
  requested = [];
  const ready = await call<CatalogInspection>(page, 'prepare', ['resumed', attempt, fixture.manifest, base]);
  expect(ready.files).toHaveLength(3);
  expect(requested.some(path => path.includes('aural-catalog.db'))).toBe(false);
  expect(await call(page, 'active', ['resumed', 'aural'])).toBeNull();
  const activated = await call<ActiveCatalog>(page, 'activate', ['resumed', attempt]);
  expect(activated.pointer.confirmed).toBe(false);
  await call(page, 'terminate', ['resumed']); await ownerReleased(page);
  await call(page, 'open', ['cold']);
  await context.setOffline(true);
  const confirmed = await call<ActiveCatalog>(page, 'active', ['cold', 'aural']);
  expect(confirmed.pointer).toMatchObject({ activeId: attempt, confirmed: true, previousId: null });
  expect(confirmed.inspection).toEqual(ready);
  await call(page, 'close', ['cold']);
});

test('real catalog update and missing-target recovery preserve all ten user stores and outbox', async ({ page }) => {
  await call(page, 'seedUsers');
  const users = await call<{ rows: unknown[]; pending: unknown[] }>(page, 'users');
  expect(users.rows).toHaveLength(10); expect(users.rows.every(Boolean)).toBe(true); expect(users.pending).toHaveLength(10);
  await call(page, 'open', ['owner']);
  const first = '52345678-1234-1234-1234-123456789012', second = '62345678-1234-1234-1234-123456789012';
  await call(page, 'prepare', ['owner', first, fixture.manifest, base + 'v1/']);
  await call(page, 'activate', ['owner', first]);
  await call(page, 'prepare', ['owner', second, update.manifest, base + 'v2/']);
  const updated = await call<ActiveCatalog>(page, 'activate', ['owner', second]);
  expect(updated.pointer).toMatchObject({ activeId: second, previousId: first, confirmed: false });
  expect(updated.inspection.files[0]!.metadata.snapshot_id).toBe('e'.repeat(64));
  expect(await call(page, 'users')).toEqual(users);
  await call(page, 'close', ['owner']);
  const missing = '72345678-1234-1234-1234-123456789012';
  await call(page, 'simulateMissingActiveTarget', [missing]);
  await call(page, 'open', ['recovery']);
  const recovered = await call<ActiveCatalog>(page, 'active', ['recovery', 'aural']);
  expect(recovered.recovered).toBe(true);
  expect(recovered.pointer).toMatchObject({ activeId: first, previousId: missing, confirmed: true });
  expect(recovered.inspection.files[0]!.metadata.snapshot_id).toBe('d'.repeat(64));
  expect(await call(page, 'users')).toEqual(users);
  await call(page, 'close', ['recovery']);
});

test('corrupt cached chunk refetches only its immutable bytes and mismatched retry preserves active data', async ({ page }) => {
  await call(page, 'open', ['owner']);
  const first = '82345678-1234-1234-1234-123456789012', second = '92345678-1234-1234-1234-123456789012';
  await call(page, 'prepare', ['owner', first, fixture.manifest, base]);
  const active = await call<ActiveCatalog>(page, 'activate', ['owner', first]);
  await call(page, 'close', ['owner']);
  const chunk = fixture.manifest.files[0]!.chunks[0]!;
  await call(page, 'corruptCachedChunk', [chunk.compressedChecksum]);
  await call(page, 'open', ['resumed']); requested = [];
  await call(page, 'prepare', ['resumed', second, fixture.manifest, base]);
  expect(requested).toEqual([chunk.path]);
  const ready = await call<InstallStatus>(page, 'status', ['resumed', second]);
  expect(ready?.phase).toBe('validated'); expect(ready?.validatedFiles).toHaveLength(3);
  await expect(call(page, 'prepare', ['resumed', second, update.manifest, base + 'v2/'])).rejects.toThrow('immutable');
  expect((await call<ActiveCatalog>(page, 'active', ['resumed', 'aural'])).inspection).toEqual(active.inspection);
  await call(page, 'close', ['resumed']);
});


test('network interruption preserves active catalog and user data then resumes the same intent', async ({ page, context }) => {
  await call(page, 'seedUsers'); const users = await call(page, 'users');
  await call(page, 'open', ['owner']);
  const first = 'a2345678-1234-1234-1234-123456789012', next = 'b2345678-1234-1234-1234-123456789012';
  await call(page, 'prepare', ['owner', first, fixture.manifest, base]);
  const previous = await call<ActiveCatalog>(page, 'activate', ['owner', first]);
  await context.route('**/catalog-fixtures/v2/**', route => route.abort('internetdisconnected'));
  await expect(call(page, 'prepare', ['owner', next, update.manifest, base + 'v2/'])).rejects.toThrow();
  const interrupted = await call<InstallStatus>(page, 'status', ['owner', next]);
  expect(interrupted?.phase).toBe('importing'); expect(interrupted?.lastError).toBeTruthy();
  expect((await call<ActiveCatalog>(page, 'active', ['owner', 'aural'])).inspection).toEqual(previous.inspection);
  expect(await call(page, 'users')).toEqual(users);
  await context.unroute('**/catalog-fixtures/v2/**');
  await call(page, 'prepare', ['owner', next, update.manifest, base + 'v2/']);
  expect((await call<InstallStatus>(page, 'status', ['owner', next]))?.phase).toBe('validated');
  expect((await call<ActiveCatalog>(page, 'active', ['owner', 'aural'])).pointer.activeId).toBe(first);
  await call(page, 'close', ['owner']);
});

// Two bounded Chrome quota-override experiments did not enforce exhaustion on
// these small preallocated fixtures. Keep this gate visibly unproven.
test.fixme('actual native quota exhaustion during catalog write preserves prior data', async () => {});
