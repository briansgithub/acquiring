/**
 * Convert processed section files into the ordered map stored in Android's
 * Room dataBlob. Kept pure so catalog exports can be regression-tested without
 * creating or deleting a database.
 */

const {
  canonicalSectionRank,
  normalizeSectionType,
  sectionTypeKey,
} = require('../../../lib/sectionOrder');

function recordSongId(record) {
  return String(record?.data?.songId ?? record?.data?.stringSongId ?? '');
}

function recordSectionName(record) {
  return record?.data?.sectionName ?? '';
}

function metadataIndex(section, fallback) {
  const index = Number(section?.index);
  return Number.isInteger(index) && index >= 0 ? index : fallback;
}

function orderSectionRecords(metadata, records) {
  const remaining = [...records];
  const ordered = [];
  const metadataSections = Array.isArray(metadata?.sections)
    ? metadata.sections
        .map((section, position) => ({ section, position }))
        .sort((a, b) => metadataIndex(a.section, a.position) - metadataIndex(b.section, b.position))
    : [];

  for (const { section: meta, position } of metadataSections) {
    const wantedId = String(meta?.songId ?? '');
    const wantedName = normalizeSectionType(meta?.sectionName);
    let match = remaining.findIndex((record) => (
      recordSongId(record) === wantedId
      && normalizeSectionType(recordSectionName(record)) === wantedName
    ));
    if (match < 0) {
      match = remaining.findIndex((record) => recordSongId(record) === wantedId);
    }
    if (match < 0) continue;

    const [record] = remaining.splice(match, 1);
    ordered.push({
      ...record,
      sectionIndex: metadataIndex(meta, position),
      sectionName: meta.sectionName || recordSectionName(record),
    });
  }

  const firstUnindexedPosition = ordered.reduce(
    (max, record) => Math.max(max, record.sectionIndex + 1),
    0,
  );
  remaining
    .map((record, sourcePosition) => ({
      ...record,
      sourcePosition,
      canonicalRank: canonicalSectionRank(recordSectionName(record)),
    }))
    .sort((a, b) => (
      (a.canonicalRank - b.canonicalRank)
      || (a.sourcePosition - b.sourcePosition)
    ))
    .forEach((record, offset) => {
      ordered.push({
        ...record,
        sectionIndex: firstUnindexedPosition + offset,
        sectionName: recordSectionName(record),
      });
    });

  const seenTypes = new Set();
  return ordered.filter((record, position) => {
    const normalized = sectionTypeKey(record.sectionName);
    const typeKey = normalized || `\u0000${position}`;
    if (seenTypes.has(typeKey)) return false;
    seenTypes.add(typeKey);
    return true;
  });
}

function buildOrderedAndroidSectionMap(metadata, records) {
  const sectionMap = {};

  for (const record of orderSectionRecords(metadata, records)) {
    const data = {
      ...record.data,
      sectionName: record.sectionName,
      sectionIndex: record.sectionIndex,
    };
    const baseKey = recordSongId(record) || String(data.numericId ?? record.file ?? 'section');
    let key = baseKey;
    let suffix = 1;
    while (Object.prototype.hasOwnProperty.call(sectionMap, key)) {
      key = `${baseKey}#${record.sectionIndex ?? 'section'}-${suffix++}`;
    }
    sectionMap[key] = data;
  }

  return sectionMap;
}

const DIATONIC_MODE_KEYS = new Map([
  ['major', 'ionian'],
  ['ionian', 'ionian'],
  ['dorian', 'dorian'],
  ['phrygian', 'phrygian'],
  ['lydian', 'lydian'],
  ['mixolydian', 'mixolydian'],
  ['minor', 'aeolian'],
  ['aeolian', 'aeolian'],
  ['naturalminor', 'aeolian'],
  ['locrian', 'locrian'],
]);

function alphabeticalGroup(title) {
  const first = String(title ?? '').trim().charAt(0).toUpperCase();
  if (/^[A-Z]$/.test(first)) return first;
  if (/^[0-9]$/.test(first)) return first;
  return '#';
}

function complexityBucket(rating) {
  if (rating == null) return null;
  const value = Number(rating);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value === 100 ? 9 : Math.floor(value / 10);
}

function canonicalDiatonicMode(scale) {
  const normalized = String(scale ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-_\s]/g, '');
  return DIATONIC_MODE_KEYS.get(normalized) ?? null;
}

/** Collect every key event from every section, de-duped within one song/mode. */
function collectAndroidBrowseModes(sectionMap) {
  const modes = new Set();
  for (const section of Object.values(sectionMap ?? {})) {
    const keys = section?.metadata?.keys ?? section?.keys;
    if (!Array.isArray(keys)) continue;
    for (const key of keys) {
      const mode = canonicalDiatonicMode(key?.scale);
      if (mode) modes.add(mode);
    }
  }
  return [...modes];
}

module.exports = {
  orderSectionRecords,
  buildOrderedAndroidSectionMap,
  alphabeticalGroup,
  complexityBucket,
  canonicalDiatonicMode,
  collectAndroidBrowseModes,
};
