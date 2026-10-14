import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { JsonObject, KeyInfo } from '../../contracts';
import { buildChordVoicing, getChordNotes, getResolvedRootMidi, getChordToneLabels, getRootPositionChordNotes } from './index';

const cMajor: KeyInfo = { tonic: 'C', scale: 'major' }, abMajor: KeyInfo = { tonic: 'Ab', scale: 'major' };

// Literal native assertions from InversionChordPlaybackTest at Android 801cf798.
describe('native ordered inversion playback', () => {
  it.each([
    ['custom borrowed second inversion', { root: 2, type: 5, inversion: 2, borrowed: [1, 3, 4, 6, 8, 9, 11] }, abMajor, [65, 71, 74]],
    ['applied first inversion', { root: 6, applied: 5, type: 7, inversion: 1 }, abMajor, [40, 55, 58, 48]],
    ['applied third inversion', { root: 4, applied: 5, type: 7, inversion: 3 }, abMajor, [54, 68, 60, 63]],
    ['applied diminished seventh spread', { root: 5, applied: 7, type: 7, inversion: 0 }, abMajor, [50, 59, 65, 68]],
    ['root position', { root: 1, type: 5, inversion: 0 }, cMajor, [48, 52, 55]],
    ['first inversion', { root: 1, type: 5, inversion: 1 }, cMajor, [52, 55, 60]],
    ['second inversion', { root: 1, type: 5, inversion: 2 }, cMajor, [55, 60, 64]],
    ['third inversion', { root: 5, type: 7, inversion: 3 }, cMajor, [65, 67, 71, 74]],
  ] satisfies [string, JsonObject, KeyInfo, number[]][])('%s', (_, chord, key, expected) => {
    expect(getChordNotes(chord, key)).toEqual(expected);
  });
  it('resolves a root-position chord independently of the current bass', () => {
    const chord = { root: 1, type: 5, inversion: 1 };
    expect(getChordNotes(chord, cMajor)).toEqual([52, 55, 60]);
    expect(getRootPositionChordNotes(chord, cMajor)).toEqual([48, 52, 55]);
    expect(getResolvedRootMidi(chord, cMajor)).toBe(48);
    expect(chord.inversion).toBe(1);
  });
  it('retains the applied harmonic root instead of the JSON denominator', () => {
    const chord = { root: 2, applied: 5, type: 7, inversion: 1 };
    expect(getChordNotes(chord, cMajor)).toEqual([49, 64, 67, 69]);
    expect(getRootPositionChordNotes(chord, cMajor)[0]).toBe(57);
    expect(getResolvedRootMidi(chord, cMajor)).toBe(57);
    expect(getChordToneLabels(chord, cMajor)).toEqual(['3̂', '5̂', '♭7̂', '1̂']);
  });
});

describe('native applied borrowing and blank inputs', () => {
  // Frozen pitch sets directly from AppliedBorrowedChordTest at Android 801cf798.
  it.each([
    [{ root: 6, applied: 5, borrowed: 'minor', type: 7 }, [3, 7, 10, 1]],
    [{ root: 7, applied: 5, borrowed: 'minor', type: 7 }, [5, 9, 0, 3]],
    [{ root: 1, applied: 1, borrowed: 'locrian' }, [0, 3, 7]],
    [{ root: 6, applied: 5, borrowed: 'minor', substitutions: ['tri'] }, [9, 1, 4]],
    [{ root: 4, applied: 7, borrowed: 'minor', alterations: ['#5'] }, [0, 4, 7]],
    [{ root: 5, applied: 5, borrowed: [0, 2, 3, 5, 7, 8, 10], inversion: 1 }, [7, 11, 2]],
  ] satisfies [JsonObject, number[]][])('preserves native borrowed/applied pitch set %j', (chord, pcs) => {
    expect(new Set(getChordNotes(chord, cMajor).map(midi => midi % 12))).toEqual(new Set(pcs));
  });
  it('keeps native blank/rest behavior across every voiced consumer helper', () => {
    const blanks: JsonObject[] = [{}, { rest: true }, { root: 0 }, { root: null }, { root: -1 }, { root: '0' }, { root: 'invalid' }];
    for (const chord of blanks) {
      expect(buildChordVoicing(chord, cMajor)).toBeNull();
      expect(getChordNotes(chord, cMajor)).toEqual([]);
      expect(getResolvedRootMidi(chord, cMajor)).toBeNull();
      expect(getChordToneLabels(chord, cMajor)).toEqual([]);
    }
  });
  it('ignores unsupported alteration names as the native modifier switch does', () => {
    expect(getChordNotes({ root: 1, alterations: ['__proto__', 'constructor', 'toString', 'unknown'] }, cMajor)).toEqual([48, 52, 55]);
  });
});

interface VoicingFixture {
  id: string; json?: string; chord?: JsonObject; key: KeyInfo;
  expectedMidi?: number[]; expectedPcs?: number[]; expectedRootMidi: number | null; expectedToneLabels: string[];
}
const fixtureNames = ['corpus_parity', 'historic_catalog_parity', 'hooktheory_parity', 'chord_role_contract'];
// Frozen native parity outputs are an oracle for these channels; expected values are never generated here.
describe('frozen MIDI, harmonic-root and ordered tone-role channels', () => {
  it.each(fixtureNames)('%s matches every declared voiced channel', (name) => {
    const path = fileURLToPath(new URL(`../../../../contracts/fixtures/${name}.json`, import.meta.url));
    const fixtures = JSON.parse(readFileSync(path, 'utf8')) as VoicingFixture[];
    expect(fixtures.length).toBeGreaterThan(0);
    const failures: string[] = [];
    for (const fixture of fixtures) {
      const chord = fixture.chord ?? JSON.parse(fixture.json!) as JsonObject;
      const voiced = buildChordVoicing(chord, fixture.key);
      const midi = voiced?.tones.map(tone => tone.midi) ?? [], labels = voiced?.labels ?? [], root = voiced?.rootMidi ?? null;
      if (fixture.expectedMidi !== undefined && JSON.stringify(midi) !== JSON.stringify(fixture.expectedMidi)) failures.push(`${fixture.id} MIDI: ${JSON.stringify(midi)} != ${JSON.stringify(fixture.expectedMidi)}`);
      if (root !== fixture.expectedRootMidi) failures.push(`${fixture.id} root: ${root} != ${fixture.expectedRootMidi}`);
      if (JSON.stringify(labels) !== JSON.stringify(fixture.expectedToneLabels)) failures.push(`${fixture.id} roles: ${JSON.stringify(labels)} != ${JSON.stringify(fixture.expectedToneLabels)}`);
      if (midi.length !== labels.length) failures.push(`${fixture.id}: missing tone role`);
      if (fixture.expectedPcs !== undefined) {
        const pcs = [...new Set(midi.map(note => (note % 12 + 12) % 12))].sort((a, b) => a - b);
        if (JSON.stringify(pcs) !== JSON.stringify(fixture.expectedPcs)) failures.push(`${fixture.id} pitch classes: ${JSON.stringify(pcs)} != ${JSON.stringify(fixture.expectedPcs)}`);
      }
    }
    expect(failures.slice(0, 20), `${fixtures.length} cases; ${failures.length} channel failures`).toEqual([]);
  });
});
