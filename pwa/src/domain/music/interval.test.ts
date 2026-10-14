import { describe, expect, it } from 'vitest';
import { IntervalDirection, NamedInterval, SpelledPitch, calculateMeasuredInterval, calculateNamedInterval } from './index';

function pitch(name: string, octave: number): SpelledPitch { return SpelledPitch.parse(name, octave)!; }

// Every literal named-interval assertion from SpelledIntervalTest, Android 801cf798.
describe('native written interval cases', () => {
  it.each([
    ['C#', 4, 'G', 4, 'd5 ↑'], ['C#', 4, 'F##', 4, 'A4 ↑'], ['C', 4, 'F#', 4, 'A4 ↑'], ['C', 4, 'Gb', 4, 'd5 ↑'],
    ['E', 4, 'C', 4, 'M3 ↓'], ['C', 4, 'Db', 5, 'm9 ↑'], ['C', 4, 'C', 6, 'P15 ↑'],
    ['B', 3, 'C', 4, 'm2 ↑'], ['C', 5, 'B', 4, 'm2 ↓'], ['G', 4, 'C', 4, 'P5 ↓'], ['Db', 5, 'C', 4, 'm9 ↓'],
    ['C#', 4, 'Db', 4, 'd2 ↑'], ['C', 4, 'C', 4, 'P1 ·'], ['C', 4, 'F##', 4, 'AA4 ↑'], ['C', 4, 'Gbb', 4, 'dd5 ↑'],
  ] satisfies [string, number, string, number, string][])('%s%i to %s%i is %s', (from, fromOctave, to, toOctave, expected) => {
    expect(calculateNamedInterval(pitch(from, fromOctave), pitch(to, toOctave)).shorthand).toBe(expected);
  });
  it('keeps the native interval-card shorthand separate from spoken text', () => {
    // IntervalShorthandTest at Android 801cf798.
    const risingFifth = new NamedInterval(5, 'P', IntervalDirection.ASCENDING, 7);
    expect(risingFifth.shorthand).toBe('P5 ↑');
    expect(risingFifth.shorthand.toLowerCase()).not.toContain('perfect');
    expect(risingFifth.spokenName).toBe('perfect fifth, ascending');
  });
  it('preserves written direction even when accidentals reverse the sounding motion', () => {
    const result = calculateNamedInterval(pitch('C##', 4), pitch('Db', 4));
    expect(result.shorthand).toBe('dd2 ↑');
    expect(result.directedSemitones).toBe(-1);
    expect(result.direction).toBe(IntervalDirection.ASCENDING);
  });
  it('distinguishes a chromatic unison from the stable true-unison convention', () => {
    expect(calculateNamedInterval(pitch('C', 4), pitch('Cb', 4)).shorthand).toBe('A1 ↓');
    const repeated = calculateNamedInterval(pitch('C', 4), pitch('C', 4));
    expect(repeated.direction).toBe(IntervalDirection.ASCENDING);
    expect(repeated.directionGlyph).toBe('·');
    expect(repeated.directedSemitones).toBe(0);
  });
  it('retains compound counts and repeated spoken quality names', () => {
    const twoOctaves = calculateNamedInterval(pitch('C', 4), pitch('C', 6));
    expect(twoOctaves.compoundOctaves).toBe(2);
    expect(twoOctaves.spokenName).toBe('perfect 15th, ascending');
    expect(calculateNamedInterval(pitch('C', 4), pitch('F##', 4)).spokenName).toBe('augmented augmented fourth, ascending');
    expect(calculateNamedInterval(pitch('C', 4), pitch('Gbb', 4)).spokenName).toBe('diminished diminished fifth, ascending');
  });
  it.each([
    ['F', 5, 'perfect 11th, ascending'], ['A', 5, 'major 13th, ascending'],
    ['B', 6, 'major 21st, ascending'], ['C', 7, 'perfect 22nd, ascending'], ['E', 8, 'major 31st, ascending'],
  ] satisfies [string, number, string][])('preserves native spoken compound ordinal %s%i', (name, octave, expected) => {
    expect(calculateNamedInterval(pitch('C', 4), pitch(name, octave)).spokenName).toBe(expected);
  });
});

describe('native measured interval cases', () => {
  it('spells measured MIDI in the written pitch coordinate system', () => {
    // MeasuredIntervalTest.relativeSpellingConvertsMidiIntoThePitchCoordinateSystem.
    expect(SpelledPitch.spellRelative(pitch('C', 4), 64)).toEqual(pitch('E', 4));
    expect(SpelledPitch.spellRelative(pitch('C', 4), 59)).toEqual(pitch('B', 3));
  });
  it('follows the order of the two raw pitches', () => {
    const ascending = calculateMeasuredInterval(60.1, 64.1), descending = calculateMeasuredInterval(67.2, 60.2);
    expect(ascending.namedInterval.quality).toBe('M');
    expect(ascending.namedInterval.number).toBe(3);
    expect(ascending.direction).toBe(IntervalDirection.ASCENDING);
    expect(descending.namedInterval.quality).toBe('P');
    expect(descending.namedInterval.number).toBe(5);
    expect(descending.direction).toBe(IntervalDirection.DESCENDING);
  });
  it('preserves measured direction inside one rounded semitone', () => {
    const ascending = calculateMeasuredInterval(60.1, 60.4), descending = calculateMeasuredInterval(60.4, 60.1), repeated = calculateMeasuredInterval(60.25, 60.25);
    expect(ascending.namedInterval.number).toBe(1);
    expect(ascending.direction).toBe(IntervalDirection.ASCENDING);
    expect(descending.direction).toBe(IntervalDirection.DESCENDING);
    expect(repeated.direction).toBeNull();
    expect(ascending.shorthand).toBe('P1 ↑');
    expect(descending.shorthand).toBe('P1 ↓');
    expect(repeated.shorthand).toBe('P1 ·');
    expect(ascending.namedInterval.shorthand).toBe('P1 ·');
    expect(ascending.centsDeviation).toBeCloseTo(30, 8);
    expect(descending.centsDeviation).toBeCloseTo(-30, 8);
    expect(repeated.centsDeviation).toBe(0);
  });
  it('rounds naming ties toward positive infinity and measures cents against that named interval', () => {
    const threshold = calculateMeasuredInterval(60.49, 60.5);
    expect(threshold.namedInterval.shorthand).toBe('m2 ↑');
    expect(threshold.centsDeviation).toBeCloseTo(-99, 8);
    const ties = calculateMeasuredInterval(-0.5, 0.5);
    expect(ties.namedInterval.shorthand).toBe('m2 ↑');
    expect(ties.centsDeviation).toBe(0);
    expect(calculateMeasuredInterval(60.2, 64.35).centsDeviation).toBeCloseTo(15, 8);
  });
  it('rejects NaN measurements rather than inventing a note', () => {
    expect(() => calculateMeasuredInterval(Number.NaN, 60)).toThrow(RangeError);
    expect(() => calculateMeasuredInterval(60, Number.NaN)).toThrow(RangeError);
  });
});
