/** Frozen 801cf798 SongOctaveOffsetViewModel.kt. Section changes keep the offset;
 * a new song zeros in-memory, then the T06 songOctaveOffsets store may restore.
 */
import type {JsonValue} from '../../contracts';
import {openUserDatabase,type UserDatabase,type UserNamespace} from '../../storage/user';
import {clampSingingOctaveOffset} from './singing-octave';

export interface SongOctaveOffsetStore {
  getOffset(slug:string):Promise<number|null>;
  upsert(slug:string,offset:number):Promise<void>;
}

export function parseSongOctaveOffsetValue(value:JsonValue):number|null {
  if(typeof value==='number'&&Number.isInteger(value))return value;
  if(value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.offset==='number'&&Number.isInteger(value.offset)){
    return value.offset;
  }
  return null;
}

export function userSongOctaveOffsetStore(db:UserDatabase,namespace:UserNamespace='guest'):SongOctaveOffsetStore {
  return {
    async getOffset(slug){
      const row=await db.get(namespace,'songOctaveOffsets',slug);
      if(!row||row.deleted)return null;
      return parseSongOctaveOffsetValue(row.value);
    },
    async upsert(slug,offset){
      await db.mutate({
        namespace,store:'songOctaveOffsets',id:slug,operationId:crypto.randomUUID(),
        value:{offset},createdAt:Date.now(),
      });
    },
  };
}

export class SongOctaveOffsetSession {
  sessionKey:string|null=null;
  songSlug:string|null=null;
  octaveOffset=0;
  private store:SongOctaveOffsetStore|null=null;
  private generation=0;
  private readonly listeners=new Set<()=>void>();
  attachStore(store:SongOctaveOffsetStore|null):void {
    this.store=store;
    if(store&&this.songSlug)void this.restore(this.songSlug);
  }
  subscribe=(listener:()=>void):(()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
  getSnapshot=():number=>this.octaveOffset;
  private publish():void {for(const listener of this.listeners)listener();}
  private setOffset(offset:number):void {
    const clamped=clampSingingOctaveOffset(offset);
    if(clamped===this.octaveOffset)return;
    this.octaveOffset=clamped;
    this.publish();
  }
  private async restore(slug:string):Promise<void> {
    const store=this.store;if(!store)return;
    const generation=++this.generation;
    const stored=await store.getOffset(slug);
    if(generation!==this.generation||this.songSlug!==slug)return;
    this.setOffset(stored??0);
  }
  async enterSession(songSlug:string,key:string):Promise<void> {
    const sameSession=this.sessionKey===key&&this.songSlug===songSlug;
    const previousSlug=this.songSlug;
    this.songSlug=songSlug;
    this.sessionKey=key;
    if(sameSession)return;
    if(previousSlug!==songSlug)this.setOffset(0);
    if(this.store)await this.restore(songSlug);
  }
  updateOctaveOffset(offset:number):void {
    this.setOffset(offset);
    const slug=this.songSlug,store=this.store;
    if(!slug||!store)return;
    void store.upsert(slug,this.octaveOffset);
  }
  clearSession():void {
    this.generation++;
    this.sessionKey=null;
    this.songSlug=null;
    this.setOffset(0);
  }
}

export async function openGuestSongOctaveOffsetStore():Promise<{db:UserDatabase;store:SongOctaveOffsetStore}|null> {
  try {
    const db=await openUserDatabase();
    return {db,store:userSongOctaveOffsetStore(db)};
  } catch {
    return null;
  }
}
