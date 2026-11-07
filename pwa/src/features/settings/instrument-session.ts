/** Frozen 801cf798 InstrumentSession.kt. Playback selectForSession never writes the
 * saved default; Settings selectAsDefault writes T06 preferences and updates session.
 */
import {decodeInstrument,Waveform} from '../../audio/synth';
import {openUserDatabase,type UserDatabase,type UserNamespace} from '../../storage/user';

export const DEFAULT_INSTRUMENT_KEY='default_instrument';
export interface InstrumentPreferenceStore {
  readDefaultIdentifier():string|null;
  writeDefaultIdentifier(identifier:string):void;
}
export interface InstrumentSnapshot {readonly session:Waveform;readonly defaultInstrument:Waveform}

export class InstrumentSessionOwner {
  private session:Waveform;
  private defaultInstrumentValue:Waveform;
  private sessionLocked=false;
  private snapshot:InstrumentSnapshot;
  private readonly listeners=new Set<()=>void>();
  constructor(private readonly store:InstrumentPreferenceStore,private readonly apply:(waveform:Waveform)=>void=()=>{}) {
    const initial=decodeInstrument(store.readDefaultIdentifier());
    this.session=initial;this.defaultInstrumentValue=initial;
    this.snapshot=Object.freeze({session:initial,defaultInstrument:initial});
    this.apply(initial);
  }
  subscribe=(listener:()=>void):(()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  getSnapshot=():InstrumentSnapshot=>this.snapshot;
  get sessionInstrument():Waveform {return this.session;}
  get defaultInstrument():Waveform {return this.defaultInstrumentValue;}
  private publish():void {
    this.snapshot=Object.freeze({session:this.session,defaultInstrument:this.defaultInstrumentValue});
    for(const listener of this.listeners)listener();
  }
  rehydrate():void {
    const initial=decodeInstrument(this.store.readDefaultIdentifier());
    this.defaultInstrumentValue=initial;
    if(!this.sessionLocked){this.session=initial;this.apply(initial);}
    this.publish();
  }
  selectForSession(instrument:Waveform):void {
    this.sessionLocked=true;this.session=instrument;this.apply(instrument);this.publish();
  }
  selectAsDefault(instrument:Waveform):void {
    this.sessionLocked=true;this.store.writeDefaultIdentifier(instrument);this.defaultInstrumentValue=instrument;
    this.session=instrument;this.apply(instrument);this.publish();
  }
  reset():void {this.sessionLocked=false;this.rehydrate();}
}

class MemoryInstrumentStore implements InstrumentPreferenceStore {
  identifier:string|null=null;
  persist:(identifier:string)=>void=()=>{};
  readDefaultIdentifier():string|null {return this.identifier;}
  writeDefaultIdentifier(identifier:string):void {this.identifier=identifier;this.persist(identifier);}
}

const memoryStore=new MemoryInstrumentStore();
export const appInstrumentSession=new InstrumentSessionOwner(memoryStore);

export function resetAppInstrumentSession():void {
  memoryStore.identifier=null;memoryStore.persist=()=>{};
  appInstrumentSession.reset();
}

export async function hydrateAppInstrumentSession(db:UserDatabase,namespace:UserNamespace='guest'):Promise<void> {
  const persist=(id:string)=>{void db.mutate({namespace,store:'preferences',id:DEFAULT_INSTRUMENT_KEY,operationId:crypto.randomUUID(),
    value:id,createdAt:Date.now()});};
  if(memoryStore.identifier!==null){memoryStore.persist=persist;persist(memoryStore.identifier);return;}
  const row=await db.get(namespace,'preferences',DEFAULT_INSTRUMENT_KEY);
  memoryStore.identifier=row&&!row.deleted&&typeof row.value==='string'?row.value:null;
  memoryStore.persist=persist;
  appInstrumentSession.rehydrate();
}

export async function openGuestInstrumentPreferences():Promise<UserDatabase|null> {
  try {return await openUserDatabase();} catch {return null;}
}

