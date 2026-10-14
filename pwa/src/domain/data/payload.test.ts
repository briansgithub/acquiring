import { gzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { decodeSongSections, decompress, parseSections, safeNumericId, sectionsInSongOrder } from './index';

const raw = '{"20":{"sectionName":"Theme B","songId":"raw__id","numericId":"00017","songInfo":"raw &amp; info","chords":[{"root":1,"arbitrary":{"a":[true,null]}}],"metadata":{"keys":[{"tonic":"C","scale":"major","beat":1}]},"futureField":true},"3":{"sectionName":"Theme A"},"__proto__":{"sectionName":"Verse"}}';
const bytes = (text: string) => new TextEncoder().encode(text);

describe('Android raw/gzip section payloads', () => {
  it('parses the same map from raw UTF-8 and a real gzip fixture', async () => {
    const expected = parseSections(raw);
    expect(await decodeSongSections(bytes(raw))).toEqual(expected);
    expect(await decodeSongSections(gzipSync(bytes(raw)))).toEqual(expected);
    expect([...expected.keys()]).toEqual(['20', '3', '__proto__']);
    expect(sectionsInSongOrder(expected).map(([id]) => id)).toEqual(['__proto__', '20', '3']);
    expect(expected.get('20')?.songInfo).toBe('raw &amp; info');
    expect(safeNumericId(expected.get('20')!)).toBe('00017');
    expect(Object.hasOwn(expected.get('20')!, 'futureField')).toBe(false);
    expect(expected.get('3')?.chords).toEqual([]);
  });
  it('returns raw UTF-8 on invalid gzip and rejects invalid model payloads', async () => {
    const corrupt = new Uint8Array([31, 139, 8, 0, 255]);
    expect(await decompress(corrupt)).toBe(new TextDecoder().decode(corrupt));
    expect(await decompress(new Uint8Array([255]))).toBe('�');
    for (const text of ['[]', 'null', '{"x":null}', '{"x":{"chords":null}}', '{"x":{"chords":[1]}}',
      '{"x":{"metadata":[]}}', '{"x":{"sectionIndex":1.2}}', '{"x":{"songInfo":{}}}', '{"x":{"sectionName":5}}', '{']) {
      expect(() => parseSections(text)).toThrow();
    }
    await expect(decodeSongSections(corrupt)).rejects.toThrow();
  });
  it('falls back consistently when browser gzip support is unavailable', async () => {
    vi.stubGlobal('DecompressionStream', undefined);
    try {
      expect(await decodeSongSections(bytes(raw))).toEqual(parseSections(raw));
      await expect(decodeSongSections(gzipSync(bytes(raw)))).rejects.toThrow();
    } finally { vi.unstubAllGlobals(); }
  });
  it('handles escaped raw IDs, nested strings, nullable fields and signed integer indices', () => {
    const value = parseSections('{"quote\\\"id":{"notes":{"text":"}:\\\"nested"},"sectionIndex":"2","songInfo":null,"numericId":123},"empty":{"sectionIndex":null,"metadata":null}}');
    expect([...value.keys()]).toEqual(['quote"id', 'empty']);
    expect(value.get('quote"id')?.sectionIndex).toBe(2);
    expect(value.get('quote"id')?.notes).toEqual({ text: '}:"nested' });
    expect(value.get('empty')?.metadata).toBeNull();
  });
  it('rejects numeric ID precision loss and accepts exact string IDs unchanged', () => {
    for (const field of ['songId', 'numericId']) {
      expect(() => parseSections('{"x":{"' + field + '":9007199254740993}}')).toThrow(/safe precision/);
    }
    expect(() => parseSections('{"x":{"metadata":{"numericId":9007199254740993}}}')).toThrow(/safe precision/);
    expect(safeNumericId(parseSections('{"x":{"numericId":"9007199254740993"}}').get('x')!)).toBe('9007199254740993');
  });
  it('applies native repair as part of catalog decode and does not silently eat a BOM', async () => {
    const repaired = parseSections('{"raw":{"numericId":1714973,"chords":[{"root":5,"beat":40,"duration":3,"type":11}]}}');
    expect(repaired.get('raw')?.chords[0]).toEqual({ root: 5, beat: 40, duration: 3, type: 9 });
    for (const data of [bytes('\ufeff{}'), gzipSync(bytes('\ufeff{}'))]) {
      expect(await decompress(data)).toBe('\ufeff{}');
      await expect(decodeSongSections(data)).rejects.toThrow();
    }
  });
});
