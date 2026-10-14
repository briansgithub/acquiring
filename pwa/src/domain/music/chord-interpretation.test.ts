import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { JsonObject, KeyInfo } from '../../contracts';
import { getChordNotes, getLetterName, getRelativeIonianRomanSymbol, getRomanSymbol, interpret, relativeIonianKey } from './index';

const cMajor: KeyInfo = { tonic: 'C', scale: 'major' };

describe('current Kotlin Roman and letter regressions', () => {
  // ChordInterpreterTest.testRegressionSuite_ParityWithWebApp, Android 801cf798.
  it.each([
    [{ root: 5, applied: 7, type: 7 }, 'vii°7/V'],
    [{ root: 1, type: 7, inversion: 3 }, 'I△42'],
    [{ root: 5, type: 11 }, 'V11'],
    [{ root: 1, suspensions: [4] }, 'Isus4'],
    [{ root: 1, omits: [3], alterations: ['#5'], adds: [9] }, 'I+(add9)(no3)(#5)'],
    [{ root: 2, type: 7, inversion: 3, alterations: ['b5', '#9'] }, 'iiø4(b5)(#9)2'],
  ] satisfies [JsonObject, string][])('retains native Roman %j', (chord, roman) => expect(getRomanSymbol(chord, cMajor)).toBe(roman));
  it('retains remote leading-tone double-sharp spelling', () => {
    expect(getLetterName({ root: 7, applied: 7, type: 7, inversion: 1 }, { tonic: 'F#', scale: 'major' })).toBe('D##°7/F##');
  });
  it.each([
    [{ root: 1 }, { tonic: 'Ab', scale: 'minor' }, 'Abm'],
    [{ root: 3 }, { tonic: 'Ab', scale: 'minor' }, 'Cb'],
    [{ root: 6 }, { tonic: 'Ab', scale: 'minor' }, 'Fb'],
    [{ root: 3 }, { tonic: 'C#', scale: 'major' }, 'E#m'],
    [{ root: 7 }, { tonic: 'C#', scale: 'major' }, 'B#°'],
    [{ root: 4 }, { tonic: 'Gb', scale: 'major' }, 'Cb'],
    [{ root: 1, inversion: 1 }, { tonic: 'Ab', scale: 'minor' }, 'Abm/Cb'],
  ] satisfies [JsonObject, KeyInfo, string][])('preserves native enharmonic letter name %j', (chord, key, letter) => {
    // EnharmonicLetterNameTest at Android 801cf798.
    expect(getLetterName(chord, key)).toBe(letter);
  });
  it.each([
    [{ root: 6, applied: 5, borrowed: 'minor', type: 7 }, 'V7/♭VI(min)', 'Eb7'],
    [{ root: 7, applied: 5, borrowed: 'minor', type: 7 }, 'V7/♭VII(min)', 'F7'],
    [{ root: 6, applied: 5, borrowed: 'minor', substitutions: ['tri'] }, '♭II(∆-sub)/♭VI(min)', 'Bbb'],
  ] satisfies [JsonObject, string, string][])('preserves native borrowed/applied display %j', (chord, roman, letter) => {
    // First two Roman/letter pairs and third letter from AppliedBorrowedChordTest.
    expect(getRomanSymbol(chord, cMajor)).toBe(roman);
    expect(getLetterName(chord, cMajor)).toBe(letter);
  });
  it('keeps native blank/rest display behavior', () => {
    const blanks: JsonObject[] = [{}, { rest: true }, { root: 0 }, { root: null }, { root: -1 }, { root: '0' }, { root: 'invalid' }];
    for (const chord of blanks) {
      expect(interpret(chord, cMajor)).toEqual({ roman: '', letter: '', midi: [], rootMidi: null, toneLabels: [] });
    }
  });
});

describe('current Kotlin relative-Ionian display', () => {
  // RelativeIonianContextTest at Android 801cf798.
  it.each([[1, 'vi'], [3, 'I'], [4, 'ii'], [5, 'iii']] as const)('maps minor degree %i to %s', (root, roman) => {
    expect(getRelativeIonianRomanSymbol({ root }, { tonic: 'A', scale: 'minor' })).toBe(roman);
  });
  it('changes only the applied denominator and preserves altered modal qualities', () => {
    expect(getRelativeIonianRomanSymbol({ root: 5, applied: 5 }, { tonic: 'A', scale: 'minor' })).toBe('V(maj)/iii');
    expect(getRelativeIonianRomanSymbol({ root: 5 }, { tonic: 'A', scale: 'harmonicMinor' })).toBe('III');
    expect(getRelativeIonianRomanSymbol({ root: 7 }, { tonic: 'A', scale: 'harmonicMinor' })).toBe('♯v°');
  });
  it('retains one fixed display context over key changes', () => {
    const context = { tonic: 'D', scale: 'major' };
    expect(getRelativeIonianRomanSymbol({ root: 1 }, { tonic: 'D', scale: 'phrygian' }, context)).toBe('i');
    expect(getRelativeIonianRomanSymbol({ root: 1 }, { tonic: 'F', scale: 'phrygian' }, context)).toBe('♭iii');
  });
  it('does not mutate playback inputs when generating a label', () => {
    const chord = { root: 1, type: 7 }, key = { tonic: 'A', scale: 'minor' }, before = getChordNotes(chord, key);
    expect(getRelativeIonianRomanSymbol(chord, key)).toBe('vi7');
    expect(getChordNotes(chord, key)).toEqual(before);
    expect(chord).toEqual({ root: 1, type: 7 });
    expect(key).toEqual({ tonic: 'A', scale: 'minor' });
  });
});

interface DisplayFixture {
  id: string; json?: string; chord?: JsonObject; key: KeyInfo;
  expectedRoman?: string; expectedLetter?: string; expectedMidi?: number[]; expectedPcs?: number[];
  expectedRootMidi: number | null; expectedToneLabels: string[]; expectedRelativeIonianRoman?: string;
  displayContext?: { tonic: string };
}
const names = ['corpus_parity', 'historic_catalog_parity', 'hooktheory_parity', 'chord_role_contract'];
describe('all six frozen musical interpretation channels', () => {
  it.each(names)('%s matches every declared output without regenerating expectations', name => {
    const path = fileURLToPath(new URL(`../../../../contracts/fixtures/${name}.json`, import.meta.url));
    const fixtures = JSON.parse(readFileSync(path, 'utf8')) as DisplayFixture[];
    expect(fixtures.length).toBeGreaterThan(0);
    const failures: string[] = [];
    for (const fixture of fixtures) {
      const chord = fixture.chord ?? JSON.parse(fixture.json!) as JsonObject, result = interpret(chord, fixture.key);
      const compare = (channel: string, actual: unknown, expected: unknown) => {
        if (expected !== undefined && JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(`${fixture.id} ${channel}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
      };
      compare('Roman', result.roman, fixture.expectedRoman);
      compare('letter', result.letter, fixture.expectedLetter);
      compare('MIDI', result.midi, fixture.expectedMidi);
      compare('pitch classes', [...new Set(result.midi.map(note => (note % 12 + 12) % 12))].sort((a, b) => a - b), fixture.expectedPcs);
      compare('harmonic root', result.rootMidi, fixture.expectedRootMidi);
      compare('tone roles', result.toneLabels, fixture.expectedToneLabels);
      if (fixture.expectedRelativeIonianRoman !== undefined) {
        const context = fixture.displayContext ? { tonic: fixture.displayContext.tonic, scale: 'major' } : relativeIonianKey(fixture.key);
        compare('relative-Ionian Roman', getRelativeIonianRomanSymbol(chord, fixture.key, context), fixture.expectedRelativeIonianRoman);
      }
    }
    expect(failures.slice(0, 20), `${fixtures.length} cases; ${failures.length} field failures`).toEqual([]);
  });
});
