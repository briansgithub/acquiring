/** Native SongPlaybackSettings.kt + SongPlaybackSettingsViewModel.kt at 3c887223 (N10).
 * Playback controls saved per song slug in the T06 `songPlaybackSettings` store. Section changes keep the
 * in-memory values. A different song publishes defaults immediately, then replaces them with that song's
 * row if one exists, unless the listener edited first. Full/Root and the selected section are not stored.
 * A null instrument means "use the Settings default", not a stored override.
 */
import type {JsonValue} from '../../contracts';
import {Waveform} from '../../audio/synth';
import type {UserDatabase,UserNamespace} from '../../storage/user';
import {DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX,DEFAULT_PLAYBACK_TEMPO_PERCENT,PLAYBACK_ARPEGGIOS} from './controller';

export const DEFAULT_MELODY_CHORD_BALANCE=0.5;
export const DEFAULT_PLAYBACK_VOICE_VOLUME=0.5;
export const PLAYBACK_TRANSPOSE_MIN=-12;
export const PLAYBACK_TRANSPOSE_MAX=12;
/** Native PlaybackRootDegreeCue entry order. */
export const PLAYBACK_ROOT_DEGREE_CUES=Object.freeze([
  'OFF','ROOT_PULSES','HARMONIC_DISTANCE','SPOKEN_NUMBER','SUNG_NUMBER_WITH_DETAILS','MELODY_FUNCTION','MELODY_CHORD_TONE',
] as const);
export type PlaybackRootDegreeCue=typeof PLAYBACK_ROOT_DEGREE_CUES[number];

export interface SongPlaybackSettingsValues {
  readonly lockInMajor:boolean;
  readonly tempoPercent:number;
  readonly arpeggioOptionIndex:number;
  readonly melodyChordBalance:number;
  readonly instrument:Waveform|null;
  readonly transpose:number;
  readonly rootDegreeCue:PlaybackRootDegreeCue;
  readonly voiceVolume:number;
  readonly loopSection:boolean;
}
export interface SongPlaybackSettingsRow extends SongPlaybackSettingsValues {readonly slug:string}
export interface SongPlaybackSettingsSnapshot extends SongPlaybackSettingsValues {readonly songSlug:string|null}

export const DEFAULT_SONG_PLAYBACK_SETTINGS:SongPlaybackSettingsValues=Object.freeze({
  lockInMajor:false,tempoPercent:DEFAULT_PLAYBACK_TEMPO_PERCENT,arpeggioOptionIndex:DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX,
  melodyChordBalance:DEFAULT_MELODY_CHORD_BALANCE,instrument:null,transpose:0,rootDegreeCue:'OFF',
  voiceVolume:DEFAULT_PLAYBACK_VOICE_VOLUME,loopSection:true,
});

const finiteIn=(value:unknown,min:number,max:number):value is number=>
  typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const isWaveform=(value:unknown):value is Waveform=>Object.values(Waveform).includes(value as Waveform);
const isCue=(value:unknown):value is PlaybackRootDegreeCue=>PLAYBACK_ROOT_DEGREE_CUES.includes(value as PlaybackRootDegreeCue);

/** Native sanitizeSongPlaybackSettings: stored rows can outlive an enum or dial range. Bad fields become
 * defaults; a null (or unknown) instrument stays null. */
export function sanitizeSongPlaybackSettings(slug:string,value:JsonValue):SongPlaybackSettingsRow|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const row=value as Record<string,unknown>;
  const transpose=row.transpose;
  return Object.freeze({
    slug,
    lockInMajor:row.lockInMajor===true,
    tempoPercent:finiteIn(row.tempoPercent,0,200)?row.tempoPercent:DEFAULT_PLAYBACK_TEMPO_PERCENT,
    arpeggioOptionIndex:Number.isInteger(row.arpeggioOptionIndex)&&finiteIn(row.arpeggioOptionIndex,0,PLAYBACK_ARPEGGIOS.length-1)
      ?row.arpeggioOptionIndex:DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX,
    melodyChordBalance:finiteIn(row.melodyChordBalance,0,1)?row.melodyChordBalance:DEFAULT_MELODY_CHORD_BALANCE,
    instrument:isWaveform(row.instrument)?row.instrument:null,
    transpose:Number.isInteger(transpose)&&finiteIn(transpose,PLAYBACK_TRANSPOSE_MIN,PLAYBACK_TRANSPOSE_MAX)?transpose:0,
    rootDegreeCue:isCue(row.rootDegreeCue)?row.rootDegreeCue:'OFF',
    voiceVolume:finiteIn(row.voiceVolume,0,1)?row.voiceVolume:DEFAULT_PLAYBACK_VOICE_VOLUME,
    loopSection:row.loopSection!==false,
  });
}

export interface SongPlaybackSettingsStore {
  get(slug:string):Promise<SongPlaybackSettingsRow|null>;
  upsert(row:SongPlaybackSettingsRow):Promise<void>;
}

export function userSongPlaybackSettingsStore(db:UserDatabase,namespace:UserNamespace='guest'):SongPlaybackSettingsStore {
  return {
    async get(slug){
      const row=await db.get(namespace,'songPlaybackSettings',slug);
      return row&&!row.deleted?sanitizeSongPlaybackSettings(slug,row.value):null;
    },
    async upsert(row){
      const {slug,...value}=row;
      await db.mutate({namespace,store:'songPlaybackSettings',id:slug,operationId:crypto.randomUUID(),
        value:value as unknown as JsonValue,createdAt:Date.now()});
    },
  };
}

export class SongPlaybackSettingsSession {
  private state:SongPlaybackSettingsSnapshot=Object.freeze({songSlug:null,...DEFAULT_SONG_PLAYBACK_SETTINGS});
  private store:SongPlaybackSettingsStore|null=null;
  private loadGeneration=0;
  private editedThisLoad=false;
  private readonly pending:SongPlaybackSettingsRow[]=[];
  private persisting=false;
  private readonly listeners=new Set<()=>void>();

  subscribe=(listener:()=>void):(()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  getSnapshot=():SongPlaybackSettingsSnapshot=>this.state;
  get songSlug():string|null {return this.state.songSlug;}

  attachStore(store:SongPlaybackSettingsStore|null):void {
    this.store=store;
    const slug=this.state.songSlug;
    if(store&&slug&&!this.editedThisLoad)void this.load(slug,this.loadGeneration);
    if(store&&this.pending.length)void this.persistLoop();
  }

  enterSong(slug:string):void {
    if(this.state.songSlug===slug)return;
    const generation=++this.loadGeneration;
    this.editedThisLoad=false;
    this.set({songSlug:slug,...DEFAULT_SONG_PLAYBACK_SETTINGS});
    if(this.store)void this.load(slug,generation);
  }

  clearSession():void {
    this.loadGeneration++;
    this.editedThisLoad=false;
    this.set({songSlug:null,...DEFAULT_SONG_PLAYBACK_SETTINGS});
  }

  updateLockInMajor(value:boolean):void {this.edit({lockInMajor:value});}
  updateTempoPercent(value:number):void {
    this.edit({tempoPercent:Number.isFinite(value)?Math.min(Math.max(value,0),200):DEFAULT_PLAYBACK_TEMPO_PERCENT});
  }
  updateArpeggioOptionIndex(index:number):void {
    this.edit({arpeggioOptionIndex:Number.isInteger(index)&&index>=0&&index<PLAYBACK_ARPEGGIOS.length?index:DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX});
  }
  updateMelodyChordBalance(value:number):void {
    this.edit({melodyChordBalance:Number.isFinite(value)?Math.min(Math.max(value,0),1):DEFAULT_MELODY_CHORD_BALANCE});
  }
  updateInstrument(waveform:Waveform):void {this.edit({instrument:waveform});}
  updateTranspose(value:number):void {
    this.edit({transpose:Math.min(Math.max(Math.trunc(value),PLAYBACK_TRANSPOSE_MIN),PLAYBACK_TRANSPOSE_MAX)});
  }
  updateRootDegreeCue(value:PlaybackRootDegreeCue):void {this.edit({rootDegreeCue:value});}
  updateVoiceVolume(value:number):void {
    this.edit({voiceVolume:Number.isFinite(value)?Math.min(Math.max(value,0),1):DEFAULT_PLAYBACK_VOICE_VOLUME});
  }
  updateLoopSection(value:boolean):void {this.edit({loopSection:value});}

  /** Test helper: resolves once queued writes reach the store. */
  async flushForTests():Promise<void> {while(this.persisting||this.pending.length&&this.store)await Promise.resolve();}

  private set(next:SongPlaybackSettingsSnapshot):void {
    this.state=Object.freeze(next);
    for(const listener of [...this.listeners])listener();
  }

  private async load(slug:string,generation:number):Promise<void> {
    const store=this.store;if(!store)return;
    let row:SongPlaybackSettingsRow|null=null;
    try{row=await store.get(slug);}catch{return;}
    if(generation!==this.loadGeneration||this.editedThisLoad||this.state.songSlug!==slug||!row)return;
    const {slug:_slug,...values}=row;void _slug;
    this.set({songSlug:slug,...values});
  }

  private edit(patch:Partial<SongPlaybackSettingsValues>):void {
    const slug=this.state.songSlug;if(slug===null)return;
    this.set({...this.state,...patch});
    this.editedThisLoad=true;
    const {songSlug:_songSlug,...values}=this.state;void _songSlug;
    const last=this.pending.at(-1);
    if(last&&last.slug===slug)this.pending.pop();
    this.pending.push(Object.freeze({slug,...values}));
    void this.persistLoop();
  }

  private async persistLoop():Promise<void> {
    if(this.persisting)return;
    const store=this.store;if(!store)return;
    this.persisting=true;
    try{
      while(this.pending.length){
        const next=this.pending.shift()!;
        try{await store.upsert(next);}catch{/* A failed write keeps the in-memory value; the next edit retries. */}
      }
    }finally{this.persisting=false;}
  }
}

export const appSongPlaybackSettings=new SongPlaybackSettingsSession();
