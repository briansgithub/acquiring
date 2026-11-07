/** Frozen 801cf798 PlaybackView.kt timeline geometry 309-311 / 441-509 / 1122-1321.
 * CSS px maps 1:1 to Android dp for pixelsPerBeat (60), melody lane (88), chord lane (40),
 * playhead stroke (2). Native noteHeight clamp is in raw px after dp.toPx, so a density-3
 * device yields ~9.4px staff vs 5 CSS px here; that mapping is explicit, not physical-mm
 * identity or T27 proof. Hidden in root-only/simple. Tap seeks currentBeat+(tapX-centerX)/60.
 * No inertia/coast, Roman painter, pitch-score overlay, or spacer-alignment hacks.
 */
import type {ExtractedSection,MelodyNote} from '../../contracts';
import {getKeys,keyAtBeat} from '../../domain/data';
import {doubleOrUndefined} from '../../domain/data/primitives';
import {nativeBooleanOrNull} from '../../domain/music/native-json';
import {getRawDegree,ionianContextStaffDegree,relativeIonianKey} from '../../domain/music';

export const TIMELINE_PIXELS_PER_BEAT = 60;
export const TIMELINE_MELODY_LANE_PX = 88;
export const TIMELINE_CHORD_LANE_PX = 40;
export const TIMELINE_HEIGHT_PX = TIMELINE_MELODY_LANE_PX + TIMELINE_CHORD_LANE_PX;
export const TIMELINE_PLAYHEAD_STROKE_PX = 2;
export const TIMELINE_TAP_SLOP_PX = 18;
export const TIMELINE_STAFF_DIVISIONS = 28;
export const TIMELINE_NOTE_HEIGHT_MIN_PX = 5;
export const TIMELINE_NOTE_HEIGHT_MAX_PX = 10;

export interface TimelineMelodyVisual {
  readonly beat: number;
  readonly duration: number;
  readonly staffDegree: number;
}

export interface TimelineChordVisual {
  readonly beat: number;
  readonly duration: number;
  readonly rest: boolean;
}

export interface TimelineLaneRect {
  readonly beat: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly active: boolean;
  readonly culled: boolean;
}

export interface PlaybackTimelineLayout {
  readonly visible: boolean;
  readonly width: number;
  readonly height: number;
  readonly pixelsPerBeat: number;
  readonly noteHeight: number;
  readonly playheadX: number;
  readonly translationX: number;
  readonly melody: readonly TimelineLaneRect[];
  readonly chords: readonly TimelineLaneRect[];
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  return value;
}

function nativeInt(value: number, label: string): number {
  if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
    throw new RangeError(`${label} must be a native Int.`);
  }
  return value;
}

export function timelineNoteHeightPx(melodyLanePx = TIMELINE_MELODY_LANE_PX): number {
  const lane = finite(melodyLanePx, 'melodyLanePx');
  return Math.min(TIMELINE_NOTE_HEIGHT_MAX_PX, Math.max(TIMELINE_NOTE_HEIGHT_MIN_PX, lane / TIMELINE_STAFF_DIVISIONS));
}

export function melodyTimelineStaffDegree(sd: string, relativeOctave: number): number {
  return getRawDegree(sd) + nativeInt(relativeOctave, 'relativeOctave') * 7;
}

export function buildMelodyTimelineVisuals(
  melody: readonly MelodyNote[],
  section: ExtractedSection,
  relativeMajor: boolean,
): readonly TimelineMelodyVisual[] {
  const keys = getKeys(section);
  const ionian = relativeIonianKey(keyAtBeat(keys, 1));
  const visuals: TimelineMelodyVisual[] = [];
  for (const note of melody) {
    if (note.isRest) continue;
    const sourceKey = keyAtBeat(keys, note.beat);
    const raw = melodyTimelineStaffDegree(note.sd, note.octave);
    const staffDegree = relativeMajor ? (ionianContextStaffDegree(note.sd, note.octave, sourceKey, ionian) ?? raw) : raw;
    visuals.push(Object.freeze({beat: note.beat, duration: note.duration, staffDegree}));
  }
  return Object.freeze(visuals);
}

export function buildChordTimelineVisuals(section: ExtractedSection): readonly TimelineChordVisual[] {
  return Object.freeze((section.chords ?? []).map((chord) => {
    const beat = doubleOrUndefined(chord.beat) ?? 1;
    const duration = doubleOrUndefined(chord.duration) ?? 1;
    const rest = nativeBooleanOrNull(chord.isRest) === true || nativeBooleanOrNull(chord.rest) === true;
    return Object.freeze({beat, duration, rest});
  }));
}

function rect(
  beat: number,
  duration: number,
  y: number,
  height: number,
  currentBeat: number,
  translationX: number,
  width: number,
  pixelsPerBeat: number,
): TimelineLaneRect {
  const x = (beat - 1) * pixelsPerBeat;
  const w = duration * pixelsPerBeat;
  const screenX = x + translationX;
  return Object.freeze({
    beat,
    x,
    y,
    width: w,
    height,
    active: currentBeat >= beat && currentBeat < beat + duration,
    culled: screenX + w < 0 || screenX > width,
  });
}

export function layoutPlaybackTimeline(input: {
  readonly width: number;
  readonly currentBeat: number;
  readonly rootOnly: boolean;
  readonly melody: readonly TimelineMelodyVisual[];
  readonly chords: readonly TimelineChordVisual[];
}): PlaybackTimelineLayout {
  const width = finite(input.width, 'width');
  const currentBeat = finite(input.currentBeat, 'currentBeat');
  if (width < 0) throw new RangeError('width must be >= 0.');
  if (input.rootOnly) {
    return Object.freeze({
      visible: false, width, height: 0, pixelsPerBeat: TIMELINE_PIXELS_PER_BEAT,
      noteHeight: timelineNoteHeightPx(), playheadX: width / 2, translationX: 0,
      melody: Object.freeze([]), chords: Object.freeze([]),
    });
  }
  const pixelsPerBeat = TIMELINE_PIXELS_PER_BEAT;
  const noteHeight = timelineNoteHeightPx();
  const melodyBaseY = TIMELINE_MELODY_LANE_PX / 2;
  const playheadX = width / 2;
  const translationX = playheadX - (currentBeat - 1) * pixelsPerBeat;
  const melody = Object.freeze(input.melody.map((note) => rect(
    finite(note.beat, 'melody.beat'), finite(note.duration, 'melody.duration'),
    melodyBaseY - note.staffDegree * noteHeight, noteHeight,
    currentBeat, translationX, width, pixelsPerBeat,
  )));
  const chords = Object.freeze(input.chords.map((chord) => rect(
    finite(chord.beat, 'chord.beat'), finite(chord.duration, 'chord.duration'),
    TIMELINE_MELODY_LANE_PX, TIMELINE_CHORD_LANE_PX,
    currentBeat, translationX, width, pixelsPerBeat,
  )));
  return Object.freeze({
    visible: true, width, height: TIMELINE_HEIGHT_PX, pixelsPerBeat, noteHeight,
    playheadX, translationX, melody, chords,
  });
}

/** Frozen PlaybackView tap: currentBeat + (tapX - width/2) / pixelsPerBeat, clamped 1..endBeat. */
export function timelineTapBeat(currentBeat:number,tapX:number,width:number,endBeat:number,pixelsPerBeat=TIMELINE_PIXELS_PER_BEAT):number {
  const span=finite(width,'width'),rate=finite(pixelsPerBeat,'pixelsPerBeat');
  if(span<=0||rate<=0)throw new RangeError('width and pixelsPerBeat must be > 0.');
  const beat=finite(currentBeat,'currentBeat')+(finite(tapX,'tapX')-span/2)/rate;
  return Math.min(finite(endBeat,'endBeat'),Math.max(1,beat));
}
