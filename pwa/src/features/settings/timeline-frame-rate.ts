/** Frozen 801cf798 TimelineFrameRate.kt. Caps visual PlaybackState publishes, not the audio clock.
 * localStorage analog of SharedPreferences "display_preferences"/timelineFrameRate. Not T06.
 */
export const DISPLAY_PREFS_KEY = 'acquiring-display';
export const TIMELINE_FRAME_RATE_KEY = 'timelineFrameRate';

export const TimelineFrameRatePreference = Object.freeze({
  STANDARD: Object.freeze({storageValue:'60',title:'60 fps'}),
  MAXIMUM: Object.freeze({storageValue:'maximum',title:'Maximum'}),
});
export type TimelineFrameRatePreference =
  typeof TimelineFrameRatePreference[keyof typeof TimelineFrameRatePreference];
export const TIMELINE_FRAME_RATE_OPTIONS = Object.freeze([
  TimelineFrameRatePreference.STANDARD,
  TimelineFrameRatePreference.MAXIMUM,
]);

export function framesPerSecond(preference:TimelineFrameRatePreference,displayMaximum:number):number {
  const supportedMaximum=Math.max(displayMaximum,1);
  return preference===TimelineFrameRatePreference.STANDARD?Math.min(60,supportedMaximum):supportedMaximum;
}
export function stateUpdateNanos(preference:TimelineFrameRatePreference,displayMaximum:number):number {
  return Math.trunc(1_000_000_000/framesPerSecond(preference,displayMaximum));
}
export function fromStorage(value:string|null|undefined):TimelineFrameRatePreference {
  return TIMELINE_FRAME_RATE_OPTIONS.find(option=>option.storageValue===value)
    ?? TimelineFrameRatePreference.STANDARD;
}

export interface DisplayPreferenceStore {
  getItem(key:string):string|null;
  setItem(key:string,value:string):void;
}

const memory=new Map<string,string>();
const memoryStore:DisplayPreferenceStore={
  getItem(key){return memory.get(key)??null;},
  setItem(key,value){memory.set(key,value);},
};

function browserStore():DisplayPreferenceStore {
  try {
    if(typeof localStorage==='undefined')return memoryStore;
    return localStorage;
  } catch { return memoryStore; }
}

function readStored(store:DisplayPreferenceStore):TimelineFrameRatePreference {
  const raw=store.getItem(DISPLAY_PREFS_KEY);
  if(!raw)return TimelineFrameRatePreference.STANDARD;
  try {
    const parsed=JSON.parse(raw) as {[TIMELINE_FRAME_RATE_KEY]?:unknown};
    return fromStorage(typeof parsed[TIMELINE_FRAME_RATE_KEY]==='string'?parsed[TIMELINE_FRAME_RATE_KEY]:null);
  } catch { return TimelineFrameRatePreference.STANDARD; }
}

function probeDisplayMaximumHz():number {
  const candidate=(globalThis as {screen?:{refreshRate?:number}}).screen?.refreshRate;
  if(typeof candidate==='number'&&Number.isFinite(candidate)&&candidate>=1)return Math.round(candidate);
  return 60;
}

export interface TimelineFrameRateSnapshot {
  readonly preference:TimelineFrameRatePreference;
  readonly displayMaximumHz:number;
  readonly minStateUpdateNanos:number;
}

export class TimelineFrameRateStore {
  preference:TimelineFrameRatePreference=TimelineFrameRatePreference.STANDARD;
  displayMaximumHz=60;
  minStateUpdateNanos=stateUpdateNanos(TimelineFrameRatePreference.STANDARD,60);
  private snapshot:TimelineFrameRateSnapshot;
  private readonly listeners=new Set<()=>void>();
  constructor(private readonly storage:DisplayPreferenceStore=browserStore()) {
    this.snapshot=this.capture();
    this.apply(readStored(this.storage),this.displayMaximumHz);
  }
  subscribe=(listener:()=>void):(()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  getSnapshot=():TimelineFrameRateSnapshot=>this.snapshot;
  private capture():TimelineFrameRateSnapshot {
    return Object.freeze({
      preference:this.preference,displayMaximumHz:this.displayMaximumHz,minStateUpdateNanos:this.minStateUpdateNanos,
    });
  }
  private publish():void {this.snapshot=this.capture();for(const listener of this.listeners)listener();}
  apply(next:TimelineFrameRatePreference,displayMaximum:number):void {
    this.preference=next;
    this.displayMaximumHz=Math.max(displayMaximum,1);
    this.minStateUpdateNanos=stateUpdateNanos(next,this.displayMaximumHz);
    this.publish();
  }
  applyToWindow(displayMaximum=probeDisplayMaximumHz()):void {
    this.apply(readStored(this.storage),displayMaximum);
  }
  select(next:TimelineFrameRatePreference,displayMaximum=probeDisplayMaximumHz()):void {
    this.storage.setItem(DISPLAY_PREFS_KEY,JSON.stringify({[TIMELINE_FRAME_RATE_KEY]:next.storageValue}));
    this.apply(next,displayMaximum);
  }
  read():TimelineFrameRatePreference {return readStored(this.storage);}
  resetForTests():void {
    memory.clear();
    this.preference=TimelineFrameRatePreference.STANDARD;
    this.displayMaximumHz=60;
    this.minStateUpdateNanos=stateUpdateNanos(TimelineFrameRatePreference.STANDARD,60);
    this.snapshot=this.capture();
    this.listeners.clear();
  }
}

export const timelineFrameRateStore=new TimelineFrameRateStore();
export function bindTimelineFrameRateWindow(target:Window=window):()=>void {
  const apply=()=>timelineFrameRateStore.applyToWindow();
  apply();
  target.addEventListener('visibilitychange',apply);
  target.addEventListener('pageshow',apply);
  return()=>{target.removeEventListener('visibilitychange',apply);target.removeEventListener('pageshow',apply);};
}
