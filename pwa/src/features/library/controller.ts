import { CatalogWorkerClient } from '../../storage/catalog/client';
import { CatalogError } from '../../storage/catalog/protocol';
import type { SongPage, SongPageRequest } from '../../storage/catalog/library-queries';
import type { SongBrowseRow } from './grouping';

export interface LibraryView {
  text:string; artist:string|null; rows:SongBrowseRow[]; sourceSnapshot:string|null;
  nextOffset:number|null; focusSlug?:string;
}
export interface LibraryState extends LibraryView {
  phase:'loading'|'ready'|'missing'|'error'; loadingMore:boolean; message?:string;
}
export interface LibraryClient { songPage(query:SongPageRequest):Promise<SongPage>; terminate():void }
const emptyView=():LibraryView=>({text:'',artist:null,rows:[],sourceSnapshot:null,nextOffset:null});
function errorMessage(error:unknown):string {
  if(error instanceof CatalogError&&error.code==='BUSY')return 'Your catalog is open in another tab. Close that tab, then try again.';
  if(error instanceof CatalogError&&error.code==='UNSUPPORTED')return 'This browser cannot open the offline catalog.';
  return 'Songs could not be loaded. Try again.';
}

/** Own one reader while visible. Every response is tied to its current search generation. */
export class LibraryController {
  private state:LibraryState;
  private listeners=new Set<()=>void>();
  private client?:LibraryClient;
  private opening?:Promise<LibraryClient>;
  private timer?:ReturnType<typeof setTimeout>;
  private generation=0;
  private disposed=false;
  private started=false;
  private readonly lifetime=new AbortController();
  constructor(remembered?:LibraryView,private readonly open:(signal:AbortSignal)=>Promise<LibraryClient>=(signal)=>CatalogWorkerClient.open(undefined,signal)) {
    const view=remembered?{...remembered,rows:[...remembered.rows]}:emptyView();
    this.state={...view,phase:'loading',loadingMore:false};
  }
  get closed():boolean {return this.disposed;}
  getSnapshot=():LibraryState=>this.state;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
  private publish(patch:Partial<LibraryState>):void {
    if(this.disposed)return;
    this.state={...this.state,...patch};for(const listener of this.listeners)listener();
  }
  capture():LibraryView {
    const {text,artist,rows,sourceSnapshot,nextOffset,focusSlug}=this.state;
    return {text,artist,rows:[...rows],sourceSnapshot,nextOffset,focusSlug};
  }
  restore(view:LibraryView):Promise<void> {
    if(this.disposed)return Promise.resolve();
    this.generation++;clearTimeout(this.timer);
    this.publish({...view,rows:[...view.rows],phase:'loading',loadingMore:false,message:undefined});
    return this.load(false,view);
  }
  rememberFocused(slug:string):void {this.publish({focusSlug:slug});}
  private reader():Promise<LibraryClient> {
    if(!this.opening)this.opening=this.open(this.lifetime.signal).then(client=>{
      if(this.disposed){client.terminate();throw new CatalogError('CLOSED','Reader closed');}
      this.client=client;return client;
    }).catch(error=>{this.opening=undefined;throw error;});
    return this.opening;
  }
  start():Promise<void> {
    if(this.started||this.disposed)return Promise.resolve();
    this.started=true;return this.load(false,this.capture());
  }
  search(text:string):void {
    if(this.disposed)return;
    this.generation++;clearTimeout(this.timer);
    this.publish({...emptyView(),text,phase:'loading',message:undefined,loadingMore:false});
    this.timer=setTimeout(()=>{this.timer=undefined;void this.load(false);},200);
  }
  showArtist(artist:string):Promise<void> {
    if(this.disposed)return Promise.resolve();
    this.generation++;clearTimeout(this.timer);
    this.publish({artist,rows:[],sourceSnapshot:null,nextOffset:null,focusSlug:undefined,phase:'loading',message:undefined,loadingMore:false});
    return this.load(false);
  }
  clearArtist():void {this.search(this.state.text);}
  retry():Promise<void> {
    if(this.disposed)return Promise.resolve();
    this.generation++;clearTimeout(this.timer);
    return this.load(false,this.capture());
  }
  loadMore():Promise<void> {
    if(this.state.phase!=='ready'||this.state.loadingMore||this.state.nextOffset===null||this.disposed)return Promise.resolve();
    return this.load(true);
  }
  private async load(append:boolean,restore?:LibraryView):Promise<void> {
    const generation=this.generation,{text,artist,nextOffset}=this.state;
    if(this.disposed)return;
    this.publish({phase:append?'ready':'loading',loadingMore:append,message:undefined});
    try {
      const reader=await this.reader();
      if(this.disposed||generation!==this.generation)return;
      const page=await reader.songPage({mode:artist===null?'search':'artist',text:artist??text,limit:20,offset:append?nextOffset!:0});
      if(this.disposed||generation!==this.generation)return;
      if(append&&this.state.sourceSnapshot!==page.sourceSnapshot){
        this.publish({rows:[],sourceSnapshot:null,nextOffset:null,loadingMore:false});
        return this.load(false);
      }
      const canRestore=restore?.sourceSnapshot===page.sourceSnapshot&&restore.rows.length>=page.rows.length;
      const rows=append?[...this.state.rows,...page.rows]:canRestore?restore!.rows:page.rows;
      this.publish({rows,sourceSnapshot:page.sourceSnapshot,nextOffset:canRestore?restore!.nextOffset:page.nextOffset,focusSlug:canRestore?restore!.focusSlug:append?this.state.focusSlug:undefined,phase:'ready',loadingMore:false});
    } catch(error){
      if(this.disposed||generation!==this.generation)return;
      const missing=error instanceof CatalogError&&error.code==='NOT_INSTALLED';
      this.publish({...(missing?{rows:[],sourceSnapshot:null,nextOffset:null,focusSlug:undefined}:{}),phase:missing?'missing':'error',message:missing?undefined:errorMessage(error),loadingMore:false});
    }
  }
  dispose():void {
    if(this.disposed)return;
    this.disposed=true;this.lifetime.abort();this.generation++;clearTimeout(this.timer);this.client?.terminate();this.client=undefined;this.listeners.clear();
  }
}
