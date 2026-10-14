import { describe, expect, it } from 'vitest';
import type { JsonObject } from '../../contracts';
import { getChordNotes, getRomanSymbol, getUniqueDisplayChords } from './index';

// Current ClosedLoopWebVsAndroidChordTest scenarios at frozen Android 801cf798.
describe('native unique display chords', () => {
  it('omits rests and deduplicates the native corpus section in first-occurrence order', () => {
    const key = { tonic: 'Ab', scale: 'minor' };
    const chords: JsonObject[] = [
      { root: 0, isRest: true, beat: 1, duration: 1 },
      { root: 6, type: 5, inversion: 0, beat: 2, duration: 4 },
      { root: 6, type: 5, inversion: 0, beat: 6, duration: 4 },
      { root: 4, type: 5, inversion: 0, beat: 10, duration: 4 },
      { root: 1, type: 5, inversion: 0, beat: 14, duration: 4 },
      { root: 1, type: 5, inversion: 0, beat: 18, duration: 4 },
      { root: 5, type: 5, inversion: 0, beat: 22, duration: 4 },
    ];
    const unique = getUniqueDisplayChords(chords, key);
    expect(unique).toHaveLength(4);
    expect(unique.map(chord => chord.root)).toEqual([6, 4, 1, 5]);
    expect(unique[0]).toBe(chords[1]);
    expect(unique.every(chord => !['', 'Rest'].includes(getRomanSymbol(chord, key)))).toBe(true);
    for (const chord of unique) {
      const notes = getChordNotes(chord, key);
      expect(notes.length).toBeGreaterThanOrEqual(3);
      expect(notes.every(note => Number.isInteger(note) && note > 0)).toBe(true);
    }
  });
  it('shows each recurring nonconsecutive chord only once', () => {
    const key = { tonic: 'C', scale: 'major' };
    const chords = [6, 4, 1, 5, 6, 4].map(root => ({ root, type: 5, inversion: 0 }));
    expect(getUniqueDisplayChords(chords, key).map(chord => getRomanSymbol(chord, key))).toEqual(['vi', 'IV', 'I', 'V']);
  });
  it('preserves the exact native signature exclusions and ordered array fields', () => {
    const first = { root: 1 };
    const chords: JsonObject[] = [first, { root: 1, adds: [9] }, { root: 1, omits: [3] },
      { root: 1, borrowed: [0, 2, 3, 5, 7, 8, 10] }, { root: 1, borrowed: [0, 2, 4, 5, 7, 9, 11] },
      { root: 1, borrowed: 'minor' }, { root: 1, alterations: ['b9', '#11'] }, { root: 1, alterations: ['#11', 'b9'] },
      { root: 1, suspensions: [4] }, { root: 1, inversion: 1 }, { root: 1, applied: 5 },
      {}, { root: 8 }, { root: 1, rest: true }];
    const unique = getUniqueDisplayChords(chords, { tonic: 'C', scale: 'major' });
    expect(unique).toEqual([first, ...chords.slice(5, 11)]);
    expect(unique[0]).toBe(first);
  });
});
