import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {expect,test,type Page} from '@playwright/test';
import type {ActiveCatalog} from '../../src/storage/catalog/protocol';
import type {CatalogManifest} from '../../src/storage/catalog/manifest';
import type {SongPayload} from '../../src/storage/catalog/detail-query';

const fixtures = new Map<string, {directory: string; manifest: CatalogManifest}>();
test.beforeAll(() => {
  for (const variant of ['old', 'new']) {
    fixtures.set(variant, JSON.parse(execFileSync('python', ['scripts/catalog/make-library-browser-fixture.py', '--variant', variant], {encoding: 'utf8'})));
  }
});
async function call<T = unknown>(page: Page, method: string, args: unknown[] = []): Promise<T> {
  return page.evaluate(async ({method, args}) => {
    const harness = window.catalogHarness as unknown as Record<string, (...args: unknown[]) => unknown>;
    return await harness[method]!(...args);
  }, {method, args}) as Promise<T>;
}
const harvest = {
  slug: 'artist__mine', artist: 'Harvest Artist', title: 'My Harvest',
  url: 'https://www.hooktheory.com/theorytab/view/artist/mine', status: 'enriched',
  dataBlob: [123, 34, 118, 34], alphaGroup: 'M', modes: 'ionian', harvestedAt: 44,
};
const shared = {
  slug: 'a-alpha', artist: 'Stale Artist', title: 'Stale Harvest Title',
  url: 'https://example.test', status: 'enriched',
  dataBlob: [1, 2, 3], alphaGroup: 'A', modes: '', harvestedAt: 44,
};

test('T06 harvest overlay survives songs catalog swap, cancel, restart; catalog slug wins; kept user rows stay', async ({page, context}) => {
  await context.route('**/library-fixtures/**', async route => {
    const [variant, ...parts] = new URL(route.request().url()).pathname.split('/library-fixtures/')[1]!.split('/');
    const fixture = fixtures.get(variant!)!, path = resolve(fixture.directory, ...parts);
    if (!path.startsWith(resolve(fixture.directory) + sep)) throw new Error('Fixture traversal');
    await route.fulfill({status: 200, body: await readFile(path)});
  });
  await page.goto('http://127.0.0.1:5173/tests/browser/catalog-worker.html');
  await page.waitForFunction(() => !!window.catalogHarness);
  await call(page, 'seedUsers');
  const users = await call<{rows: unknown[]; pending: {operationId: string}[]}>(page, 'users');
  await call(page, 'seedHarvest', [harvest]);
  await call(page, 'seedHarvest', [shared]);
  await call(page, 'open', ['owner']);
  const first = 'c2345678-1234-1234-1234-123456789012';
  await call(page, 'prepare', ['owner', first, fixtures.get('old')!.manifest, 'http://127.0.0.1:5173/library-fixtures/old/']);
  const activated = await call<ActiveCatalog>(page, 'activate', ['owner', first]);
  expect(activated.harvestedRestored).toBe(1);
  const mine = await call<SongPayload>(page, 'songPayload', ['owner', harvest.slug]);
  expect(mine.song.title).toBe('My Harvest');
  expect([...mine.data!]).toEqual(harvest.dataBlob);
  expect(mine.complexityRating).toBeNull();
  const catalogWins = await call<SongPayload>(page, 'songPayload', ['owner', 'a-alpha']);
  expect(catalogWins.song.title).toBe('Alpha Song');
  expect(catalogWins.song.artist).toBe('Artist-A');
  const bySlugs = await call<{slug: string; title: string | null}[]>(page, 'songBrowseBySlugs', ['owner', ['a-alpha', harvest.slug, 'missing']]);
  expect(bySlugs.map(row => row.slug)).toEqual(['a-alpha', harvest.slug]);
  expect(bySlugs.find(row => row.slug === 'a-alpha')!.title).toBe('Alpha Song');
  expect((await call<{rows: unknown[]}>(page, 'users')).rows).toEqual(users.rows);
  expect(await call<string[]>(page, 'harvestIds')).toEqual(expect.arrayContaining(['kept', harvest.slug, shared.slug]));

  await call(page, 'terminate', ['owner']);
  await page.waitForFunction(async () => !(await navigator.locks.query()).held?.some(lock => lock.name === 'acquiring-catalog-owner-v1'));
  await call(page, 'open', ['restart']);
  expect((await call<SongPayload>(page, 'songPayload', ['restart', harvest.slug])).song.title).toBe('My Harvest');
  const next = 'd2345678-1234-1234-1234-123456789012';
  await call(page, 'beginPrepare', ['restart', next, fixtures.get('new')!.manifest, 'http://127.0.0.1:5173/library-fixtures/new/']);
  await call(page, 'terminate', ['restart']);
  await page.waitForFunction(async () => !(await navigator.locks.query()).held?.some(lock => lock.name === 'acquiring-catalog-owner-v1'));
  expect(await call<string[]>(page, 'harvestIds')).toEqual(expect.arrayContaining(['kept', harvest.slug, shared.slug]));
  await call(page, 'open', ['resume']);
  expect((await call<ActiveCatalog>(page, 'active', ['resume', 'songs'])).pointer.activeId).toBe(first);
  await call(page, 'prepare', ['resume', next, fixtures.get('new')!.manifest, 'http://127.0.0.1:5173/library-fixtures/new/']);
  const swapped = await call<ActiveCatalog>(page, 'activate', ['resume', next]);
  expect(swapped.pointer.activeId).toBe(next);
  expect(swapped.harvestedRestored).toBe(1);
  expect((await call<SongPayload>(page, 'songPayload', ['resume', harvest.slug])).song.title).toBe('My Harvest');
  expect((await call<SongPayload>(page, 'songPayload', ['resume', 'a-alpha'])).song.title).toBe('Updated Search');
  expect((await call<{rows: unknown[]}>(page, 'users')).rows).toEqual(users.rows);
  const bad = structuredClone(fixtures.get('new')!.manifest);
  bad.files[0]!.checksum = '0'.repeat(64);
  const failed = 'e2345678-1234-1234-1234-123456789012';
  await expect(call(page, 'prepare', ['resume', failed, bad, 'http://127.0.0.1:5173/library-fixtures/new/'])).rejects.toThrow();
  expect((await call<ActiveCatalog>(page, 'active', ['resume', 'songs'])).pointer.activeId).toBe(next);
  expect((await call<SongPayload>(page, 'songPayload', ['resume', harvest.slug])).song.title).toBe('My Harvest');
  expect((await call<{rows: unknown[]}>(page, 'users')).rows).toEqual(users.rows);
  await call(page, 'close', ['resume']);
});
