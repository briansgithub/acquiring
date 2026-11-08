/** Pinned PlaybackView simpleRootPitchTarget: source interval register, optional first-key context. */
import type {ExtractedSection} from '../../contracts';
import {getKeys,keyAtBeat} from '../../domain/data';
import {doubleOrUndefined} from '../../domain/data/primitives';
import {ionianContextDegreeLabel,ionianContextPreviewAudioNote,relativeIonianKey} from '../../domain/music';
import {PlaybackActiveEventIndex} from './event-state';
import {preparePlaybackSection} from './section-model';
import type {ResolvedPersistentPitchTarget} from './persistent-pitch';

export class PersistentRootTargets {
  private readonly index:PlaybackActiveEventIndex;
  private readonly ionianKey;
  constructor(section:ExtractedSection){
    this.index=new PlaybackActiveEventIndex(section,preparePlaybackSection(section).melody);
    this.ionianKey=relativeIonianKey(keyAtBeat(getKeys(section),1));
  }
  atBeat(beat:number,majorLocked:boolean):ResolvedPersistentPitchTarget|null{
    const chord=this.index.chordAtBeat(beat);if(!chord)return null;
    const onset=doubleOrUndefined(chord.beat)??1;
    const root=this.index.chordRootIntervalAtBeat(onset===0?1:onset);if(!root)return null;
    const sourcePitch=root.currentIntervalPitch;
    const sourceMidi=majorLocked?(ionianContextPreviewAudioNote(sourcePitch,this.ionianKey)??sourcePitch.toAudioNoteNumber()):sourcePitch.toAudioNoteNumber();
    return sourceMidi>0?{sourceMidi,label:majorLocked?ionianContextDegreeLabel(root.current.pitch,this.ionianKey):root.currentDegreeLabel,position:{kind:'simple-root'}}:null;
  }
}

/** Native PitchGauge: cents/200 clamped at ±1.2; 8dp bar centered on its position. */
export function rootGaugeBarTop(cents:number):string{
  const normalized=Math.max(-1.2,Math.min(1.2,cents/200));
  return `calc(${(1-normalized)*50}% + ${normalized*4-4}px)`;
}
