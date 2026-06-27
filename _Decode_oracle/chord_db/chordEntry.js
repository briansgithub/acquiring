/**
 * chordEntry.js — normalize a compare row into a storable chord DB entry.
 */

const { attrBuckets } = require('../report');
const { classifyFailure } = require('./classifyFailure');

function entryId(song, section, beat) {
  return `${song}/${section}/${beat}`;
}

function specialBuckets(buckets) {
  const special = new Set(['suspensions', 'alterations', 'adds', 'omits']);
  return buckets.filter(([k]) => special.has(k));
}

function compositeKey(buckets) {
  const special = specialBuckets(buckets);
  if (special.length < 2) return null;
  return special.map(([k, v]) => `${k}=${v}`).sort().join('+');
}

function rowToEntry(row, ctx) {
  const { song, section, key, countMatch } = ctx;
  const buckets = attrBuckets(row.chord);
  const flags = row.flags || {};
  const pianoValidated = !!(flags.pianoValidated);
  return {
    id: entryId(song, section, row.beat),
    song,
    section,
    beat: row.beat,
    key,
    chord: row.chord,
    truthRoman: row.truthRoman,
    truthLetter: row.truthLetter,
    truthPcs: row.truthPcs ?? null,
    pianoNotes: pianoValidated ? (row.pianoNotes ?? null) : (row.pianoNotes ?? null),
    pianoPcs: row.pianoPcs ?? null,
    pianoValidated,
    engRoman: row.engRoman,
    engLetter: row.engLetter,
    engNotes: row.engNotes,
    engPcs: row.engPcs ?? null,
    flags,
    notesOk: !!row.notesOk,
    romanExact: !!flags.romanExact,
    failureClass: classifyFailure(row, { countMatch }),
    buckets: buckets.map(([k, v]) => `${k}=${v}`),
    compositeKey: compositeKey(buckets),
  };
}

module.exports = { rowToEntry, entryId, compositeKey, specialBuckets };
