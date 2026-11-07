/** Frozen 801cf798 HistoryManager.kt. T06 `history` records; MRU rules stay here. */
import type {JsonValue} from '../../contracts';
import {openUserDatabase,type UserDatabase,type UserNamespace} from '../../storage/user';

export const HISTORY_IDS=Object.freeze({SLUGS:'recent_slugs',ARTISTS:'recent_artists'});
export const MAX_HISTORY=10;

export interface HistoryStore {
  getRecentSlugs():Promise<string[]>;
  addSong(slug:string):Promise<void>;
  getRecentArtists():Promise<string[]>;
  addArtist(artistName:string|null):Promise<void>;
}

export function canonicalArtistName(artistName:string):string {
  return artistName.replace(/-/g,' ').trim();
}

export function addRecentSlug(current:readonly string[],slug:string):string[] {
  return [slug,...current.filter(value=>value!==slug)].slice(0,MAX_HISTORY);
}

export function addRecentArtist(current:readonly string[],artistName:string|null):string[] {
  const canonical=artistName&&artistName.trim()?canonicalArtistName(artistName):'';
  if(!canonical)return [...current];
  return [canonical,...current.filter(value=>value.toLowerCase()!==canonical.toLowerCase())].slice(0,MAX_HISTORY);
}

function parseStringList(value:JsonValue,key:string):string[] {
  if(!value||typeof value!=='object'||Array.isArray(value))return [];
  const list=(value as Record<string,JsonValue>)[key];
  if(!Array.isArray(list))return [];
  return list.filter((item):item is string=>typeof item==='string'&&item.length>0);
}

export function userHistoryStore(db:UserDatabase,namespace:UserNamespace='guest'):HistoryStore {
  const read=async(id:string,key:string)=>parseStringList((await db.get(namespace,'history',id))?.value??null,key);
  const write=async(id:string,key:string,values:string[])=>{
    await db.mutate({namespace,store:'history',id,operationId:crypto.randomUUID(),value:{[key]:values},createdAt:Date.now()});
  };
  return {
    getRecentSlugs:()=>read(HISTORY_IDS.SLUGS,'slugs'),
    async addSong(slug){
      if(!slug)return;
      await write(HISTORY_IDS.SLUGS,'slugs',addRecentSlug(await read(HISTORY_IDS.SLUGS,'slugs'),slug));
    },
    getRecentArtists:()=>read(HISTORY_IDS.ARTISTS,'names'),
    async addArtist(artistName){
      const next=addRecentArtist(await read(HISTORY_IDS.ARTISTS,'names'),artistName);
      if(next.length===0)return;
      await write(HISTORY_IDS.ARTISTS,'names',next);
    },
  };
}

export async function openGuestHistoryStore():Promise<{db:UserDatabase;store:HistoryStore}|null> {
  try {
    const db=await openUserDatabase();
    return {db,store:userHistoryStore(db)};
  } catch {
    return null;
  }
}

export async function recordOpenedSong(slug:string,artist:string|null):Promise<void> {
  const opened=await openGuestHistoryStore();
  if(!opened)return;
  try {await opened.store.addSong(slug);await opened.store.addArtist(artist);}
  finally {opened.db.close();}
}

export async function recordOpenedArtist(artist:string|null):Promise<void> {
  const opened=await openGuestHistoryStore();
  if(!opened)return;
  try {await opened.store.addArtist(artist);}
  finally {opened.db.close();}
}
