import type { ExtractedSection, JsonValue, KeyInfo } from '../../contracts';
import { assertSafeNumericId, doubleOrUndefined, isObject, primitiveContent } from './primitives';

export interface KeyInfoWithBeat { key: KeyInfo; beat: number }

function safeId(value: JsonValue | undefined): string {
  assertSafeNumericId(value);
  if (value == null) return '';
  return primitiveContent(value) ?? JSON.stringify(value);
}

export function safeSongId(section: ExtractedSection): string { return safeId(section.songId); }
export function safeNumericId(section: ExtractedSection): string { return safeId(section.numericId); }
export function safeSectionName(section: ExtractedSection): string { return section.sectionName ?? 'Section'; }
export function safeSongInfo(section: ExtractedSection): string { return section.songInfo ?? ''; }

export function getKeys(section: ExtractedSection): KeyInfoWithBeat[] {
  const values = section.metadata?.keys;
  const keys: KeyInfoWithBeat[] = [];
  if (Array.isArray(values)) {
    for (const value of values) {
      if (!isObject(value)) continue;
      keys.push({
        key: { tonic: primitiveContent(value.tonic) ?? 'C', scale: primitiveContent(value.scale) ?? 'major' },
        beat: doubleOrUndefined(value.beat) ?? 1,
      });
    }
  }
  return keys.length ? keys.sort((a, b) => {
    // Kotlin Double.compareTo sorts NaN last.
    if (Number.isNaN(a.beat)) return Number.isNaN(b.beat) ? 0 : 1;
    if (Number.isNaN(b.beat)) return -1;
    return a.beat - b.beat;
  }) : [{ key: { tonic: 'C', scale: 'major' }, beat: 1 }];
}

/** Sorted key changes; before the first change uses that first key, just as Android. */
export function keyAtBeat(keys: readonly KeyInfoWithBeat[], beat: number): KeyInfo {
  if (!keys.length) return { tonic: 'C', scale: 'major' };
  let low = 0, high = keys.length - 1, activeIndex = 0;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (keys[middle].beat <= beat) { activeIndex = middle; low = middle + 1; }
    else high = middle - 1;
  }
  return keys[activeIndex].key;
}

export function getKeyAtBeat(section: ExtractedSection, beat: number): KeyInfo {
  return keyAtBeat(getKeys(section), beat);
}
export function getParsedKey(section: ExtractedSection): KeyInfo { return getKeyAtBeat(section, 1); }
export function getBpm(section: ExtractedSection): number {
  const tempos = section.metadata?.tempos;
  const first = Array.isArray(tempos) ? tempos[0] : undefined;
  return isObject(first) ? doubleOrUndefined(first.bpm) ?? 120 : 120;
}
