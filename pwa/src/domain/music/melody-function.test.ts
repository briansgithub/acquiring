import { describe, expect, it } from 'vitest';
import type { ExtractedSection, MelodyNote } from '../../contracts';
import { PlaybackRootDegreeCue, isSpokenMelodyChordTone, modeAnnouncement } from '../../audio/synth/spoken-cues';
import {
  buildMelodyFunctionInput, describeMelodyFunction, foldMelodyIntoSingingRange, melodyFunctionCardText, placeSpokenMelodyMidi,
  spokenMelodyFunction, spokenMelodyRegister, type MelodyFunctionChordTone, type MelodyFunctionInput,
} from './melody-function';
import { SpelledPitch } from './spelled-pitch';
import { circleOfFifthsDistance, tonicPitchClass } from './relative-ionian';
import { spokenSuffixForChord } from './spoken-chord-suffix';

const cMajor = { tonic: 'C', scale: 'major' };
const pitch = (name: string, octave = 4) => SpelledPitch.parse(name, octave)!;
const tone = (name: string, label: string): MelodyFunctionChordTone => ({ pitchClass: ((pitch(name).chromaticPosition % 12) + 12) % 12, label });
const triad = [tone('C', '1̂'), tone('E', '3̂'), tone('G', '5̂')];
function input(current: string | null, options: {
  scaleDegree?: string; tones?: MelodyFunctionChordTone[] | null; previous?: string; next?: string; previousIsTone?: boolean; nextIsTone?: boolean;
  wasPreviousTone?: boolean; willBeNextTone?: boolean; arrivedBeforeNextChord?: boolean; heldAcrossChordChange?: boolean;
} = {}): MelodyFunctionInput {
  return {
    currentPitch: current ? pitch(current) : null, scaleDegreeLabel: options.scaleDegree ?? '', key: cMajor,
    chordTones: options.tones === undefined ? triad : options.tones,
    previousPitch: options.previous ? pitch(options.previous) : null, nextPitch: options.next ? pitch(options.next) : null,
    previousIsCurrentChordTone: options.previousIsTone ?? false, nextIsCurrentChordTone: options.nextIsTone ?? false,
    currentWasPreviousChordTone: options.wasPreviousTone ?? false, currentWillBeNextChordTone: options.willBeNextTone ?? false,
    arrivedBeforeNextChord: options.arrivedBeforeNextChord ?? false, heldAcrossChordChange: options.heldAcrossChordChange ?? false,
  };
}

describe('native MelodyFunctionTest (Android 3c887223)', () => {
  it('chordMembersUseTheirActualToneLabels', () => {
    const cases: [string, MelodyFunctionChordTone, string][] = [['C', tone('C', '1̂'), 'Chord root'], ['Eb', tone('Eb', '♭3̂'), 'Chord third'],
      ['Bb', tone('Bb', '♭7̂'), 'Chord seventh'], ['D', tone('D', '9̂'), 'Chord ninth'], ['F', tone('F', '4̂'), 'Chord fourth']];
    for (const [name, chordTone, expected] of cases) expect(describeMelodyFunction(input(name, { tones: [chordTone] })).title).toBe(expected);
    expect(describeMelodyFunction(input('F', { tones: [tone('F', '4̂')] })).detail).toContain('fall to the third');
  });
  it('dominantThirdAlsoExplainsTheKeysLeadingToneAndResolution', () => {
    const result = describeMelodyFunction(input('B', { scaleDegree: '7̂', tones: [tone('G', '1̂'), tone('B', '3̂'), tone('D', '5̂')], next: 'C' }));
    expect(result.title).toBe('Chord third');
    expect(result.detail).toContain('leading tone of the key');
    expect(result.detail).toContain('The next note does.');
  });
  it('semitoneAboveChordRootIsNotCalledALeadingTone', () => {
    const result = describeMelodyFunction(input('Db', { scaleDegree: '♭2̂' }));
    expect(result.title).not.toContain('Leading tone');
    expect(result.title).toBe('Chromatic color tone');
  });
  it('namesPassingNeighborSuspensionAnticipationAndAppoggiatura', () => {
    expect(describeMelodyFunction(input('D', { previous: 'C', next: 'E', previousIsTone: true, nextIsTone: true })).title).toBe('Passing tone');
    expect(describeMelodyFunction(input('D', { previous: 'C', next: 'C' })).title).toBe('Upper neighbor');
    expect(describeMelodyFunction(input('F', { next: 'E', nextIsTone: true, wasPreviousTone: true, heldAcrossChordChange: true })).title).toBe('Suspension');
    expect(describeMelodyFunction(input('A', { willBeNextTone: true, arrivedBeforeNextChord: true })).title).toBe('Anticipation');
    expect(describeMelodyFunction(input('F', { previous: 'C', next: 'E', nextIsTone: true })).title).toBe('Appoggiatura');
  });
  it('prefixesChromaticPassingButNotAChordMinorThird', () => {
    expect(describeMelodyFunction(input('F#', { previous: 'E', next: 'G', previousIsTone: true, nextIsTone: true })).title).toBe('Chromatic passing tone');
    const minorThird = describeMelodyFunction(input('Eb', { scaleDegree: '♭3̂', tones: [tone('C', '1̂'), tone('Eb', '♭3̂')] }));
    expect(minorThird.title).toBe('Chord third');
    expect(minorThird.detail).not.toContain('in the key');
  });
  it('describesMelodyAndChordRests', () => {
    expect(describeMelodyFunction(input(null))).toEqual({ title: 'Rest', detail: 'No melody note right now.', tone: 'NEUTRAL' });
    const noChord = describeMelodyFunction(input('G', { scaleDegree: '5̂', tones: null }));
    expect(noChord.title).toBe('Scale degree 5');
    expect(noChord.tone).toBe('STABLE');
    expect(noChord.detail).toContain('No chord under this note');
  });
  it('colorsStableChordTonesLeanExtensionsAndTonesThatShouldMove', () => {
    expect(describeMelodyFunction(input('C')).tone).toBe('STABLE');
    expect(describeMelodyFunction(input('Bb', { tones: [tone('Bb', '♭7̂')] })).tone).toBe('LEANING');
    expect(describeMelodyFunction(input('B', { scaleDegree: '7̂', tones: [tone('G', '1̂'), tone('B', '3̂')], next: 'C' })).tone).toBe('MOVING');
    expect(describeMelodyFunction(input('D', { previous: 'C', next: 'E', previousIsTone: true, nextIsTone: true })).tone).toBe('MOVING');
    expect(describeMelodyFunction(input('Db', { scaleDegree: '♭2̂' })).tone).toBe('OUTSIDE');
  });
  it('restBetweenNotesBreaksTheMelodicConnection', () => {
    const chord = { root: 1, type: 5, beat: 1, duration: 4 };
    const melody: MelodyNote[] = [{ sd: '1', beat: 1, duration: 1, octave: 0, isRest: false },
      { sd: '1', beat: 2, duration: 1, octave: 0, isRest: true }, { sd: '2', beat: 3, duration: 1, octave: 0, isRest: false }];
    const section: ExtractedSection = { chords: [chord] };
    const built = buildMelodyFunctionInput(section, melody, melody[2]!, chord);
    expect(built.previousPitch).toBeNull();
    expect(built.previousIsCurrentChordTone).toBe(false);
  });
  it('spokenCuesStayWithinTwoWords', () => {
    const cues = [input('C'), input('D', { previous: 'C', next: 'E', previousIsTone: true, nextIsTone: true }),
      input('F#', { scaleDegree: '♯4̂', previous: 'E', next: 'G', previousIsTone: true, nextIsTone: true }),
      input('Db', { scaleDegree: '♭2̂', previous: 'C', next: 'C' }), input('Db', { scaleDegree: '♭2̂' })]
      .map((value) => spokenMelodyFunction(describeMelodyFunction(value)));
    expect(cues).toEqual(['root', 'passing', 'chromatic passing', 'upper neighbor', 'chromatic color']);
    expect(spokenMelodyFunction(describeMelodyFunction(input(null)))).toBeNull();
    expect(cues.map((cue) => isSpokenMelodyChordTone(cue!))).toEqual([true, false, false, false, false]);
    expect(isSpokenMelodyChordTone('seventh')).toBe(true);
    expect(isSpokenMelodyChordTone('one')).toBe(false);
  });
  it('modeAnnouncementsFollowTheRootDegreeVoicesOnly', () => {
    expect(modeAnnouncement(null, 'dorian', PlaybackRootDegreeCue.SPOKEN_NUMBER, false)).toBeNull();
    expect(modeAnnouncement('major', 'dorian', PlaybackRootDegreeCue.SPOKEN_NUMBER, false)).toBe('dorian');
    expect(modeAnnouncement('major', 'harmonicMinor', PlaybackRootDegreeCue.SUNG_NUMBER_WITH_DETAILS, false)).toBe('harmonic minor');
    expect(modeAnnouncement('major', 'major', PlaybackRootDegreeCue.SPOKEN_NUMBER, false)).toBeNull();
    expect(modeAnnouncement('major', 'dorian', PlaybackRootDegreeCue.SPOKEN_NUMBER, true)).toBeNull();
    for (const cue of [PlaybackRootDegreeCue.MELODY_FUNCTION, PlaybackRootDegreeCue.MELODY_CHORD_TONE, PlaybackRootDegreeCue.OFF]) {
      expect(modeAnnouncement('major', 'dorian', cue, false)).toBeNull();
    }
  });
});

describe('native SingingMelodyRegisterTest (Android 3c887223)', () => {
  it('folds melody into C2..B4 keeping direction across rests', () => {
    expect(foldMelodyIntoSingingRange([60, 64, 62, 62, 67])).toEqual([60, 64, 62, 62, 67]);
    expect(foldMelodyIntoSingingRange([72, 74, 71])).toEqual([60, 62, 59]);
    expect(foldMelodyIntoSingingRange([28, 26, 31])).toEqual([40, 38, 43]);
    expect(foldMelodyIntoSingingRange([72, null, 74])).toEqual([60, null, 62]);
  });
  it('speaks melody roles in C3..B3 and C5 only after B4 rising', () => {
    expect(spokenMelodyRegister([60, 64, 62])).toEqual([48, 52, 50]);
    expect(spokenMelodyRegister([60, null, 64])).toEqual([48, null, 52]);
    expect(spokenMelodyRegister([60, 60])).toEqual([48, 48]);
    expect(spokenMelodyRegister([60, 67])).toEqual([48, 55]);
    expect(placeSpokenMelodyMidi(72, 71, 71)).toBe(72);
    expect(placeSpokenMelodyMidi(72, 71, 59)).toBe(60);
    expect(spokenMelodyRegister([71, 72, 83, 84])).toEqual([59, 60, 71, 72]);
  });
  it('cardTextUsesTheShortFunctionWords', () => {
    const passing = describeMelodyFunction({ currentPitch: pitch('D'), scaleDegreeLabel: '2̂', key: cMajor,
      chordTones: [{ pitchClass: 0, label: '1̂' }, { pitchClass: 4, label: '3̂' }, { pitchClass: 7, label: '5̂' }],
      previousPitch: pitch('C'), nextPitch: pitch('E'), previousIsCurrentChordTone: true, nextIsCurrentChordTone: true });
    expect(melodyFunctionCardText(passing)).toBe('Passing');
    expect(melodyFunctionCardText(describeMelodyFunction({ currentPitch: null, scaleDegreeLabel: '', key: cMajor, chordTones: [] }))).toBe('Rest');
  });
});

describe('root-degree cue helpers', () => {
  it('measures circle-of-fifths distance from the tonic', () => {
    expect(circleOfFifthsDistance(0, 7)).toBe(1);
    expect(circleOfFifthsDistance(0, 5)).toBe(1);
    expect(circleOfFifthsDistance(0, 6)).toBe(6);
    expect(circleOfFifthsDistance(0, 2)).toBe(2);
    expect(tonicPitchClass({ tonic: 'Eb', scale: 'major' })).toBe(3);
  });
  it('chooses spoken chord suffixes from the Roman numeral, chord JSON and voicing', () => {
    expect(spokenSuffixForChord({ root: 2, type: 5 }, 'ii', null)).toBe('MIN');
    expect(spokenSuffixForChord({ root: 5, type: 7 }, 'V7', null)).toBe('SEVEN');
    expect(spokenSuffixForChord({ root: 4, type: 7 }, 'IV△7', null)).toBe('SEV_MAJ');
    expect(spokenSuffixForChord({ root: 5, type: 5, suspensions: [4] }, 'Vsus4', null)).toBe('SUS_FOUR');
    expect(spokenSuffixForChord({ root: 5, type: 7, suspensions: [2, 4] }, 'V7', null)).toBe('SEVENTH_SUS_TWO_FOUR');
    expect(spokenSuffixForChord({ root: 7, type: 7 }, 'viiø7', null)).toBe('HALF_DIM');
    expect(spokenSuffixForChord({ root: 7, type: 5 }, 'vii°', null)).toBe('DIM');
    expect(spokenSuffixForChord({ root: 2, type: 7, omits: [7] }, 'ii7', null)).toBe('MIN');
    expect(spokenSuffixForChord({ root: 1, type: 5 }, 'I', null)).toBeNull();
    expect(spokenSuffixForChord({ root: 0, _letterQuality: 'augmented' }, 'C+', null)).toBe('AUG');
  });
});
