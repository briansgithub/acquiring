import type {SongBrowseRow} from './grouping';

/** Frozen PlaylistsSection.kt empty copy. Play/Shuffle queue is a later slice. */
export const PLAYLISTS_EMPTY_COPY='No songs yet. Tap the star on the Playback tab to add one.';
export const PLAYLIST_SONGS_MAX_HEIGHT_PX=280;

/** Restore playlist order after SongDao IN-list hydration; missing catalog slugs drop. */
export function songsForPlaylist(slugs:readonly string[],rows:readonly SongBrowseRow[]):SongBrowseRow[] {
  const bySlug=new Map(rows.map(row=>[row.slug,row]));
  return slugs.flatMap(slug=>{const row=bySlug.get(slug);return row?[row]:[];});
}
