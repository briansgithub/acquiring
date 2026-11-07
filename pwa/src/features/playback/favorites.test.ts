import {afterEach,describe,expect,it,vi} from 'vitest';
import {FAVORITED_CONFIRMATION_MS,FavoriteSession,shouldShowFavoritedConfirmation} from './favorites-session';
import {PLAYLIST_IDS,playlistEntryId,type PlaylistEntryRecord,type PlaylistRecord,type PlaylistStore} from './playlist-store';

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
      .sort((a,b)=>{
        const aPos=a.position===null?1:0,bPos=b.position===null?1:0;
        if(aPos!==bPos)return aPos-bPos;
        if(a.position!==null&&b.position!==null&&a.position!==b.position)return a.position-b.position;
        if(a.addedAt!==b.addedAt)return b.addedAt-a.addedAt;
        return a.slug.localeCompare(b.slug,'en',{sensitivity:'accent'});
      });
  }
  async getSlugsIn(playlistId:string):Promise<string[]> {
    return (await this.getEntriesIn(playlistId)).map(entry=>entry.slug);
  }
  async saveGeneratedPlaylist(playlist:PlaylistRecord,entries:readonly PlaylistEntryRecord[]):Promise<void> {
    this.playlists.set(playlist.id,playlist);
    for(const entry of entries)await this.addEntry(entry);
  }
  async getSummaries(){
    const playlists=[...this.playlists.values()].sort((a,b)=>{
      if(a.isBuiltIn!==b.isBuiltIn)return a.isBuiltIn?-1:1;
      if(a.createdAt!==b.createdAt)return a.createdAt-b.createdAt;
      return a.name.localeCompare(b.name,'en',{sensitivity:'accent'});
    });
    return playlists.map(playlist=>({id:playlist.id,name:playlist.name,
      songCount:[...this.entries.values()].filter(entry=>entry.playlistId===playlist.id).length}));
  }
  async deletePlaylist(playlistId:string):Promise<void> {
    const playlist=this.playlists.get(playlistId);
    if(!playlist||playlist.isBuiltIn)return;
    this.playlists.delete(playlistId);
    for(const [id,entry] of this.entries)if(entry.playlistId===playlistId)this.entries.delete(id);
  }
}

describe('unchanged native PlaylistDao.kt Favorites',()=>{
  it('seedingTheBuiltInPlaylistIsIdempotent',async()=>{
    const store=new MemoryStore();
    await store.ensureBuiltInPlaylist(PLAYLIST_IDS.FAVORITES,PLAYLIST_IDS.FAVORITES_NAME,1_000);
    await store.ensureBuiltInPlaylist(PLAYLIST_IDS.FAVORITES,PLAYLIST_IDS.FAVORITES_NAME,1_000);
    await store.ensureBuiltInPlaylist(PLAYLIST_IDS.FAVORITES,'Renamed',9_999);
    expect([...store.playlists.values()]).toEqual([{id:'favorites',name:'Favorites',isBuiltIn:true,createdAt:1_000}]);
  });
  it('addingAndRemovingDrivesMembership',async()=>{
    const store=new MemoryStore();
    await store.ensureBuiltInPlaylist(PLAYLIST_IDS.FAVORITES,PLAYLIST_IDS.FAVORITES_NAME,1_000);
    const slug='scott-joplin__maple-leaf-rag';
    expect(await store.isInPlaylist(PLAYLIST_IDS.FAVORITES,slug)).toBe(false);
    await store.addEntry({playlistId:PLAYLIST_IDS.FAVORITES,slug,addedAt:10,position:null,sectionId:null,sectionName:null});
    expect(await store.isInPlaylist(PLAYLIST_IDS.FAVORITES,slug)).toBe(true);
    await store.addEntry({playlistId:PLAYLIST_IDS.FAVORITES,slug,addedAt:20,position:null,sectionId:null,sectionName:null});
    expect(await store.getSlugsIn(PLAYLIST_IDS.FAVORITES)).toEqual([slug]);
    expect(store.entries.get(playlistEntryId(PLAYLIST_IDS.FAVORITES,slug))?.addedAt).toBe(10);
    await store.removeEntry(PLAYLIST_IDS.FAVORITES,slug);
    expect(await store.isInPlaylist(PLAYLIST_IDS.FAVORITES,slug)).toBe(false);
    expect(await store.getSlugsIn(PLAYLIST_IDS.FAVORITES)).toEqual([]);
  });
  it('playlistSongsComeBackNewestFirst',async()=>{
    const store=new MemoryStore();
    await store.ensureBuiltInPlaylist(PLAYLIST_IDS.FAVORITES,PLAYLIST_IDS.FAVORITES_NAME,1_000);
    await store.addEntry({playlistId:PLAYLIST_IDS.FAVORITES,slug:'oldest',addedAt:100,position:null,sectionId:null,sectionName:null});
    await store.addEntry({playlistId:PLAYLIST_IDS.FAVORITES,slug:'newest',addedAt:300,position:null,sectionId:null,sectionName:null});
    await store.addEntry({playlistId:PLAYLIST_IDS.FAVORITES,slug:'middle',addedAt:200,position:null,sectionId:null,sectionName:null});
    expect(await store.getSlugsIn(PLAYLIST_IDS.FAVORITES)).toEqual(['newest','middle','oldest']);
  });
  it('builtInPlaylistsAreNotDeletable',async()=>{
    const store=new MemoryStore();
    await store.ensureBuiltInPlaylist(PLAYLIST_IDS.FAVORITES,PLAYLIST_IDS.FAVORITES_NAME,1_000);
    await store.addEntry({playlistId:PLAYLIST_IDS.FAVORITES,slug:'a-song',addedAt:10,position:null,sectionId:null,sectionName:null});
    await store.deletePlaylist(PLAYLIST_IDS.FAVORITES);
    expect(await store.getSlugsIn(PLAYLIST_IDS.FAVORITES)).toEqual(['a-song']);
    expect(store.playlists.size).toBe(1);
  });
  it('membershipIsScopedToItsOwnPlaylist',async()=>{
    const store=new MemoryStore();
    await store.ensureBuiltInPlaylist(PLAYLIST_IDS.FAVORITES,PLAYLIST_IDS.FAVORITES_NAME,1_000);
    store.playlists.set('practice',{id:'practice',name:'Practice',isBuiltIn:false,createdAt:2_000});
    await store.addEntry({playlistId:'practice',slug:'shared-song',addedAt:10,position:null,sectionId:null,sectionName:null});
    expect(await store.isInPlaylist('practice','shared-song')).toBe(true);
    expect(await store.isInPlaylist(PLAYLIST_IDS.FAVORITES,'shared-song')).toBe(false);
    expect(await store.getSlugsIn(PLAYLIST_IDS.FAVORITES)).toEqual([]);
  });
});

describe('native MainActivity favorite star',()=>{
  afterEach(()=>{vi.useRealTimers();});
  it('shows confirmation only after a successful add',()=>{
    expect(shouldShowFavoritedConfirmation(true,true)).toBe(true);
    expect(shouldShowFavoritedConfirmation(false,true)).toBe(false);
    expect(shouldShowFavoritedConfirmation(true,false)).toBe(false);
  });
  it('flips optimistically, persists, and hides Favorited after 2s',async()=>{
    vi.useFakeTimers();
    const store=new MemoryStore(),session=new FavoriteSession(()=>1_000);
    session.attachStore(store);
    await session.enterSong('detail-gzip');
    expect(session.getSnapshot()).toEqual({favorite:false,confirmation:false});
    const toggling=session.toggle();
    expect(session.getSnapshot()).toEqual({favorite:true,confirmation:false});
    await toggling;
    expect(session.getSnapshot()).toEqual({favorite:true,confirmation:true});
    expect(await store.isInPlaylist(PLAYLIST_IDS.FAVORITES,'detail-gzip')).toBe(true);
    await vi.advanceTimersByTimeAsync(FAVORITED_CONFIRMATION_MS);
    expect(session.getSnapshot()).toEqual({favorite:true,confirmation:false});
    await session.toggle();
    expect(session.getSnapshot()).toEqual({favorite:false,confirmation:false});
    expect(await store.isInPlaylist(PLAYLIST_IDS.FAVORITES,'detail-gzip')).toBe(false);
  });
  it('puts the star back when the write fails',async()=>{
    const session=new FavoriteSession();
    session.attachStore({
      ensureBuiltInPlaylist:async()=>{throw new Error('quota');},
      isInPlaylist:async()=>false,addEntry:async()=>{},removeEntry:async()=>{},getSlugsIn:async()=>[],getEntriesIn:async()=>[],
      getSummaries:async()=>[],deletePlaylist:async()=>{},saveGeneratedPlaylist:async()=>{},
    });
    await session.enterSong('detail-gzip');
    const toggling=session.toggle();
    expect(session.getSnapshot().favorite).toBe(true);
    await toggling;
    expect(session.getSnapshot()).toEqual({favorite:false,confirmation:false});
  });
  it('restores membership when reentering the same song',async()=>{
    const store=new MemoryStore(),session=new FavoriteSession();
    session.attachStore(store);
    await session.enterSong('detail-gzip');
    await session.toggle();
    await session.enterSong('playback-context');
    expect(session.getSnapshot().favorite).toBe(false);
    await session.enterSong('detail-gzip');
    expect(session.getSnapshot().favorite).toBe(true);
  });
});
