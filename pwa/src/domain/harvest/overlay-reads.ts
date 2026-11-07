/** T06 harvest overlay at read time. Catalog slug wins, including a present row with a null blob. */
import type {SongBrowseRow} from '../../features/library/grouping';
import type {SongPayload} from '../../storage/catalog/detail-query';
import type {HarvestedSong} from './harvested-song';

export function harvestedSongPayload(sourceSnapshot: string, song: HarvestedSong): SongPayload {
  return {
    sourceSnapshot,
    song: {slug: song.slug, artist: song.artist, title: song.title, url: song.url, status: song.status},
    data: new Uint8Array(song.dataBlob),
    complexityRating: null,
  };
}

export function harvestedBrowseRow(song: HarvestedSong): SongBrowseRow {
  return {slug: song.slug, artist: song.artist, title: song.title, complexityRating: null};
}

export function mergeHarvestBrowseBySlugs(
  catalogRows: readonly SongBrowseRow[],
  requested: readonly string[],
  overlay: ReadonlyMap<string, HarvestedSong>,
): SongBrowseRow[] {
  const present = new Set(catalogRows.map(row => row.slug));
  const extra: SongBrowseRow[] = [];
  for (const slug of requested) {
    if (present.has(slug)) continue;
    const song = overlay.get(slug);
    if (song) extra.push(harvestedBrowseRow(song));
  }
  return extra.length ? [...catalogRows, ...extra] : [...catalogRows];
}
