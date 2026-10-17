import type {ExtractedSection,JsonObject,MelodyNote} from '../../contracts';
import {getKeys,keyAtBeat} from '../../domain/data';
import {doubleOrUndefined} from '../../domain/data/primitives';
import {nativeBooleanOrNull} from '../../domain/music/native-json';
import {calculateNamedInterval,getDegreeLabelFromSpelling,IntervalDirection,resolveChordRoot,resolveScaleDegreePitch,type NamedInterval,type ResolvedChordRoot,type SpelledPitch} from '../../domain/music';
import {STREAM_LIMITS} from '../../audio/synth';

export interface ChordRootIntervalState {
  readonly previous:ResolvedChordRoot|null;readonly current:ResolvedChordRoot;
  readonly previousIntervalPitch:SpelledPitch|null;readonly currentIntervalPitch:SpelledPitch;
  readonly interval:NamedInterval|null;readonly previousDegreeLabel:string|null;readonly currentDegreeLabel:string;
}
export interface MelodyIntervalState {
  readonly previous:SpelledPitch;readonly current:SpelledPitch;readonly interval:NamedInterval;
  readonly previousDegreeLabel:string;readonly currentDegreeLabel:string;readonly contentDescription:string;
}
export type MelodyPitchCardDisplayMode='HIDDEN'|'SINGLE'|'INTERVAL';
export type MelodyPitchCardVerticalPosition='TOP'|'CENTER'|'BOTTOM';
export interface MelodyPitchCard {readonly role:'PREVIOUS'|'CURRENT';readonly pitch:SpelledPitch;readonly scaleDegreeLabel:string;readonly verticalPosition:MelodyPitchCardVerticalPosition}
const samePitch=(a:SpelledPitch,b:SpelledPitch)=>a.letter.name===b.letter.name&&a.accidental===b.accidental&&a.octave===b.octave;
export const showsRootOnlyPrevious=(previous:SpelledPitch|null):boolean=>previous!==null;
export const showsRootOnlyInterval=(previous:SpelledPitch|null,current:SpelledPitch|null,interval:NamedInterval|null):boolean=>previous!==null&&current!==null&&interval!==null&&!samePitch(previous,current);
export function melodyPitchCardDisplayMode(current:SpelledPitch|null,state:MelodyIntervalState|null):MelodyPitchCardDisplayMode {
  return current===null?'HIDDEN':state===null||samePitch(state.previous,state.current)?'SINGLE':'INTERVAL';
}
export const melodyCurrentCardVerticalPosition=(mode:MelodyPitchCardDisplayMode):MelodyPitchCardVerticalPosition=>mode==='SINGLE'?'CENTER':'TOP';
export function buildMelodyPitchCards(state:MelodyIntervalState,previousLabel=state.previousDegreeLabel,currentLabel=state.currentDegreeLabel):readonly MelodyPitchCard[] {
  const ascending=state.interval.direction===IntervalDirection.ASCENDING;
  return Object.freeze([
    Object.freeze({role:'PREVIOUS' as const,pitch:state.previous,scaleDegreeLabel:previousLabel,verticalPosition:ascending?'BOTTOM' as const:'TOP' as const}),
    Object.freeze({role:'CURRENT' as const,pitch:state.current,scaleDegreeLabel:currentLabel,verticalPosition:ascending?'TOP' as const:'BOTTOM' as const}),
  ]);
}
interface Timed<T>{readonly sourceIndex:number;readonly onset:number;readonly duration:number;readonly value:T}
const normalize=(beat:number)=>beat===0?1:beat;
const rest=(chord:JsonObject)=>nativeBooleanOrNull(chord.isRest)===true||nativeBooleanOrNull(chord.rest)===true;
function compare<T>(a:Timed<T>,b:Timed<T>):number {
  // Kotlin Double.compareTo places NaN last. Preserve original source order at tied onsets.
  const difference=Number.isNaN(a.onset)?Number.isNaN(b.onset)?0:1:Number.isNaN(b.onset)?-1:a.onset===b.onset?0:a.onset<b.onset?-1:1;
  return difference||a.sourceIndex-b.sourceIndex;
}
function activeIndex<T>(events:readonly Timed<T>[],beat:number):number {
  if(!Number.isFinite(beat))throw new RangeError('Playback query beat must be finite.');
  let low=0,high=events.length-1,last=-1;
  while(low<=high){const middle=(low+high)>>>1;if(events[middle].onset<=beat){last=middle;low=middle+1;}else high=middle-1;}
  for(let index=last;index>=0;index--)if(beat<events[index].onset+events[index].duration)return index;
  return -1;
}
/** Frozen native PlaybackIntervalState queries. Build/sort once per section, never per audio frame.
 * Native source-object identity is retained; callers treat section/melody as readonly, just like
 * the existing catalog detail snapshot. Timing and key metadata are captured at construction.
 * Resource caps and finite query validation are explicit browser extensions, not native claims.
 */
export class PlaybackActiveEventIndex {
  private readonly chords:readonly Timed<JsonObject>[];
  private readonly notes:readonly Timed<MelodyNote>[];
  private readonly keys:ReturnType<typeof getKeys>;
  constructor(section:ExtractedSection,melody:readonly MelodyNote[]){
    if(section.chords.length+melody.length>STREAM_LIMITS.events)throw new RangeError('Playback event limit exceeded.');
    if(Array.isArray(section.metadata?.keys)&&section.metadata.keys.length>STREAM_LIMITS.events)throw new RangeError('Playback key limit exceeded.');
    this.keys=getKeys(section);
    this.chords=section.chords.map((value,sourceIndex)=>({value,sourceIndex,onset:normalize(doubleOrUndefined(value.beat)??1),duration:doubleOrUndefined(value.duration)??1})).sort(compare);
    this.notes=melody.map((value,sourceIndex)=>({value,sourceIndex,onset:normalize(value.beat),duration:value.duration})).sort(compare);
  }
  chordAtBeat(beat:number):JsonObject|null{return this.chords[activeIndex(this.chords,beat)]?.value??null;}
  melodyNoteAtBeat(beat:number):MelodyNote|null{return this.notes[activeIndex(this.notes,beat)]?.value??null;}
  chordRootIntervalAtBeat(beat:number):ChordRootIntervalState|null {
    const index=activeIndex(this.chords,beat),active=this.chords[index];
    if(!active||active.duration<=0||rest(active.value))return null;
    const current=resolveChordRoot(active.value,keyAtBeat(this.keys,active.onset));if(!current)return null;
    let previous:ResolvedChordRoot|null=null;
    for(let i=index-1;i>=0;i--){const event=this.chords[i];
      if(event.onset>=active.onset||event.duration<=0||rest(event.value))continue;
      previous=resolveChordRoot(event.value,keyAtBeat(this.keys,event.onset));if(previous)break;
    }
    return Object.freeze({previous,current,previousIntervalPitch:previous?.simpleModePitch??null,currentIntervalPitch:current.simpleModePitch,
      interval:previous?calculateNamedInterval(previous.simpleModePitch,current.simpleModePitch):null,
      previousDegreeLabel:previous?getDegreeLabelFromSpelling(previous.pitch,previous.sourceKey):null,currentDegreeLabel:getDegreeLabelFromSpelling(current.pitch,current.sourceKey)});
  }
  melodyIntervalAtBeat(beat:number):MelodyIntervalState|null {
    const index=activeIndex(this.notes,beat),active=this.notes[index];
    if(!active||active.value.isRest||active.duration<=0)return null;
    const current=resolveScaleDegreePitch(active.value.sd,active.value.octave,keyAtBeat(this.keys,active.onset));if(!current)return null;
    const before=this.notes[index-1];
    if(!before||before.value.isRest||before.duration<=0)return null;
    const previous=resolveScaleDegreePitch(before.value.sd,before.value.octave,keyAtBeat(this.keys,before.onset));if(!previous)return null;
    const interval=calculateNamedInterval(previous,current);
    return Object.freeze({previous,current,interval,previousDegreeLabel:getDegreeLabelFromSpelling(previous,keyAtBeat(this.keys,before.onset)),currentDegreeLabel:getDegreeLabelFromSpelling(current,keyAtBeat(this.keys,active.onset)),
      contentDescription:`Play melody interval ${previous.displayName} to ${current.displayName}, ${interval.spokenName}`});
  }
}
