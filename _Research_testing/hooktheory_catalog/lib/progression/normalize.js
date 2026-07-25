/**
 * Normalize section chord progressions into pitch-class and functional tokens.
 */

const path = require('path');
const { pathToFileURL } = require('url');
const { getRepoRoot } = require('../../../../lib/dataRoot');
const { activeKeyAtBeat } = require('./activeKeyAtBeat');
const {
  chordAttributeFlags,
  windowAttributeFlags,
  windowMetadataExtras,
} = require('./attributeFlags');
const { chordRootPc } = require('../../../../_Decode_oracle/chordRootPc');
const { noteToPc } = require('../../../../_Decode_oracle/svgTruth');

const SEARCH_MODES = ['pitch_class', 'functional'];
const PROBE_CAP = 32;
const PROGRESSION_SEP = '|';

let symbolFnsPromise = null;

async function loadSymbolFns() {
  if (symbolFnsPromise) return symbolFnsPromise;
  symbolFnsPromise = (async () => {
    const modPath = path.join(getRepoRoot(), 'web-player', 'lib', 'jsonToSymbol.js');
    const mod = await import(pathToFileURL(modPath).href);
    return { getChordSymbol: mod.getChordSymbol };
  })();
  return symbolFnsPromise;
}

function parseFallbackKey(metadata) {
  const k = metadata?.keys?.[0];
  return {
    tonic: String(k?.tonic || 'C').replace(/♭/g, 'b').replace(/♯/g, '#'),
    scale: k?.scale || 'major',
  };
}

function normalizeBeat(beat) {
  return beat === 0 ? 1 : beat;
}

function chordDuration(chord) {
  return typeof chord.duration === 'number' ? chord.duration : 1;
}

function extractChordRows(sectionData) {
  const metadata = sectionData.metadata || {};
  const fallbackKey = parseFallbackKey(metadata);
  const chords = (sectionData.chords || [])
    .filter((c) => !c.isRest)
    .sort((a, b) => normalizeBeat(a.beat) - normalizeBeat(b.beat));
  return { metadata, fallbackKey, chords };
}

function pitchClassToken(chord, metadata, fallbackKey) {
  const beat = normalizeBeat(chord.beat);
  const key = activeKeyAtBeat(metadata.keys, beat, fallbackKey);
  const rootPc = chordRootPc(chord, key);
  const tonicPc = noteToPc(key.tonic);
  if (rootPc == null || tonicPc == null) return null;
  return String(((rootPc - tonicPc) % 12 + 12) % 12);
}

async function buildTokenRows(sectionData) {
  const { getChordSymbol } = await loadSymbolFns();
  const { metadata, fallbackKey, chords } = extractChordRows(sectionData);
  const rows = [];
  for (const chord of chords) {
    const beat = normalizeBeat(chord.beat);
    const key = activeKeyAtBeat(metadata.keys, beat, fallbackKey);
    const functional = getChordSymbol(chord, key);
    const pitch = pitchClassToken(chord, metadata, fallbackKey);
    if (!functional || pitch == null) continue;
    rows.push({
      chord,
      beat,
      duration: chordDuration(chord),
      key,
      functional,
      pitch,
      flags: chordAttributeFlags(chord, functional),
    });
  }
  return rows;
}

function buildWindowsFromRows(rows, maxLen, modes = SEARCH_MODES) {
  const cap = Math.min(maxLen, rows.length, PROBE_CAP);
  const windows = [];
  if (!rows.length || cap < 1) return windows;

  for (const mode of modes) {
    const tokens = rows.map((r) => (mode === 'pitch_class' ? r.pitch : r.functional));
    for (let len = 1; len <= cap; len++) {
      for (let start = 0; start <= rows.length - len; start++) {
        const slice = rows.slice(start, start + len);
        const progression = tokens.slice(start, start + len).join(PROGRESSION_SEP);
        const beatDuration = slice.reduce((s, r) => s + r.duration, 0);
        const durations = slice.map((r) => r.duration);
        const beats = slice.map((r) => r.beat);
        const minChordDuration = Math.min(...durations);
        const key = slice[0].key;
        windows.push({
          progression,
          length: len,
          search_mode: mode,
          start_position: start,
          beat_duration: beatDuration,
          attribute_flags: windowAttributeFlags(slice.map((r) => r.flags)),
          metadata: JSON.stringify({
            beats,
            durations,
            min_chord_duration: minChordDuration,
            key_tonic: key.tonic,
            key_scale: key.scale,
            tokens: tokens.slice(start, start + len),
            ...windowMetadataExtras(slice.map((r) => r.chord)),
          }),
        });
      }
    }
  }
  return windows;
}

async function normalizeSection(sectionData, { maxLen = PROBE_CAP, modes = SEARCH_MODES } = {}) {
  const rows = await buildTokenRows(sectionData);
  return buildWindowsFromRows(rows, maxLen, modes);
}

function ngramRowFromWindow(slug, sectionType, window) {
  return {
    progression: window.progression,
    length: window.length,
    search_mode: window.search_mode,
    slug,
    section_type: sectionType,
    start_position: window.start_position,
    beat_duration: window.beat_duration,
    attribute_flags: window.attribute_flags,
    metadata: typeof window.metadata === 'string' ? window.metadata : JSON.stringify(window.metadata),
  };
}

function parseSequenceInput(sequence) {
  if (!sequence) return [];
  return String(sequence)
    .split(/[|→>,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function sequenceToProgression(tokens) {
  return tokens.join(PROGRESSION_SEP);
}

module.exports = {
  SEARCH_MODES,
  PROBE_CAP,
  PROGRESSION_SEP,
  loadSymbolFns,
  extractChordRows,
  buildTokenRows,
  buildWindowsFromRows,
  normalizeSection,
  ngramRowFromWindow,
  parseSequenceInput,
  sequenceToProgression,
};
