import { interpretChordContract } from '../../web/lib/chordContract.js';
import { migrateLegacySectionData } from '../../web/lib/hooktheoryDataCompat.js';
import { noteNameToPc } from '../../web/lib/chordNoteUtils.js';
import { NORMALIZER_VERSION, stableJson, hash } from './common.mjs';

export const VIEWS = ['harmony', 'harmony_bass'];
const modes = new Set(['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian', 'harmonicMinor', 'phrygianDominant']);
const arrays = ['adds', 'omits', 'alterations', 'suspensions', 'substitutions'];
const flags = ['useMaj7', 'halfDim', 'dimTriad', 'appliedDenomMaj', 'flattenHalfDimB5'];
const memo = new Map();
const pc = n => ((n % 12) + 12) % 12;
const tonicName = s => typeof s === 'string' ? s.trim().replaceAll('♭', 'b').replaceAll('♯', '#') : '';

export function strictKey(entry) {
  if (!entry || !modes.has(entry.scale)) throw Error('missing-or-unsupported-key');
  const tonic = tonicName(entry.tonic);
  if (noteNameToPc(tonic) == null) throw Error('missing-or-unsupported-key');
  return { tonic, scale: entry.scale };
}

/** Structured functional identity; roman text is presentation, never the lookup key. */
export function normalizeChord(chord, key) {
  strictKey(key);
  if (!chord || chord.isRest || chord.rest) throw Error('rest');
  if (chord.confidence != null && (!Number.isFinite(chord.confidence) || chord.confidence < 0 || chord.confidence > 1)) throw Error('invalid-confidence');
  for (const field of [...flags, 'uncertain', 'ambiguous', 'isRest', 'rest']) if (chord[field] != null && typeof chord[field] !== 'boolean') throw Error(`invalid-${field}`);
  if (chord.uncertain || chord.ambiguous || chord.confidence != null && chord.confidence < 1) throw Error('uncertain-chord');
  if (!(Number.isInteger(chord.root) && chord.root >= 1 && chord.root <= 7)) throw Error('unresolved-functional-root');
  if (chord.type != null && ![1, 3, 5, 7, 9, 11, 13].includes(chord.type)) throw Error('unsupported-chord-type');
  if (chord.applied != null && (!Number.isInteger(chord.applied) || chord.applied < 0 || chord.applied > 7)) throw Error('unsupported-applied-function');
  if (chord.inversion != null && (!Number.isInteger(chord.inversion) || chord.inversion < 0 || chord.inversion > 6)) throw Error('invalid-inversion');
  if (chord.pedal != null && chord.pedal !== '' && chord.pedal !== 0) throw Error('unresolved-pedal');
  if (chord.alternate) throw Error('unresolved-alternate');
  for (const field of arrays) if (chord[field] != null && !Array.isArray(chord[field])) throw Error(`invalid-${field}`);
  if ((chord.substitutions || []).some(s => s !== 'tri')) throw Error('unsupported-substitution');
  const borrowed = chord.borrowed || null;
  if (borrowed && !(typeof borrowed === 'string' && modes.has(borrowed)) &&
      !(Array.isArray(borrowed) && borrowed.length === 7 && borrowed.every(n => Number.isFinite(n)))) throw Error('unsupported-borrowing');
  const semantic = { root: chord.root, type: chord.type || 5, applied: chord.applied || 0, borrowed,
    ...Object.fromEntries(arrays.map(k => [k, [...new Set(chord[k] || [])].sort((a, b) => String(a).localeCompare(String(b), 'en'))])),
    ...Object.fromEntries(flags.map(k => [k, !!chord[k]])) };
  const memoKey = stableJson([key, semantic, chord.inversion || 0]);
  if (memo.has(memoKey)) return memo.get(memoKey);
  const interpreted = interpretChordContract({ ...semantic, inversion: chord.inversion || 0 }, key);
  const rootPosition = interpretChordContract({ ...semantic, inversion: 0 }, key);
  if (!interpreted.midi.length || interpreted.midi.some(n => !Number.isInteger(n) || n < 1 || n > 127) || !Number.isFinite(interpreted.rootMidi)) throw Error('unresolved-pitches');
  const bassMidi = Math.min(...interpreted.midi);
  const identity = { version: NORMALIZER_VERSION, mode: key.scale, ...semantic,
    rootPc: pc(interpreted.rootMidi - noteNameToPc(key.tonic)),
    intervals: [...new Set(interpreted.pcs.map(n => pc(n - interpreted.rootMidi)))].sort((a, b) => a - b) };
  const result = { tokens: {
    harmony: stableJson(identity),
    harmony_bass: stableJson({ ...identity, inversion: chord.inversion || 0, bassInterval: pc(bassMidi - interpreted.rootMidi) })
  }, degree: rootPosition.roman, roman: interpreted.roman, notes: interpreted.midi,
  rootMidi: interpreted.rootMidi, bassMidi, key, semantic };
  if (memo.size > 100_000) memo.clear();
  memo.set(memoKey, result);
  return result;
}

export function sectionIdentity(songId, section, sourceName = '') {
  const source = section.numericId ?? section.songId ?? section.stringSongId;
  return hash(['section', songId, source != null ? String(source) : sourceName, section.sectionName || '', source == null ? section.sectionIndex ?? null : null]);
}
export function sectionRevision(section) {
  // Cache timestamps/file aliases are not musical content.
  return hash({ chords: section.chords, metadata: section.metadata, songId: section.songId, numericId: section.numericId, sectionName: section.sectionName });
}

export function normalizeSection({ songId, section: rawSection, sourceName = '' }) {
  const section = migrateLegacySectionData(structuredClone(rawSection));
  const sectionId = sectionIdentity(songId, section, sourceName);
  const revision = sectionRevision(rawSection);
  const diagnostics = [], runs = [];
  const chords = Array.isArray(section.chords) ? section.chords : [];
  if (!chords.length) diagnostics.push({ reason: 'missing-chords' });
  const keys = (section.metadata?.keys || []).map((k, index) => ({ ...k, index })).sort((a, b) => a.beat - b.beat || a.index - b.index);
  const events = chords.map((rawChord, index) => {
    const chord = rawChord && typeof rawChord === 'object' && !Array.isArray(rawChord) ? rawChord : {};
    const event = { index, chord, beat: chord.beat, endBeat: chord.beat + chord.duration };
    try {
      if (!Number.isFinite(chord.beat) || !Number.isFinite(chord.duration) || chord.duration <= 0) throw Error('invalid-timing');
      if (index > 0 && chord.beat < chords[index - 1]?.beat) throw Error('unordered-events');
      if (index > 0 && chords[index - 1]?.beat + chords[index - 1]?.duration > chord.beat + 1e-7 ||
          index + 1 < chords.length && chords[index + 1]?.beat < event.endBeat - 1e-7) throw Error('overlapping-source-events');
      const keyEntry = keys.filter(k => Number.isFinite(k.beat) && k.beat <= chord.beat).at(-1);
      if (keyEntry && new Set(keys.filter(k => k.beat === keyEntry.beat).map(k => stableJson([k.tonic,k.scale]))).size > 1) throw Error('conflicting-keys');
      const key = strictKey(keyEntry);
      if (keys.some(k => k.beat > chord.beat && k.beat < event.endBeat)) throw Error('key-change-inside-chord');
      return { ...event, normalized: normalizeChord(chord, key), key };
    } catch (error) {
      diagnostics.push({ index, reason: error.message });
      return { ...event, reason: error.message };
    }
  });
  const denominators = {};
  for (const view of VIEWS) {
    let active = null, observedTransitions = 0, uncertainTransitions = 0;
    const flush = () => { if (active) runs.push(active); active = null; };
    for (const event of events) {
      const previous = events[event.index - 1];
      const touching = previous && Number.isFinite(previous.endBeat) && Math.abs(previous.endBeat - event.beat) < 1e-7;
      const sounding = previous && !previous.chord.isRest && !previous.chord.rest && !event.chord.isRest && !event.chord.rest;
      const sameKey = previous?.key && event.key && stableJson(previous.key) === stableJson(event.key);
      const possibleAdjacency = previous && (touching || !Number.isFinite(previous.endBeat) || !Number.isFinite(event.beat));
      if (possibleAdjacency && sounding && (!sameKey || !previous.normalized || !event.normalized || previous.normalized.tokens[view] !== event.normalized.tokens[view])) {
        observedTransitions++;
        if (!sameKey || !previous.normalized || !event.normalized) uncertainTransitions++;
      }
      if (!event.normalized) { flush(); continue; }
      if (!touching || !sameKey) flush();
      const norm = event.normalized;
      const position = { startIndex: event.index, endIndex: event.index, startBeat: event.beat, endBeat: event.endBeat,
        degree: norm.degree, roman: norm.roman, notes: norm.notes, rootMidi: norm.rootMidi, bassMidi: norm.bassMidi,
        key: event.key, inversion: event.chord.inversion || 0, varyingBass: false };
      if (!active) active = { id: hash([NORMALIZER_VERSION, view, sectionId, event.index]), view, songId, sectionId, revision, tokens: [], positions: [], transitionIds: [], key: event.key };
      if (active.tokens.at(-1) === norm.tokens[view]) {
        const last = active.positions.at(-1);
        last.varyingBass ||= last.bassMidi !== position.bassMidi;
        last.endIndex = event.index; last.endBeat = event.endBeat;
      } else {
        if (active.positions.length) active.transitionIds.push(hash(['transition', songId, sectionId, active.positions.at(-1).endIndex, event.index]));
        active.tokens.push(norm.tokens[view]); active.positions.push(position);
      }
    }
    flush();
    denominators[view] = { observedTransitions, uncertainTransitions, eligibleTransitions: runs.filter(r => r.view === view).reduce((n, r) => n + r.transitionIds.length, 0) };
  }
  return { sectionId, songId, revision, sourceName, sectionName: section.sectionName || sourceName, runs, diagnostics, denominators };
}
