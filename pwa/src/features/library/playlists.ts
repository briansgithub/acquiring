import {displayArtist,displayTitle} from '../../domain/data';
import type {PlaylistEntryRecord} from '../playback/playlist-store';
import type {SongBrowseRow} from './grouping';
import {queuedSong,type QueuedSong} from './song-queue';

/** Frozen PlaylistsSection.kt empty copy. */
export const PLAYLISTS_EMPTY_COPY='No songs yet. Tap the star on the Playback tab to add one.';
export const PLAYLIST_SONGS_MAX_HEIGHT_PX=280;

/** Restore playlist order after SongDao IN-list hydration; missing catalog slugs drop. */
export function songsForPlaylist(slugs:readonly string[],rows:readonly SongBrowseRow[]):SongBrowseRow[] {
  const bySlug=new Map(rows.map(row=>[row.slug,row]));
  return slugs.flatMap(slug=>{const row=bySlug.get(slug);return row?[row]:[];});
}

/** Native startSavedQueue: keep missing slugs; empty sectionId resolves later to first section. */
export function queuedSongsFromEntries(entries:readonly PlaylistEntryRecord[],rows:readonly SongBrowseRow[]):QueuedSong[] {
  const bySlug=new Map(rows.map(row=>[row.slug,row]));
  return entries.map(entry=>{
    const row=bySlug.get(entry.slug);
    return queuedSong(
      entry.slug,
      row?displayTitle(row.title):entry.slug,
      row?displayArtist(row.artist):'',
      entry.sectionId??'',
      entry.sectionName??'First section',
    );
  });
}
