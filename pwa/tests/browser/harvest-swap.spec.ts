import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {expect,test,type Page} from '@playwright/test';
import type {ActiveCatalog} from '../../src/storage/catalog/protocol';
import type {CatalogManifest} from '../../src/storage/catalog/manifest';
import type {SongPage,ArtistSuggestionsPage,SongBrowseGroupCount} from '../../src/storage/catalog/library-queries';
import type {SongBrowseRow} from '../../src/features/library/grouping';
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
  dataBlob: [123, 34, 118, 34], alphaGroup: 'M', modes: 'ionian\ndorian\nionian', harvestedAt: 44,
};
const shared = {
  slug: 'a-alpha', artist: 'Stale Artist', title: 'Stale Harvest Title',
  url: 'https://example.test', status: 'enriched',
  dataBlob: [1, 2, 3], alphaGroup: 'A', modes: '', harvestedAt: 44,
};

test('T06 harvest overlay survives songs catalog swap, cancel, restart; catalog slug wins; kept user rows stay', async ({page, context}) => {
  test.setTimeout(60_000); // five query matrices plus install/cancel/restart/recovery; no latency assertion
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
  await call(page, 'seedHarvest', [{...shared,slug:'ghost'}]);
  // Identical NOCASE keys straddle pages; binary slug is the deterministic final tie-break.
  for(const slug of ['Tie','tie'])await call(page,'seedHarvest',[{...harvest,slug,title:'My Harvest'}]);
  await call(page, 'open', ['owner']);
  async function verifyQueries(owner:string) {
    const query=(text:string,offset=0,limit=2)=>call<SongPage>(page,'songPage',[owner,{mode:'search',text,offset,limit}]);
    const first=await query('My Harvest');
    const second=await query('My Harvest',first.nextOffset!);
    expect(first.rows.map(row=>row.slug)).toEqual([harvest.slug,'Tie']);
    expect(first.hasMore).toBe(true);expect(first.nextOffset).toBe(2);
    expect(second.rows.map(row=>row.slug)).toEqual(['tie']);
    expect(second.hasMore).toBe(false);expect(second.nextOffset).toBeNull();
    expect((await query('My_Harvest',0,100)).rows).toHaveLength(3); // SQLite LIKE wildcard
    expect((await query('stale')).rows).toEqual([]); // catalog and ghost both suppress ledger
    expect((await query("' OR 1=1 --")).rows).toEqual([]);
    for(const mode of ['artist','artistSearch']) {
      expect((await call<SongPage>(page,'songPage',[owner,{mode,text:'Harvest Artist',limit:100}])).rows).toHaveLength(3);
    }
    expect((await call<SongPage>(page,'songPage',[owner,{mode:'artist',text:'harvest artist'}])).rows).toEqual([]); // native equality is case-sensitive
    const suggestions=await call<ArtistSuggestionsPage>(page,'artistSuggestions',[owner,{query:'Harvest',limit:1}]);
    expect(suggestions.names).toEqual(['Harvest Artist']);expect(suggestions.hasMore).toBe(false);
    expect((await call<ArtistSuggestionsPage>(page,'artistSuggestions',[owner,{query:'Stale'}])).names).toEqual([]);
    const rows=(mode:string,key:string,filter='')=>call<SongBrowseRow[]>(page,'songBrowseGroupSongs',[owner,mode,key,filter]);
    const counts=(mode:string,filter='')=>call<SongBrowseGroupCount[]>(page,'songBrowseGroupCounts',[owner,mode,filter]);
    expect((await rows('alphabetical','M')).map(row=>row.slug)).toEqual([harvest.slug,'Tie','tie']);
    expect((await rows('complexity','unrated')).map(row=>row.slug)).toEqual([harvest.slug,'Tie','tie']);
    for(const mode of ['alphabetical','complexity','mode']) {
      const filtered=await counts(mode,'my_harvest'); // native browse INSTR strips underscore
      expect(filtered).toHaveLength(mode==='mode'?2:1);
      expect(filtered.every(row=>row.songCount===3)).toBe(true);
      for(const heading of filtered) {
        const members=await rows(mode,heading.groupKey,'my_harvest');
        expect(members).toHaveLength(heading.songCount);
        expect(new Set(members.map(row=>row.slug)).size).toBe(3);
        expect(members.every(row=>row.complexityRating===null)).toBe(true);
      }
      expect((await counts(mode,'%')).reduce((n,row)=>n+row.songCount,0)).toBe(mode==='mode'?0:1); // only catalog's literal percent title; INSTR, not LIKE
      expect(await counts(mode,'Stale')).toEqual([]);
    }
    expect((await rows('mode','dorian')).map(row=>row.slug)).toEqual([harvest.slug,'Tie','tie']);
    const ionian=await rows('mode','ionian');
    expect(ionian.filter(row=>row.slug==='a-alpha')).toHaveLength(1);
    expect(ionian.find(row=>row.slug==='a-alpha')!.complexityRating).toBe(77);
    const ghost=await call<SongPayload>(page,'songPayload',[owner,'ghost']);
    expect(ghost.song.title).toBe('Alpha Ghost');expect(ghost.data).toBeNull();
    const membership=await call<SongBrowseRow[]>(page,'songBrowseBySlugs',[owner,['ghost',harvest.slug,harvest.slug,'a-alpha']]);
    expect(membership).toHaveLength(3);
    expect(membership.find(row=>row.slug==='ghost')!.title).toBe('Alpha Ghost');
  }
  const first = 'c2345678-1234-1234-1234-123456789012';
  await call(page, 'prepare', ['owner', first, fixtures.get('old')!.manifest, 'http://127.0.0.1:5173/library-fixtures/old/']);
  const activated = await call<ActiveCatalog>(page, 'activate', ['owner', first]);
  expect(activated.harvestedRestored).toBe(3);
  await verifyQueries('owner');
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
  await verifyQueries('restart');
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
  expect(swapped.harvestedRestored).toBe(3);
  await verifyQueries('resume');
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
  await verifyQueries('resume');
  const after=await call<{rows:unknown[];pending:{operationId:string}[]}>(page,'users');
  expect(after.rows).toEqual(users.rows);
  expect(after.pending.map(row=>row.operationId)).toEqual(expect.arrayContaining(users.pending.map(row=>row.operationId)));
  await call(page,'simulateMissingActiveTarget',['f2345678-1234-1234-1234-123456789012','songs']);
  await call(page,'terminate',['resume']);
  await page.waitForFunction(async()=>!(await navigator.locks.query()).held?.some(lock=>lock.name==='acquiring-catalog-owner-v1'));
  await call(page,'open',['recovered']);
  const recovered=await call<ActiveCatalog>(page,'active',['recovered','songs']);
  expect(recovered.recovered).toBe(true);expect(recovered.pointer.activeId).toBe(first);
  await verifyQueries('recovered');
  expect((await call<{rows:unknown[]}>(page,'users')).rows).toEqual(users.rows);
  await call(page, 'close', ['recovered']);
});
