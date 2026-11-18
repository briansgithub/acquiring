/** Process-local SongQueueSession. Native MainActivity holds one ViewModel; Aural begin() stays deferred. */
import type {PlaylistEntryRecord,PlaylistRecord,PlaylistStore} from '../playback/playlist-store';
import type {SongBrowseRow} from './grouping';
import {queuedSongsFromEntries} from './playlists';
import {SongQueueSession,queuedSong,shuffledExampleQueue} from './song-queue';

const session=new SongQueueSession();
let version=0;
const listeners=new Set<()=>void>();

function emit():void {
  version+=1;
  for(const listener of listeners)listener();
}

export function subscribeSongQueue(listener:()=>void):()=>void {
  listeners.add(listener);
  return()=>{listeners.delete(listener);};
}
export function songQueueVersion():number {return version;}
export function songQueueSession():SongQueueSession {return session;}

export function mutateSongQueue(action:(queue:SongQueueSession)=>void):void {
  action(session);
  emit();
}

export function resetSongQueueHost():void {
  if(session.active)session.dismiss();
  emit();
}

export async function startSavedQueue(
  store:PlaylistStore,
  browseBySlugs:(slugs:string[])=>Promise<SongBrowseRow[]>,
  playlistId:string,
  shuffle:boolean,
):Promise<void> {
  const expected=session.begin(false,'Playlist');
  emit();
  try {
    const stored=await store.getEntriesIn(playlistId);
    const slugs=stored.map(entry=>entry.slug);
    const rows=slugs.length===0?[]:await browseBySlugs(slugs);
    session.finishPreparation(expected,queuedSongsFromEntries(stored,rows),shuffle?null:playlistId,shuffle);
  } catch {
    session.error(expected,'Could not open this playlist.');
  }
  emit();
}

/** N15 (Android startExampleShuffle): shuffle example songs above a popularity cutoff into a queue that opens on
 * each song's chorus and holds it until the listener advances. */
export async function startExampleShuffle(
  loadExampleSongs:()=>Promise<readonly {slug:string;title:string;artist:string;score:number|null}[]>,
  minimumPopularityPercent:number|null,
):Promise<void> {
  const expected=session.begin(false,'Example songs',true,true);
  emit();
  try {
    const candidates=(await loadExampleSongs()).map(song=>({song:queuedSong(song.slug,song.title,song.artist,'','Chorus'),score:song.score}));
    session.finishPreparation(expected,shuffledExampleQueue(candidates,minimumPopularityPercent),null,true);
    if(session.entries.length>0)session.start();
  } catch {
    session.error(expected,'Could not prepare example songs. Try again.');
  }
  emit();
}

export async function saveCurrentQueue(store:PlaylistStore,name:string):Promise<void> {
  const trimmed=name.trim();
  if(!trimmed || session.entries.length===0)return;
  const id=crypto.randomUUID();
  const now=Date.now();
  const playlist:PlaylistRecord={id,name:trimmed,isBuiltIn:false,createdAt:now};
  const entries:PlaylistEntryRecord[]=session.entries.map((song,position)=>({
    playlistId:id,slug:song.slug,addedAt:now,position,
    sectionId:song.sectionId||null,sectionName:song.sectionName,
  }));
  try {
    await store.saveGeneratedPlaylist(playlist,entries);
    session.markSaved(id);
  } catch {
    session.showNotice('Could not save this playlist. Try again.');
  }
  emit();
}
