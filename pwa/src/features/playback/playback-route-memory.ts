/** Frozen 801cf798 MainActivity + PlaybackController route-position memory.
 * Tempo 100% and arpeggio index 3 (`remember(selectedSong?.slug)`) reset when the
 * song is left. Transpose and session waveform are process-wide. Beat survives
 * Info because native `PlaybackController.load` no-ops on unchanged `slug:section`.
 * Mix / Lock in Major / root-only stay Compose-local and reset on remount.
 * Settings `selectAsDefault` instrument persistence remains T21.
 */
import {DEFAULT_WAVEFORM,Waveform} from '../../audio/synth';
import {DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX,DEFAULT_PLAYBACK_TEMPO_PERCENT} from './controller';

export interface PlaybackSongMemory {
  readonly sectionId:string;readonly beat:number;readonly tempoPercent:number;readonly arpeggioIndex:number;
}
export interface PlaybackRouteEntry extends PlaybackSongMemory {
  readonly transpose:number;readonly waveform:Waveform;
}

let selectedSlug:string|null=null;
let transpose=0;
let waveform:Waveform=DEFAULT_WAVEFORM;
const bySlug=new Map<string,PlaybackSongMemory>();
let lastIdentity:{readonly slug:string;readonly sectionId:string;readonly beat:number}|null=null;

export function sessionTranspose():number {return transpose;}
export function sessionWaveform():Waveform {return waveform;}
export function setSessionTranspose(value:number):void {transpose=value;}
export function setSessionWaveform(value:Waveform):void {waveform=value;}

export function capturePlayback(slug:string,memory:PlaybackSongMemory):void {
  const stored=Object.freeze({sectionId:memory.sectionId,beat:memory.beat,tempoPercent:memory.tempoPercent,arpeggioIndex:memory.arpeggioIndex});
  bySlug.set(slug,stored);
  lastIdentity=Object.freeze({slug,sectionId:memory.sectionId,beat:memory.beat});
}

export function leavePlaybackSong():void {selectedSlug=null;}

export function enterPlayback(slug:string,firstSectionId:string,sectionIds:readonly string[]):PlaybackRouteEntry {
  const remembered=bySlug.get(slug);
  const sameSong=selectedSlug===slug;
  selectedSlug=slug;
  const sectionId=sameSong&&remembered&&sectionIds.includes(remembered.sectionId)?remembered.sectionId:firstSectionId;
  const beat=lastIdentity?.slug===slug&&lastIdentity.sectionId===sectionId?lastIdentity.beat:1;
  const tempoPercent=sameSong&&remembered?remembered.tempoPercent:DEFAULT_PLAYBACK_TEMPO_PERCENT;
  const arpeggioIndex=sameSong&&remembered?remembered.arpeggioIndex:DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX;
  return Object.freeze({sectionId,beat,tempoPercent,arpeggioIndex,transpose,waveform});
}

export function resetPlaybackRouteMemory():void {
  selectedSlug=null;transpose=0;waveform=DEFAULT_WAVEFORM;bySlug.clear();lastIdentity=null;
}
