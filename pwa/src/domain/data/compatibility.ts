import type { ExtractedSection, JsonObject } from '../../contracts';
import { doubleOrUndefined, intOrUndefined, primitiveContent } from './primitives';
import { safeNumericId } from './section-metadata';

const LEGACY_FP = '94c3b7dc6a7f8804312aae2fa40079291ec84b95';
const LEGACY_ID = '1714973';

function isLegacyChord(section: ExtractedSection, chord: JsonObject): boolean {
  if (!(primitiveContent(section.metadata?.fp) === LEGACY_FP ||
    safeNumericId(section) === LEGACY_ID || primitiveContent(section.metadata?.numericId) === LEGACY_ID)) return false;
  const empty = (key: string) => !Array.isArray(chord[key]) || chord[key].length === 0;
  return (intOrUndefined(chord.root) ?? 0) === 5 && (doubleOrUndefined(chord.beat) ?? 0) === 40 &&
    (doubleOrUndefined(chord.duration) ?? 0) === 3 && (intOrUndefined(chord.type) ?? 5) === 11 &&
    (intOrUndefined(chord.inversion) ?? 0) === 0 && (intOrUndefined(chord.applied) ?? 0) === 0 &&
    empty('suspensions') && empty('adds') && empty('omits') && empty('alterations');
}

export function migrateSection(section: ExtractedSection): ExtractedSection {
  let changed = false;
  const chords = section.chords.map(chord => {
    if (!isLegacyChord(section, chord)) return chord;
    changed = true;
    // Android iterates existing keys; it does not synthesize missing suspensions.
    const repaired: JsonObject = { ...chord, type: 9 };
    if (Object.hasOwn(chord, 'suspensions')) repaired.suspensions = [4];
    return repaired;
  });
  return changed ? { ...section, chords } : section;
}

export function migrateSections(sections: ReadonlyMap<string, ExtractedSection>): Map<string, ExtractedSection> {
  return new Map([...sections].map(([id, section]) => [id, migrateSection(section)]));
}
