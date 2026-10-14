import { describe, expect, it } from 'vitest';
import type { ExtractedSection, JsonObject } from '../../contracts';
import { migrateSection, migrateSections } from './index';

const oldChord = (): JsonObject => ({
  root: 5, beat: 40, duration: 3, type: 11, inversion: 0, applied: 0,
  adds: [], omits: [], alterations: [], suspensions: [],
});
const legacy = (chord = oldChord()): ExtractedSection => ({ numericId: '1714973', chords: [chord] });

describe('Android HooktheoryDataCompat fixtures', () => {
  it('repairs only the known legacy Piano Man chord without mutating source', () => {
    const original = legacy();
    original.metadata = { fp: '94c3b7dc6a7f8804312aae2fa40079291ec84eb95' }; // Native test has a different fingerprint.
    Object.freeze(original.chords[0]);
    Object.freeze(original);
    const repaired = migrateSection(original);
    expect(repaired.chords[0]).toEqual({ ...oldChord(), type: 9, suspensions: [4] });
    expect(original.chords[0].type).toBe(11);
    expect(repaired).not.toBe(original);
    expect(migrateSection(repaired)).toBe(repaired);
  });
  it('matches the exact native fingerprint or metadata numeric ID independently', () => {
    const metadataCases: JsonObject[] = [
      { fp: '94c3b7dc6a7f8804312aae2fa40079291ec84b95' }, { numericId: 1714973 },
    ];
    for (const metadata of metadataCases) {
      const section: ExtractedSection = { chords: [oldChord()], metadata };
      expect(migrateSection(section).chords[0].type).toBe(9);
    }
    expect(migrateSection({ chords: [oldChord()], metadata: { fp: '94c3b7dc6a7f8804312aae2fa40079291ec84eb95' } }).chords[0].type).toBe(11);
  });
  it('leaves genuine elevenths and each mismatching legacy guard alone', () => {
    const genuine: ExtractedSection = { numericId: 'other', chords: [{ root: 1, beat: 56.5, duration: 1, type: 11, suspensions: [] }] };
    expect(migrateSection(genuine)).toBe(genuine);
    const guardCases: JsonObject[] = [
      { root: 1 }, { beat: 39 }, { duration: 4 }, { type: 9 }, { inversion: 1 }, { applied: 1 },
      { adds: [1] }, { omits: [1] }, { alterations: [1] }, { suspensions: [1] },
    ];
    for (const patch of guardCases) {
      const source = legacy({ ...oldChord(), ...patch });
      expect(migrateSection(source)).toBe(source);
    }
  });
  it('preserves the native missing-field behavior and all unrelated chord keys', () => {
    const chord = oldChord();
    delete chord.suspensions;
    chord.source = { untouched: true };
    const source = legacy(chord);
    const repaired = migrateSection(source).chords[0];
    expect(repaired.type).toBe(9);
    expect(Object.hasOwn(repaired, 'suspensions')).toBe(false);
    expect(repaired.source).toBe(chord.source);
    expect(chord.type).toBe(11);
    const malformed = legacy({ root: '5', beat: '40', duration: '3', type: '11', suspensions: 'wrong-shape' });
    expect(migrateSection(malformed).chords[0].suspensions).toEqual([4]);
    const map = new Map([['raw-id', source]]);
    expect([...migrateSections(map).keys()]).toEqual(['raw-id']);
    expect(map.get('raw-id')).toBe(source);
  });
});
