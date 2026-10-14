import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { JsonObject, KeyInfo } from '../../contracts';
import { resolveChordRoot } from './index';
import { floorMod } from './spelled-pitch';

const cMajor: KeyInfo = { tonic: 'C', scale: 'major' };

describe('native written chord-root resolution', () => {
  // Direct root assertions from AppliedBorrowedChordTest at Android 801cf798.
  it.each([
    [{ root: 6, applied: 5, borrowed: 'minor', type: 7 }, 'Eb', 'BORROWED_APPLIED', 'major'],
    [{ root: 7, applied: 5, borrowed: 'minor', type: 7 }, 'F', 'BORROWED_APPLIED', 'major'],
    [{ root: 1, applied: 1, borrowed: 'locrian' }, 'C', 'BORROWED_APPLIED', 'minor'],
    [{ root: 6, applied: 5, borrowed: 'minor', substitutions: ['tri'] }, 'Bbb', 'TRITONE_SUBSTITUTION', 'major'],
    [{ root: 4, applied: 7, borrowed: 'minor', alterations: ['#5'] }, 'E', 'BORROWED_APPLIED', 'minor'],
    [{ root: 5, applied: 5, borrowed: [0, 2, 3, 5, 7, 8, 10], inversion: 1 }, 'G', 'BORROWED_APPLIED', 'major'],
  ] as const)('preserves native borrowed/applied root %j', (chord, noteName, context, quality) => {
    const result = resolveChordRoot(JSON.parse(JSON.stringify(chord)) as JsonObject, cMajor);
    expect(result?.pitch.noteName).toBe(noteName);
    expect(result?.context).toBe(context);
    expect(result?.chordQuality).toBe(quality);
  });

  // Direct assertions from SpelledPitchResolutionTest at Android 801cf798.
  it('preserves native, borrowed, applied and substituted enharmonic spelling', () => {
    expect(resolveChordRoot({ root: 3 }, { tonic: 'C#', scale: 'major' })?.pitch.noteName).toBe('E#');
    expect(resolveChordRoot({ root: 6, borrowed: 'minor' }, cMajor)?.pitch.noteName).toBe('Ab');
    const applied = resolveChordRoot({ root: 5, applied: 7 }, cMajor);
    expect(applied?.pitch.noteName).toBe('F#');
    expect(applied?.context).toBe('APPLIED');
    const triSub = resolveChordRoot({ root: 5, applied: 5, substitutions: ['tri'] }, cMajor);
    expect(triSub?.pitch.noteName).toBe('Ab');
    expect(triSub?.context).toBe('TRITONE_SUBSTITUTION');
  });
  it('keeps applied roots in the source written register', () => {
    const result = resolveChordRoot({ root: 5, applied: 5 }, cMajor);
    expect(result?.pitch.noteName).toBe('D');
    expect(result?.pitch.octave).toBe(3);
    expect(result?.genericStepsFromTonic).toBe(1);
    expect(result?.specificSemitonesFromTonic).toBe(2);
  });
  it('resolves the own-root spelling used by native relative-Ionian tone labels', () => {
    // RelativeIonianContextTest.secondaryDominantChordTonesSpellFromTheirOwnRootNotByNearestPitchClass.
    expect(resolveChordRoot({ root: 5, applied: 5 }, { tonic: 'A', scale: 'minor' })?.pitch.noteName).toBe('B');
  });

  // Source-branch boundaries from ChordInterpreter.kt:194-379, with literal expected values.
  it('keeps source-relative and simple-mode registers separate across B/C', () => {
    const result = resolveChordRoot({ root: 2 }, { tonic: 'B', scale: 'major' });
    expect(result?.pitch.noteName).toBe('C#');
    expect(result?.pitch.octave).toBe(4);
    expect(result?.simpleModePitch.octave).toBe(3);
    expect(result?.genericStepsFromTonic).toBe(1);
    expect(result?.specificSemitonesFromTonic).toBe(2);
    expect(resolveChordRoot({ root: 2 }, { tonic: 'B', scale: 'major' }, -1)?.pitch.octave).toBe(0);
  });
  it('retains custom-array padding, normalization and missing-value fallbacks', () => {
    expect(resolveChordRoot({ root: 1, borrowed: [] }, cMajor)?.customIntervals).toEqual([0, 2, 4, 5, 7, 9, 11]);
    const result = resolveChordRoot({ root: 1, borrowed: [-1, '2', null] }, cMajor);
    expect(result?.customIntervals).toEqual([11, 2, 0, 2, 4, 6, 8]);
    expect(result?.pitch.noteName).toBe('Cb');
    expect(result?.context).toBe('CUSTOM_BORROWED');
    expect(resolveChordRoot({ root: 3, borrowed: 'unknown' }, { tonic: 'C', scale: 'minor' })?.pitch.noteName).toBe('Eb');
  });
  it('preserves native quality alterations independently of voiced modifier policy', () => {
    expect(resolveChordRoot({ root: 7, alterations: ['#5'] }, cMajor)?.chordQuality).toBe('minor');
    expect(resolveChordRoot({ root: 2, alterations: ['b5'] }, cMajor)?.chordQuality).toBe('diminished');
    expect(resolveChordRoot({ root: 1, alterations: ['#5'] }, cMajor)?.chordQuality).toBe('augmented');
    // Native non-borrowed tritone root metadata uses the major scale's effective degree 2 quality.
    expect(resolveChordRoot({ root: 5, applied: 5, substitutions: ['tri'] }, cMajor)?.chordQuality).toBe('minor');
  });
  it('parses primitive flags/integers and rejects invalid roots without inventing a tonic', () => {
    const invalidChords: JsonObject[] = [{}, { root: null }, { root: -1 }, { root: 8 }, { root: 'invalid' }, { root: 2147483648 }, { root: 2.5 }, { root: true }];
    for (const chord of invalidChords) {
      expect(resolveChordRoot(chord, cMajor), JSON.stringify(chord)).toBeNull();
    }
    expect(resolveChordRoot({ root: '+2' }, cMajor)?.pitch.noteName).toBe('D');
    expect(resolveChordRoot({ root: 1, rest: 'true' }, cMajor)).toBeNull();
    expect(resolveChordRoot({ root: 1, isRest: true }, cMajor)).toBeNull();
    expect(resolveChordRoot({ root: 1, rest: 'TRUE' }, cMajor)?.pitch.noteName).toBe('C');
    expect(resolveChordRoot({ root: 1 }, { tonic: 'invalid', scale: 'major' })).toBeNull();
  });
  it('retains explicit letter-root spelling and quality', () => {
    const result = resolveChordRoot({ root: 0, _letterRootName: 'D##', _letterQuality: 'diminished' }, { tonic: 'F#', scale: 'major' });
    expect(result?.pitch.noteName).toBe('D##');
    expect(result?.pitch.octave).toBe(4);
    expect(result?.simpleModePitch.octave).toBe(3);
    expect(result?.chordQuality).toBe('diminished');
    expect(result?.effectiveKey).toEqual({ tonic: 'D##', scale: 'major' });
  });
});

interface RootFixture {
  id: string; json?: string; chord?: JsonObject; key: KeyInfo; expectedRootMidi: number | null;
}
// Frozen contract outputs are independently checked by current native Android tests.
// This checks only their resolved-root channel, never labels, voicing or source truth accuracy.
describe('frozen corpus root channel', () => {
  it.each(['corpus_parity', 'historic_catalog_parity', 'hooktheory_parity', 'chord_role_contract'])(
    '%s matches the native harmonic root pitch class', (name) => {
      const path = fileURLToPath(new URL(`../../../../contracts/fixtures/${name}.json`, import.meta.url));
      const cases = JSON.parse(readFileSync(path, 'utf8')) as RootFixture[];
      expect(cases.length).toBeGreaterThan(0);
      const failures: string[] = [];
      for (const fixture of cases) {
        const chord = fixture.chord ?? JSON.parse(fixture.json!) as JsonObject;
        const result = resolveChordRoot(chord, fixture.key);
        const rootMidi = result ? 48 + floorMod(result.pitch.toAudioNoteNumber(), 12) : null;
        if (rootMidi !== fixture.expectedRootMidi) failures.push(`${fixture.id}: expected ${fixture.expectedRootMidi}, got ${rootMidi}`);
      }
      expect(failures.slice(0, 20), `${cases.length} root-only cases; ${failures.length} mismatches`).toEqual([]);
    },
  );
});
