import { describe, expect, it } from 'vitest';
import type { ExtractedSection } from '../../contracts';
import { getBpm, getKeyAtBeat, getKeys, getParsedKey, keyAtBeat, safeNumericId, safeSectionName, safeSongId, safeSongInfo } from './index';

describe('Android HooktheoryModels metadata', () => {
  it('preserves raw IDs, fallback strings and structured JSON identity', () => {
    const section: ExtractedSection = { chords: [], songId: 'raw__Song-ID', numericId: 1714973, sectionName: '', songInfo: 'Raw &amp; info' };
    expect(safeSongId(section)).toBe('raw__Song-ID');
    expect(safeNumericId(section)).toBe('1714973');
    expect(safeSectionName(section)).toBe('');
    expect(safeSongInfo(section)).toBe('Raw &amp; info');
    expect(safeSongId({ chords: [], songId: { raw: ['value', true] } })).toBe('{"raw":["value",true]}');
    expect(safeNumericId({ chords: [], numericId: false })).toBe('false');
    expect(safeNumericId({ chords: [], numericId: null })).toBe('');
    expect(safeSectionName({ chords: [] })).toBe('Section');
    expect(safeSongInfo({ chords: [] })).toBe('');
  });
  it('resolves native Bb/C modulation at the exact beat boundary', () => {
    const section: ExtractedSection = { chords: [], metadata: { keys: [
      { tonic: 'C', scale: 'major', beat: 17 }, { tonic: 'Bb', scale: 'mixolydian', beat: 1 },
    ] } };
    for (const beat of [-5, 1, 16.5]) expect(getKeyAtBeat(section, beat)).toEqual({ tonic: 'Bb', scale: 'mixolydian' });
    for (const beat of [17, 24]) expect(getKeyAtBeat(section, beat)).toEqual({ tonic: 'C', scale: 'major' });
    expect(getParsedKey(section)).toEqual({ tonic: 'Bb', scale: 'mixolydian' });
    expect(section.metadata!.keys).toEqual([{ tonic: 'C', scale: 'major', beat: 17 }, { tonic: 'Bb', scale: 'mixolydian', beat: 1 }]);
  });
  it('skips non-object keys, applies primitive/default semantics, and reads only first tempo', () => {
    const section: ExtractedSection = { chords: [], metadata: { keys: [
      null, [], 'bad', { tonic: null, scale: 3, beat: 'bad' },
      { tonic: 'D', scale: 'minor', beat: '17' }, { tonic: 'E', scale: 'major', beat: 17 },
    ], tempos: [{ bpm: '95.5' }, { bpm: 200 }] } };
    expect(getKeys(section)[0]).toEqual({ key: { tonic: 'null', scale: '3' }, beat: 1 });
    expect(getKeyAtBeat(section, 17)).toEqual({ tonic: 'E', scale: 'major' });
    expect(getBpm(section)).toBe(95.5);
    expect(getBpm({ chords: [], metadata: { tempos: [null, { bpm: 200 }] } })).toBe(120);
    expect(getBpm({ chords: [], metadata: { tempos: [{ bpm: 0 }] } })).toBe(0);
    expect(getKeys({ chords: [], metadata: { keys: [null, []] } })).toEqual([{ key: { tonic: 'C', scale: 'major' }, beat: 1 }]);
    expect(keyAtBeat([], 30)).toEqual({ tonic: 'C', scale: 'major' });
  });
});
