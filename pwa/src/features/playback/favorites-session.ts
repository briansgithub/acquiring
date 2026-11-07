/** Frozen 801cf798 MainActivity favorite star + FavoritedConfirmation.kt */
import {PLAYLIST_IDS,type PlaylistStore} from './playlist-store';

export const FAVORITED_CONFIRMATION_MS=2_000;
export function shouldShowFavoritedConfirmation(added:boolean,writeSucceeded:boolean):boolean {
  return added&&writeSucceeded;
}

export interface FavoriteSnapshot {readonly favorite:boolean;readonly confirmation:boolean}

export class FavoriteSession {
  private slug:string|null=null;
  private store:PlaylistStore|null=null;
  private generation=0;
  private confirmationTimer:ReturnType<typeof setTimeout>|null=null;
  private snapshot:FavoriteSnapshot=Object.freeze({favorite:false,confirmation:false});
  private readonly listeners=new Set<()=>void>();
  constructor(private readonly now:()=>number=()=>Date.now()){}
  subscribe=(listener:()=>void):(()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
  getSnapshot=():FavoriteSnapshot=>this.snapshot;
  attachStore(store:PlaylistStore|null):void {
    this.store=store;
    if(store&&this.slug)void this.restore(this.slug);
  }
  private publish(next:FavoriteSnapshot):void {
    this.snapshot=Object.freeze(next);
    for(const listener of this.listeners)listener();
  }
  private clearConfirmationTimer():void {
    if(this.confirmationTimer===null)return;
    clearTimeout(this.confirmationTimer);
    this.confirmationTimer=null;
  }
  async enterSong(slug:string):Promise<void> {
    this.generation++;
    this.slug=slug;
    this.clearConfirmationTimer();
    this.publish({favorite:false,confirmation:false});
    await this.restore(slug);
  }
  private async restore(slug:string):Promise<void> {
    const store=this.store;if(!store)return;
    const generation=this.generation;
    try{
      const favorite=await store.isInPlaylist(PLAYLIST_IDS.FAVORITES,slug);
      if(generation!==this.generation||this.slug!==slug)return;
      this.publish({favorite,confirmation:false});
    }catch{
      if(generation!==this.generation||this.slug!==slug)return;
      this.publish({favorite:false,confirmation:false});
    }
  }
  async toggle():Promise<void> {
    const slug=this.slug;if(!slug)return;
    const shouldAdd=!this.snapshot.favorite;
    this.clearConfirmationTimer();
    this.publish({favorite:shouldAdd,confirmation:false});
    await this.write(slug,shouldAdd);
  }
  private async write(slug:string,shouldAdd:boolean):Promise<void> {
    const store=this.store,generation=this.generation;
    try{
      if(!store)throw new Error('Favorite store unavailable');
      await store.ensureBuiltInPlaylist(PLAYLIST_IDS.FAVORITES,PLAYLIST_IDS.FAVORITES_NAME,this.now());
      if(shouldAdd)await store.addEntry({playlistId:PLAYLIST_IDS.FAVORITES,slug,addedAt:this.now(),position:null,sectionId:null,sectionName:null});
      else await store.removeEntry(PLAYLIST_IDS.FAVORITES,slug);
      if(generation!==this.generation||this.slug!==slug)return;
      if(!shouldShowFavoritedConfirmation(shouldAdd,true))return;
      this.publish({favorite:true,confirmation:true});
      this.confirmationTimer=setTimeout(()=>{
        this.confirmationTimer=null;
        if(generation!==this.generation)return;
        this.publish({favorite:this.snapshot.favorite,confirmation:false});
      },FAVORITED_CONFIRMATION_MS);
    }catch{
      if(generation!==this.generation||this.slug!==slug)return;
      this.clearConfirmationTimer();
      this.publish({favorite:!shouldAdd,confirmation:false});
    }
  }
}
