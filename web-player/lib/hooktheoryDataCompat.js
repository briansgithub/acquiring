/**
 * Compatibility migrations for previously cached Hooktheory section data.
 *
 * Hooktheory revised Piano Man's chorus cadence from a legacy type=11 payload
 * to the canonical type=9 + suspensions:[4] payload. The old cached section
 * is identified by its content fingerprint, so genuine type=11 chords remain
 * genuine 11ths everywhere else.
 */

const LEGACY_PIANO_MAN_CHORUS_FP = "94c3b7dc6a7f8804312aae2fa40079291ec84b95";
const LEGACY_PIANO_MAN_CHORUS_ID = "1714973";

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isLegacyPianoManChorus(section, chord) {
  const metadata = section?.metadata || {};
  const fp = String(metadata.fp ?? metadata.content_fp ?? "");
  const numericId = String(section?.numericId ?? metadata.numericId ?? "");
  const sourceMatches = fp === LEGACY_PIANO_MAN_CHORUS_FP || numericId === LEGACY_PIANO_MAN_CHORUS_ID;
  if (!sourceMatches) return false;

  return asNumber(chord?.root) === 5
    && asNumber(chord?.beat) === 40
    && asNumber(chord?.duration) === 3
    && asNumber(chord?.type, 5) === 11
    && asNumber(chord?.inversion) === 0
    && asNumber(chord?.applied) === 0
    && !(chord?.suspensions || []).length
    && !(chord?.adds || []).length
    && !(chord?.omits || []).length
    && !(chord?.alterations || []).length;
}

/** Return a migrated chord without mutating the cached source object. */
export function migrateLegacyChord(chord, section = {}) {
  if (!isLegacyPianoManChorus(section, chord)) return chord;
  return { ...chord, type: 9, suspensions: [4] };
}

/** Return a migrated section without mutating the cached source object. */
export function migrateLegacySectionData(section) {
  if (!section || !Array.isArray(section.chords)) return section;
  const chords = section.chords.map((chord) => migrateLegacyChord(chord, section));
  const changed = chords.some((chord, index) => chord !== section.chords[index]);
  return changed ? { ...section, chords } : section;
}

export const LEGACY_PIANO_MAN_CHORUS = Object.freeze({
  fingerprint: LEGACY_PIANO_MAN_CHORUS_FP,
  numericId: LEGACY_PIANO_MAN_CHORUS_ID,
});
