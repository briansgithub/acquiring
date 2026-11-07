import {describe,expect,it} from 'vitest';
import {PLAYLIST_IDS,playlistEntryId,type PlaylistEntryRecord,type PlaylistRecord,type PlaylistStore} from '../playback/playlist-store';
import {queuedSongsFromEntries,songsForPlaylist} from './playlists';

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
      .sort((a,b)=>b.addedAt-a.addedAt||a.slug.localeCompare(b.slug,'en',{sensitivity:'accent'}));
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

describe('native PlaylistsSection hydration',()=>{
  it('lists Favorites before user playlists even when empty',async()=>{
    const store=new MemoryStore();
    await store.ensureBuiltInPlaylist(PLAYLIST_IDS.FAVORITES,PLAYLIST_IDS.FAVORITES_NAME,3_000);
    store.playlists.set('practice',{id:'practice',name:'Practice',isBuiltIn:false,createdAt:1_000});
    expect(await store.getSummaries()).toEqual([
      {id:'favorites',name:'Favorites',songCount:0},
      {id:'practice',name:'Practice',songCount:0},
    ]);
  });
  it('hydrates newest-first slugs and drops catalog misses',async()=>{
    const store=new MemoryStore();
    await store.ensureBuiltInPlaylist(PLAYLIST_IDS.FAVORITES,PLAYLIST_IDS.FAVORITES_NAME,1_000);
    await store.addEntry({playlistId:PLAYLIST_IDS.FAVORITES,slug:'oldest',addedAt:100,position:null,sectionId:null,sectionName:null});
    await store.addEntry({playlistId:PLAYLIST_IDS.FAVORITES,slug:'newest',addedAt:300,position:null,sectionId:null,sectionName:null});
    await store.addEntry({playlistId:PLAYLIST_IDS.FAVORITES,slug:'gone',addedAt:200,position:null,sectionId:null,sectionName:null});
    const slugs=await store.getSlugsIn(PLAYLIST_IDS.FAVORITES);
    expect(slugs).toEqual(['newest','gone','oldest']);
    expect(songsForPlaylist(slugs,[
      {slug:'oldest',artist:'A',title:'Old',complexityRating:null},
      {slug:'newest',artist:'B',title:'New',complexityRating:null},
    ]).map(row=>row.slug)).toEqual(['newest','oldest']);
  });
  it('counts entries on the owning playlist only',async()=>{
    const store=new MemoryStore();
    await store.ensureBuiltInPlaylist(PLAYLIST_IDS.FAVORITES,PLAYLIST_IDS.FAVORITES_NAME,1_000);
    store.playlists.set('practice',{id:'practice',name:'Practice',isBuiltIn:false,createdAt:2_000});
    await store.addEntry({playlistId:PLAYLIST_IDS.FAVORITES,slug:'one',addedAt:10,position:null,sectionId:null,sectionName:null});
    await store.addEntry({playlistId:'practice',slug:'two',addedAt:11,position:null,sectionId:null,sectionName:null});
    expect(await store.getSummaries()).toEqual([
      {id:'favorites',name:'Favorites',songCount:1},
      {id:'practice',name:'Practice',songCount:1},
    ]);
  });
  it('keeps missing catalog slugs in a saved queue and fills First section',()=>{
    const songs=queuedSongsFromEntries([
      {playlistId:'favorites',slug:'gone',addedAt:1,position:0,sectionId:null,sectionName:null},
      {playlistId:'favorites',slug:'kept',addedAt:2,position:1,sectionId:'verse',sectionName:'Verse'},
    ],[{slug:'kept',artist:'Artist-A',title:'Kept',complexityRating:null}]);
    expect(songs.map(song=>song.slug)).toEqual(['gone','kept']);
    expect(songs[0]).toMatchObject({title:'gone',artist:'',sectionId:'',sectionName:'First section'});
    expect(songs[1]).toMatchObject({title:'Kept',sectionId:'verse',sectionName:'Verse'});
  });
});
