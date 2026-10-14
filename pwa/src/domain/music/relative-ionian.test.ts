import { describe, expect, it } from 'vitest';
import type { KeyInfo } from './index';
import {
  canonicalScaleName, degreeInKey, ionianContextDegreeLabel, ionianContextPreviewAudioNote,
  ionianContextStaffDegree, noteNameAccidentalPreference, relativeIonianDegree, relativeIonianDegreeLabel,
  relativeIonianKey, relativeIonianStaffDegree, resolveScaleDegreePitch, SpelledPitch,
} from './index';

describe('Android RelativeIonianContextTest core fixtures', () => {
  it('resolves every supported mode and native aliases to relative major', () => {
    const modalKeys: KeyInfo[] = [
      { tonic: 'C', scale: 'major' }, { tonic: 'C', scale: 'ionian' }, { tonic: 'D', scale: 'dorian' },
      { tonic: 'E', scale: 'phrygian' }, { tonic: 'F', scale: 'lydian' }, { tonic: 'G', scale: 'mixolydian' },
      { tonic: 'A', scale: 'minor' }, { tonic: 'A', scale: 'aeolian' }, { tonic: 'B', scale: 'locrian' },
      { tonic: 'A', scale: 'harmonicMinor' }, { tonic: 'E', scale: 'phrygianDominant' },
    ];
    for (const source of modalKeys) expect(relativeIonianKey(source)).toEqual({ tonic: 'C', scale: 'major' });
    expect(relativeIonianKey({ tonic: 'Bb', scale: 'dorian' })).toEqual({ tonic: 'Ab', scale: 'major' });
    expect(canonicalScaleName('aeolian')).toBe('minor');
    expect(canonicalScaleName('other')).toBe('other');
  });
  it('chooses accidentals from the relative-major signature and first chronological section key', () => {
    for (const [tonic, scale] of [['G', 'major'], ['E', 'dorian'], ['F#', 'major'], ['F♯', 'major']]) {
      expect(noteNameAccidentalPreference({ tonic, scale })).toBe('sharps');
    }
    for (const [tonic, scale] of [['F', 'major'], ['G', 'dorian'], ['Gb', 'major'], ['G♭', 'major'], ['C', 'major'], ['A', 'minor'], ['D', 'dorian']]) {
      expect(noteNameAccidentalPreference({ tonic, scale })).toBe('flats');
    }
    expect(noteNameAccidentalPreference({ chords: [], metadata: { keys: [
      { tonic: 'F', scale: 'major', beat: 8 }, { tonic: 'G', scale: 'major', beat: 1 },
    ] } })).toBe('sharps');
    expect(noteNameAccidentalPreference({ chords: [] })).toBe('flats');
  });
  it('rotates source scale degrees and staff positions without changing pitch', () => {
    const key = { tonic: 'A', scale: 'minor' };
    const tonic = resolveScaleDegreePitch('1', 0, key)!;
    const mediant = resolveScaleDegreePitch('3', 0, key)!;
    expect(relativeIonianDegreeLabel(tonic, key)).toBe('6̂');
    expect(relativeIonianDegreeLabel(mediant, key)).toBe('1̂');
    expect(relativeIonianDegreeLabel(70, key)).toBe('♭7̂');
    expect(relativeIonianStaffDegree('1', 0, key)).toBe(6);
    expect(relativeIonianStaffDegree('3', 0, key)).toBe(8);
    expect(relativeIonianDegree(tonic, key)).toEqual({ degree: 6, alteration: 0 });
    expect(tonic.toAudioNoteNumber()).toBe(69);
  });
  it('keeps a fixed D-major reference across source modulations', () => {
    const context = relativeIonianKey({ tonic: 'D', scale: 'major' });
    const dKey = { tonic: 'D', scale: 'phrygian' }, fKey = { tonic: 'F', scale: 'phrygian' };
    const d = resolveScaleDegreePitch('1', 0, dKey)!;
    const f = resolveScaleDegreePitch('1', 0, fKey)!;
    expect(relativeIonianDegreeLabel(d, dKey)).toBe('3̂');
    expect(relativeIonianDegreeLabel(f, fKey)).toBe('3̂');
    expect(ionianContextDegreeLabel(d, context)).toBe('1̂');
    expect(ionianContextDegreeLabel(f, context)).toBe('♭3̂');
    expect(ionianContextStaffDegree('1', 0, dKey, context)).toBe(1);
    expect(ionianContextStaffDegree('1', 0, fKey, context)).toBe(3);
    for (const octave of [3, 4]) {
      const c = SpelledPitch.parse('C', octave)!;
      expect(ionianContextDegreeLabel(c, context)).toBe('♭7̂');
      expect(ionianContextPreviewAudioNote(c, context)).toBe(60);
    }
    expect(ionianContextPreviewAudioNote(48, context)).toBe(60);
    expect(ionianContextPreviewAudioNote(72, context)).toBe(60);
  });
  it('preserves the native D-sharp chord-tone label when root spelling is supplied', () => {
    // The future chord resolver supplies this B root; no chord interpreter is assumed here.
    const root = SpelledPitch.parse('B', 3)!;
    const context = { tonic: 'C', scale: 'major' };
    expect(ionianContextDegreeLabel(63, context, root)).toBe('♯2̂');
    expect(ionianContextDegreeLabel(63, context)).toBe('♭3̂');
    expect(ionianContextPreviewAudioNote(63, context, 3, root)).toBe(51);
    expect(root.noteName).toBe('B');
  });
  it('returns native null/empty results for malformed degrees or keys', () => {
    const pitch = SpelledPitch.parse('C', 4)!;
    const invalid = { tonic: 'invalid', scale: 'major' };
    expect(degreeInKey(pitch, invalid)).toBeNull();
    expect(ionianContextDegreeLabel(pitch, invalid)).toBe('');
    expect(ionianContextPreviewAudioNote(pitch, invalid)).toBeNull();
    expect(ionianContextStaffDegree('bad', 0, { tonic: 'C', scale: 'major' }, invalid)).toBeNull();
  });
});
