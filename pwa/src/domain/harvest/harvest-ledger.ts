/** Frozen 801cf798 HarvestLedger.kt. Survives catalog-file swap. No Hooktheory fetch. */
import {decodeModes,encodeModes,type HarvestedSong,type HarvestSongInput} from './harvested-song';

export const LEGACY_ADOPTION_KEY = 'legacyHarvestsAdopted';
export const LEGACY_ADOPTION_LIMIT = 500;

export interface HarvestLedgerStore {
  getAll(): HarvestedSong[];
  count(): number;
  record(song: HarvestedSong): void;
  adopt(songs: HarvestedSong[]): void;
  hasFlag(key: string): boolean;
  setFlag(key: string, value: string): void;
}

export interface HarvestCatalog {
  songExists(slug: string): boolean;
  getSongBySlug(slug: string): HarvestSongInput | null;
  getUnratedSlugsWithChords(limit: number): string[];
  getModesForSlug(slug: string): string[];
  insertRestored(entry: HarvestedSong): void;
}

export interface StagedCatalog {
  slugsPresent(slugs: readonly string[]): Set<string>;
}

export function recordHarvest(
  userDb: HarvestLedgerStore,
  song: HarvestSongInput,
  alphaGroup: string,
  modes: Iterable<string>,
  harvestedAt: number,
): void {
  if (!song.dataBlob) return;
  userDb.record({
    slug: song.slug,
    artist: song.artist,
    title: song.title,
    url: song.url,
    status: song.status,
    dataBlob: song.dataBlob,
    alphaGroup,
    modes: encodeModes(modes),
    harvestedAt,
  });
}

export function adoptLegacyHarvests(
  currentDb: HarvestCatalog,
  staged: StagedCatalog,
  userDb: HarvestLedgerStore,
  alphabeticalGroup: (title: string | null) => string,
  now: number,
): void {
  if (userDb.hasFlag(LEGACY_ADOPTION_KEY)) return;
  const candidateSlugs = currentDb.getUnratedSlugsWithChords(LEGACY_ADOPTION_LIMIT + 1);
  if (candidateSlugs.length > LEGACY_ADOPTION_LIMIT) return;
  const stagedSlugs = staged.slugsPresent(candidateSlugs);
  const entries: HarvestedSong[] = [];
  for (const slug of candidateSlugs) {
    if (stagedSlugs.has(slug)) continue;
    const song = currentDb.getSongBySlug(slug);
    if (!song?.dataBlob) continue;
    entries.push({
      slug: song.slug,
      artist: song.artist,
      title: song.title,
      url: song.url,
      status: song.status,
      dataBlob: song.dataBlob,
      alphaGroup: alphabeticalGroup(song.title),
      modes: encodeModes(currentDb.getModesForSlug(song.slug)),
      harvestedAt: now,
    });
  }
  userDb.adopt(entries);
  userDb.setFlag(LEGACY_ADOPTION_KEY, String(now));
}

/** Rebuilds ledgered harvests the catalog is missing. Catalog slug wins, including ratings a harvest never produces. */
export function replayHarvests(catalogDb: HarvestCatalog, userDb: HarvestLedgerStore): number {
  let restored = 0;
  for (const entry of userDb.getAll()) {
    if (catalogDb.songExists(entry.slug)) continue;
    catalogDb.insertRestored(entry);
    restored++;
  }
  return restored;
}

export function restoredModes(entry: HarvestedSong): string[] {
  return [...decodeModes(entry.modes)];
}
