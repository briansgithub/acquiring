import { describe, expect, it } from 'vitest';
import {
  CHORD_QUALITIES, ROMAN_NUMERALS, SCALE_INTERVALS, generateScaleLabels,
  getDegreeLabelFromMidi, getDegreeLabelFromSpelling, getMidiNote, getModifierValue,
  getNoteLabel, getRawDegree, getRelativeDegreeLabel, normalizeTonic, resolveScaleDegreePitch,
} from './index';
import type { KeyInfo } from './index';

describe('Android melody pitch and scale fixtures', () => {
  it('reproduces MelodyAccuracyTest MIDI notes, overflow and modifiers', () => {
    const cases: [string, number, KeyInfo, number][] = [
      ['1', 0, { tonic: 'C', scale: 'major' }, 60], ['3', 0, { tonic: 'C', scale: 'major' }, 64],
      ['8', 0, { tonic: 'C', scale: 'major' }, 72], ['1', 1, { tonic: 'C', scale: 'major' }, 72],
      ['1', 0, { tonic: 'G', scale: 'major' }, 67], ['4', 0, { tonic: 'G', scale: 'major' }, 72],
      ['1', 0, { tonic: 'B', scale: 'major' }, 71], ['2', 0, { tonic: 'B', scale: 'major' }, 73],
      ['#1', 0, { tonic: 'C', scale: 'major' }, 61], ['b3', 0, { tonic: 'C', scale: 'major' }, 63],
      ['1', 0, { tonic: 'Bb', scale: 'mixolydian' }, 70],
    ];
    for (const [sd, octave, key, midi] of cases) expect(getMidiNote(sd, octave, key)).toBe(midi);
  });
  it('retains the native Ab-minor, C-sharp-major and G-flat-major spellings', () => {
    expect(Array.from({ length: 7 }, (_, i) => getNoteLabel(i + 1, 'Ab', 'minor'))).toEqual(['Ab', 'Bb', 'Cb', 'Db', 'Eb', 'Fb', 'Gb']);
    expect(Array.from({ length: 7 }, (_, i) => getNoteLabel(i + 1, 'C#', 'major'))).toEqual(['C#', 'D#', 'E#', 'F#', 'G#', 'A#', 'B#']);
    expect(getNoteLabel(4, 'Gb', 'major')).toBe('Cb');
    expect(getNoteLabel(3, 'D#', 'major')).toBe('Fx');
    expect(getNoteLabel('3', 'D#', 'major')).toBe('F##');
  });
  it('covers modal, harmonic and custom labels plus native unknown-key fallback', () => {
    expect(generateScaleLabels('F', SCALE_INTERVALS.lydian)).toEqual(['F', 'G', 'A', 'B', 'C', 'D', 'E']);
    expect(generateScaleLabels('E', SCALE_INTERVALS.phrygianDominant)).toEqual(['E', 'F', 'G#', 'A', 'B', 'C', 'D']);
    expect(generateScaleLabels('A', SCALE_INTERVALS.harmonicMinor)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G#']);
    expect(getNoteLabel(4, 'C', 'custom', [0, 1, 3, 6, 7, 8, 10])).toBe('F#');
    expect(generateScaleLabels('C###', SCALE_INTERVALS.major)).toEqual(['C###', 'D###', 'E###', 'F###', 'G###', 'A###', 'B###']);
    expect(generateScaleLabels('invalid', [])).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(() => generateScaleLabels('C', [0, 2])).toThrow(RangeError);
    expect(getNoteLabel(3, 'C', 'unknown')).toBe('E');
    expect(getMidiNote('1', 0, { tonic: 'invalid', scale: 'unknown' })).toBe(60);
    expect(CHORD_QUALITIES.harmonicMinor).toEqual(['minor', 'diminished', 'augmented', 'minor', 'major', 'major', 'diminished']);
    expect(ROMAN_NUMERALS.phrygianDominant).toEqual(['I', 'II', 'iii°', 'iv', 'v°', 'VI+', 'vii']);
  });
  it('preserves the native difference between legacy MIDI and written enharmonic registers', () => {
    const flatKey = { tonic: 'Cb', scale: 'major' };
    const sharpKey = { tonic: 'B#', scale: 'major' };
    expect(getMidiNote('1', 0, flatKey)).toBe(71);
    expect(resolveScaleDegreePitch('1', 0, flatKey)?.toAudioNoteNumber()).toBe(59);
    expect(getMidiNote('1', 0, sharpKey)).toBe(60);
    expect(resolveScaleDegreePitch('1', 0, sharpKey)?.toAudioNoteNumber()).toBe(72);
  });
  it('keeps permissive legacy degree extraction separate from strict written resolution', () => {
    expect(getRawDegree('degree3')).toBe(3);
    expect(getRawDegree('1then2')).toBe(12);
    expect(getRawDegree('2147483648')).toBe(1);
    expect(getRawDegree('#')).toBe(1);
    expect(getRawDegree('-1')).toBe(1);
    expect(getModifierValue('bb#♯♭x')).toBe(1);
    expect(normalizeTonic('\u001c C#\u2003')).toBe('C#');
    expect(normalizeTonic('\ufeffC')).toBe('\ufeffC');
    expect(getMidiNote('0', 0, { tonic: 'C', scale: 'major' })).toBe(71);
  });
  it('uses distinct native tie rules for melody and chord-relative labels', () => {
    expect(getDegreeLabelFromMidi(70, { tonic: 'C', scale: 'major' })).toBe('♯6̂');
    expect(getRelativeDegreeLabel(70, 60)).toBe('♭7̂');
    expect(getDegreeLabelFromMidi(61, { tonic: 'C', scale: 'major' })).toBe('♯1̂');
    expect(getRelativeDegreeLabel(61, 60)).toBe('♭2̂');
    const writtenDSharp = resolveScaleDegreePitch('#2', 0, { tonic: 'C', scale: 'major' })!;
    expect(getDegreeLabelFromSpelling(writtenDSharp, { tonic: 'C', scale: 'major' })).toBe('♯2̂');
    expect(getDegreeLabelFromSpelling(writtenDSharp, { tonic: 'invalid', scale: 'major' })).toBe('');
  });
});

describe('Android SpelledPitchResolutionTest core cases', () => {
  it('applies source accidentals to key spelling rather than replacing it', () => {
    const e = resolveScaleDegreePitch('b3', 0, { tonic: 'C#', scale: 'major' })!;
    const c = resolveScaleDegreePitch('#3', 0, { tonic: 'Ab', scale: 'minor' })!;
    expect([e.noteName, e.octave]).toEqual(['E', 4]);
    expect([c.noteName, c.octave]).toEqual(['C', 5]);
  });
  it('rejects malformed degrees and overflowing native integers', () => {
    for (const sd of ['', '#', '0', '-1', 'degree3', '2147483648', '3.5', '1#']) {
      expect(resolveScaleDegreePitch(sd, 0, { tonic: 'C', scale: 'major' })).toBeNull();
    }
    expect(resolveScaleDegreePitch('1', 0, { tonic: 'invalid', scale: 'major' })).toBeNull();
  });
  it('shares written positions for degree overflow and relative octaves', () => {
    const key = { tonic: 'C', scale: 'major' };
    const eight = resolveScaleDegreePitch('8', 0, key)!;
    expect(eight).toEqual(resolveScaleDegreePitch('1', 1, key));
    expect(eight.octave).toBe(5);
    expect(resolveScaleDegreePitch('1', -1, key)?.octave).toBe(3);
    expect(resolveScaleDegreePitch('𝄫3', 0, key)?.noteName).toBe('Ebb');
    expect(resolveScaleDegreePitch('𝄪4', 0, key)?.noteName).toBe('F##');
  });
});
