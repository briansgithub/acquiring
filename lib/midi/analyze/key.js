const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export const PC_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

export const LOCAL_KEY_MODE_CATALOG = Object.freeze([
  { scale: "major", intervals: [0, 2, 4, 5, 7, 9, 11], prior: 0 },
  { scale: "minor", intervals: [0, 2, 3, 5, 7, 8, 10], prior: -0.015 },
  { scale: "dorian", intervals: [0, 2, 3, 5, 7, 9, 10], prior: -0.095 },
  { scale: "phrygian", intervals: [0, 1, 3, 5, 7, 8, 10], prior: -0.11 },
  { scale: "lydian", intervals: [0, 2, 4, 6, 7, 9, 11], prior: -0.105 },
  { scale: "mixolydian", intervals: [0, 2, 4, 5, 7, 9, 10], prior: -0.085 },
  { scale: "locrian", intervals: [0, 1, 3, 5, 6, 8, 10], prior: -0.14 },
  { scale: "harmonicMinor", intervals: [0, 2, 3, 5, 7, 8, 11], prior: -0.12 },
  { scale: "phrygianDominant", intervals: [0, 1, 4, 5, 7, 8, 10], prior: -0.135 },
]);

const NATURAL_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function tonicToPc(tonic) {
  const match = String(tonic || "").trim().replace(/♭/g, "b").replace(/♯/g, "#").match(/^([A-Ga-g])([#bx]*)$/);
  if (!match) return null;
  let pc = NATURAL_PC[match[1].toUpperCase()];
  for (const accidental of match[2]) {
    if (accidental === "#") pc += 1;
    else if (accidental === "b") pc -= 1;
    else if (accidental === "x") pc += 2;
  }
  return ((pc % 12) + 12) % 12;
}

function pearson(a, b) {
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let numerator = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const da = a[index] - meanA;
    const db = b[index] - meanB;
    numerator += da * db;
    varianceA += da * da;
    varianceB += db * db;
  }
  const denominator = Math.sqrt(varianceA * varianceB);
  return denominator ? numerator / denominator : 0;
}

function profileAtTonic(profile, tonicPc) {
  return Array.from({ length: 12 }, (_, pc) => profile[(pc - tonicPc + 12) % 12]);
}

function modeProfile(mode, tonicPc) {
  if (mode.scale === "major") return profileAtTonic(MAJOR_PROFILE, tonicPc);
  if (mode.scale === "minor") return profileAtTonic(MINOR_PROFILE, tonicPc);
  const profile = Array(12).fill(0.22);
  for (let index = 0; index < mode.intervals.length; index += 1) {
    const pc = (tonicPc + mode.intervals[index]) % 12;
    profile[pc] = index === 0 ? 1.42 : index === 4 ? 1.05 : index === 2 ? 0.94 : 0.74;
  }
  return profile;
}

function softmaxCandidates(candidates, temperature = 0.12) {
  const max = Math.max(...candidates.map((candidate) => candidate.score));
  const weights = candidates.map((candidate) => Math.exp((candidate.score - max) / temperature));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  return candidates.map((candidate, index) => ({ ...candidate, probability: weights[index] / total }));
}

function chromaForWindow(notes, startTick, endTick) {
  const chroma = Array(12).fill(0);
  for (const note of notes) {
    if (note.isPercussion) continue;
    const overlap = Math.max(0, Math.min(note.endTick, endTick) - Math.max(note.startTick, startTick));
    if (!overlap) continue;
    const velocityWeight = 0.25 + 0.75 * note.velocity;
    chroma[note.pc] += overlap * velocityWeight * Math.max(0.05, note.harmonyWeight ?? 1);
  }
  return chroma;
}

function compareKeyCandidates(a, b) {
  return b.score - a.score
    || a.tonicPc - b.tonicPc
    || (a.scale < b.scale ? -1 : a.scale > b.scale ? 1 : 0);
}

function modeCandidates(chroma, modes = LOCAL_KEY_MODE_CATALOG) {
  const totalWeight = chroma.reduce((sum, value) => sum + value, 0);
  if (!totalWeight) return [];
  const candidates = [];
  for (let tonicPc = 0; tonicPc < 12; tonicPc += 1) {
    for (const mode of modes) {
      const profile = modeProfile(mode, tonicPc);
      const correlation = pearson(chroma, profile);
      const scaleWeight = mode.intervals.reduce((sum, interval) => sum + chroma[(tonicPc + interval) % 12], 0);
      const coverage = scaleWeight / totalWeight;
      const tonicStrength = chroma[tonicPc] / totalWeight;
      const dominantStrength = chroma[(tonicPc + 7) % 12] / totalWeight;
      candidates.push({
        tonic: PC_NAMES[tonicPc],
        tonicPc,
        scale: mode.scale,
        correlation,
        coverage,
        tonicStrength,
        modePrior: mode.prior,
        score: 0.68 * correlation + 0.22 * coverage + 0.07 * Math.min(1, tonicStrength * 4)
          + 0.03 * Math.min(1, dominantStrength * 4) + mode.prior,
      });
    }
  }
  candidates.sort(compareKeyCandidates);
  return softmaxCandidates(candidates, 0.105);
}

export function inferKeyCandidates(notes, { startTick, endTick, keySignatures = [] } = {}) {
  const chroma = chromaForWindow(notes, startTick, endTick);
  const totalWeight = chroma.reduce((sum, value) => sum + value, 0);
  const activeSignature = keySignatures
    .filter((entry) => entry.tick <= startTick)
    .sort((a, b) => b.tick - a.tick)[0] || keySignatures[0] || null;

  if (totalWeight === 0) {
    const fallbackTonic = tonicToPc(activeSignature?.tonic) === null ? "C" : activeSignature.tonic;
    const fallbackScale = activeSignature?.scale === "minor" ? "minor" : "major";
    return {
      chroma,
      totalWeight,
      usedDefault: !activeSignature,
      best: { tonic: fallbackTonic, scale: fallbackScale, tonicPc: tonicToPc(fallbackTonic) ?? 0, score: 0, correlation: 0, probability: 1 },
      candidates: [],
    };
  }

  let candidates = [];
  for (let tonicPc = 0; tonicPc < 12; tonicPc += 1) {
    for (const scale of ["major", "minor"]) {
      const correlation = pearson(chroma, profileAtTonic(scale === "major" ? MAJOR_PROFILE : MINOR_PROFILE, tonicPc));
      const signatureMatches = activeSignature
        && tonicToPc(activeSignature.tonic) === tonicPc
        && activeSignature.scale === scale;
      const exactPrior = signatureMatches && activeSignature.authority === "authoritative" ? 0.3 : 0;
      const weakPrior = signatureMatches && activeSignature.authority !== "authoritative" ? 0.12 : 0;
      candidates.push({
        tonic: signatureMatches ? activeSignature.tonic : PC_NAMES[tonicPc],
        scale,
        tonicPc,
        correlation,
        score: correlation + exactPrior + weakPrior,
        metadataPrior: exactPrior + weakPrior,
      });
    }
  }
  candidates.sort(compareKeyCandidates);
  candidates = softmaxCandidates(candidates);
  return {
    chroma,
    totalWeight,
    usedDefault: false,
    best: candidates[0],
    candidates,
  };
}

function fifthDistance(a, b) {
  const clockwise = ((b - a) * 7 + 120) % 12;
  return Math.min(clockwise, 12 - clockwise);
}

function keyTransition(previous, current) {
  if (!previous) return 0;
  if (previous.tonicPc === current.tonicPc && previous.scale === current.scale) return 0.24;
  let score = -0.34;
  if (previous.tonicPc === current.tonicPc) score += 0.1;
  if (fifthDistance(previous.tonicPc, current.tonicPc) <= 1) score += 0.13;
  const previousMode = LOCAL_KEY_MODE_CATALOG.find((mode) => mode.scale === previous.scale);
  const currentMode = LOCAL_KEY_MODE_CATALOG.find((mode) => mode.scale === current.scale);
  if (previousMode && currentMode) {
    const previousSet = new Set(previousMode.intervals.map((interval) => (previous.tonicPc + interval) % 12));
    const overlap = currentMode.intervals.filter((interval) => previousSet.has((current.tonicPc + interval) % 12)).length;
    if (overlap >= 6) score += 0.08;
  }
  return score;
}

function compactKeyPath(states, observations, source, authority) {
  const timeline = [];
  for (let index = 0; index < states.length; index += 1) {
    const state = states[index];
    const previous = states[index - 1];
    if (previous && previous.tonicPc === state.tonicPc && previous.scale === state.scale) continue;
    timeline.push({
      tick: observations[index].tick,
      tonic: state.tonic,
      tonicPc: state.tonicPc,
      scale: state.scale,
      source,
      authority,
      inferred: authority === "inferred",
      confidence: Number((state.probability || 0).toFixed(6)),
    });
  }
  return timeline;
}

function explicitTimeline(explicitKeys, startTick, endTick, fallbackKey) {
  const before = explicitKeys.filter((event) => event.tick <= startTick).sort((a, b) => b.tick - a.tick)[0];
  const within = explicitKeys.filter((event) => event.tick > startTick && event.tick < endTick);
  const selected = before ? [{ ...before, tick: startTick }, ...within] : within.slice();
  if (!selected.length || selected[0].tick > startTick) {
    selected.unshift({
      tick: startTick,
      tonic: fallbackKey.tonic,
      tonicPc: fallbackKey.tonicPc,
      scale: fallbackKey.scale,
      source: "global-profile-fallback",
      authority: "inferred",
      inferred: true,
      confidence: 0.5,
      exact: false,
    });
  }
  return selected.sort((a, b) => a.tick - b.tick).map((event) => ({
    ...event,
    tonicPc: tonicToPc(event.tonic),
    source: event.source || "midi-key-signature",
    authority: event.authority || "weak",
    inferred: event.authority === "inferred" || Boolean(event.inferred),
    confidence: event.confidence ?? (event.authority === "authoritative" ? 1 : 0.72),
  }));
}

/**
 * Infer a smoothed local-key sequence only when the file supplies no explicit
 * Hooktheory/MIDI key events. Rare catalog modes carry conservative priors.
 */
export function inferLocalKeyTimeline(notes, {
  startTick,
  endTick,
  ppq,
  explicitKeys = [],
  fallbackKey,
  topK = 5,
  hopBeats = 2,
  stateWidth = 24,
  beamWidth = Math.max(32, topK * 8),
  modes = LOCAL_KEY_MODE_CATALOG,
} = {}) {
  if (explicitKeys.length) {
    const selected = explicitTimeline(explicitKeys, startTick, endTick, fallbackKey);
    const hasAuthoritative = selected.some((event) => event.authority === "authoritative");
    const hasWeak = selected.some((event) => event.authority === "weak");
    return {
      source: hasAuthoritative ? "embedded-hooktheory" : hasWeak ? "midi-key-signature" : "global-profile-fallback",
      authority: hasAuthoritative ? "authoritative" : hasWeak ? "weak" : "inferred",
      selected,
      paths: [{ rank: 1, score: 0, probability: 1, timeline: selected }],
      observations: [],
      modeCatalog: modes.map((mode) => ({ scale: mode.scale, prior: mode.prior })),
    };
  }

  const hopTicks = Math.max(1, Math.round(ppq * hopBeats));
  const observations = [];
  for (let tick = startTick; tick < endTick; tick += hopTicks) {
    const windowEnd = Math.min(endTick, tick + hopTicks);
    const chroma = chromaForWindow(notes, tick, windowEnd);
    let candidates = modeCandidates(chroma, modes).slice(0, stateWidth);
    if (!candidates.length) {
      candidates = [{
        tonic: fallbackKey.tonic,
        tonicPc: fallbackKey.tonicPc,
        scale: fallbackKey.scale,
        correlation: 0,
        coverage: 0,
        tonicStrength: 0,
        modePrior: 0,
        score: 0,
        probability: 1,
      }];
    }
    observations.push({ tick, endTick: windowEnd, chroma, candidates });
  }
  if (!observations.length) {
    const selected = [{
      tick: startTick,
      tonic: fallbackKey.tonic,
      tonicPc: fallbackKey.tonicPc,
      scale: fallbackKey.scale,
      source: "global-profile-fallback",
      authority: "inferred",
      inferred: true,
      confidence: 1,
    }];
    return {
      source: "global-profile-fallback",
      authority: "inferred",
      selected,
      paths: [{ rank: 1, score: 0, probability: 1, timeline: selected }],
      observations: [],
      modeCatalog: modes.map((mode) => ({ scale: mode.scale, prior: mode.prior })),
    };
  }

  let beam = [];
  for (let observationIndex = 0; observationIndex < observations.length; observationIndex += 1) {
    const observation = observations[observationIndex];
    const expanded = [];
    if (!beam.length) {
      for (let stateIndex = 0; stateIndex < observation.candidates.length; stateIndex += 1) {
        const state = observation.candidates[stateIndex];
        expanded.push({ state, totalScore: state.score, previous: null, previousRank: -1, stateIndex });
      }
    } else {
      for (let previousRank = 0; previousRank < beam.length; previousRank += 1) {
        const previous = beam[previousRank];
        for (let stateIndex = 0; stateIndex < observation.candidates.length; stateIndex += 1) {
          const state = observation.candidates[stateIndex];
          expanded.push({
            state,
            totalScore: previous.totalScore + keyTransition(previous.state, state) + state.score,
            previous,
            previousRank,
            stateIndex,
          });
        }
      }
    }
    expanded.sort((a, b) => (
      b.totalScore - a.totalScore
      || a.state.tonicPc - b.state.tonicPc
      || (a.state.scale < b.state.scale ? -1 : a.state.scale > b.state.scale ? 1 : 0)
      || a.previousRank - b.previousRank
      || a.stateIndex - b.stateIndex
    ));
    beam = expanded.slice(0, Math.max(topK, Math.min(256, beamWidth)));
  }

  const endpoints = beam.slice(0, topK);
  const maxScore = endpoints[0]?.totalScore ?? 0;
  const weights = endpoints.map((entry) => Math.exp((entry.totalScore - maxScore) / 0.35));
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const paths = endpoints.map((endpoint, index) => {
    const states = Array(observations.length);
    let node = endpoint;
    for (let cursor = observations.length - 1; cursor >= 0; cursor -= 1) {
      states[cursor] = node.state;
      node = node.previous;
    }
    return {
      rank: index + 1,
      score: Number(endpoint.totalScore.toFixed(6)),
      probability: Number((weights[index] / total).toFixed(6)),
      timeline: compactKeyPath(states, observations, "local-profile-smoothed", "inferred"),
    };
  });
  return {
    source: "local-profile-smoothed",
    authority: "inferred",
    selected: paths[0]?.timeline || [],
    paths,
    observations: observations.map((observation) => ({
      tick: observation.tick,
      endTick: observation.endTick,
      chroma: observation.chroma,
      alternatives: observation.candidates.slice(0, topK).map(serializeKeyCandidate),
    })),
    modeCatalog: modes.map((mode) => ({ scale: mode.scale, prior: mode.prior })),
  };
}

export function serializeKeyCandidate(candidate) {
  return {
    tonic: candidate.tonic,
    scale: candidate.scale,
    tonicPc: candidate.tonicPc,
    score: Number(candidate.score.toFixed(6)),
    correlation: Number((candidate.correlation || 0).toFixed(6)),
    probability: Number((candidate.probability || 0).toFixed(6)),
    metadataPrior: Number((candidate.metadataPrior || 0).toFixed(6)),
    ...(candidate.coverage === undefined ? {} : { coverage: Number(candidate.coverage.toFixed(6)) }),
    ...(candidate.modePrior === undefined ? {} : { modePrior: Number(candidate.modePrior.toFixed(6)) }),
  };
}
