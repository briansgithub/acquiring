/** Frozen 801cf798 PlaylistDao.kt / Playlist.kt. T06 records; business rules stay here. */
import type {JsonValue} from '../../contracts';
import {openUserDatabase,type UserDatabase,type UserNamespace} from '../../storage/user';

export const PLAYLIST_IDS=Object.freeze({FAVORITES:'favorites',FAVORITES_NAME:'Favorites'});
export interface PlaylistRecord {readonly id:string;readonly name:string;readonly isBuiltIn:boolean;readonly createdAt:number}
export interface PlaylistEntryRecord {
  readonly playlistId:string;readonly slug:string;readonly addedAt:number;
  readonly position:number|null;readonly sectionId:string|null;readonly sectionName:string|null;
}
export interface PlaylistSummary {readonly id:string;readonly name:string;readonly songCount:number}
export interface PlaylistStore {
  ensureBuiltInPlaylist(id:string,name:string,createdAt:number):Promise<void>;
  isInPlaylist(playlistId:string,slug:string):Promise<boolean>;
  addEntry(entry:PlaylistEntryRecord):Promise<void>;
  removeEntry(playlistId:string,slug:string):Promise<void>;
  getSlugsIn(playlistId:string):Promise<string[]>;
  getEntriesIn(playlistId:string):Promise<PlaylistEntryRecord[]>;
  getSummaries():Promise<PlaylistSummary[]>;
  deletePlaylist(playlistId:string):Promise<void>;
  saveGeneratedPlaylist(playlist:PlaylistRecord,entries:readonly PlaylistEntryRecord[]):Promise<void>;
}

export function playlistEntryId(playlistId:string,slug:string):string {return `${playlistId}\t${slug}`;}

export function parsePlaylistValue(id:string,value:JsonValue):PlaylistRecord|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const {name,isBuiltIn,createdAt}=value as Record<string,JsonValue>;
  if(typeof name!=='string'||typeof isBuiltIn!=='boolean'||typeof createdAt!=='number'||!Number.isInteger(createdAt))return null;
  return {id,name,isBuiltIn,createdAt};
}
export function parsePlaylistEntryValue(value:JsonValue):PlaylistEntryRecord|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const {playlistId,slug,addedAt,position,sectionId,sectionName}=value as Record<string,JsonValue>;
  if(typeof playlistId!=='string'||typeof slug!=='string'||typeof addedAt!=='number'||!Number.isInteger(addedAt))return null;
  const pos=position===undefined||position===null?null:typeof position==='number'&&Number.isInteger(position)?position:null;
  if(position!==undefined&&position!==null&&pos===null)return null;
  if(sectionId!==undefined&&sectionId!==null&&typeof sectionId!=='string')return null;
  if(sectionName!==undefined&&sectionName!==null&&typeof sectionName!=='string')return null;
  return {playlistId,slug,addedAt,position:pos,sectionId:typeof sectionId==='string'?sectionId:null,sectionName:typeof sectionName==='string'?sectionName:null};
}

function slugOrder(a:PlaylistEntryRecord,b:PlaylistEntryRecord):number {
  const aPos=a.position===null?1:0,bPos=b.position===null?1:0;
  if(aPos!==bPos)return aPos-bPos;
  if(a.position!==null&&b.position!==null&&a.position!==b.position)return a.position-b.position;
  if(a.addedAt!==b.addedAt)return b.addedAt-a.addedAt;
  return a.slug.localeCompare(b.slug,'en',{sensitivity:'accent'});
}

export function userPlaylistStore(db:UserDatabase,namespace:UserNamespace='guest'):PlaylistStore {
  return {
    async ensureBuiltInPlaylist(id,name,createdAt){
      const row=await db.get(namespace,'playlists',id);
      if(row&&!row.deleted)return;
      await db.mutate({namespace,store:'playlists',id,operationId:crypto.randomUUID(),
        value:{name,isBuiltIn:true,createdAt},createdAt});
    },
    async isInPlaylist(playlistId,slug){
      const row=await db.get(namespace,'playlistEntries',playlistEntryId(playlistId,slug));
      return Boolean(row&&!row.deleted&&parsePlaylistEntryValue(row.value));
    },
    async addEntry(entry){
      const id=playlistEntryId(entry.playlistId,entry.slug);
      const row=await db.get(namespace,'playlistEntries',id);
      if(row&&!row.deleted)return;
      await db.mutate({namespace,store:'playlistEntries',id,operationId:crypto.randomUUID(),
        value:{playlistId:entry.playlistId,slug:entry.slug,addedAt:entry.addedAt,
          position:entry.position,sectionId:entry.sectionId,sectionName:entry.sectionName},
        createdAt:entry.addedAt});
    },
    async removeEntry(playlistId,slug){
      const id=playlistEntryId(playlistId,slug);
      const row=await db.get(namespace,'playlistEntries',id);
      if(!row||row.deleted)return;
      await db.mutate({namespace,store:'playlistEntries',id,operationId:crypto.randomUUID(),
        value:null,deleted:true,createdAt:Date.now()});
    },
    async getEntriesIn(playlistId){
      const rows=await db.list(namespace,'playlistEntries');
      return rows.map(row=>parsePlaylistEntryValue(row.value)).filter((entry):entry is PlaylistEntryRecord=>entry?.playlistId===playlistId)
        .sort(slugOrder);
    },
    async getSlugsIn(playlistId){
      return (await this.getEntriesIn(playlistId)).map(entry=>entry.slug);
    },
    async saveGeneratedPlaylist(playlist,entries){
      await db.mutate({namespace,store:'playlists',id:playlist.id,operationId:crypto.randomUUID(),
        value:{name:playlist.name,isBuiltIn:playlist.isBuiltIn,createdAt:playlist.createdAt},createdAt:playlist.createdAt});
      for(const entry of entries)await this.addEntry(entry);
    },
    async getSummaries(){
      const playlists=(await db.list(namespace,'playlists')).map(row=>parsePlaylistValue(row.id,row.value)).filter((row):row is PlaylistRecord=>row!==null);
      const entries=(await db.list(namespace,'playlistEntries')).map(row=>parsePlaylistEntryValue(row.value)).filter((row):row is PlaylistEntryRecord=>row!==null);
      playlists.sort((a,b)=>{
        if(a.isBuiltIn!==b.isBuiltIn)return a.isBuiltIn?-1:1;
        if(a.createdAt!==b.createdAt)return a.createdAt-b.createdAt;
        return a.name.localeCompare(b.name,'en',{sensitivity:'accent'});
      });
      return playlists.map(playlist=>({id:playlist.id,name:playlist.name,
        songCount:entries.filter(entry=>entry.playlistId===playlist.id).length}));
    },
    async deletePlaylist(playlistId){
      const row=await db.get(namespace,'playlists',playlistId);
      const parsed=row&&!row.deleted?parsePlaylistValue(playlistId,row.value):null;
      if(!parsed||parsed.isBuiltIn)return;
      await db.mutate({namespace,store:'playlists',id:playlistId,operationId:crypto.randomUUID(),
        value:null,deleted:true,createdAt:Date.now()});
      for(const slug of await this.getSlugsIn(playlistId))await this.removeEntry(playlistId,slug);
    },
  };
}

export async function openGuestPlaylistStore():Promise<{db:UserDatabase;store:PlaylistStore}|null> {
  try {
    const db=await openUserDatabase();
    return {db,store:userPlaylistStore(db)};
  } catch {
    return null;
  }
}
