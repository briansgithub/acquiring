import { chordInterpreter } from "../../../web-player/lib/music.js";
import { activeKeyAtBeat } from "../shared/timeline.mjs";

import { createHash } from "node:crypto";

const HARMONIC_FIELDS = [
  "root", "type", "inversion", "applied", "borrowed",
  "adds", "omits", "alterations", "suspensions", "substitutions",
];

function arrayValue(value) {
  return Array.isArray(value)
    ? [...value].map(String).sort().join("|")
    : value == null ? "" : String(value);
}

function fieldEqual(left, right, field) {
  if (["adds", "omits", "alterations", "suspensions", "substitutions", "borrowed"].includes(field)) {
    return arrayValue(left?.[field]) === arrayValue(right?.[field]);
  }
  const defaults = { type: 5, inversion: 0, applied: 0 };
  return (left?.[field] ?? defaults[field] ?? null) === (right?.[field] ?? defaults[field] ?? null);
}

export function harmonicObjectEqual(left, right) {
  return HARMONIC_FIELDS.every((field) => fieldEqual(left, right, field));
}

export function harmonicObjectSignature(chord) {
  return HARMONIC_FIELDS.map((field) => `${field}=${arrayValue(chord?.[field] ?? ({ type: 5, inversion: 0, applied: 0 }[field]))}`).join(";");
}

function sectionContract(value) {
  if (!value) return { chords: [], notes: [], metadata: {} };
  if (value.hooktheory) return value.hooktheory;
  if (value.bestPath) return value.bestPath;
  if (value.sections?.length) return sectionContract(value.sections[0]);
  return value;
}

function soundingChords(section) {
  return (sectionContract(section).chords || []).filter((chord) => !chord.isRest);
}

function melodyNotes(section) {
  const notes = sectionContract(section).notes;
  if (Array.isArray(notes)) return notes.filter((note) => !note.isRest);
  if (notes && Array.isArray(notes.melody1)) return notes.melody1.filter((note) => !note.isRest);
  return [];
}

function greedyMatch(expected, actual, tolerance, position = (event) => Number(event.beat ?? 1)) {
  const used = new Set();
  const pairs = [];
  for (let expectedIndex = 0; expectedIndex < expected.length; expectedIndex += 1) {
    let winner = -1;
    let winnerDistance = Infinity;
    for (let actualIndex = 0; actualIndex < actual.length; actualIndex += 1) {
      if (used.has(actualIndex)) continue;
      const distance = Math.abs(position(expected[expectedIndex]) - position(actual[actualIndex]));
      if (distance <= tolerance && distance < winnerDistance) {
        winner = actualIndex;
        winnerDistance = distance;
      }
    }
    if (winner >= 0) {
      used.add(winner);
      pairs.push({ expectedIndex, actualIndex: winner, distance: winnerDistance });
    }
  }
  return pairs;
}

function prf(matches, expected, actual) {
  const precision = actual ? matches / actual : expected ? 0 : 1;
  const recall = expected ? matches / expected : actual ? 0 : 1;
  return {
    matches,
    expected,
    actual,
    precision,
    recall,
    f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0,
  };
}

function barePc(note) {
  const match = /^([A-Ga-g])([#bx]*)(?:-?\d+)?$/.exec(String(note));
  if (!match) return null;
  let pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1].toUpperCase()];
  for (const accidental of match[2]) pc += accidental === "b" ? -1 : accidental === "x" ? 2 : 1;
  return ((pc % 12) + 12) % 12;
}

function renderedSignature(chord, key) {
  try {
    const notes = chordInterpreter(chord, key).notes || [];
    const pcs = [...new Set(notes.map(barePc).filter(Number.isInteger))].sort((a, b) => a - b);
    return `${pcs.join(",")}/${notes.length ? barePc(notes[0]) : ""}`;
  } catch {
    return null;
  }
}

function chordEvidence(chord, key) {
  try {
    const notes = chordInterpreter(chord, key).notes || [];
    const rootNotes = chordInterpreter({ ...chord, inversion: 0 }, key).notes || [];
    const pcs = [...new Set(notes.map(barePc).filter(Number.isInteger))].sort((a, b) => a - b);
    const rootPc = rootNotes.length ? barePc(rootNotes[0]) : null;
    const bassPc = notes.length ? barePc(notes[0]) : null;
    const intervals = new Set(pcs.map((pc) => ((pc - rootPc) % 12 + 12) % 12));
    const quality = intervals.has(4) && intervals.has(7) ? "major"
      : intervals.has(3) && intervals.has(7) ? "minor"
        : intervals.has(3) && intervals.has(6) ? "diminished"
          : intervals.has(4) && intervals.has(8) ? "augmented"
            : "other";
    return { pcs, rootPc, bassPc, quality };
  } catch {
    return { pcs: [], rootPc: null, bassPc: null, quality: "unknown" };
  }
}

function tonicPc(tonic) {
  const match = /^([A-Ga-g])([#bx]*)$/.exec(String(tonic || ""));
  if (!match) return null;
  let pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1].toUpperCase()];
  for (const accidental of match[2]) pc += accidental === "b" ? -1 : accidental === "x" ? 2 : 1;
  return ((pc % 12) + 12) % 12;
}

function keyMirexScore(expected, actual) {
  const expectedPc = tonicPc(expected.tonic);
  const actualPc = tonicPc(actual.tonic);
  if (expectedPc === null || actualPc === null) return 0;
  if (expectedPc === actualPc && expected.scale === actual.scale) return 1;
  const delta = ((actualPc - expectedPc) % 12 + 12) % 12;
  if (expected.scale === actual.scale && (delta === 5 || delta === 7)) return 0.5;
  const expectedMinor = expected.scale === "minor";
  const actualMinor = actual.scale === "minor";
  if (expectedMinor !== actualMinor) {
    if ((!expectedMinor && delta === 9) || (expectedMinor && delta === 3)) return 0.3;
    if (delta === 0) return 0.2;
  }
  return 0;
}

function keyTimelineScore(expectedSection, actualSection) {
  const expected = sectionContract(expectedSection);
  const actual = sectionContract(actualSection);
  const expectedKeys = expected.metadata?.keys || [];
  const actualKeys = actual.metadata?.keys || [];
  const endBeat = Math.max(
    Number(expected.metadata?.endBeat || 1),
    Number(actual.metadata?.endBeat || 1),
    ...soundingChords(expected).map((chord) => Number(chord.beat || 1) + Number(chord.duration || 0)),
  );
  const boundaries = [...new Set([
    1,
    endBeat,
    ...expectedKeys.map((key) => Number(key.beat || 1)),
    ...actualKeys.map((key) => Number(key.beat || 1)),
  ])].filter(Number.isFinite).sort((a, b) => a - b);
  let exact = 0;
  let tonic = 0;
  let mirex = 0;
  let total = 0;
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (end <= start) continue;
    const midpoint = (start + end) / 2;
    const expectedKey = activeKeyAtBeat(expectedKeys, midpoint);
    const actualKey = activeKeyAtBeat(actualKeys, midpoint);
    const weight = end - start;
    total += weight;
    if (expectedKey.tonic === actualKey.tonic) tonic += weight;
    if (expectedKey.tonic === actualKey.tonic && expectedKey.scale === actualKey.scale) exact += weight;
    mirex += weight * keyMirexScore(expectedKey, actualKey);
  }
  return {
    exact: total ? exact / total : 1,
    tonic: total ? tonic / total : 1,
    mirex: total ? mirex / total : 1,
    durationBeats: total,
  };
}

const SCALE_INTERVALS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
};

function melodyPc(note, key) {
  const match = /^([#b]*)(\d+)$/.exec(String(note.sd || ""));
  const tonic = tonicPc(key.tonic);
  if (!match || tonic === null) return null;
  const degree = Number(match[2]);
  const scale = SCALE_INTERVALS[key.scale] || SCALE_INTERVALS.major;
  const octave = Math.floor((degree - 1) / 7);
  let accidental = 0;
  for (const symbol of match[1]) accidental += symbol === "b" ? -1 : 1;
  return ((tonic + scale[(degree - 1) % 7] + octave * 12 + accidental) % 12 + 12) % 12;
}

function accuracyVsCoverage(rows, coverageTargets = [0.1, 0.25, 0.5, 0.75, 1]) {
  if (!rows.length) return { count: 0, points: [] };
  const ranked = [...rows].sort((left, right) => (
    Number(right.probability ?? right.confidence ?? 0)
      - Number(left.probability ?? left.confidence ?? 0)
  ));
  return {
    count: ranked.length,
    points: coverageTargets.map((target) => {
      const count = Math.max(1, Math.min(ranked.length, Math.ceil(ranked.length * target)));
      const accepted = ranked.slice(0, count);
      return {
        targetCoverage: target,
        coverage: count / ranked.length,
        count,
        confidenceThreshold: Number(accepted.at(-1)?.probability ?? accepted.at(-1)?.confidence ?? 0),
        accuracy: accepted.reduce((sum, row) => sum + (row.success ? 1 : 0), 0) / count,
      };
    }),
  };
}

function calibration(rows, bins = 10) {
  if (!rows.length) return { brier: null, ece: null, count: 0, bins: [] };
  let brier = 0;
  const buckets = Array.from({ length: bins }, (_, index) => ({
    index,
    lower: index / bins,
    upper: (index + 1) / bins,
    count: 0,
    probability: 0,
    success: 0,
  }));
  for (const row of rows) {
    const probability = Math.max(0, Math.min(1, Number(row.probability ?? row.confidence ?? 0)));
    const success = row.success ? 1 : 0;
    brier += (probability - success) ** 2;
    const bucket = buckets[Math.min(bins - 1, Math.floor(probability * bins))];
    bucket.count += 1;
    bucket.probability += probability;
    bucket.success += success;
  }
  let ece = 0;
  for (const bucket of buckets) {
    if (!bucket.count) continue;
    ece += (bucket.count / rows.length)
      * Math.abs(bucket.probability / bucket.count - bucket.success / bucket.count);
  }
  return {
    brier: brier / rows.length,
    ece,
    count: rows.length,
    bins: buckets.filter((bucket) => bucket.count).map((bucket) => ({
      index: bucket.index,
      lower: bucket.lower,
      upper: bucket.upper,
      count: bucket.count,
      meanConfidence: bucket.probability / bucket.count,
      accuracy: bucket.success / bucket.count,
    })),
  };
}

export function evaluateAnalysis(truthInput, analysisDocument, options = {}) {
  const tolerance = Number(options.beatTolerance ?? 0.25);
  const truth = sectionContract(truthInput);
  const predictedSection = analysisDocument.sections?.[0] || analysisDocument;
  const predicted = sectionContract(predictedSection);
  const expectedChords = soundingChords(truth);
  const actualChords = soundingChords(predicted);
  const chordPairs = greedyMatch(expectedChords, actualChords, tolerance);
  const alternativesByIndex = new Map(
    (predictedSection.analysis?.chordAlternatives || []).map((row) => [row.chordIndex, row]),
  );
  const fieldCorrect = Object.fromEntries(HARMONIC_FIELDS.map((field) => [field, 0]));
  let exactObjects = 0;
  let top3 = 0;
  let top5 = 0;
  let forwardEquivalent = 0;
  const expectedEvidenceRows = expectedChords.map((chord) => {
    const key = activeKeyAtBeat(truth.metadata?.keys || [], chord.beat ?? 1);
    return {
      chord,
      key,
      evidence: chordEvidence(chord, key),
      duration: Math.max(0, Number(chord.duration || 0)) || 1,
      signature: harmonicObjectSignature(chord),
    };
  });
  const durationTotal = expectedEvidenceRows.reduce((sum, row) => sum + row.duration, 0);
  const durationCorrect = { root: 0, majMin: 0, triad: 0, tetrad: 0, inversion: 0 };
  const majMinDurationTotal = expectedEvidenceRows.reduce(
    (sum, row) => sum + (["major", "minor"].includes(row.evidence.quality) ? row.duration : 0),
    0,
  );
  const rareThreshold = Number(options.rareOccurrenceThreshold ?? 5);
  const suppliedRare = new Set(options.rareSignatures || []);
  const signatureCounts = options.signatureCounts instanceof Map
    ? options.signatureCounts
    : new Map(Object.entries(options.signatureCounts || {}));
  for (const [signature, count] of signatureCounts) {
    if (Number(count) <= rareThreshold) suppliedRare.add(signature);
  }
  const rareRows = new Map();
  if (suppliedRare.size) {
    for (const row of expectedEvidenceRows) {
      if (!suppliedRare.has(row.signature)) continue;
      const aggregate = rareRows.get(row.signature) || { total: 0, correct: 0 };
      aggregate.total += 1;
      rareRows.set(row.signature, aggregate);
    }
  }
  const matchByActual = new Map();
  for (const pair of chordPairs) {
    const expected = expectedChords[pair.expectedIndex];
    const actual = actualChords[pair.actualIndex];
    for (const field of HARMONIC_FIELDS) {
      if (fieldEqual(expected, actual, field)) fieldCorrect[field] += 1;
    }
    const exact = harmonicObjectEqual(expected, actual);
    if (exact) exactObjects += 1;
    const alternativesRow = alternativesByIndex.get(pair.actualIndex);
    const alternatives = alternativesRow?.alternatives || [];
    if (alternatives.slice(0, 3).some((candidate) => harmonicObjectEqual(expected, candidate.chord))) top3 += 1;
    if (alternatives.slice(0, 5).some((candidate) => harmonicObjectEqual(expected, candidate.chord))) top5 += 1;
    const expectedRow = expectedEvidenceRows[pair.expectedIndex];
    const expectedKey = expectedRow.key;
    const actualKey = activeKeyAtBeat(predicted.metadata?.keys || [], actual.beat ?? 1);
    const expectedEvidence = expectedRow.evidence;
    const actualEvidence = chordEvidence(actual, actualKey);
    const durationWeight = expectedRow.duration;
    if (expectedEvidence.rootPc === actualEvidence.rootPc) durationCorrect.root += durationWeight;
    if (["major", "minor"].includes(expectedEvidence.quality)) {
      if (expectedEvidence.rootPc === actualEvidence.rootPc
        && expectedEvidence.quality === actualEvidence.quality) durationCorrect.majMin += durationWeight;
    }
    if (expectedEvidence.rootPc === actualEvidence.rootPc
      && expectedEvidence.quality === actualEvidence.quality) durationCorrect.triad += durationWeight;
    if (expectedEvidence.pcs.join(",") === actualEvidence.pcs.join(",")) durationCorrect.tetrad += durationWeight;
    if (expectedEvidence.rootPc === actualEvidence.rootPc
      && expectedEvidence.quality === actualEvidence.quality
      && expectedEvidence.bassPc === actualEvidence.bassPc) durationCorrect.inversion += durationWeight;
    const expectedSignature = renderedSignature(expected, expectedKey);
    const predictedCandidates = alternatives.slice(0, 5).length
      ? alternatives.slice(0, 5).map((candidate) => candidate.chord)
      : [actual];
    if (expectedSignature && predictedCandidates.some((candidate) => renderedSignature(candidate, actualKey) === expectedSignature)) {
      forwardEquivalent += 1;
    }
    if (rareRows.has(expectedRow.signature) && exact) rareRows.get(expectedRow.signature).correct += 1;
    matchByActual.set(pair.actualIndex, { exact, alternativesRow, alternatives });
  }
  const confidenceRows = actualChords.map((_, actualIndex) => {
    const match = matchByActual.get(actualIndex);
    const alternativesRow = match?.alternativesRow || alternativesByIndex.get(actualIndex);
    const alternatives = match?.alternatives || alternativesRow?.alternatives || [];
    return {
      probability: alternativesRow?.confidence ?? alternatives[0]?.probability ?? 0,
      success: Boolean(match?.exact),
    };
  });

  const expectedNotes = melodyNotes(truth);
  const actualNotes = melodyNotes(predicted);
  const notePairs = greedyMatch(expectedNotes, actualNotes, tolerance);
  let exactNotes = 0;
  let offsetNotes = 0;
  let pitchNotes = 0;
  let scaleDegreeNotes = 0;
  for (const pair of notePairs) {
    const expected = expectedNotes[pair.expectedIndex];
    const actual = actualNotes[pair.actualIndex];
    const expectedEnd = Number(expected.beat || 1) + Number(expected.duration || 0);
    const actualEnd = Number(actual.beat || 1) + Number(actual.duration || 0);
    if (Math.abs(expectedEnd - actualEnd) <= tolerance) offsetNotes += 1;
    if (String(expected.sd) === String(actual.sd)) scaleDegreeNotes += 1;
    const expectedKey = activeKeyAtBeat(truth.metadata?.keys || [], expected.beat ?? 1);
    const actualKey = activeKeyAtBeat(predicted.metadata?.keys || [], actual.beat ?? 1);
    const expectedPc = melodyPc(expected, expectedKey);
    const actualPc = melodyPc(actual, actualKey);
    if (expectedPc !== null && expectedPc === actualPc) pitchNotes += 1;
    if (String(expected.sd) === String(actual.sd)
      && Number(expected.octave || 0) === Number(actual.octave || 0)
      && Math.abs(Number(expected.duration || 0) - Number(actual.duration || 0)) <= tolerance) {
      exactNotes += 1;
    }
  }

  const boundaries = prf(chordPairs.length, expectedChords.length, actualChords.length);
  const melodyOnsets = prf(notePairs.length, expectedNotes.length, actualNotes.length);
  const fieldAccuracy = Object.fromEntries(
    HARMONIC_FIELDS.map((field) => [field, chordPairs.length ? fieldCorrect[field] / chordPairs.length : 0]),
  );
  const fieldMacro = HARMONIC_FIELDS.reduce((sum, field) => sum + fieldAccuracy[field], 0) / HARMONIC_FIELDS.length;
  const keys = keyTimelineScore(truth, predicted);
  const chordDenominator = expectedChords.length || 1;
  const melodyExact = expectedNotes.length ? exactNotes / expectedNotes.length : 1;
  const harmonicScore = (0.2 * keys.exact + 0.3 * boundaries.f1 + 0.4 * fieldMacro) / 0.9;
  const globalScore = 0.2 * keys.exact + 0.3 * boundaries.f1 + 0.4 * fieldMacro + 0.1 * melodyExact;

  return {
    schemaVersion: "midi-evaluation/v1",
    beatTolerance: tolerance,
    globalScore,
    harmonicScore,
    key: keys,
    chords: {
      boundaries,
      matched: chordPairs.length,
      exactObject: exactObjects / chordDenominator,
      top3: top3 / chordDenominator,
      top5: top5 / chordDenominator,
      forwardEquivalentTop5: forwardEquivalent / chordDenominator,
      durationWeighted: {
        durationBeats: durationTotal,
        majMinDurationBeats: majMinDurationTotal,
        root: durationTotal ? durationCorrect.root / durationTotal : 1,
        majMin: majMinDurationTotal ? durationCorrect.majMin / majMinDurationTotal : 1,
        triad: durationTotal ? durationCorrect.triad / durationTotal : 1,
        tetrad: durationTotal ? durationCorrect.tetrad / durationTotal : 1,
        inversion: durationTotal ? durationCorrect.inversion / durationTotal : 1,
      },
      fieldAccuracy,
      fieldMacro,
      rareSignatureMacro: rareRows.size
        ? [...rareRows.values()].reduce((sum, row) => sum + row.correct / row.total, 0) / rareRows.size
        : null,
      rareSignatureCount: rareRows.size,
      rareSignatures: [...rareRows.entries()].map(([signature, row]) => ({
        signature,
        total: row.total,
        correct: row.correct,
        accuracy: row.correct / row.total,
      })),
    },
    melody: {
      onsets: melodyOnsets,
      offsets: prf(offsetNotes, expectedNotes.length, actualNotes.length),
      pitchClasses: prf(pitchNotes, expectedNotes.length, actualNotes.length),
      scaleDegrees: prf(scaleDegreeNotes, expectedNotes.length, actualNotes.length),
      exact: melodyExact,
    },
    calibration: calibration(confidenceRows),
    accuracyVsCoverage: accuracyVsCoverage(confidenceRows),
    ...(options.evaluationMetadata ? { evaluationMetadata: structuredClone(options.evaluationMetadata) } : {}),
  };
}

function normalizeAggregateEntry(value, index) {
  const report = value?.report ?? value?.evaluation ?? value;
  if (!report || typeof report !== "object") {
    throw new TypeError(`Evaluation report at index ${index} is not an object`);
  }
  const metadata = {
    ...(report.evaluationMetadata || {}),
    ...(value?.metadata || {}),
  };
  for (const field of [
    "id", "pairId", "songId", "compositionGroupId", "lane", "evaluationLane",
    "artifactKind", "rendererFamilyId", "familyHoldoutKey", "split", "partition", "manifestId", "frozen",
  ]) {
    if (value?.[field] !== undefined) metadata[field] = value[field];
  }
  return { report, metadata };
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function meanFinite(entries, read) {
  const values = entries.map(({ report }) => finiteNumber(read(report))).filter((value) => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function weightedFinite(entries, valueReader, weightReader) {
  let numerator = 0;
  let denominator = 0;
  for (const { report } of entries) {
    const value = finiteNumber(valueReader(report));
    const weight = finiteNumber(weightReader(report));
    if (value === null || weight === null || weight <= 0) continue;
    numerator += value * weight;
    denominator += weight;
  }
  return denominator ? numerator / denominator : null;
}

function aggregatePrf(entries, read) {
  const totals = entries.reduce((result, { report }) => {
    const row = read(report) || {};
    result.matches += finiteNumber(row.matches) ?? 0;
    result.expected += finiteNumber(row.expected) ?? 0;
    result.actual += finiteNumber(row.actual) ?? 0;
    return result;
  }, { matches: 0, expected: 0, actual: 0 });
  return prf(totals.matches, totals.expected, totals.actual);
}

function aggregateRareSignatures(entries) {
  const signatures = new Map();
  for (const { report } of entries) {
    for (const row of report.chords?.rareSignatures || []) {
      if (!row?.signature) continue;
      const aggregate = signatures.get(row.signature) || { total: 0, correct: 0 };
      aggregate.total += finiteNumber(row.total) ?? 0;
      aggregate.correct += finiteNumber(row.correct) ?? 0;
      signatures.set(row.signature, aggregate);
    }
  }
  const bySignature = [...signatures.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([signature, row]) => ({
      signature,
      total: row.total,
      correct: row.correct,
      accuracy: row.total ? row.correct / row.total : null,
    }));
  const exactMacro = bySignature.length
    ? bySignature.reduce((sum, row) => sum + row.accuracy, 0) / bySignature.length
    : null;
  const fallbackMacro = meanFinite(entries, (report) => report.chords?.rareSignatureMacro);
  return {
    count: bySignature.length || entries.reduce(
      (maximum, { report }) => Math.max(maximum, finiteNumber(report.chords?.rareSignatureCount) ?? 0),
      0,
    ),
    occurrences: bySignature.reduce((sum, row) => sum + row.total, 0),
    correct: bySignature.reduce((sum, row) => sum + row.correct, 0),
    macro: exactMacro ?? fallbackMacro,
    aggregation: exactMacro === null ? "song-macro-fallback" : "exact-signature-macro",
    bySignature,
  };
}

function aggregateCalibration(entries) {
  let brierNumerator = 0;
  let brierCount = 0;
  const bins = new Map();
  let allReportsHaveBins = true;
  for (const { report } of entries) {
    const calibrationRow = report.calibration || {};
    const count = finiteNumber(calibrationRow.count) ?? 0;
    const brier = finiteNumber(calibrationRow.brier);
    if (brier !== null && count > 0) {
      brierNumerator += brier * count;
      brierCount += count;
    }
    if (count > 0 && !calibrationRow.bins?.length) allReportsHaveBins = false;
    for (const row of calibrationRow.bins || []) {
      const rowCount = finiteNumber(row.count) ?? 0;
      if (!rowCount) continue;
      const index = Number(row.index);
      const aggregate = bins.get(index) || {
        index,
        lower: row.lower,
        upper: row.upper,
        count: 0,
        confidence: 0,
        success: 0,
      };
      aggregate.count += rowCount;
      aggregate.confidence += (finiteNumber(row.meanConfidence) ?? 0) * rowCount;
      aggregate.success += (finiteNumber(row.accuracy) ?? 0) * rowCount;
      bins.set(index, aggregate);
    }
  }
  const mergedBins = [...bins.values()].sort((left, right) => left.index - right.index).map((row) => ({
    index: row.index,
    lower: row.lower,
    upper: row.upper,
    count: row.count,
    meanConfidence: row.confidence / row.count,
    accuracy: row.success / row.count,
  }));
  const total = mergedBins.reduce((sum, row) => sum + row.count, 0);
  const exactEce = total ? mergedBins.reduce(
    (sum, row) => sum + row.count / total * Math.abs(row.meanConfidence - row.accuracy),
    0,
  ) : null;
  const fallbackEce = weightedFinite(
    entries,
    (report) => report.calibration?.ece,
    (report) => report.calibration?.count,
  );
  return {
    count: brierCount || total,
    brier: brierCount ? brierNumerator / brierCount : null,
    ece: allReportsHaveBins ? exactEce : fallbackEce,
    aggregation: allReportsHaveBins ? "pooled-bins" : "weighted-song-summary",
    bins: mergedBins,
  };
}

function aggregateAccuracyVsCoverage(entries, calibrationSummary) {
  const targets = [...new Set(entries.flatMap(
    ({ report }) => (report.accuracyVsCoverage?.points || []).map((point) => point.targetCoverage),
  ))].filter(Number.isFinite).sort((left, right) => left - right);
  const songMacro = targets.map((targetCoverage) => {
    const rows = entries.map(({ report }) => (
      report.accuracyVsCoverage?.points?.find((point) => point.targetCoverage === targetCoverage)
    )).filter(Boolean);
    return {
      targetCoverage,
      songs: rows.length,
      coverage: rows.length
        ? rows.reduce((sum, row) => sum + row.coverage, 0) / rows.length
        : null,
      accuracy: rows.length
        ? rows.reduce((sum, row) => sum + row.accuracy, 0) / rows.length
        : null,
      confidenceThreshold: rows.length
        ? rows.reduce((sum, row) => sum + row.confidenceThreshold, 0) / rows.length
        : null,
    };
  });
  const descendingBins = [...calibrationSummary.bins].sort((left, right) => right.index - left.index);
  const total = descendingBins.reduce((sum, row) => sum + row.count, 0);
  const pooledBinned = [];
  let count = 0;
  let correct = 0;
  for (const row of descendingBins) {
    count += row.count;
    correct += row.accuracy * row.count;
    pooledBinned.push({
      confidenceThreshold: row.lower,
      coverage: total ? count / total : null,
      count,
      accuracy: count ? correct / count : null,
    });
  }
  return { songMacro, pooledBinned };
}

function normalizePartition(value) {
  if (value === "dev") return "development";
  if (value === "val" || value === "validation") return "development";
  return value || null;
}

function commonMetadata(entries, fields) {
  for (const field of fields) {
    const values = [...new Set(entries.map(({ metadata }) => metadata[field]).filter((value) => value != null && value !== ""))];
    if (values.length === 1) return values[0];
  }
  return null;
}

function pairSetId(entries) {
  const ids = entries.map(({ metadata }) => (
    metadata.pairId ?? metadata.id ?? metadata.songId ?? metadata.compositionGroupId
  ));
  if (ids.some((id) => id == null || id === "")) return null;
  return `sha256:${createHash("sha256").update(JSON.stringify(ids.map(String).sort())).digest("hex")}`;
}

function aggregateCore(entries, options = {}) {
  const mean = (read) => meanFinite(entries, read);
  const calibrationSummary = aggregateCalibration(entries);
  const rareSignatures = aggregateRareSignatures(entries);
  const chordDuration = (report) => report.chords?.durationWeighted?.durationBeats;
  const majMinDuration = (report) => report.chords?.durationWeighted?.majMinDurationBeats
    ?? report.chords?.durationWeighted?.durationBeats;
  const chordOccurrences = (report) => report.chords?.boundaries?.expected;
  const evaluationSet = {
    partition: normalizePartition(
      options.partition ?? options.split ?? commonMetadata(entries, ["partition", "split"]),
    ),
    frozen: Boolean(options.frozenDevelopment ?? options.frozen ?? commonMetadata(entries, ["frozen"])),
    manifestId: options.manifestId ?? commonMetadata(entries, ["manifestId"]) ?? null,
    pairSetId: options.pairSetId ?? pairSetId(entries),
  };
  return {
    schemaVersion: "midi-evaluation-aggregate/v2",
    songs: entries.length,
    evaluationSet,
    songMacro: {
      globalScore: mean((report) => report.globalScore),
      harmonicScore: mean((report) => report.harmonicScore),
      keyExact: mean((report) => report.key?.exact),
      keyMirex: mean((report) => report.key?.mirex),
      boundaryF1: mean((report) => report.chords?.boundaries?.f1),
      exactObject: mean((report) => report.chords?.exactObject),
      fieldMacro: mean((report) => report.chords?.fieldMacro),
      top5: mean((report) => report.chords?.top5),
      forwardEquivalentTop5: mean((report) => report.chords?.forwardEquivalentTop5),
      rareSignatureMacro: rareSignatures.macro,
      melodyExact: mean((report) => report.melody?.exact),
      brier: mean((report) => report.calibration?.brier),
      ece: mean((report) => report.calibration?.ece),
    },
    occurrenceWeighted: {
      exactObject: weightedFinite(entries, (report) => report.chords?.exactObject, chordOccurrences),
      top3: weightedFinite(entries, (report) => report.chords?.top3, chordOccurrences),
      top5: weightedFinite(entries, (report) => report.chords?.top5, chordOccurrences),
      forwardEquivalentTop5: weightedFinite(
        entries,
        (report) => report.chords?.forwardEquivalentTop5,
        chordOccurrences,
      ),
    },
    durationWeighted: {
      keyExact: weightedFinite(entries, (report) => report.key?.exact, (report) => report.key?.durationBeats),
      keyTonic: weightedFinite(entries, (report) => report.key?.tonic, (report) => report.key?.durationBeats),
      keyMirex: weightedFinite(entries, (report) => report.key?.mirex, (report) => report.key?.durationBeats),
      chordDurationBeats: entries.reduce((sum, { report }) => sum + (finiteNumber(chordDuration(report)) ?? 0), 0),
      majMinDurationBeats: entries.reduce((sum, { report }) => sum + (finiteNumber(majMinDuration(report)) ?? 0), 0),
      root: weightedFinite(entries, (report) => report.chords?.durationWeighted?.root, chordDuration),
      majMin: weightedFinite(entries, (report) => report.chords?.durationWeighted?.majMin, majMinDuration),
      triad: weightedFinite(entries, (report) => report.chords?.durationWeighted?.triad, chordDuration),
      tetrad: weightedFinite(entries, (report) => report.chords?.durationWeighted?.tetrad, chordDuration),
      inversion: weightedFinite(entries, (report) => report.chords?.durationWeighted?.inversion, chordDuration),
    },
    micro: {
      chordBoundaries: aggregatePrf(entries, (report) => report.chords?.boundaries),
      melodyOnsets: aggregatePrf(entries, (report) => report.melody?.onsets),
      melodyOffsets: aggregatePrf(entries, (report) => report.melody?.offsets),
      melodyPitchClasses: aggregatePrf(entries, (report) => report.melody?.pitchClasses),
      melodyScaleDegrees: aggregatePrf(entries, (report) => report.melody?.scaleDegrees),
    },
    rareSignatures,
    calibration: calibrationSummary,
    accuracyVsCoverage: aggregateAccuracyVsCoverage(entries, calibrationSummary),
  };
}

function groupEntries(entries, read) {
  const groups = new Map();
  for (const entry of entries) {
    const value = read(entry.metadata);
    if (value == null || value === "") continue;
    const key = String(value);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return groups;
}

export function aggregateEvaluationReports(reports, options = {}) {
  if (!Array.isArray(reports) || reports.length === 0) {
    throw new TypeError("aggregateEvaluationReports requires at least one song report");
  }
  const entries = reports.map(normalizeAggregateEntry);
  const aggregate = aggregateCore(entries, options);
  const lanes = groupEntries(
    entries,
    (metadata) => metadata.evaluationLane ?? metadata.lane ?? metadata.artifactKind,
  );
  const rendererFamilies = groupEntries(
    entries,
    (metadata) => metadata.familyHoldoutKey ?? metadata.rendererFamilyId,
  );
  aggregate.lanes = Object.fromEntries(
    [...lanes.entries()].sort(([left], [right]) => left.localeCompare(right)).map(
      ([name, rows]) => [name, aggregateCore(rows, { ...options, frozen: false })],
    ),
  );
  aggregate.rendererFamilyHoldouts = Object.fromEntries(
    [...rendererFamilies.entries()].sort(([left], [right]) => left.localeCompare(right)).map(
      ([name, rows]) => [name, aggregateCore(rows, { ...options, frozen: false })],
    ),
  );
  return aggregate;
}

export function evaluatePromotion(baseline, candidate, options = {}) {
  if (String(baseline?.schemaVersion || "").startsWith("midi-evaluation-aggregate/")
    || String(candidate?.schemaVersion || "").startsWith("midi-evaluation-aggregate/")) {
    return evaluateFrozenDevelopmentPromotion(baseline, candidate, options);
  }
  const minimumGain = Number(options.minimumGain ?? 0.02);
  const maximumRegression = Number(options.maximumRegression ?? 0.005);
  const protectedMetrics = options.protectedMetrics || [
    ["key", "exact"],
    ["chords", "boundaries", "f1"],
    ["chords", "top5"],
    ["chords", "forwardEquivalentTop5"],
    ["chords", "rareSignatureMacro"],
  ];
  const get = (value, path) => path.reduce((current, key) => current?.[key], value);
  const regressions = protectedMetrics.map((metricPath) => {
    const before = finiteNumber(get(baseline, metricPath));
    const after = finiteNumber(get(candidate, metricPath));
    return { metric: metricPath.join("."), before, after, regression: before - after };
  }).filter((row) => row.before !== null && row.after !== null && row.regression > maximumRegression);
  const unavailableMetrics = protectedMetrics.map((metricPath) => {
    const before = finiteNumber(get(baseline, metricPath));
    const after = finiteNumber(get(candidate, metricPath));
    return before !== null && after !== null ? null : metricPath.join(".");
  }).filter(Boolean);
  const baselineGlobal = finiteNumber(baseline.globalScore);
  const candidateGlobal = finiteNumber(candidate.globalScore);
  const gain = baselineGlobal === null || candidateGlobal === null ? null : candidateGlobal - baselineGlobal;
  const baselineEce = finiteNumber(baseline.calibration?.ece);
  const candidateEce = finiteNumber(candidate.calibration?.ece);
  const calibrationRegression = baselineEce === null || candidateEce === null ? null : candidateEce - baselineEce;
  if (calibrationRegression !== null && calibrationRegression > maximumRegression) {
    regressions.push({
      metric: "calibration.ece",
      before: baselineEce,
      after: candidateEce,
      regression: calibrationRegression,
    });
  }
  return {
    promoted: gain !== null
      && gain >= minimumGain
      && regressions.length === 0
      && unavailableMetrics.length === 0,
    gain,
    minimumGain,
    maximumRegression,
    regressions,
    unavailableMetrics,
  };
}

function promotionInputErrors(baseline, candidate) {
  const errors = [];
  for (const [name, report] of [["baseline", baseline], ["candidate", candidate]]) {
    if (report?.schemaVersion !== "midi-evaluation-aggregate/v2") {
      errors.push(`${name}.schemaVersion must be midi-evaluation-aggregate/v2`);
    }
    if (report?.evaluationSet?.frozen !== true) {
      errors.push(`${name}.evaluationSet.frozen must be true`);
    }
    if (normalizePartition(report?.evaluationSet?.partition) !== "development") {
      errors.push(`${name}.evaluationSet.partition must be development`);
    }
    if (!report?.evaluationSet?.manifestId) {
      errors.push(`${name}.evaluationSet.manifestId is required`);
    }
    if (!report?.evaluationSet?.pairSetId) {
      errors.push(`${name}.evaluationSet.pairSetId is required`);
    }
    if (!Number.isInteger(report?.songs) || report.songs <= 0) {
      errors.push(`${name}.songs must be a positive integer`);
    }
  }
  if (baseline?.evaluationSet?.manifestId !== candidate?.evaluationSet?.manifestId) {
    errors.push("baseline and candidate manifestId values must match");
  }
  if (baseline?.evaluationSet?.pairSetId !== candidate?.evaluationSet?.pairSetId) {
    errors.push("baseline and candidate pairSetId values must match");
  }
  if (baseline?.songs !== candidate?.songs) {
    errors.push("baseline and candidate song counts must match");
  }
  return errors;
}

export function evaluateFrozenDevelopmentPromotion(baseline, candidate, options = {}) {
  const minimumGain = Number(options.minimumGain ?? 0.02);
  const maximumRegression = Number(options.maximumRegression ?? 0.005);
  const inputErrors = promotionInputErrors(baseline, candidate);
  const protectedMetrics = options.protectedAggregateMetrics || [
    ["songMacro", "keyExact"],
    ["songMacro", "boundaryF1"],
    ["songMacro", "top5"],
    ["songMacro", "forwardEquivalentTop5"],
    ["rareSignatures", "macro"],
  ];
  const get = (value, path) => path.reduce((current, key) => current?.[key], value);
  const unavailableMetrics = [];
  const regressions = [];
  for (const metricPath of protectedMetrics) {
    const before = finiteNumber(get(baseline, metricPath));
    const after = finiteNumber(get(candidate, metricPath));
    if (before === null || after === null) {
      unavailableMetrics.push(metricPath.join("."));
    } else if (before - after > maximumRegression) {
      regressions.push({
        metric: metricPath.join("."),
        before,
        after,
        regression: before - after,
      });
    }
  }
  for (const metric of ["brier", "ece"]) {
    const before = finiteNumber(baseline?.calibration?.[metric]);
    const after = finiteNumber(candidate?.calibration?.[metric]);
    if (before === null || after === null) {
      unavailableMetrics.push(`calibration.${metric}`);
    } else if (after - before > maximumRegression) {
      regressions.push({
        metric: `calibration.${metric}`,
        before,
        after,
        regression: after - before,
      });
    }
  }
  const beforeScore = finiteNumber(baseline?.songMacro?.harmonicScore);
  const afterScore = finiteNumber(candidate?.songMacro?.harmonicScore);
  if (beforeScore === null || afterScore === null) unavailableMetrics.push("songMacro.harmonicScore");
  const gain = beforeScore === null || afterScore === null ? null : afterScore - beforeScore;
  return {
    promoted: inputErrors.length === 0
      && unavailableMetrics.length === 0
      && regressions.length === 0
      && gain !== null
      && gain >= minimumGain,
    gate: "frozen-development-song-macro/v1",
    gain,
    minimumGain,
    maximumRegression,
    regressions,
    unavailableMetrics,
    inputErrors,
    evaluationSet: candidate?.evaluationSet ?? null,
  };
}
