import {DatabaseSync} from 'node:sqlite';
import {afterEach,describe,expect,it} from 'vitest';
import {adoptLegacyHarvests,replayHarvests} from './harvest-ledger';
import {OverlayHarvestCatalog} from './catalog-swap';
import {sqliteHarvestCatalog,sqliteStagedCatalog,type HarvestSqlite} from './sqlite-harvest-catalog';
import {MemoryHarvestLedger} from './memory-harvest';
import {alphabeticalGroup} from '../../features/library/grouping';

const dbs: DatabaseSync[] = [];
afterEach(() => { for (const sql of dbs.splice(0)) sql.close(); });

function reader(sql: DatabaseSync): HarvestSqlite {
  return {
    selectValue(text, bind = []) {
      const row = sql.prepare(text).get(...bind) as Record<string, unknown> | undefined;
      if (!row) return undefined;
      const values = Object.values(row);
      return values.length === 1 ? values[0] : row;
    },
    selectObjects(text, bind = []) { return sql.prepare(text).all(...bind) as Record<string, unknown>[]; },
  };
}

function disposableCatalog(rows: Array<{slug: string; title: string; blob: Uint8Array | null; rating: number | null; modes?: string[]}>): {sql: DatabaseSync; catalog: ReturnType<typeof sqliteHarvestCatalog>; staged: ReturnType<typeof sqliteStagedCatalog>} {
  const sql = new DatabaseSync(':memory:');
  dbs.push(sql);
  sql.exec(`CREATE TABLE songs(slug TEXT PRIMARY KEY, artist TEXT, title TEXT, url TEXT NOT NULL, status TEXT NOT NULL, dataBlob BLOB);
    CREATE TABLE song_browse_entries(slug TEXT PRIMARY KEY, artist TEXT, title TEXT, alphaGroup TEXT NOT NULL, complexityRating REAL, complexityBucket INTEGER);
    CREATE TABLE song_browse_modes(slug TEXT NOT NULL, mode TEXT NOT NULL, PRIMARY KEY(slug, mode));`);
  const insertSong = sql.prepare('INSERT INTO songs VALUES(?,?,?,?,?,?)');
  const insertBrowse = sql.prepare('INSERT INTO song_browse_entries VALUES(?,?,?,?,?,?)');
  const insertMode = sql.prepare('INSERT INTO song_browse_modes VALUES(?,?)');
  for (const row of rows) {
    insertSong.run(row.slug, 'Artist', row.title, 'https://example.test', 'complete', row.blob);
    insertBrowse.run(row.slug, 'Artist', row.title, alphabeticalGroup(row.title), row.rating, row.rating == null ? null : Math.trunc(row.rating / 10));
    for (const mode of row.modes ?? []) insertMode.run(row.slug, mode);
  }
  const db = reader(sql);
  return {sql, catalog: sqliteHarvestCatalog(db), staged: sqliteStagedCatalog(db)};
}

describe('readonly sqlite harvest catalog (disposable fixtures)', () => {
  it('adopts unrated-with-chords missing from staged, never writes sqlite, overlays on replay', () => {
    const payload = new Uint8Array([1, 2, 3]);
    const current = disposableCatalog([
      {slug: 'legacy-harvest', title: 'Legacy Harvest', blob: payload, rating: null, modes: ['ionian']},
      {slug: 'catalog-a', title: 'Song catalog-a', blob: payload, rating: 40},
    ]);
    const staged = disposableCatalog([
      {slug: 'catalog-a', title: 'Song catalog-a', blob: payload, rating: 40},
    ]);
    const user = new MemoryHarvestLedger();
    adoptLegacyHarvests(current.catalog, staged.staged, user, alphabeticalGroup, 9);
    expect(user.getAll().map(song => song.slug)).toEqual(['legacy-harvest']);
    expect([...user.getAll()[0]!.dataBlob]).toEqual([1, 2, 3]);
    expect(() => current.catalog.insertRestored(user.getAll()[0]!)).toThrow(/immutable/);
    const overlay = new OverlayHarvestCatalog(staged.catalog);
    expect(replayHarvests(overlay, user)).toBe(1);
    expect(replayHarvests(overlay, user)).toBe(0);
    expect(overlay.getSongBySlug('legacy-harvest')?.title).toBe('Legacy Harvest');
    expect(staged.catalog.songExists('legacy-harvest')).toBe(false);
    expect(Number(staged.sql.prepare('SELECT COUNT(*) AS n FROM songs').get()!.n)).toBe(1);
  });

  it('skips rated rows and catalog-present slugs; empty blob is not adoptable', () => {
    const current = disposableCatalog([
      {slug: 'rated', title: 'Rated', blob: new Uint8Array([1]), rating: 12},
      {slug: 'ghost', title: 'Ghost', blob: null, rating: null},
      {slug: 'kept-rated', title: 'Kept', blob: new Uint8Array([1]), rating: null},
    ]);
    const staged = disposableCatalog([
      {slug: 'kept-rated', title: 'Kept', blob: new Uint8Array([1]), rating: 8},
    ]);
    const user = new MemoryHarvestLedger();
    adoptLegacyHarvests(current.catalog, staged.staged, user, alphabeticalGroup, 1);
    expect(user.getAll()).toEqual([]);
    expect(current.catalog.getUnratedSlugsWithChords(10)).toEqual(['kept-rated']);
  });
});
