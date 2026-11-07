import {afterEach,describe,expect,it} from 'vitest';
import type {PlaylistEntryRecord,PlaylistRecord,PlaylistStore} from '../playback/playlist-store';
import {PLAYLIST_IDS,playlistEntryId} from '../playback/playlist-store';
import {resetSongQueueHost,saveCurrentQueue,songQueueSession,startSavedQueue} from './song-queue-host';

class MemoryStore implements PlaylistStore {
  playlists=new Map<string,PlaylistRecord>();
  entries=new Map<string,PlaylistEntryRecord>();
  async ensureBuiltInPlaylist(id:string,name:string,createdAt:number):Promise<void> {
    if(this.playlists.has(id))return;
    this.playlists.set(id,{id,name,isBuiltIn:true,createdAt});
  }
  async isInPlaylist(playlistId:string,slug:string):Promise<boolean> {
    return this.entries.has(playlistEntryId(playlistId,slug));
  }
  async addEntry(entry:PlaylistEntryRecord):Promise<void> {
    const id=playlistEntryId(entry.playlistId,entry.slug);
    if(this.entries.has(id))return;
    this.entries.set(id,entry);
  }
  async removeEntry(playlistId:string,slug:string):Promise<void> {
    this.entries.delete(playlistEntryId(playlistId,slug));
  }
  async getEntriesIn(playlistId:string){
    return [...this.entries.values()].filter(entry=>entry.playlistId===playlistId)
      .sort((a,b)=>(a.position??0)-(b.position??0)||b.addedAt-a.addedAt);
  }
  async getSlugsIn(playlistId:string){return (await this.getEntriesIn(playlistId)).map(entry=>entry.slug);}
  async getSummaries(){
    return [...this.playlists.values()].map(playlist=>({
      id:playlist.id,name:playlist.name,
      songCount:[...this.entries.values()].filter(entry=>entry.playlistId===playlist.id).length,
    }));
  }
  async deletePlaylist():Promise<void> {}
  async saveGeneratedPlaylist(playlist:PlaylistRecord,entries:readonly PlaylistEntryRecord[]):Promise<void> {
    this.playlists.set(playlist.id,playlist);
    for(const entry of entries)await this.addEntry(entry);
  }
}

afterEach(()=>resetSongQueueHost());

describe('startSavedQueue',()=>{
  it('loads saved playlist order and shuffle play drops the playlist id',async()=>{
    const store=new MemoryStore();
    await store.ensureBuiltInPlaylist(PLAYLIST_IDS.FAVORITES,PLAYLIST_IDS.FAVORITES_NAME,1);
    await store.addEntry({playlistId:PLAYLIST_IDS.FAVORITES,slug:'a-alpha',addedAt:2,position:0,sectionId:null,sectionName:null});
    await store.addEntry({playlistId:PLAYLIST_IDS.FAVORITES,slug:'b-alpha',addedAt:3,position:1,sectionId:'s',sectionName:'Verse'});
    const rows=[
      {slug:'a-alpha',artist:'Artist-A',title:'Alpha',complexityRating:null},
      {slug:'b-alpha',artist:'Artist-B',title:'Beta',complexityRating:null},
    ];
    await startSavedQueue(store,async()=>rows,PLAYLIST_IDS.FAVORITES,false);
    const queue=songQueueSession();
    expect(queue.active).toBe(true);
    expect(queue.started).toBe(false);
    expect(queue.originQuiz).toBe(false);
    expect(queue.shuffleEnabled).toBe(false);
    expect(queue.savedPlaylistId).toBe(PLAYLIST_IDS.FAVORITES);
    expect(queue.entries.map(song=>song.slug)).toEqual(['a-alpha','b-alpha']);
    expect(queue.entries[1]?.sectionName).toBe('Verse');
    await startSavedQueue(store,async()=>rows,PLAYLIST_IDS.FAVORITES,true);
    expect(songQueueSession().shuffleEnabled).toBe(true);
    expect(songQueueSession().savedPlaylistId).toBeNull();
  });

  it('saves the prepared queue as a named playlist',async()=>{
    const store=new MemoryStore();
    await store.ensureBuiltInPlaylist(PLAYLIST_IDS.FAVORITES,PLAYLIST_IDS.FAVORITES_NAME,1);
    await store.addEntry({playlistId:PLAYLIST_IDS.FAVORITES,slug:'a-alpha',addedAt:2,position:0,sectionId:null,sectionName:null});
    const rows=[{slug:'a-alpha',artist:'Artist-A',title:'Alpha',complexityRating:null}];
    await startSavedQueue(store,async()=>rows,PLAYLIST_IDS.FAVORITES,false);
    await saveCurrentQueue(store,'Practice queue');
    const saved=songQueueSession().savedPlaylistId;
    expect(saved).toBeTruthy();
    expect(songQueueSession().notice).toBe('Playlist saved');
    expect((await store.getSummaries()).some(summary=>summary.id===saved&&summary.name==='Practice queue'&&summary.songCount===1)).toBe(true);
  });
});
