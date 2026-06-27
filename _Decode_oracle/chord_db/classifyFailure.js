/**
 * classifyFailure.js — bucket a notesOk failure into engine vs harness vs piano noise.
 */

const ENGINE_MOD_ATTRS = ['suspensions', 'omits', 'adds', 'alterations'];

function hasEngineMod(chord) {
  return ENGINE_MOD_ATTRS.some((k) => {
    const v = chord[k];
    return Array.isArray(v) ? v.length > 0 : !!v;
  });
}

function classifyFailure(row, sectionMeta = {}) {
  if (row.notesOk) return null;
  if (row.engineError) return 'engine';
  if (sectionMeta.countMatch === false) return 'harness';
  const f = row.flags || {};
  if (row.pianoNotes && f.usePiano && !f.pianoValidated) return 'piano_noise';
  if (f.pianoExact === false && f.pcsExact === false && row.pianoNotes && !f.pianoValidated) {
    return 'piano_noise';
  }
  if (!f.romanCore) return 'engine';
  if (f.pcsExact && f.bassInNotes && f.orderOk === false) return 'engine';
  if (hasEngineMod(row.chord || {})) return 'engine';
  if (f.pcsExact === false || f.bassInNotes === false) return 'engine';
  return 'harness';
}

module.exports = { classifyFailure, hasEngineMod, ENGINE_MOD_ATTRS };
