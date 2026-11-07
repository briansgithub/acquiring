/** Readonly sqlite ports for HarvestLedger adopt/replay. insertRestored must not mutate catalog.db. */
import type {HarvestCatalog,StagedCatalog} from './harvest-ledger';
import type {HarvestSongInput} from './harvested-song';

export interface HarvestSqlite {
  selectValue(sql: string, bind?: (string | number)[]): unknown;
  selectObjects(sql: string, bind?: (string | number)[]): Record<string, unknown>[];
}

const UNRATED_WITH_CHORDS = `SELECT songs.slug AS slug FROM songs
LEFT JOIN song_browse_entries ON song_browse_entries.slug = songs.slug
WHERE songs.dataBlob IS NOT NULL AND song_browse_entries.complexityRating IS NULL
LIMIT ?`;

function blobOf(value: unknown): Uint8Array | null {
  if (value == null) return null;
  if (value instanceof Uint8Array) return value;
  return null;
}

export function sqliteHarvestCatalog(db: HarvestSqlite): HarvestCatalog {
  return {
    songExists(slug) {
      return Number(db.selectValue('SELECT EXISTS(SELECT 1 FROM songs WHERE slug = ?)', [slug])) === 1;
    },
    getSongBySlug(slug) {
      const row = db.selectObjects(
        'SELECT slug,artist,title,url,status,dataBlob FROM songs WHERE slug = ? LIMIT 1',
        [slug],
      )[0];
      if (!row || typeof row.slug !== 'string' || typeof row.url !== 'string' || typeof row.status !== 'string') return null;
      if (row.artist !== null && typeof row.artist !== 'string') return null;
      if (row.title !== null && typeof row.title !== 'string') return null;
      const song: HarvestSongInput = {
        slug: row.slug,
        artist: typeof row.artist === 'string' ? row.artist : null,
        title: typeof row.title === 'string' ? row.title : null,
        url: row.url,
        status: row.status,
        dataBlob: blobOf(row.dataBlob),
      };
      return song;
    },
    getUnratedSlugsWithChords(limit) {
      return db.selectObjects(UNRATED_WITH_CHORDS, [limit]).map(row => String(row.slug));
    },
    getModesForSlug(slug) {
      return db.selectObjects('SELECT mode FROM song_browse_modes WHERE slug = ?', [slug]).map(row => String(row.mode));
    },
    insertRestored() {
      throw new Error('Song catalog files are immutable; harvest replay uses the T06 overlay');
    },
  };
}

/** Native HarvestLedger.slugsPresent: candidate IN-list, chunks of 200. */
export function sqliteStagedCatalog(db: HarvestSqlite): StagedCatalog {
  return {
    slugsPresent(slugs) {
      const present = new Set<string>();
      for (let index = 0; index < slugs.length; index += 200) {
        const chunk = slugs.slice(index, index + 200);
        if (!chunk.length) continue;
        for (const row of db.selectObjects(
          `SELECT slug FROM songs WHERE slug IN (${chunk.map(() => '?').join(',')})`,
          [...chunk],
        )) present.add(String(row.slug));
      }
      return present;
    },
  };
}
