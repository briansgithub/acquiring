import {CatalogWorkerClient} from '../../storage/catalog/client';
import {CatalogError} from '../../storage/catalog/protocol';
import {readSongDetails,type SongDetails,type SongDetailClient} from './reader';
export interface SongReaderClient extends SongDetailClient {terminate():void}
export interface SongDetailState {readonly phase:'loading'|'ready'|'missing'|'download'|'error';readonly details?:SongDetails;readonly message?:string}

/** Own the transient lookup, then release the catalog worker. Never retain ownership while displaying a song. */
export class SongDetailController {
  private state:SongDetailState={phase:'loading'};
  private listeners=new Set<()=>void>();
  private revision=0;
  private stopped=false;
  private started=false;
  private lifetime?:AbortController;
  private client?:SongReaderClient;
  private active?:Promise<void>;
  constructor(readonly slug:string,private readonly open:(signal:AbortSignal)=>Promise<SongReaderClient>=signal=>CatalogWorkerClient.open(undefined,signal)){}
  get closed():boolean{return this.stopped;}
  getSnapshot=():SongDetailState=>this.state;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
  private publish(state:SongDetailState):void {if(this.stopped)return;this.state=state;for(const listener of this.listeners)listener();}
  private async openReader(signal:AbortSignal):Promise<SongReaderClient> {
    // A departing same-page worker releases its Web Lock asynchronously. Availability
    // checks never queue behind/steal another tab's lock; retry at most1s in total.
    const waits=[50,100,200,300,350];
    for(let attempt=0;;attempt++){
      if(signal.aborted)throw new CatalogError('CLOSED','Song read cancelled');
      try{return await this.open(signal);}catch(error){
        if(!(error instanceof CatalogError)||error.code!=='BUSY'||attempt>=waits.length)throw error;
        await new Promise<void>((resolve,reject)=>{
          const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(new CatalogError('CLOSED','Song read cancelled'));};
          const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},waits[attempt]);
          signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
        });
      }
    }
  }
  start():Promise<void>{if(this.started)return this.active??Promise.resolve();this.started=true;return this.retry();}
  retry():Promise<void>{
    if(this.stopped)return Promise.resolve();
    const revision=++this.revision;this.lifetime?.abort();this.client?.terminate();this.client=undefined;
    const lifetime=new AbortController();this.lifetime=lifetime;this.publish({phase:'loading'});
    return this.active=(async()=>{
      let client:SongReaderClient|undefined;
      try {
        client=await this.openReader(lifetime.signal);
        if(this.stopped||revision!==this.revision)return;
        this.client=client;
        const details=await readSongDetails(client,this.slug,lifetime.signal);
        if(this.stopped||revision!==this.revision)return;
        this.publish(details?{phase:'ready',details}:{phase:'missing',message:'This song is not in your downloaded library.'});
      } catch(error){
        if(this.stopped||revision!==this.revision)return;
        if(error instanceof CatalogError&&error.code==='NOT_INSTALLED')this.publish({phase:'download',message:'Download the song library to open this song offline.'});
        else {
          const code=error instanceof CatalogError?error.code:'';
          const message=code==='BUSY'?'Your catalog is open in another tab. Close that tab, then try again.'
            :code==='PAYLOAD_MISSING'?'This song has no downloaded chord data.'
            :code==='LIMIT'?'This song exceeds the size supported by this browser.'
            :'This song could not be opened. Try again.';
          this.publish({phase:'error',message});
        }
      } finally {client?.terminate();if(this.client===client)this.client=undefined;}
    })();
  }
  dispose():void {if(this.stopped)return;this.stopped=true;++this.revision;this.lifetime?.abort();this.client?.terminate();this.client=undefined;this.listeners.clear();}
}
