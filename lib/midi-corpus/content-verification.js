'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { hashFile, sha256String } = require('./hash');
const { stableStringify } = require('./stable-json');

const FEATURE_SCHEMA_VERSION = 'midi-content-features/v1';
const VERIFIER_ALGORITHM_VERSION = 'musical-content-local-alignment/v1';
const SCALE_INTERVALS = Object.freeze({
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonicminor: [0, 2, 3, 5, 7, 8, 11],
  phrygiandominant: [0, 1, 4, 5, 7, 8, 10],
});
const NATURAL_PC = Object.freeze({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 });
const VERIFICATION_PARAMETERS = Object.freeze({
  harmonic_weight: 0.65,
  melody_weight: 0.20,
  rhythm_weight: 0.15,
  local_alignment_gap_penalty: 0.42,
  local_alignment_match_floor: 0.72,
  transpositions_tested: 12,
  rhythm_tempo_normalization: 'median-ioi-and-duration',
  melody_representation: 'interval-contour',
});

function round(value, places = 9) {
  const factor = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function modulo12(value) {
  return ((Number(value) % 12) + 12) % 12;
}

function tonicToPc(value) {
  const match = /^([A-Ga-g])([#bx]*)$/.exec(String(value || '').trim());
  if (!match) return null;
  let pc = NATURAL_PC[match[1].toUpperCase()];
  for (const accidental of match[2]) {
    if (accidental === '#') pc += 1;
    else if (accidental === 'b') pc -= 1;
    else if (accidental === 'x') pc += 2;
  }
  return modulo12(pc);
}

function scaleIntervals(value) {
  const normalized = String(value || 'major').toLowerCase().replace(/[^a-z]/g, '');
  return SCALE_INTERVALS[normalized] || SCALE_INTERVALS.major;
}

function keyEvents(section) {
  const metadata = section?.metadata && typeof section.metadata === 'object' ? section.metadata : section;
  const events = Array.isArray(metadata?.keys) ? metadata.keys : [];
  const normalized = events.map((event) => ({
    beat: Number.isFinite(Number(event?.beat)) ? Number(event.beat) : 0,
    tonic: event?.tonic || 'C',
    scale: event?.scale || 'major',
  })).sort((left, right) => left.beat - right.beat);
  return normalized.length ? normalized : [{ beat: 0, tonic: 'C', scale: 'major', defaulted: true }];
}

function keyAtBeat(events, beat) {
  let active = events[0];
  for (const event of events) {
    if (event.beat <= beat) active = event;
    else break;
  }
  return active;
}

function borrowedIntervals(chord, key) {
  if (Array.isArray(chord.borrowed) && chord.borrowed.length >= 7) {
    const values = chord.borrowed.slice(0, 7).map(Number);
    if (values.every(Number.isFinite)) return values;
  }
  if (typeof chord.borrowed === 'string' && chord.borrowed.trim()) return scaleIntervals(chord.borrowed);
  return scaleIntervals(key.scale);
}

function wrappedScaleInterval(intervals, index) {
  const octave = Math.floor(index / 7);
  return intervals[((index % 7) + 7) % 7] + 12 * octave;
}

function chordPitchClasses(chord, key, rootPc) {
  if (Array.isArray(chord.pitch_classes) || Array.isArray(chord.pitchClasses)) {
    return [...new Set((chord.pitch_classes || chord.pitchClasses).map(modulo12))].sort((a, b) => a - b);
  }
  const intervals = Number(chord.applied) >= 1 && Number(chord.applied) <= 7
    ? SCALE_INTERVALS.major
    : borrowedIntervals(chord, key);
  const degree = Number(chord.applied) >= 1 && Number(chord.applied) <= 7
    ? Number(chord.applied) - 1
    : Math.max(0, Math.min(6, Number(chord.root || 1) - 1));
  const base = wrappedScaleInterval(intervals, degree);
  let chordIntervals = [
    0,
    wrappedScaleInterval(intervals, degree + 2) - base,
    wrappedScaleInterval(intervals, degree + 4) - base,
  ];
  if (Number(chord.type || 5) >= 7) chordIntervals.push(wrappedScaleInterval(intervals, degree + 6) - base);
  if (Number(chord.type || 5) >= 9) chordIntervals.push(14);
  if (Number(chord.type || 5) >= 11) chordIntervals.push(17);
  if (Number(chord.type || 5) >= 13) chordIntervals.push(21);

  const suspensions = new Set((chord.suspensions || []).map(Number));
  if (suspensions.has(2) || suspensions.has(4)) {
    chordIntervals = chordIntervals.filter((interval) => ![3, 4].includes(modulo12(interval)));
    if (suspensions.has(2)) chordIntervals.push(2);
    if (suspensions.has(4)) chordIntervals.push(5);
  }
  for (const add of chord.adds || []) {
    const degreeNumber = Number(String(add).replace(/[^0-9]/g, ''));
    if (degreeNumber >= 1) chordIntervals.push(wrappedScaleInterval(SCALE_INTERVALS.major, degreeNumber - 1));
  }
  const omissions = new Set((chord.omits || []).map((value) => Number(String(value).replace(/[^0-9]/g, ''))));
  if (omissions.has(3)) chordIntervals = chordIntervals.filter((interval) => ![3, 4].includes(modulo12(interval)));
  if (omissions.has(5)) chordIntervals = chordIntervals.filter((interval) => modulo12(interval) !== 7);
  for (const alteration of chord.alterations || []) {
    const match = /^([b#])(\d+)$/.exec(String(alteration));
    if (!match) continue;
    const degreeNumber = Number(match[2]);
    const natural = modulo12(wrappedScaleInterval(SCALE_INTERVALS.major, degreeNumber - 1));
    chordIntervals = chordIntervals.filter((interval) => modulo12(interval) !== natural);
    chordIntervals.push(natural + (match[1] === 'b' ? -1 : 1));
  }
  return [...new Set(chordIntervals.map((interval) => modulo12(rootPc + interval)))].sort((a, b) => a - b);
}

function chordRootPc(chord, key) {
  if (Number.isFinite(Number(chord.root_pc ?? chord.rootPitchClass))) {
    return modulo12(chord.root_pc ?? chord.rootPitchClass);
  }
  const tonicPc = tonicToPc(key.tonic) ?? 0;
  const intervals = borrowedIntervals(chord, key);
  const rootDegree = Math.max(0, Math.min(6, Number(chord.root || 1) - 1));
  const targetPc = modulo12(tonicPc + intervals[rootDegree]);
  const applied = Number(chord.applied || 0);
  return applied >= 1 && applied <= 7
    ? modulo12(targetPc + SCALE_INTERVALS.major[applied - 1])
    : targetPc;
}

function harmonicEvents(section) {
  const keys = keyEvents(section);
  return (Array.isArray(section?.chords) ? section.chords : [])
    .filter((chord) => chord && typeof chord === 'object' && !chord.isRest)
    .map((chord, sourceIndex) => {
      const beat = Number.isFinite(Number(chord.beat)) ? Number(chord.beat) : sourceIndex;
      const duration = Number.isFinite(Number(chord.duration)) && Number(chord.duration) > 0
        ? Number(chord.duration)
        : 1;
      const key = keyAtBeat(keys, beat);
      const rootPc = chordRootPc(chord, key);
      return {
        root_pc: rootPc,
        pitch_classes: chordPitchClasses(chord, key, rootPc),
        quality: String(chord.quality || `type:${Number(chord.type || 5)}`),
        beat,
        duration,
      };
    })
    .sort((left, right) => left.beat - right.beat || left.root_pc - right.root_pc);
}

function noteNameToMidi(value) {
  const match = /^([A-Ga-g])([#bx]*)(-?\d+)$/.exec(String(value || '').trim());
  if (!match) return null;
  const pc = tonicToPc(`${match[1]}${match[2]}`);
  return pc === null ? null : (Number(match[3]) + 1) * 12 + pc;
}

function scaleDegreePitch(note, key) {
  const match = /^([#b]*)([1-7])$/.exec(String(note.sd ?? note.scale_degree ?? '').trim());
  if (!match) return null;
  const tonicPc = tonicToPc(key.tonic) ?? 0;
  const degree = Number(match[2]) - 1;
  let accidental = 0;
  for (const symbol of match[1]) accidental += symbol === '#' ? 1 : -1;
  const octave = Number.isFinite(Number(note.octave)) ? Number(note.octave) : 0;
  return 60 + tonicPc + scaleIntervals(key.scale)[degree] + accidental + 12 * octave;
}

function flattenNotes(notes) {
  if (!Array.isArray(notes)) return [];
  return notes.flatMap((value) => (Array.isArray(value) ? value : [value]));
}

function melodyEvents(section) {
  const keys = keyEvents(section);
  return flattenNotes(section?.notes)
    .filter((note) => note && typeof note === 'object' && !note.isRest)
    .map((note, sourceIndex) => {
      const beat = Number.isFinite(Number(note.beat)) ? Number(note.beat) : sourceIndex;
      const key = keyAtBeat(keys, beat);
      let pitch = Number.isFinite(Number(note.midi ?? note.pitch)) ? Number(note.midi ?? note.pitch) : null;
      if (pitch === null && note.name) pitch = noteNameToMidi(note.name);
      if (pitch === null) pitch = scaleDegreePitch(note, key);
      return {
        pitch,
        beat,
        duration: Number.isFinite(Number(note.duration)) && Number(note.duration) > 0
          ? Number(note.duration)
          : 1,
      };
    })
    .filter((note) => Number.isFinite(note.pitch))
    .sort((left, right) => left.beat - right.beat || left.pitch - right.pitch);
}

function selectSection(document, selector) {
  if (document?.schema_version === FEATURE_SCHEMA_VERSION) return { value: document, label: 'precomputed-features' };
  if (document?.schemaVersion === FEATURE_SCHEMA_VERSION) return { value: document, label: 'precomputed-features' };
  if (Array.isArray(document?.sections)) {
    let index = 0;
    if (selector !== undefined && selector !== null) {
      const numeric = Number(selector);
      if (Number.isInteger(numeric) && numeric >= 0 && numeric < document.sections.length) index = numeric;
      else {
        index = document.sections.findIndex((section) => (
          section?.name === selector || section?.hooktheory?.sectionName === selector
        ));
      }
      if (index < 0) throw new Error(`Section selector did not match: ${selector}`);
    }
    const selected = document.sections[index];
    return { value: selected?.hooktheory || selected, label: selected?.name || String(index) };
  }
  if (document?.hooktheory && typeof document.hooktheory === 'object') {
    return { value: document.hooktheory, label: document.hooktheory.sectionName || 'hooktheory' };
  }
  if (Array.isArray(document?.chords) || Array.isArray(document?.notes)) {
    return { value: document, label: document.sectionName || 'root' };
  }
  if (document && typeof document === 'object' && !Array.isArray(document)) {
    const entries = Object.entries(document).filter(([, value]) => (
      value && typeof value === 'object' && (Array.isArray(value.chords) || Array.isArray(value.notes))
    ));
    if (entries.length) {
      const match = selector == null
        ? entries[0]
        : entries.find(([key, value], index) => (
          key === String(selector) || value.sectionName === selector || index === Number(selector)
        ));
      if (!match) throw new Error(`Section selector did not match: ${selector}`);
      return { value: match[1], label: match[0] };
    }
  }
  throw new TypeError('Musical document does not contain a recognizable section or feature object');
}

function normalizePrecomputedFeatures(value) {
  const harmony = (value.harmony || []).map((event) => ({
    root_pc: modulo12(event.root_pc),
    pitch_classes: [...new Set((event.pitch_classes || [event.root_pc]).map(modulo12))].sort((a, b) => a - b),
    quality: String(event.quality || 'unknown'),
    beat: Number(event.beat || 0),
    duration: Number(event.duration || 1),
  }));
  const melody = (value.melody || []).map((event) => ({
    pitch: Number(event.pitch),
    beat: Number(event.beat || 0),
    duration: Number(event.duration || 1),
  })).filter((event) => Number.isFinite(event.pitch));
  return { harmony, melody };
}

function extractMusicalFeatures(document, options = {}) {
  const selected = selectSection(document, options.section);
  const raw = selected.value;
  const core = raw?.schema_version === FEATURE_SCHEMA_VERSION || raw?.schemaVersion === FEATURE_SCHEMA_VERSION
    ? normalizePrecomputedFeatures(raw)
    : { harmony: harmonicEvents(raw), melody: melodyEvents(raw) };
  const features = {
    schema_version: FEATURE_SCHEMA_VERSION,
    section: selected.label,
    harmony: core.harmony,
    melody: core.melody,
  };
  return {
    features,
    feature_sha256: sha256String(stableStringify(features)),
  };
}

async function loadFeatureInput(input, options = {}) {
  let document;
  let documentProvenance;
  if (typeof input === 'string') {
    const absolutePath = path.resolve(input);
    const raw = await fsp.readFile(absolutePath);
    const hashed = await hashFile(absolutePath);
    if (raw.length >= 4 && raw.subarray(0, 4).toString('ascii') === 'MThd') {
      const analyzerUrl = pathToFileURL(path.join(__dirname, '..', 'midi', 'analyze', 'index.js')).href;
      const { analyzeMidi } = await import(analyzerUrl);
      document = await analyzeMidi(raw, { filename: path.basename(absolutePath), topK: 5 });
      documentProvenance = {
        kind: 'local_midi_file',
        path: absolutePath,
        bytes: hashed.bytes,
        document_sha256: hashed.sha256,
        analyzer_schema_version: document.schemaVersion,
        analyzer_source_sha256: document.source?.sha256 || null,
      };
    } else {
      document = JSON.parse(raw.toString('utf8'));
      documentProvenance = {
        kind: 'local_json_file',
        path: absolutePath,
        bytes: hashed.bytes,
        document_sha256: hashed.sha256,
      };
    }
  } else if (input && typeof input === 'object') {
    document = input;
    const canonical = stableStringify(input);
    documentProvenance = {
      kind: 'inline_json',
      bytes: Buffer.byteLength(canonical),
      document_sha256: sha256String(canonical),
    };
  } else {
    throw new TypeError('Verification input must be a JSON file path or object');
  }
  const extracted = extractMusicalFeatures(document, { section: options.section });
  return {
    ...extracted,
    provenance: {
      ...documentProvenance,
      selected_section: extracted.features.section,
      feature_schema_version: FEATURE_SCHEMA_VERSION,
      feature_sha256: extracted.feature_sha256,
      ...(options.provenance || {}),
    },
  };
}

function setSimilarity(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function positiveRatioSimilarity(left, right) {
  if (!(left > 0) || !(right > 0)) return left === right ? 1 : 0;
  return Math.exp(-Math.abs(Math.log(left / right)));
}

function localAlign(reference, candidate, similarity, options = {}) {
  const n = reference.length;
  const m = candidate.length;
  if (!n || !m) return null;
  const gapPenalty = options.gapPenalty ?? VERIFICATION_PARAMETERS.local_alignment_gap_penalty;
  const matchFloor = options.matchFloor ?? VERIFICATION_PARAMETERS.local_alignment_match_floor;
  let previousScore = new Float64Array(m + 1);
  let previousPairs = new Uint32Array(m + 1);
  let previousSimilarity = new Float64Array(m + 1);
  let previousRefStart = new Int32Array(m + 1);
  let previousCandidateStart = new Int32Array(m + 1);
  let best = null;

  for (let i = 1; i <= n; i += 1) {
    const score = new Float64Array(m + 1);
    const pairs = new Uint32Array(m + 1);
    const similaritySum = new Float64Array(m + 1);
    const refStart = new Int32Array(m + 1);
    const candidateStart = new Int32Array(m + 1);
    for (let j = 1; j <= m; j += 1) {
      const pairSimilarity = similarity(reference[i - 1], candidate[j - 1]);
      const diagonal = previousScore[j - 1] + (2 * pairSimilarity - matchFloor);
      const up = previousScore[j] - gapPenalty;
      const left = score[j - 1] - gapPenalty;
      let direction = 0;
      let selected = 0;
      if (diagonal > selected) { selected = diagonal; direction = 1; }
      if (up > selected) { selected = up; direction = 2; }
      if (left > selected) { selected = left; direction = 3; }
      if (direction === 0) continue;
      score[j] = selected;
      if (direction === 1) {
        const continuing = previousScore[j - 1] > 0;
        pairs[j] = previousPairs[j - 1] + 1;
        similaritySum[j] = previousSimilarity[j - 1] + pairSimilarity;
        refStart[j] = continuing ? previousRefStart[j - 1] : i - 1;
        candidateStart[j] = continuing ? previousCandidateStart[j - 1] : j - 1;
      } else if (direction === 2) {
        pairs[j] = previousPairs[j];
        similaritySum[j] = previousSimilarity[j];
        refStart[j] = previousRefStart[j];
        candidateStart[j] = previousCandidateStart[j];
      } else {
        pairs[j] = pairs[j - 1];
        similaritySum[j] = similaritySum[j - 1];
        refStart[j] = refStart[j - 1];
        candidateStart[j] = candidateStart[j - 1];
      }
      if (!best || selected > best.rawScore
        || (selected === best.rawScore && pairs[j] > best.pairs)) {
        best = {
          rawScore: selected,
          pairs: pairs[j],
          similaritySum: similaritySum[j],
          referenceStart: refStart[j],
          referenceEnd: i,
          candidateStart: candidateStart[j],
          candidateEnd: j,
        };
      }
    }
    previousScore = score;
    previousPairs = pairs;
    previousSimilarity = similaritySum;
    previousRefStart = refStart;
    previousCandidateStart = candidateStart;
  }
  if (!best || best.pairs === 0) return null;
  const coverage = best.pairs / Math.min(n, m);
  const meanSimilarity = best.similaritySum / best.pairs;
  return {
    score: round(Math.max(0, Math.min(1, coverage * meanSimilarity))),
    coverage: round(coverage),
    mean_similarity: round(meanSimilarity),
    paired_events: best.pairs,
    reference_span: [best.referenceStart, best.referenceEnd],
    candidate_span: [best.candidateStart, best.candidateEnd],
  };
}

function transposeHarmonicEvent(event, semitones) {
  return {
    ...event,
    root_pc: modulo12(event.root_pc + semitones),
    pitch_classes: event.pitch_classes.map((pc) => modulo12(pc + semitones)).sort((a, b) => a - b),
  };
}

function harmonicEventSimilarity(reference, candidate) {
  const root = reference.root_pc === candidate.root_pc ? 1 : 0;
  const pitchClasses = setSimilarity(reference.pitch_classes, candidate.pitch_classes);
  const quality = reference.quality === candidate.quality ? 1 : 0.35;
  const duration = positiveRatioSimilarity(reference.duration, candidate.duration);
  return 0.48 * root + 0.30 * pitchClasses + 0.14 * quality + 0.08 * duration;
}

function alignHarmony(reference, candidate) {
  let best = null;
  for (let semitones = 0; semitones < 12; semitones += 1) {
    const shifted = candidate.map((event) => transposeHarmonicEvent(event, semitones));
    const alignment = localAlign(reference, shifted, harmonicEventSimilarity);
    if (!alignment) continue;
    if (!best || alignment.score > best.score
      || (alignment.score === best.score && alignment.paired_events > best.paired_events)) {
      best = { ...alignment, transposition: semitones };
    }
  }
  if (!best) {
    return {
      score: 0,
      coverage: 0,
      mean_similarity: 0,
      paired_events: 0,
      reference_span: [0, 0],
      candidate_span: [0, 0],
      transposition_semitones: 0,
    };
  }
  return {
    ...best,
    transposition_semitones: best.transposition > 5 ? best.transposition - 12 : best.transposition,
  };
}

function median(values) {
  const sorted = values.filter((value) => value > 0 && Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return 1;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function melodyContour(notes) {
  if (notes.length < 2) return [];
  const iois = notes.slice(0, -1).map((note, index) => notes[index + 1].beat - note.beat);
  const scale = median(iois);
  return notes.slice(0, -1).map((note, index) => ({
    interval: notes[index + 1].pitch - note.pitch,
    ioi: iois[index] > 0 ? iois[index] / scale : 0,
  }));
}

function melodicIntervalSimilarity(left, right) {
  const distances = [
    Math.abs(left.interval - right.interval),
    Math.abs(left.interval - right.interval - 12),
    Math.abs(left.interval - right.interval + 12),
  ];
  let pitch = Math.exp(-Math.min(...distances) / 2.5);
  if (Math.sign(left.interval) !== Math.sign(right.interval) && left.interval && right.interval) pitch *= 0.4;
  return 0.82 * pitch + 0.18 * positiveRatioSimilarity(left.ioi, right.ioi);
}

function rhythmSignature(events) {
  if (events.length < 2) return [];
  const iois = events.slice(0, -1).map((event, index) => events[index + 1].beat - event.beat);
  const durations = events.slice(0, -1).map((event) => event.duration);
  const ioiMedian = median(iois);
  const durationMedian = median(durations);
  return iois.map((ioi, index) => ({
    ioi: ioi > 0 ? ioi / ioiMedian : 0,
    duration: durations[index] > 0 ? durations[index] / durationMedian : 0,
  }));
}

function rhythmEventSimilarity(left, right) {
  return 0.7 * positiveRatioSimilarity(left.ioi, right.ioi)
    + 0.3 * positiveRatioSimilarity(left.duration, right.duration);
}

function compareMusicalFeatures(reference, candidate) {
  const harmonic = alignHarmony(reference.harmony || [], candidate.harmony || []);
  const referenceMelody = melodyContour(reference.melody || []);
  const candidateMelody = melodyContour(candidate.melody || []);
  const melody = referenceMelody.length && candidateMelody.length
    ? localAlign(referenceMelody, candidateMelody, melodicIntervalSimilarity)
    : null;
  const referenceRhythmSource = reference.harmony?.length >= 2 ? reference.harmony : reference.melody;
  const candidateRhythmSource = candidate.harmony?.length >= 2 ? candidate.harmony : candidate.melody;
  const referenceRhythm = rhythmSignature(referenceRhythmSource || []);
  const candidateRhythm = rhythmSignature(candidateRhythmSource || []);
  const rhythm = referenceRhythm.length && candidateRhythm.length
    ? localAlign(referenceRhythm, candidateRhythm, rhythmEventSimilarity)
    : null;

  const components = [
    { value: harmonic.score, weight: VERIFICATION_PARAMETERS.harmonic_weight },
  ];
  if (melody) components.push({ value: melody.score, weight: VERIFICATION_PARAMETERS.melody_weight });
  if (rhythm) components.push({ value: rhythm.score, weight: VERIFICATION_PARAMETERS.rhythm_weight });
  const weight = components.reduce((sum, component) => sum + component.weight, 0);
  const total = components.reduce((sum, component) => sum + component.value * component.weight, 0) / weight;
  return {
    algorithm_version: VERIFIER_ALGORITHM_VERSION,
    parameters: VERIFICATION_PARAMETERS,
    total_score: round(total),
    harmonic,
    melody,
    rhythm,
    feature_counts: {
      reference_harmonic_events: reference.harmony?.length || 0,
      candidate_harmonic_events: candidate.harmony?.length || 0,
      reference_melody_events: reference.melody?.length || 0,
      candidate_melody_events: candidate.melody?.length || 0,
    },
  };
}

function resolveMetadataMatch(db, options) {
  let rows;
  if (options.metadataAlgorithmVersion) {
    rows = db.prepare(`
      SELECT * FROM metadata_matches
      WHERE manifest_id = ? AND record_id = ? AND source_id = ? AND source_item_id = ?
        AND algorithm_version = ?
    `).all(
      options.manifestId,
      options.recordId,
      options.sourceId,
      options.sourceItemId,
      options.metadataAlgorithmVersion,
    );
  } else {
    rows = db.prepare(`
      SELECT * FROM metadata_matches
      WHERE manifest_id = ? AND record_id = ? AND source_id = ? AND source_item_id = ?
      ORDER BY algorithm_version COLLATE BINARY
    `).all(options.manifestId, options.recordId, options.sourceId, options.sourceItemId);
  }
  if (rows.length === 0) {
    const error = new Error('Metadata match does not exist; content verification cannot invent a candidate match');
    error.code = 'METADATA_MATCH_NOT_FOUND';
    throw error;
  }
  if (rows.length > 1) {
    const error = new Error('Multiple metadata matching algorithms exist; specify metadataAlgorithmVersion');
    error.code = 'AMBIGUOUS_METADATA_MATCH';
    throw error;
  }
  return rows[0];
}

function frozenCalibration(db, calibrationId) {
  if (calibrationId) {
    return db.prepare(`
      SELECT * FROM verification_calibrations
      WHERE calibration_id = ? AND verifier_algorithm_version = ? AND valid = 1 AND frozen = 1
    `).get(calibrationId, VERIFIER_ALGORITHM_VERSION) || null;
  }
  return db.prepare(`
    SELECT calibration.*
    FROM active_verification_calibrations AS active
    JOIN verification_calibrations AS calibration USING (calibration_id)
    WHERE active.verifier_algorithm_version = ?
      AND calibration.valid = 1 AND calibration.frozen = 1
  `).get(VERIFIER_ALGORITHM_VERSION) || null;
}

async function verifyContentMatch(db, options) {
  const match = resolveMetadataMatch(db, options);
  const [reference, candidate] = await Promise.all([
    loadFeatureInput(options.reference, {
      section: options.referenceSection,
      provenance: options.referenceProvenance,
    }),
    loadFeatureInput(options.candidate, {
      section: options.candidateSection,
      provenance: options.candidateProvenance,
    }),
  ]);
  const result = compareMusicalFeatures(reference.features, candidate.features);
  const calibration = frozenCalibration(db, options.calibrationId);
  const threshold = calibration ? Number(calibration.selected_threshold) : null;
  const disposition = !calibration
    ? 'quarantine_no_frozen_calibration'
    : (result.total_score >= threshold ? 'auto_accept' : 'quarantine_below_threshold');
  const parameterSha256 = sha256String(stableStringify(VERIFICATION_PARAMETERS));
  const identity = {
    match: {
      manifest_id: match.manifest_id,
      record_id: match.record_id,
      source_id: match.source_id,
      source_item_id: match.source_item_id,
      metadata_algorithm_version: match.algorithm_version,
    },
    verifier_algorithm_version: VERIFIER_ALGORITHM_VERSION,
    reference_sha256: reference.feature_sha256,
    candidate_sha256: candidate.feature_sha256,
    feature_parameters_sha256: parameterSha256,
    calibration_id: calibration?.calibration_id || null,
  };
  const verificationId = `sha256:${sha256String(stableStringify(identity))}`;
  const persistedResult = {
    ...result,
    verification_id: verificationId,
    disposition,
    calibration: calibration ? {
      calibration_id: calibration.calibration_id,
      threshold,
      wilson_precision_lower_bound: Number(calibration.wilson_precision_lower_bound),
      known_positive_coverage: Number(calibration.known_positive_coverage),
      frozen: true,
    } : null,
  };

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT OR IGNORE INTO content_verification_results (
        verification_id, manifest_id, record_id, source_id, source_item_id,
        metadata_algorithm_version, verifier_algorithm_version,
        reference_sha256, candidate_sha256, feature_parameters_sha256,
        harmonic_score, melody_score, rhythm_score, total_score,
        transposition_semitones, calibration_id, applied_threshold, disposition,
        reference_provenance_json, candidate_provenance_json, result_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      verificationId,
      match.manifest_id,
      match.record_id,
      match.source_id,
      match.source_item_id,
      match.algorithm_version,
      VERIFIER_ALGORITHM_VERSION,
      reference.feature_sha256,
      candidate.feature_sha256,
      parameterSha256,
      result.harmonic.score,
      result.melody?.score ?? null,
      result.rhythm?.score ?? null,
      result.total_score,
      result.harmonic.transposition_semitones,
      calibration?.calibration_id || null,
      threshold,
      disposition,
      stableStringify(reference.provenance),
      stableStringify(candidate.provenance),
      stableStringify(persistedResult),
    );
    db.prepare(`
      INSERT INTO metadata_match_verification_state (
        manifest_id, record_id, source_id, source_item_id, metadata_algorithm_version,
        verification_id, disposition
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(manifest_id, record_id, source_id, source_item_id, metadata_algorithm_version)
      DO UPDATE SET
        verification_id = excluded.verification_id,
        disposition = excluded.disposition,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      match.manifest_id,
      match.record_id,
      match.source_id,
      match.source_item_id,
      match.algorithm_version,
      verificationId,
      disposition,
    );
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
  return {
    ...persistedResult,
    reference_provenance: reference.provenance,
    candidate_provenance: candidate.provenance,
  };
}

module.exports = {
  FEATURE_SCHEMA_VERSION,
  SCALE_INTERVALS,
  VERIFICATION_PARAMETERS,
  VERIFIER_ALGORITHM_VERSION,
  alignHarmony,
  compareMusicalFeatures,
  extractMusicalFeatures,
  frozenCalibration,
  harmonicEventSimilarity,
  loadFeatureInput,
  localAlign,
  melodyContour,
  rhythmSignature,
  verifyContentMatch,
};
