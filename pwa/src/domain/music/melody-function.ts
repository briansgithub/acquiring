/** Native MelodyFunction.kt + SingingMelodyRegister.kt at Android 3c887223 (N08).
 * Classifies the sounding melody note against the active chord (chord member, passing, neighbor, suspension...),
 * gives the one- or two-word spoken cue, and places melody/spoken pitches in singable registers.
 */
import type { ExtractedSection, JsonObject, KeyInfo, MelodyNote } from '../../contracts';
import { getKeyAtBeat } from '../data';
import { doubleOrUndefined } from '../data/primitives';
import { interpret } from './chord-interpretation';
import { nativeBooleanOrNull } from './native-json';
import { SpelledPitch } from './spelled-pitch';
import { getDegreeLabelFromSpelling, resolveScaleDegreePitch } from './theory';

export interface MelodyFunctionChordTone { readonly pitchClass: number; readonly label: string }
export interface MelodyFunctionInput {
  readonly currentPitch: SpelledPitch | null;
  readonly scaleDegreeLabel: string;
  readonly key: KeyInfo;
  readonly chordTones: readonly MelodyFunctionChordTone[] | null;
  readonly previousPitch?: SpelledPitch | null;
  readonly nextPitch?: SpelledPitch | null;
  readonly previousIsCurrentChordTone?: boolean;
  readonly nextIsCurrentChordTone?: boolean;
  readonly currentWasPreviousChordTone?: boolean;
  readonly currentWillBeNextChordTone?: boolean;
  readonly arrivedBeforeNextChord?: boolean;
  readonly heldAcrossChordChange?: boolean;
  readonly chordChangesDuringNote?: number;
}
/** Card color: green sits (STABLE), blue leans (LEANING), amber moves (MOVING), red is outside the chord (OUTSIDE). */
export type MelodyFunctionTone = 'NEUTRAL' | 'STABLE' | 'LEANING' | 'MOVING' | 'OUTSIDE';
export interface MelodyFunctionDescription { readonly title: string; readonly detail: string; readonly tone: MelodyFunctionTone }

const floorMod = (a: number, n: number) => ((a % n) + n) % n;
const pitchClassOf = (pitch: SpelledPitch) => floorMod(pitch.chromaticPosition, 12);
/** Kotlin `filter(Char::isDigit).toIntOrNull()`. */
const digits = (label: string) => [...label].filter((char) => /\p{Nd}/u.test(char)).join('');
const digitInt = (label: string): number | null => { const value = digits(label); return /^\d+$/.test(value) ? Number(value) : null; };
const lowerFirst = (text: string) => text ? text[0]!.toLowerCase() + text.slice(1) : text;
const upperFirst = (text: string) => text ? text[0]!.toUpperCase() + text.slice(1) : text;
const moving = (title: string, detail: string): MelodyFunctionDescription => ({ title, detail, tone: 'MOVING' });
const roleTitle = (prefix: string, role: string) => prefix ? prefix + lowerFirst(role) : role;
const scaleDegreeTitle = (label: string) => `Scale degree ${digits(label) || label}`;
const spokenScaleDegree = (label: string) => `scale degree ${digits(label) || label}`;
const scalePitchClass = (key: KeyInfo, degree: number) => {
  const pitch = resolveScaleDegreePitch(String(degree), 0, key);
  return pitch ? pitchClassOf(pitch) : null;
};
const isPitchInKey = (pitchClass: number, key: KeyInfo) => [1, 2, 3, 4, 5, 6, 7].some((degree) => scalePitchClass(key, degree) === pitchClass);

function scaleDegreeTone(label: string): MelodyFunctionTone {
  const degree = digitInt(label);
  return degree === 1 || degree === 3 || degree === 5 ? 'STABLE' : degree === 2 || degree === 4 || degree === 6 || degree === 7 ? 'MOVING' : 'NEUTRAL';
}

function melodicMovement(from: SpelledPitch, to: SpelledPitch) {
  const staffDistance = Math.abs(to.staffPosition - from.staffPosition);
  return { direction: Math.sign(to.chromaticPosition - from.chromaticPosition), isStep: staffDistance === 1, isLeap: staffDistance >= 2 };
}

const MEMBER_NAMES: Record<number, string> = {
  1: 'root', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth', 7: 'seventh', 8: 'octave', 9: 'ninth', 10: 'tenth', 11: 'eleventh', 13: 'thirteenth',
};

function describeChordMember(chordLabel: string, input: MelodyFunctionInput, currentPc: number): MelodyFunctionDescription {
  const degree = digitInt(chordLabel);
  const memberName = (degree !== null ? MEMBER_NAMES[degree] : undefined) ?? 'tone';
  const title = `Chord ${memberName}`;
  const keyDegree = digitInt(input.scaleDegreeLabel);
  const tonic = SpelledPitch.parse(input.key.tonic, 4);
  const tonicPc = tonic ? pitchClassOf(tonic) : null;
  const nextPc = input.nextPitch ? pitchClassOf(input.nextPitch) : null;
  let keyAdvice = '';
  if (tonicPc !== null && floorMod(tonicPc - currentPc, 12) === 1) {
    keyAdvice = ` This is also the leading tone of the key. Let it rise a half step to 1.${nextPc === tonicPc ? ' The next note does.' : ''}`;
  } else if (keyDegree === 4 && isPitchInKey(currentPc, input.key)) {
    keyAdvice = ` This is 4 in the key. It wants to fall to 3.${nextPc === scalePitchClass(input.key, 3) ? ' The next note does.' : ''}`;
  } else if ((keyDegree === 1 || keyDegree === 3 || keyDegree === 5) && isPitchInKey(currentPc, input.key)) {
    keyAdvice = ' It is home in the chord and in the key.';
  }
  const action = degree === 1 || degree === 3 || degree === 5 ? 'Sit on this.'
    : degree === 4 ? 'Lean on this. It belongs to the chord and wants to fall to the third.'
      : degree === 7 || degree === 9 || degree === 11 || degree === 13 ? 'Lean on this. It belongs to the chord and wants to move.'
        : 'This note belongs to the chord.';
  const tone: MelodyFunctionTone = keyAdvice.includes('leading tone') || keyAdvice.includes('wants to fall to 3') ? 'MOVING'
    : degree === 1 || degree === 3 || degree === 5 ? 'STABLE' : 'LEANING';
  return { title, detail: action + keyAdvice, tone };
}

export function describeMelodyFunction(input: MelodyFunctionInput): MelodyFunctionDescription {
  const current = input.currentPitch;
  if (!current) return { title: 'Rest', detail: 'No melody note right now.', tone: 'NEUTRAL' };
  const currentPc = pitchClassOf(current);
  const chordTones = input.chordTones;
  if (!chordTones) {
    return { title: scaleDegreeTitle(input.scaleDegreeLabel),
      detail: `No chord under this note. It is ${spokenScaleDegree(input.scaleDegreeLabel)} in the key.`, tone: scaleDegreeTone(input.scaleDegreeLabel) };
  }
  const chordTone = chordTones.find((tone) => tone.pitchClass === currentPc);
  if (chordTone) return describeChordMember(chordTone.label, input, currentPc);

  const chromaticPrefix = isPitchInKey(currentPc, input.key) ? '' : 'Chromatic ';
  const previous = input.previousPitch ?? null, next = input.nextPitch ?? null;
  const previousMovement = previous ? melodicMovement(previous, current) : null;
  const nextMovement = next ? melodicMovement(current, next) : null;

  if (input.currentWillBeNextChordTone && input.arrivedBeforeNextChord) {
    return moving(roleTitle(chromaticPrefix, 'Anticipation'), 'You are early. This note belongs to the next chord.');
  }
  if (input.currentWasPreviousChordTone && input.heldAcrossChordChange) {
    if (nextMovement?.isStep) {
      return nextMovement.direction < 0
        ? moving(roleTitle(chromaticPrefix, 'Suspension'), 'This note was in the previous chord. Let it fall by step.')
        : moving(roleTitle(chromaticPrefix, 'Retardation'), 'This note was in the previous chord. Let it rise by step.');
    }
    return moving(roleTitle(chromaticPrefix, 'Held over'), 'The chord changed under a note you are still holding.');
  }
  if (previous && next && pitchClassOf(previous) === pitchClassOf(next) && previousMovement?.isStep && nextMovement?.isStep) {
    return moving(roleTitle(chromaticPrefix, `${previousMovement.direction > 0 ? 'Upper' : 'Lower'} neighbor`), 'Step away and come back. Do not settle here.');
  }
  if (previousMovement?.isStep && nextMovement?.isStep && previousMovement.direction === nextMovement.direction
    && input.previousIsCurrentChordTone && input.nextIsCurrentChordTone) {
    return moving(roleTitle(chromaticPrefix, 'Passing tone'),
      `Keep moving ${nextMovement.direction > 0 ? 'upward' : 'downward'}. This note connects the chord tones on either side.`);
  }
  if (previousMovement?.isLeap && nextMovement?.isStep && previousMovement.direction !== nextMovement.direction && input.nextIsCurrentChordTone) {
    return moving(roleTitle(chromaticPrefix, 'Appoggiatura'), 'You leapt onto a tension. Step off it onto the chord tone.');
  }
  if (previousMovement?.isStep && nextMovement?.isLeap && previousMovement.direction !== nextMovement.direction && input.previousIsCurrentChordTone) {
    return moving(roleTitle(chromaticPrefix, 'Escape tone'), 'A short step off the chord, then a leap onward.');
  }
  if (next && next.chromaticPosition - current.chromaticPosition === 1 && input.nextIsCurrentChordTone) {
    return moving(roleTitle(chromaticPrefix, 'Leading tone'), 'A half step under the next note. Let it rise.');
  }
  if ((input.chordChangesDuringNote ?? 0) > 1) {
    return moving(roleTitle(chromaticPrefix, 'Pedal tone'), 'The melody holds still while the chords move.');
  }
  return { title: roleTitle(chromaticPrefix, 'Color tone'),
    detail: 'This note is outside the chord. Hear it against the root, then follow the melody.', tone: 'OUTSIDE' };
}

const SPOKEN_DEGREE_NUMBERS: Record<string, string> = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven' };

export function spokenMelodyFunction(description: MelodyFunctionDescription): string | null {
  if (description.title === 'Rest') return null;
  const chromatic = description.title.startsWith('Chromatic ');
  const role = upperFirst(chromatic ? description.title.slice('Chromatic '.length) : description.title);
  let words: string | null;
  switch (role) {
    case 'Passing tone': words = chromatic ? 'chromatic passing' : 'passing'; break;
    case 'Upper neighbor': case 'Lower neighbor': words = role.toLowerCase(); break;
    case 'Color tone': words = chromatic ? 'chromatic color' : 'color'; break;
    case 'Escape tone': words = 'escape'; break;
    case 'Leading tone': words = 'leading'; break;
    case 'Pedal tone': words = 'pedal'; break;
    case 'Held over': words = 'held over'; break;
    case 'Chord octave': words = 'root'; break;
    case 'Chord tenth': words = 'third'; break;
    default:
      words = role.startsWith('Chord ') ? role.slice('Chord '.length).toLowerCase()
        : role.startsWith('Scale degree ') ? SPOKEN_DEGREE_NUMBERS[role.slice('Scale degree '.length)] ?? null
          : role.toLowerCase();
  }
  return words && words.split(' ').length <= 2 ? words : null;
}

/** Native melodyFunctionCardText: the one- or two-word caption, or "Rest". */
export const melodyFunctionCardText = (description: MelodyFunctionDescription) => {
  const words = spokenMelodyFunction(description);
  return words ? upperFirst(words) : 'Rest';
};

const normalizeBeat = (beat: number) => beat === 0 ? 1 : beat;
const isRestChord = (chord: JsonObject | null | undefined) => !chord || nativeBooleanOrNull(chord.isRest) === true || nativeBooleanOrNull(chord.rest) === true;
const playable = (note: MelodyNote | null | undefined): note is MelodyNote => !!note && !note.isRest && note.duration > 0;
interface TimedChord { readonly sourceIndex: number; readonly onset: number; readonly duration: number; readonly chord: JsonObject }
function compareTimed(a: { onset: number; sourceIndex: number }, b: { onset: number; sourceIndex: number }) {
  const difference = Number.isNaN(a.onset) ? Number.isNaN(b.onset) ? 0 : 1 : Number.isNaN(b.onset) ? -1 : a.onset === b.onset ? 0 : a.onset < b.onset ? -1 : 1;
  return difference || a.sourceIndex - b.sourceIndex;
}
function timedChords(section: ExtractedSection): TimedChord[] {
  return section.chords.map((chord, sourceIndex) => ({ sourceIndex, chord,
    onset: normalizeBeat(doubleOrUndefined(chord.beat) ?? 1), duration: doubleOrUndefined(chord.duration) ?? 1 })).sort(compareTimed);
}

/** Native activeChordAtBeat (PlaybackActiveEventIndex.chordAtBeat): last chord at or before the beat that still sounds. */
export function activeChordAtBeat(section: ExtractedSection, beat: number, chords = timedChords(section)): JsonObject | null {
  let low = 0, high = chords.length - 1, last = -1;
  while (low <= high) { const middle = (low + high) >>> 1; if (chords[middle]!.onset <= beat) { last = middle; low = middle + 1; } else high = middle - 1; }
  for (let index = last; index >= 0; index--) if (beat < chords[index]!.onset + chords[index]!.duration) return chords[index]!.chord;
  return null;
}

export function buildMelodyFunctionInput(section: ExtractedSection, melody: readonly MelodyNote[], activeNote: MelodyNote | null,
  activeChord: JsonObject | null, chords = timedChords(section)): MelodyFunctionInput {
  const note = playable(activeNote) ? activeNote : null;
  const notePitch = note ? resolveScaleDegreePitch(note.sd, note.octave, getKeyAtBeat(section, normalizeBeat(note.beat))) : null;
  const key = note ? getKeyAtBeat(section, normalizeBeat(note.beat)) : getKeyAtBeat(section, 1);
  if (!note || !notePitch) return { currentPitch: null, scaleDegreeLabel: '', key, chordTones: [] };

  const ordered = melody.map((value, index) => ({ value, sourceIndex: index, onset: normalizeBeat(value.beat) })).sort(compareTimed);
  let activeIndex = ordered.findIndex((entry) => entry.value === activeNote);
  if (activeIndex < 0) activeIndex = ordered.findIndex((entry) => JSON.stringify(entry.value) === JSON.stringify(activeNote));
  const connectedPitch = (index: number) => {
    const adjacent = ordered[index]?.value;
    return playable(adjacent) ? resolveScaleDegreePitch(adjacent.sd, adjacent.octave, getKeyAtBeat(section, normalizeBeat(adjacent.beat))) : null;
  };
  const previousPitch = connectedPitch(activeIndex - 1), nextPitch = connectedPitch(activeIndex + 1);

  let currentChordIndex = chords.findIndex((event) => event.chord === activeChord);
  if (currentChordIndex < 0) currentChordIndex = chords.findIndex((event) => JSON.stringify(event.chord) === JSON.stringify(activeChord));
  const currentEvent = chords[currentChordIndex], previousEvent = chords[currentChordIndex - 1], nextEvent = chords[currentChordIndex + 1];
  const tones = (event: TimedChord | undefined): MelodyFunctionChordTone[] | null => {
    if (!event || isRestChord(event.chord)) return null;
    const interpretation = interpret(event.chord, getKeyAtBeat(section, event.onset));
    return interpretation.midi.map((midi, index) => ({ pitchClass: floorMod(midi, 12), label: interpretation.toneLabels[index] ?? '' }));
  };
  const currentTones = tones(currentEvent), previousTones = tones(previousEvent) ?? [], nextTones = tones(nextEvent) ?? [];
  const notePc = pitchClassOf(notePitch);
  const noteOnset = normalizeBeat(note.beat), noteEnd = noteOnset + note.duration;
  const has = (list: readonly MelodyFunctionChordTone[] | null, pitch: SpelledPitch | null) =>
    pitch !== null && (list ?? []).some((tone) => tone.pitchClass === pitchClassOf(pitch));
  return {
    currentPitch: notePitch, scaleDegreeLabel: getDegreeLabelFromSpelling(notePitch, key), key, chordTones: currentTones,
    previousPitch, nextPitch,
    previousIsCurrentChordTone: has(currentTones, previousPitch),
    nextIsCurrentChordTone: has(currentTones, nextPitch),
    currentWasPreviousChordTone: previousTones.some((tone) => tone.pitchClass === notePc),
    currentWillBeNextChordTone: nextTones.some((tone) => tone.pitchClass === notePc),
    arrivedBeforeNextChord: nextEvent ? noteOnset < nextEvent.onset : false,
    heldAcrossChordChange: currentEvent ? noteOnset < currentEvent.onset : false,
    chordChangesDuringNote: chords.filter((event) => event.onset > noteOnset && event.onset < noteEnd).length,
  };
}

/** C2 through B4, a singable span for the played melody. */
export const SINGING_MELODY_LOW_MIDI = 36;
export const SINGING_MELODY_HIGH_MIDI = 71;
export const SPOKEN_MELODY_PREFERRED_LOW = 48;
export const SPOKEN_MELODY_PREFERRED_HIGH = 59;
export const SPOKEN_MELODY_C5 = 72;

const pitchClassCandidates = (midi: number) => {
  const pc = floorMod(midi, 12), out: number[] = [];
  for (let candidate = SINGING_MELODY_LOW_MIDI; candidate <= SINGING_MELODY_HIGH_MIDI; candidate++) if (floorMod(candidate, 12) === pc) out.push(candidate);
  return out;
};
/** Kotlin minBy: the first element with the smallest key. */
const minBy = (values: readonly number[], key: (value: number) => number) =>
  values.reduce((best, value) => key(value) < key(best) ? value : best, values[0]!);

export function placeSingingMelodyMidi(written: number, previousWritten: number | null, previousSung: number | null): number {
  const candidates = pitchClassCandidates(written);
  if (!candidates.length) return Math.min(Math.max(written, SINGING_MELODY_LOW_MIDI), SINGING_MELODY_HIGH_MIDI);
  if (previousWritten === null || previousSung === null) return minBy(candidates, (midi) => Math.abs(midi - written));
  const direction = Math.sign(written - previousWritten);
  const ideal = Math.min(Math.max(previousSung + (written - previousWritten), SINGING_MELODY_LOW_MIDI), SINGING_MELODY_HIGH_MIDI);
  const directed = direction > 0 ? candidates.filter((midi) => midi > previousSung)
    : direction < 0 ? candidates.filter((midi) => midi < previousSung) : candidates.filter((midi) => midi === previousSung);
  return minBy(directed.length ? directed : candidates, (midi) => Math.abs(midi - ideal));
}

export function foldMelodyIntoSingingRange(writtenMidis: readonly (number | null)[]): (number | null)[] {
  const sung: (number | null)[] = writtenMidis.map(() => null);
  let previousWritten: number | null = null, previousSung: number | null = null;
  writtenMidis.forEach((written, index) => {
    if (written === null || written <= 0) return;
    const placed = placeSingingMelodyMidi(written, previousWritten, previousSung);
    sung[index] = placed; previousWritten = written; previousSung = placed;
  });
  return sung;
}

export function placeSpokenMelodyMidi(sounding: number, previousSounding: number | null, previousSpoken: number | null): number {
  const candidates = pitchClassCandidates(sounding);
  const preferred = candidates.filter((midi) => midi >= SPOKEN_MELODY_PREFERRED_LOW && midi <= SPOKEN_MELODY_PREFERRED_HIGH);
  if (previousSounding === null || previousSpoken === null) {
    const anchor = sounding >= 60 ? sounding - 12 : sounding;
    return minBy(preferred.length ? preferred : candidates, (midi) => Math.abs(midi - anchor));
  }
  if (sounding === previousSounding) return previousSpoken;
  const direction = Math.sign(sounding - previousSounding);
  const ideal = previousSpoken + (sounding - previousSounding);
  const underC5 = candidates.filter((midi) => midi < SPOKEN_MELODY_C5);
  let directed: number[];
  if (direction > 0) {
    directed = preferred.filter((midi) => midi > previousSpoken);
    if (!directed.length) directed = underC5.filter((midi) => midi > previousSpoken);
    if (!directed.length) directed = [SPOKEN_MELODY_C5].filter((midi) => midi > previousSpoken && floorMod(sounding, 12) === 0);
  } else {
    directed = preferred.filter((midi) => midi < previousSpoken);
    if (!directed.length) directed = underC5.filter((midi) => midi < previousSpoken);
  }
  const pool = directed.length ? directed : underC5.length ? underC5 : candidates;
  return minBy(pool, (midi) => Math.abs(midi - ideal));
}

export function spokenMelodyRegister(soundingMidis: readonly (number | null)[]): (number | null)[] {
  const spoken: (number | null)[] = soundingMidis.map(() => null);
  let previousSounding: number | null = null, previousSpoken: number | null = null;
  soundingMidis.forEach((sounding, index) => {
    if (sounding === null || sounding <= 0) return;
    const placed = placeSpokenMelodyMidi(sounding, previousSounding, previousSpoken);
    spoken[index] = placed; previousSounding = sounding; previousSpoken = placed;
  });
  return spoken;
}

interface CueEvent { readonly layer: string; readonly startBeat: number; readonly fullMidiNotes: readonly number[] }
/** Native annotateMelodyVoiceCues: attach the spoken melody function (and its sung MIDI) to melody onsets and to
 * chord changes under a held note when the function changes. Returns new event objects; inputs are not mutated. */
export function annotateMelodyVoiceCues<T extends CueEvent>(section: ExtractedSection, melody: readonly MelodyNote[], events: readonly T[]):
  (T & { spokenMelodyCue?: string | null; melodyCueMidi?: number | null })[] {
  const annotated: (T & { spokenMelodyCue?: string | null; melodyCueMidi?: number | null })[] = [...events];
  const notes = melody.filter(playable);
  if (!notes.length) return annotated;
  const chords = timedChords(section);
  const cueAt = (note: MelodyNote, beat: number) =>
    spokenMelodyFunction(describeMelodyFunction(buildMelodyFunctionInput(section, melody, note, activeChordAtBeat(section, beat, chords), chords)));
  const soundingMidis = melody.map((note) => !playable(note) ? null
    : events.find((event) => event.layer === 'MELODY' && Math.abs(event.startBeat - Math.max(note.beat, 1)) < 1e-6)?.fullMidiNotes[0] ?? null);
  const spokenMidis = spokenMelodyRegister(soundingMidis);
  for (const note of notes) {
    const noteIndex = melody.indexOf(note);
    const noteStart = Math.max(note.beat, 1), noteEnd = noteStart + note.duration;
    const melodyMidi = spokenMidis[noteIndex] ?? soundingMidis[noteIndex] ?? null;
    let lastCue = cueAt(note, noteStart);
    for (let index = 0; index < annotated.length; index++) {
      const event = annotated[index]!;
      if (event.layer === 'MELODY' && Math.abs(event.startBeat - noteStart) < 1e-6) {
        annotated[index] = { ...event, spokenMelodyCue: lastCue, melodyCueMidi: melodyMidi };
      } else if (event.layer === 'CHORD' && event.startBeat > noteStart + 1e-6 && event.startBeat < noteEnd) {
        const cue = cueAt(note, event.startBeat);
        if (cue !== null && cue !== lastCue) {
          annotated[index] = { ...event, spokenMelodyCue: cue, melodyCueMidi: melodyMidi };
          lastCue = cue;
        }
      }
    }
  }
  return annotated;
}
