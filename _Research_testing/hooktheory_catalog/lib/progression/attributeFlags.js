/**
 * Bitmask flags for chord quality filters on progression windows.
 */

const FLAG = {
  HAS_MINOR: 1 << 0,
  HAS_SEVENTH_EXT: 1 << 1,
  HAS_INVERSION: 1 << 2,
  HAS_SUSPENSION: 1 << 3,
  HAS_ALTERATION: 1 << 4,
};

function isMinorChord(chord, symbol) {
  if (symbol) {
    const lead = symbol.replace(/[^A-Za-z°ø]/g, '').charAt(0);
    if (lead && lead === lead.toLowerCase() && lead !== 'v') return true;
    if (/ø|dim|°/.test(symbol)) return true;
  }
  const borrowed = chord.borrowed;
  if (borrowed === 'minor' || borrowed === 'min') return true;
  return false;
}

function chordAttributeFlags(chord, symbol) {
  if (!chord || chord.isRest) return 0;
  let flags = 0;
  if (isMinorChord(chord, symbol)) flags |= FLAG.HAS_MINOR;
  const type = chord.type ?? 5;
  if (type > 5 || (symbol && /\d.*7|7|△|ø|°/.test(symbol))) flags |= FLAG.HAS_SEVENTH_EXT;
  if ((chord.inversion ?? 0) > 0) flags |= FLAG.HAS_INVERSION;
  if (chord.suspensions?.length) flags |= FLAG.HAS_SUSPENSION;
  if (chord.alterations?.length) flags |= FLAG.HAS_ALTERATION;
  return flags;
}

function windowAttributeFlags(chordFlags) {
  return chordFlags.reduce((acc, f) => acc | f, 0);
}

function windowMetadataExtras(chords) {
  let hasBorrowed = false;
  let hasApplied = false;
  for (const c of chords) {
    if (c.borrowed != null && c.borrowed !== '' && c.borrowed !== false) hasBorrowed = true;
    if (c.applied && c.applied !== 0) hasApplied = true;
  }
  return { has_borrowed: hasBorrowed, has_applied: hasApplied };
}

module.exports = {
  FLAG,
  chordAttributeFlags,
  windowAttributeFlags,
  windowMetadataExtras,
};
