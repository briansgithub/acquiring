import { chordInterpreter } from "../../../web-player/lib/music.js";
import defaultCatalogPriors from "./catalog-priors.json" with { type: "json" };

import { meterAtTick, chordObject, cloneChordObject, keyAtTick, keyIdentity, noteNameToPc, round } from "./theory.js";

export const CATALOG_PRIORS_INFO = Object.freeze({
  schemaVersion: defaultCatalogPriors.schemaVersion,
  algorithmVersion: defaultCatalogPriors.algorithmVersion,
  manifestId: defaultCatalogPriors.manifestId,
  trainingSplit: defaultCatalogPriors.trainingSplit,
  trainObjects: defaultCatalogPriors.summary?.trainObjects ?? 0,
  trainOccurrences: defaultCatalogPriors.summary?.trainOccurrences ?? 0,
});

const STRUCTURAL_ARRAY_FIELDS = ["adds", "omits", "alterations", "suspensions", "substitutions"];

function stableValue(value) {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value === null || value === undefined) return "null";
  return JSON.stringify(value);
}

/** Stable identity for every raw field that can change rendered harmony. */
export function candidateId(chord) {
  const arrays = STRUCTURAL_ARRAY_FIELDS
    .map((field) => `${field}:${stableValue(chord[field] || [])}`)
    .join("|");
  return [
    `root:${stableValue(chord.root)}`,
    `type:${stableValue(chord.type)}`,
    `inversion:${stableValue(chord.inversion)}`,
    `applied:${stableValue(chord.applied || 0)}`,
    `borrowed:${stableValue(chord.borrowed ?? null)}`,
    arrays,
    `rest:${chord.isRest ? 1 : 0}`,
  ].join("|");
}

function baseCandidate(chord, family, prior, key, catalog = null) {
  if (chord.isRest) {
    return {
      id: candidateId(chord),
      stateId: `${keyIdentity(key)}|${candidateId(chord)}`,
      chord,
      family,
      prior,
      pitchClasses: [],
      bassPitchClass: null,
      rootPitchClass: null,
      soundId: "rest",
      catalogId: catalog?.id || null,
      transitionModel: catalog?.transitionModel || null,
    };
  }
  try {
    const interpreted = chordInterpreter(chord, key);
    const rootPosition = chord.inversion === 0 ? interpreted : chordInterpreter({ ...chord, inversion: 0 }, key);
    const rendered = (interpreted.notes || []).map(noteNameToPc).filter((pc) => pc !== null);
    const rootRendered = (rootPosition.notes || []).map(noteNameToPc).filter((pc) => pc !== null);
    if (rendered.length < 2 || rootRendered.length < 2) return null;
    const pitchClasses = [...new Set(rendered)].sort((a, b) => a - b);
    const id = candidateId(chord);
    return {
      id,
      stateId: `${keyIdentity(key)}|${id}`,
      chord,
      family,
      prior,
      pitchClasses,
      bassPitchClass: rendered[0],
      rootPitchClass: rootRendered[0],
      soundId: `${pitchClasses.join(",")}/${rendered[0]}`,
      catalogId: catalog?.id || null,
      transitionModel: catalog?.transitionModel || null,
      trainOccurrences: catalog?.trainOccurrences || 0,
    };
  } catch {
    return null;
  }
}

const transitionModelCache = new WeakMap();

function catalogTransitionModel(priors) {
  if (!priors || typeof priors !== "object") return null;
  if (transitionModelCache.has(priors)) return transitionModelCache.get(priors);
  const model = {
    bySource: new Map((priors.transitions?.bySource || []).map((row) => [row.fromId, {
      totalCount: Number(row.totalCount || 0),
      otherCount: Number(row.otherCount || 0),
      successors: new Map((row.successors || []).map((item) => [item.toId, Number(item.count || 0)])),
    }])),
  };
  transitionModelCache.set(priors, model);
  return model;
}

function catalogFamily(chord) {
  const modified = STRUCTURAL_ARRAY_FIELDS.some((field) => (chord[field] || []).length > 0);
  if (modified) return "catalog-modified";
  if (chord.applied && chord.borrowed) return "catalog-applied-borrowed";
  if (chord.applied) return "catalog-applied";
  if (chord.borrowed) return "catalog-borrowed";
  if (Number(chord.type) > 7) return "catalog-extension";
  return "catalog-observed";
}

function catalogSpecs(key, options) {
  if (options.includeCatalog === false) return [];
  const priors = options.catalogPriors === undefined ? defaultCatalogPriors : options.catalogPriors;
  if (!priors || priors.schemaVersion !== "hooktheory-catalog-priors/v1" || !Array.isArray(priors.objects)) {
    return [];
  }
  const transitionModel = catalogTransitionModel(priors);
  const maximum = priors.objects.reduce(
    (value, entry) => Math.max(value, Number(entry.smoothedLogProbability ?? -Infinity)),
    -Infinity,
  );
  let entries = priors.objects.filter((entry) => {
    const chord = entry.chord || {};
    if (options.includeBorrowed === false && chord.borrowed) return false;
    if (options.includeApplied === false && Number(chord.applied || 0) !== 0) return false;
    return true;
  });
  const configuredLimit = Number(options.maxCatalogObjects);
  if (Number.isInteger(configuredLimit) && configuredLimit > 0 && entries.length > configuredLimit) {
    entries = [...entries]
      .sort((left, right) => (
        Number(right.trainOccurrences || 0) - Number(left.trainOccurrences || 0)
        || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
      ))
      .slice(0, configuredLimit);
  }
  return entries.map((entry) => {
    const chord = chordObject({
      root: entry.chord.root,
      type: entry.chord.type,
      inversion: entry.chord.inversion,
      applied: entry.chord.applied,
      borrowed: Array.isArray(entry.chord.borrowed) ? [...entry.chord.borrowed] : entry.chord.borrowed,
      adds: [...(entry.chord.adds || [])],
      omits: [...(entry.chord.omits || [])],
      alterations: [...(entry.chord.alterations || [])],
      suspensions: [...(entry.chord.suspensions || [])],
      substitutions: [...(entry.chord.substitutions || [])],
    });
    const logProbability = Number(entry.smoothedLogProbability ?? maximum);
    const scaleRow = (entry.byScale || []).find((row) => row.scale === key.scale);
    const scaleAdjustment = scaleRow
      ? 0.025 * Math.min(1, Math.log1p(scaleRow.trainOccurrences) / Math.log1p(entry.trainOccurrences || 1))
      : -0.035;
    return {
      chord,
      family: catalogFamily(chord),
      prior: Math.max(-0.55, Math.min(0, 0.045 * (logProbability - maximum))) + scaleAdjustment,
      catalog: {
        id: entry.id,
        trainOccurrences: Number(entry.trainOccurrences || 0),
        transitionModel,
      },
    };
  });
}

function addFamily(specs, { family, borrowed = null, applied = 0, prior = 0, roots = [1, 2, 3, 4, 5, 6, 7] }) {
  for (const root of roots) {
    for (const type of [5, 7]) {
      const inversionCount = type === 5 ? 3 : 4;
      for (let inversion = 0; inversion < inversionCount; inversion += 1) {
        specs.push({
          chord: chordObject({ root, type, inversion, applied, borrowed }),
          family,
          prior: prior - (type === 7 ? 0.035 : 0) - inversion * 0.012,
        });
      }
    }
  }
}

function addExtensionFamily(specs, { family = "canonical-extension", prior = -0.09 } = {}) {
  for (let root = 1; root <= 7; root += 1) {
    for (const type of [9, 11, 13]) {
      for (let inversion = 0; inversion <= 3; inversion += 1) {
        specs.push({
          chord: chordObject({ root, type, inversion }),
          family,
          prior: prior - (type - 9) * 0.006 - inversion * 0.012,
        });
      }
    }
  }
}

export function buildChordCatalog(key, options = {}) {
  const specs = [];
  addFamily(specs, { family: "diatonic", prior: 0 });
  // Higher extensions and their supported inversions are legal Hooktheory
  // objects even when a particular combination is absent from the train
  // split. Keep this grammar-level family independent of empirical priors so
  // rare canonical objects remain inferable.
  addExtensionFamily(specs);
  if (options.includeBorrowed !== false) {
    addFamily(specs, {
      family: "parallel-borrowed",
      borrowed: key.scale === "minor" ? "major" : "minor",
      prior: -0.16,
    });
  }
  if (options.includeApplied !== false) {
    addFamily(specs, {
      family: "applied-dominant",
      applied: 5,
      prior: -0.13,
      roots: [2, 3, 4, 5, 6, 7],
    });
  }
  const rest = chordObject({ isRest: true });
  specs.push({ chord: rest, family: "rest", prior: 0 });
  specs.push(...catalogSpecs(key, options));
  const deduplicated = new Map();
  for (const spec of specs) {
    const id = candidateId(spec.chord);
    const prior = deduplicated.get(id);
    if (!prior) {
      deduplicated.set(id, spec);
      continue;
    }
    prior.prior = Math.max(prior.prior, spec.prior);
    if (spec.catalog) prior.catalog = spec.catalog;
  }
  return [...deduplicated.values()]
    .map((spec) => baseCandidate(spec.chord, spec.family, spec.prior, key, spec.catalog))
    .filter(Boolean);
}

function metricalPosition(tick, ppq, meters) {
  const meter = meterAtTick(tick, meters);
  const measureLength = meter.numerator * (4 / meter.denominator);
  const offset = (tick - meter.tick) / ppq;
  const position = measureLength > 0 ? ((offset % measureLength) + measureLength) % measureLength : 0;
  return {
    numerator: meter.numerator,
    denominator: meter.denominator,
    positionInMeasure: position,
    measureBoundary: position < 1 / ppq || measureLength - position < 1 / ppq,
  };
}

const BOUNDARY_SOURCE_ORDER = ["section-edge", "metrical-grid", "note-onset", "note-offset", "bass-change"];

function quantizeBoundaryTick(tick, startTick, endTick, quantumTicks) {
  const quantized = startTick + Math.round((tick - startTick) / quantumTicks) * quantumTicks;
  return Math.max(startTick, Math.min(endTick, quantized));
}

function lowestActiveMidi(notes, tick, side) {
  let lowest = null;
  for (const note of notes) {
    if (note.isPercussion) continue;
    const active = side === "before"
      ? note.startTick < tick && note.endTick >= tick
      : note.startTick <= tick && note.endTick > tick;
    if (active && (lowest === null || note.midi < lowest)) lowest = note.midi;
  }
  return lowest;
}

/**
 * Build variable-length harmonic frames. Metrical grid points are retained as
 * anchors; sufficiently strong note-onset, note-offset, and bass-change
 * evidence may add sub-beat boundaries between them.
 */
export function buildHarmonicFrames(notes, {
  startTick,
  endTick,
  ppq,
  gridBeats,
  meters,
  adaptive = true,
  minAdaptiveBeats = Math.min(0.25, gridBeats),
  maxFrames = 50_000,
} = {}) {
  const gridTicks = Math.max(1, Math.round(gridBeats * ppq));
  const quantumTicks = Math.max(1, Math.round(minAdaptiveBeats * ppq));
  const boundaryMap = new Map();
  const addBoundary = (tick, source, strength, mandatory = false, diagnostics = {}) => {
    if (tick < startTick || tick > endTick) return;
    const entry = boundaryMap.get(tick) || {
      tick,
      sources: new Set(),
      strength: 0,
      mandatory: false,
      onsetCount: 0,
      offsetCount: 0,
      bassBefore: null,
      bassAfter: null,
    };
    entry.sources.add(source);
    entry.strength += strength;
    entry.mandatory ||= mandatory;
    entry.onsetCount = Math.max(entry.onsetCount, diagnostics.onsetCount || 0);
    entry.offsetCount = Math.max(entry.offsetCount, diagnostics.offsetCount || 0);
    if (diagnostics.bassBefore !== undefined) entry.bassBefore = diagnostics.bassBefore;
    if (diagnostics.bassAfter !== undefined) entry.bassAfter = diagnostics.bassAfter;
    boundaryMap.set(tick, entry);
  };

  addBoundary(startTick, "section-edge", 4, true);
  addBoundary(endTick, "section-edge", 4, true);
  for (let tick = startTick + gridTicks; tick < endTick; tick += gridTicks) {
    addBoundary(tick, "metrical-grid", 2, true);
  }

  if (adaptive) {
    const evidence = new Map();
    const evidenceAt = (tick) => {
      const quantized = quantizeBoundaryTick(tick, startTick, endTick, quantumTicks);
      if (quantized <= startTick || quantized >= endTick) return null;
      if (!evidence.has(quantized)) {
        evidence.set(quantized, {
          tick: quantized,
          onsetCount: 0,
          offsetCount: 0,
          onsetPcs: new Set(),
          offsetPcs: new Set(),
          onsetWeight: 0,
          offsetWeight: 0,
        });
      }
      return evidence.get(quantized);
    };
    for (const note of notes) {
      if (note.isPercussion || note.endTick <= startTick || note.startTick >= endTick) continue;
      const weight = (0.25 + 0.75 * note.velocity) * Math.max(0.04, note.harmonyWeight ?? 1);
      const onset = evidenceAt(note.startTick);
      if (onset) {
        onset.onsetCount += 1;
        onset.onsetPcs.add(note.pc);
        onset.onsetWeight += weight;
      }
      const offset = evidenceAt(note.endTick);
      if (offset) {
        offset.offsetCount += 1;
        offset.offsetPcs.add(note.pc);
        offset.offsetWeight += weight;
      }
    }

    for (const item of evidence.values()) {
      const bassBefore = lowestActiveMidi(notes, item.tick, "before");
      const bassAfter = lowestActiveMidi(notes, item.tick, "after");
      const bassChanged = bassBefore !== bassAfter && (bassBefore !== null || bassAfter !== null);
      const onsetStrong = item.onsetPcs.size >= 2 || item.onsetCount >= 3 || item.onsetWeight >= 2.2;
      const offsetStrong = item.offsetPcs.size >= 2 || item.offsetCount >= 3 || item.offsetWeight >= 2.2;
      if (!onsetStrong && !offsetStrong && !bassChanged) continue;
      const diagnostics = {
        onsetCount: item.onsetCount,
        offsetCount: item.offsetCount,
        bassBefore: bassBefore === null ? null : bassBefore % 12,
        bassAfter: bassAfter === null ? null : bassAfter % 12,
      };
      if (onsetStrong) addBoundary(item.tick, "note-onset", 0.6 + Math.min(2, item.onsetWeight / 2), false, diagnostics);
      if (offsetStrong) addBoundary(item.tick, "note-offset", 0.35 + Math.min(1.5, item.offsetWeight / 3), false, diagnostics);
      if (bassChanged) addBoundary(item.tick, "bass-change", 1.4, false, diagnostics);
    }
  }

  const mandatory = [...boundaryMap.values()].filter((entry) => entry.mandatory);
  const optional = [...boundaryMap.values()].filter((entry) => !entry.mandatory)
    .sort((a, b) => b.strength - a.strength || a.tick - b.tick);
  const optionalBudget = Math.max(0, maxFrames + 1 - mandatory.length);
  const retained = [...mandatory, ...optional.slice(0, optionalBudget)].sort((a, b) => a.tick - b.tick);
  const boundaries = retained.map((entry) => ({
    tick: entry.tick,
    sources: BOUNDARY_SOURCE_ORDER.filter((source) => entry.sources.has(source)),
    strength: round(entry.strength),
    mandatory: entry.mandatory,
    onsetCount: entry.onsetCount,
    offsetCount: entry.offsetCount,
    bassBefore: entry.bassBefore,
    bassAfter: entry.bassAfter,
  }));

  const frames = [];
  for (let boundaryIndex = 0; boundaryIndex < boundaries.length - 1; boundaryIndex += 1) {
    const frameStart = boundaries[boundaryIndex].tick;
    const frameEnd = boundaries[boundaryIndex + 1].tick;
    if (frameEnd <= frameStart) continue;
    const chroma = Array(12).fill(0);
    let noteCount = 0;
    let bassMidi = null;
    for (const note of notes) {
      if (note.isPercussion || note.endTick <= frameStart || note.startTick >= frameEnd) continue;
      const overlapTicks = Math.max(0, Math.min(note.endTick, frameEnd) - Math.max(note.startTick, frameStart));
      if (!overlapTicks) continue;
      const durationWeight = overlapTicks / ppq;
      const velocityWeight = 0.25 + 0.75 * note.velocity;
      const weight = durationWeight * velocityWeight * Math.max(0.04, note.harmonyWeight ?? 1);
      chroma[note.pc] += weight;
      noteCount += 1;
      if (bassMidi === null || note.midi < bassMidi) bassMidi = note.midi;
    }
    const totalWeight = chroma.reduce((sum, value) => sum + value, 0);
    frames.push({
      index: frames.length,
      startTick: frameStart,
      endTick: frameEnd,
      chroma,
      totalWeight,
      noteCount,
      bassPitchClass: bassMidi === null ? null : bassMidi % 12,
      boundaryEvidence: boundaries[boundaryIndex],
      endBoundaryEvidence: boundaries[boundaryIndex + 1],
      ...metricalPosition(frameStart, ppq, meters),
    });
  }
  return {
    frames,
    boundaries,
    adaptive,
    gridTicks,
    quantumTicks,
  };
}

/** Backward-compatible fixed-grid frame helper. */
export function buildBeatFrames(notes, options) {
  return buildHarmonicFrames(notes, { ...options, adaptive: options?.adaptive ?? false }).frames;
}

function emission(candidate, frame) {
  const timingFit = Math.min(1, Math.max(0, Number(frame.boundaryEvidence?.strength || 0) / 4));
  if (candidate.chord.isRest) {
    return {
      score: frame.totalWeight < 0.015 ? 3.9 : -1.25 - Math.min(2, frame.totalWeight),
      coverage: frame.totalWeight ? 0 : 1,
      presence: frame.totalWeight ? 0 : 1,
      bassAgreement: frame.bassPitchClass === null ? 1 : 0,
      rootStrength: 0,
      timingFit,
    };
  }
  if (frame.totalWeight <= 0) {
    return { score: -2.5 + candidate.prior, coverage: 0, presence: 0, bassAgreement: 0.5, rootStrength: 0, timingFit };
  }
  const expectedWeight = candidate.pitchClasses.reduce((sum, pc) => sum + frame.chroma[pc], 0);
  const coverage = expectedWeight / frame.totalWeight;
  const presence = candidate.pitchClasses.reduce((sum, pc) => {
    const threshold = Math.max(0.0001, frame.totalWeight * 0.08);
    return sum + Math.min(1, frame.chroma[pc] / threshold);
  }, 0) / candidate.pitchClasses.length;
  const bassAgreement = frame.bassPitchClass === null
    ? 0.5
    : frame.bassPitchClass === candidate.bassPitchClass
      ? 1
      : candidate.pitchClasses.includes(frame.bassPitchClass) ? 0.35 : 0;
  const rootStrength = frame.chroma[candidate.rootPitchClass] / frame.totalWeight;
  const fit = 0.58 * coverage + 0.22 * presence + 0.13 * bassAgreement + 0.07 * Math.min(1, rootStrength * 3);
  return {
    score: fit * 4 + candidate.prior,
    coverage,
    presence,
    bassAgreement,
    rootStrength,
    timingFit,
  };
}

function fifthDistance(a, b) {
  const clockwise = ((b - a) * 7 + 120) % 12;
  return Math.min(clockwise, 12 - clockwise);
}

function transition(previous, current, frame) {
  if (!previous) return 0;
  let score;
  if (previous.stateId === current.stateId) score = 0.42;
  else if (previous.chord.isRest || current.chord.isRest) score = -0.05;
  else {
    score = frame.measureBoundary ? -0.015 : -0.14;
    if (previous.soundId === current.soundId) score += 0.13;
    if (previous.id === current.id) score += 0.12;
    if (fifthDistance(previous.rootPitchClass, current.rootPitchClass) <= 1) score += 0.04;
  }
  if (previous.catalogId && current.catalogId && previous.transitionModel === current.transitionModel) {
    const row = previous.transitionModel?.bySource.get(previous.catalogId);
    if (row?.totalCount > 0) {
      const count = row.successors.get(current.catalogId);
      if (count) {
        const categories = Math.max(2, row.successors.size + (row.otherCount > 0 ? 1 : 0));
        const probability = (count + 0.25) / (row.totalCount + 0.25 * categories);
        score += Math.max(-0.1, Math.min(0.16, 0.075 * Math.log(probability * categories)));
      } else score -= row.otherCount > 0 ? 0.018 : 0.04;
    }
  }
  return score;
}

function serializeAlternative(entry, probability, selected) {
  return {
    chord: cloneChordObject(entry.candidate.chord, { beat: undefined, duration: undefined }),
    family: entry.candidate.family,
    pitchClasses: entry.candidate.pitchClasses,
    bassPitchClass: entry.candidate.bassPitchClass,
    score: round(entry.sequenceScore),
    probability: round(probability),
    selected,
    diagnostics: {
      coverage: round(entry.fit.coverage),
      presence: round(entry.fit.presence),
      bassAgreement: round(entry.fit.bassAgreement),
      rootStrength: round(entry.fit.rootStrength),
      timingFit: round(entry.fit.timingFit),
    },
  };
}

function frameAlternatives(frame, scored, selected, previousSelected, topK) {
  const ranked = scored.map((entry) => ({
    ...entry,
    sequenceScore: entry.fit.score + transition(previousSelected, entry.candidate, frame),
  })).sort((a, b) => (
    b.sequenceScore - a.sequenceScore
    || (a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0)
  ));
  const max = ranked[0]?.sequenceScore ?? 0;
  const weights = ranked.map((entry) => Math.exp((entry.sequenceScore - max) / 0.3));
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const probabilityByState = new Map(ranked.map((entry, index) => [entry.candidate.stateId, weights[index] / total]));
  const selectedEntry = ranked.find((entry) => entry.candidate.stateId === selected.stateId);
  const ordered = [selectedEntry, ...ranked.filter((entry) => entry !== selectedEntry)].filter(Boolean).slice(0, topK);
  return {
    confidence: probabilityByState.get(selected.stateId) || 0,
    alternatives: ordered.map((entry) => serializeAlternative(
      entry,
      probabilityByState.get(entry.candidate.stateId) || 0,
      entry.candidate.stateId === selected.stateId,
    )),
  };
}

export function inferChordPath(frames, {
  ppq,
  startTick,
  keySignatures,
  fallbackKey,
  catalogOptions = {},
  emissionWidth = 24,
  topK = 5,
} = {}) {
  if (frames.length === 0) {
    return { chords: [], frames: [], chordSegments: [], pathAlternatives: [], beamWidth: 0 };
  }
  const catalogs = new Map();
  const scoredFrames = frames.map((frame) => {
    const key = keyAtTick(frame.startTick, keySignatures, fallbackKey);
    const keyId = keyIdentity(key);
    if (!catalogs.has(keyId)) catalogs.set(keyId, buildChordCatalog(key, catalogOptions));
    const scored = catalogs.get(keyId)
      .map((candidate) => ({ candidate, fit: emission(candidate, frame) }))
      .sort((a, b) => (
        b.fit.score - a.fit.score
        || (a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0)
      ))
      .slice(0, emissionWidth);
    return { frame, key, scored };
  });

  const beamWidth = Math.min(256, Math.max(topK * 4, Math.min(128, emissionWidth * 2)));
  let beam = [];
  for (let frameIndex = 0; frameIndex < scoredFrames.length; frameIndex += 1) {
    const { frame, scored } = scoredFrames[frameIndex];
    const expanded = [];
    if (!beam.length) {
      for (let stateIndex = 0; stateIndex < scored.length; stateIndex += 1) {
        const entry = scored[stateIndex];
        expanded.push({
          ...entry,
          totalScore: entry.fit.score,
          previous: null,
          previousRank: -1,
          stateIndex,
        });
      }
    } else {
      for (let previousRank = 0; previousRank < beam.length; previousRank += 1) {
        const prior = beam[previousRank];
        for (let stateIndex = 0; stateIndex < scored.length; stateIndex += 1) {
          const entry = scored[stateIndex];
          expanded.push({
            ...entry,
            totalScore: prior.totalScore + transition(prior.candidate, entry.candidate, frame) + entry.fit.score,
            previous: prior,
            previousRank,
            stateIndex,
          });
        }
      }
    }
    expanded.sort((a, b) => (
      b.totalScore - a.totalScore
      || (a.candidate.stateId < b.candidate.stateId ? -1 : a.candidate.stateId > b.candidate.stateId ? 1 : 0)
      || a.previousRank - b.previousRank
      || a.stateIndex - b.stateIndex
    ));
    beam = expanded.slice(0, beamWidth);
  }

  const endpoints = beam.slice(0, topK);
  const endpointMax = endpoints[0]?.totalScore ?? 0;
  const endpointWeights = endpoints.map((entry) => Math.exp((entry.totalScore - endpointMax) / 0.6));
  const endpointTotal = endpointWeights.reduce((sum, weight) => sum + weight, 0) || 1;
  const completePaths = endpoints.map((endpoint, rank) => {
    const candidates = Array(scoredFrames.length);
    let node = endpoint;
    for (let cursor = scoredFrames.length - 1; cursor >= 0; cursor -= 1) {
      candidates[cursor] = node.candidate;
      node = node.previous;
    }
    return {
      rank: rank + 1,
      score: round(endpoint.totalScore),
      probability: round(endpointWeights[rank] / endpointTotal),
      candidates,
    };
  });
  const path = completePaths[0].candidates;

  const serializedFrames = scoredFrames.map(({ frame, key, scored }, index) => {
    const previous = index > 0 ? path[index - 1] : null;
    const alternatives = frameAlternatives(frame, scored, path[index], previous, topK);
    return {
      index,
      beat: round(1 + (frame.startTick - startTick) / ppq),
      duration: round((frame.endTick - frame.startTick) / ppq),
      startTick: frame.startTick,
      endTick: frame.endTick,
      key: { tonic: key.tonic, scale: key.scale },
      noteCount: frame.noteCount,
      chroma: frame.chroma.map((value) => round(value)),
      bassPitchClass: frame.bassPitchClass,
      measureBoundary: frame.measureBoundary,
      boundaryEvidence: frame.boundaryEvidence || null,
      endBoundaryEvidence: frame.endBoundaryEvidence || null,
      confidence: round(alternatives.confidence),
      alternatives: alternatives.alternatives,
    };
  });

  const serializeCompleteSegments = (candidatePath) => {
    const segments = [];
    let segmentStart = 0;
    for (let index = 1; index <= candidatePath.length; index += 1) {
      if (index < candidatePath.length && candidatePath[index].stateId === candidatePath[segmentStart].stateId) continue;
      const firstFrame = frames[segmentStart];
      const lastFrame = frames[index - 1];
      const beat = round(1 + (firstFrame.startTick - startTick) / ppq);
      const duration = round((lastFrame.endTick - firstFrame.startTick) / ppq);
      const key = scoredFrames[segmentStart].key;
      segments.push({
        startFrame: segmentStart,
        endFrame: index - 1,
        startTick: firstFrame.startTick,
        endTick: lastFrame.endTick,
        beat,
        duration,
        key: { tonic: key.tonic, scale: key.scale },
        family: candidatePath[segmentStart].family,
        chord: cloneChordObject(candidatePath[segmentStart].chord, { beat, duration }),
      });
      segmentStart = index;
    }
    return segments;
  };

  const pathAlternatives = completePaths.map(({ rank, score, probability, candidates }) => ({
    rank,
    score,
    probability,
    segments: serializeCompleteSegments(candidates),
  }));

  const chords = [];
  const chordSegments = [];
  let runStart = 0;
  for (let index = 1; index <= path.length; index += 1) {
    if (index < path.length && path[index].stateId === path[runStart].stateId) continue;
    const firstFrame = frames[runStart];
    const lastFrame = frames[index - 1];
    const beat = round(1 + (firstFrame.startTick - startTick) / ppq);
    const duration = round((lastFrame.endTick - firstFrame.startTick) / ppq);
    const chord = cloneChordObject(path[runStart].chord, { beat, duration });
    chords.push(chord);
    const confidences = serializedFrames.slice(runStart, index).map((frame) => frame.confidence);
    chordSegments.push({
      chordIndex: chords.length - 1,
      startFrame: runStart,
      endFrame: index - 1,
      beat,
      duration,
      key: serializedFrames[runStart].key,
      family: path[runStart].family,
      confidence: round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length),
      alternatives: serializedFrames[runStart].alternatives,
    });
    runStart = index;
  }

  return { chords, frames: serializedFrames, chordSegments, pathAlternatives, beamWidth };
}
