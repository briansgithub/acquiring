import type { ExtractedSection, JsonObject, JsonValue } from '../../contracts';
import { migrateSections } from './compatibility';
import { assertSafeNumericId, intOrUndefined, isObject } from './primitives';

/** Android DataUtils: a failed gzip decode falls back to replacement-tolerant raw UTF-8. */
export async function decompress(data: Uint8Array): Promise<string> {
  try {
    const bytes = new Uint8Array(data);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await new Response(stream).arrayBuffer());
  } catch {
    // Preserve BOM as Android's readers do; JSON parsing may reject it.
    return new TextDecoder('utf-8', { ignoreBOM: true }).decode(data);
  }
}

function decodeSection(value: JsonValue, id: string): ExtractedSection {
  if (!isObject(value)) throw new TypeError('Section ' + id + ' must be an object');
  const section: ExtractedSection = { chords: [] };
  for (const field of ['songId', 'numericId', 'notes'] as const) {
    if (Object.hasOwn(value, field)) {
      if (field !== 'notes') assertSafeNumericId(value[field]);
      section[field] = value[field];
    }
  }
  for (const field of ['sectionName', 'songInfo'] as const) {
    if (!Object.hasOwn(value, field)) continue;
    if (value[field] !== null && typeof value[field] !== 'string') throw new TypeError(field + ' must be a string or null');
    section[field] = value[field] as string | null;
  }
  if (Object.hasOwn(value, 'sectionIndex')) {
    const index = value.sectionIndex === null ? null : intOrUndefined(value.sectionIndex);
    if (index === undefined) throw new TypeError('sectionIndex must be an Int or null');
    section.sectionIndex = index;
  }
  if (Object.hasOwn(value, 'chords')) {
    if (!Array.isArray(value.chords) || !value.chords.every(isObject)) throw new TypeError('chords must be an object array');
    section.chords = value.chords;
  }
  if (Object.hasOwn(value, 'metadata')) {
    if (value.metadata !== null && !isObject(value.metadata)) throw new TypeError('metadata must be an object or null');
    if (isObject(value.metadata)) assertSafeNumericId(value.metadata.numericId);
    section.metadata = value.metadata as JsonObject | null;
  }
  return section;
}

/** Read object keys in JSON text order, including integer-like IDs (Object.keys reorders those). */
function sourceKeys(text: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (character === '"') {
      const start = i++;
      for (; i < text.length; i++) {
        if (text[i] === '\\') i++;
        else if (text[i] === '"') break;
      }
      if (depth === 1 && /^\s*:/.test(text.slice(i + 1))) keys.push(JSON.parse(text.slice(start, i + 1)) as string);
    } else if (character === '{' || character === '[') depth++;
    else if (character === '}' || character === ']') depth--;
  }
  return keys;
}

/** Parse a catalog's map of sections, ignore unknown model fields, then apply the native repair. */
export function parseSections(text: string): Map<string, ExtractedSection> {
  const value: unknown = JSON.parse(text);
  if (!isObject(value)) throw new TypeError('Section payload must be an object');
  const sections = new Map<string, ExtractedSection>();
  for (const id of sourceKeys(text)) sections.set(id, decodeSection(value[id], id));
  return migrateSections(sections);
}

export async function decodeSongSections(data: Uint8Array): Promise<Map<string, ExtractedSection>> {
  return parseSections(await decompress(data));
}
