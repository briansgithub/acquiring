#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { analyzeMidi } from "../../lib/midi/analyze/index.js";
import { renderSectionToMidi } from "../../lib/midi/render/index.mjs";
import { chordInterpreter } from "../../web-player/lib/music.js";

const DEFAULT_MINIMUM_CASES = 93;
const DEFAULT_GATE_TARGET = 0.99;
const REQUIRED_TOP_K = 5;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function barePitchClass(note) {
  const match = /^([A-Ga-g])([#bx]*)(?:-?\d+)?$/.exec(String(note));
  if (!match) return null;
  let pitchClass = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1].toUpperCase()];
  for (const accidental of match[2]) {
    pitchClass += accidental === "b" ? -1 : accidental === "x" ? 2 : 1;
  }
  return ((pitchClass % 12) + 12) % 12;
}

/**
 * A forward-equivalent signature intentionally ignores spelling and duplicated
 * voices. It retains the sounding pitch-class set and bass pitch class, so
 * inversions remain distinguishable.
 */
function forwardSignature(chord, key) {
  try {
    const notes = chordInterpreter(chord, key)?.notes || [];
    const rendered = notes.map(barePitchClass).filter(Number.isInteger);
    if (!rendered.length) return null;
    const pitchClasses = [...new Set(rendered)].sort((left, right) => left - right);
    return {
      pitchClasses,
      bassPitchClass: rendered[0],
      id: `${pitchClasses.join(",")}/${rendered[0]}`,
    };
  } catch {
    return null;
  }
}

function parseChord(value, index) {
  let chord = value;
  if (typeof chord === "string") {
    try {
      chord = JSON.parse(chord);
    } catch (error) {
      throw new TypeError(`Parity case ${index + 1} has invalid chord JSON: ${error.message}`);
    }
  }
  if (!chord || typeof chord !== "object" || Array.isArray(chord)) {
    throw new TypeError(`Parity case ${index + 1} must contain a chord object in \"json\"`);
  }
  return { ...chord };
}

function normalizeCase(input, index, harmonicDurationBeats) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError(`Parity case ${index + 1} must be an object`);
  }
  if (!input.key || typeof input.key !== "object" || !input.key.tonic || !input.key.scale) {
    throw new TypeError(`Parity case ${index + 1} must provide key.tonic and key.scale`);
  }
  const chord = parseChord(input.json ?? input.chord, index);
  chord.beat = Number(chord.beat ?? 1);
  chord.duration = Number(chord.duration ?? harmonicDurationBeats);
  if (!Number.isFinite(chord.beat) || !Number.isFinite(chord.duration) || chord.duration <= 0) {
    throw new TypeError(`Parity case ${index + 1} has invalid beat or duration`);
  }
  return {
    index,
    id: String(input.id ?? `parity-${index + 1}`),
    chord,
    key: { tonic: String(input.key.tonic), scale: String(input.key.scale) },
  };
}

function sectionForCase(testCase) {
  const endBeat = Math.max(2, testCase.chord.beat + testCase.chord.duration);
  return {
    sectionName: testCase.id,
    songId: `synthetic-parity-${testCase.index + 1}`,
    songInfo: testCase.id,
    chords: [testCase.chord],
    notes: [],
    metadata: {
      keys: [{ ...testCase.key, beat: 1 }],
      tempos: [{ bpm: 120, beat: 1 }],
      meters: [{ numBeats: 4, beatUnit: 1, beat: 1 }],
      endBeat,
    },
  };
}

function soundingChords(analysis) {
  return (analysis.sections?.[0]?.hooktheory?.chords || []).filter((chord) => !chord.isRest);
}

function matchingAlternativeRow(analysis, expectedBeat) {
  const rows = analysis.sections?.[0]?.analysis?.chordAlternatives || [];
  return rows
    .filter((row) => Math.abs(Number(row.beat ?? 1) - expectedBeat) <= 0.25)
    .sort((left, right) => (
      Math.abs(Number(left.beat ?? 1) - expectedBeat) - Math.abs(Number(right.beat ?? 1) - expectedBeat)
      || Number(left.chordIndex ?? 0) - Number(right.chordIndex ?? 0)
    ))[0] || null;
}

function ratio(hits, total) {
  return { hits, total, recall: total ? hits / total : 1 };
}

function errorSummary(error) {
  return {
    name: error?.name || "Error",
    code: error?.code || "SYNTHETIC_CASE_FAILED",
    message: error?.message || String(error),
  };
}

async function analyzeCase(testCase) {
  const section = sectionForCase(testCase);
  const rendered = renderSectionToMidi(section);
  const analysis = await analyzeMidi(rendered.bytes, {
    topK: REQUIRED_TOP_K,
    sourceName: `synthetic-parity-${String(testCase.index + 1).padStart(3, "0")}.mid`,
  });
  const predictedChords = soundingChords(analysis);

  if (testCase.chord.isRest) {
    const passed = predictedChords.length === 0;
    return {
      index: testCase.index,
      id: testCase.id,
      status: "rest-excluded-from-sounding-recall",
      key: testCase.key,
      expectedChord: testCase.chord,
      rendered: { byteLength: rendered.bytes.byteLength, sha256: sha256(rendered.bytes) },
      restCheck: {
        passed,
        predictedSoundingChordCount: predictedChords.length,
        warningCodes: (analysis.sections?.[0]?.analysis?.warnings || []).map((warning) => warning.code),
      },
      contributesToRecall: false,
    };
  }

  const expectedSignature = forwardSignature(testCase.chord, testCase.key);
  if (!expectedSignature) throw new Error("Forward decoder did not produce a sounding chord signature");
  const alternativesRow = matchingAlternativeRow(analysis, testCase.chord.beat);
  const alternatives = (alternativesRow?.alternatives || []).slice(0, REQUIRED_TOP_K).map((alternative, index) => {
    const candidateKey = alternativesRow?.key || testCase.key;
    const signature = forwardSignature(alternative.chord, candidateKey);
    return {
      rank: index + 1,
      chord: alternative.chord,
      family: alternative.family,
      probability: alternative.probability,
      signature,
      forwardEquivalent: signature?.id === expectedSignature.id,
    };
  });
  const firstEquivalentRank = alternatives.find((alternative) => alternative.forwardEquivalent)?.rank ?? null;

  return {
    index: testCase.index,
    id: testCase.id,
    status: alternativesRow ? "scored" : "missing-aligned-chord",
    key: testCase.key,
    expectedChord: testCase.chord,
    expectedSignature,
    rendered: { byteLength: rendered.bytes.byteLength, sha256: sha256(rendered.bytes) },
    analysis: {
      selectedKey: analysis.sections?.[0]?.hooktheory?.metadata?.keys?.[0] || null,
      predictedSoundingChordCount: predictedChords.length,
      alignedBeat: alternativesRow?.beat ?? null,
      alternativeCount: alternatives.length,
    },
    alternatives,
    forwardEquivalent: {
      firstRank: firstEquivalentRank,
      top1: firstEquivalentRank !== null && firstEquivalentRank <= 1,
      top3: firstEquivalentRank !== null && firstEquivalentRank <= 3,
      top5: firstEquivalentRank !== null && firstEquivalentRank <= 5,
    },
    contributesToRecall: true,
  };
}

/**
 * Run the canonical renderer -> deterministic analyzer round-trip gate.
 *
 * This measures compatibility with this project's own synthetic renderer. It
 * is deliberately not an estimate of accuracy on independently authored MIDI.
 */
export async function runSyntheticRoundtripGate(corpus, options = {}) {
  if (!Array.isArray(corpus)) throw new TypeError("corpus must be an array of parity cases");
  const gateTarget = Number(options.gateTarget ?? DEFAULT_GATE_TARGET);
  const requestedMinimumCases = Number(options.minimumCases ?? 0);
  const harmonicDurationBeats = Number(options.harmonicDurationBeats ?? 4);
  if (!Number.isFinite(gateTarget) || gateTarget < 0 || gateTarget > 1) {
    throw new RangeError("gateTarget must be between 0 and 1");
  }
  if (!Number.isSafeInteger(requestedMinimumCases) || requestedMinimumCases < 0) {
    throw new RangeError("minimumCases must be a non-negative integer");
  }
  const minimumCases = requestedMinimumCases;
  if (!Number.isFinite(harmonicDurationBeats) || harmonicDurationBeats <= 0) {
    throw new RangeError("harmonicDurationBeats must be positive");
  }

  const normalized = corpus.map((entry, index) => normalizeCase(entry, index, harmonicDurationBeats));
  const cases = [];
  for (const testCase of normalized) {
    try {
      cases.push(await analyzeCase(testCase));
    } catch (error) {
      cases.push({
        index: testCase.index,
        id: testCase.id,
        status: "error",
        key: testCase.key,
        expectedChord: testCase.chord,
        contributesToRecall: !testCase.chord.isRest,
        error: errorSummary(error),
      });
    }
  }

  const sounding = cases.filter((entry) => entry.contributesToRecall);
  const rests = cases.filter((entry) => !entry.contributesToRecall);
  const errors = cases.filter((entry) => entry.status === "error");
  const top1Hits = sounding.filter((entry) => entry.forwardEquivalent?.top1).length;
  const top3Hits = sounding.filter((entry) => entry.forwardEquivalent?.top3).length;
  const top5Hits = sounding.filter((entry) => entry.forwardEquivalent?.top5).length;
  const restChecksPassed = rests.every((entry) => entry.restCheck?.passed === true);
  const corpusComplete = normalized.length >= minimumCases;
  const hasSoundingCases = sounding.length > 0;
  const top5 = ratio(top5Hits, sounding.length);
  const passed = corpusComplete
    && hasSoundingCases
    && errors.length === 0
    && restChecksPassed
    && top5.recall >= gateTarget;
  const outcomeDigest = sha256(JSON.stringify(cases.map((entry) => ({
    id: entry.id,
    status: entry.status,
    firstRank: entry.forwardEquivalent?.firstRank ?? null,
    restPassed: entry.restCheck?.passed ?? null,
    error: entry.error ?? null,
  }))));

  return {
    schemaVersion: "midi-synthetic-roundtrip-gate/v1",
    evidence: {
      kind: "synthetic-canonical-round-trip",
      realWorldAccuracyClaim: false,
      disclaimer: "This gate measures round-trip compatibility with this project's deterministic renderer; it does not measure accuracy on independently authored or arbitrary MIDI files.",
    },
    configuration: {
      analyzerTopK: REQUIRED_TOP_K,
      gateTarget,
      minimumCases,
      harmonicDurationBeats,
    },
    corpus: {
      totalCases: normalized.length,
      minimumCases,
      complete: corpusComplete,
      soundingCases: sounding.length,
      restCases: rests.length,
    },
    metrics: {
      forwardEquivalentChordRecall: {
        top1: ratio(top1Hits, sounding.length),
        top3: ratio(top3Hits, sounding.length),
        top5,
      },
      executionErrors: errors.length,
      restChecks: {
        passed: rests.filter((entry) => entry.restCheck?.passed).length,
        total: rests.length,
        allPassed: restChecksPassed,
      },
    },
    gate: {
      metric: "metrics.forwardEquivalentChordRecall.top5.recall",
      operator: ">=",
      target: gateTarget,
      actual: top5.recall,
      passed,
      conditions: {
        corpusMinimumMet: corpusComplete,
        hasSoundingCases,
        noExecutionErrors: errors.length === 0,
        restChecksPassed,
      },
    },
    deterministicOutcomeSha256: outcomeDigest,
    cases,
  };
}

export async function loadParityCorpus(filename) {
  const bytes = await fs.readFile(filename);
  const parsed = JSON.parse(bytes.toString("utf8"));
  if (!Array.isArray(parsed)) throw new TypeError("Parity corpus JSON must contain an array");
  return { cases: parsed, byteLength: bytes.byteLength, sha256: sha256(bytes) };
}

export async function resolveDefaultParityCorpus(cwd = process.cwd()) {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const relative = path.join("android", "app", "src", "test", "resources", "corpus_parity.json");
  const candidates = [
    path.resolve(cwd, relative),
    path.resolve(cwd, "..", relative),
    path.resolve(repositoryRoot, relative),
    path.resolve(repositoryRoot, "..", relative),
  ];
  for (const candidate of [...new Set(candidates)]) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      // Keep looking; the Android repository may be a sibling worktree.
    }
  }
  throw new Error(`Unable to find corpus_parity.json; pass --corpus <file>. Checked: ${candidates.join(", ")}`);
}

function usage() {
  return [
    "Usage: node tools/midi-analyze/synthetic-roundtrip.mjs [options]",
    "",
    "Options:",
    "  --corpus <file>          Parity corpus JSON (auto-detected by default)",
    "  -o, --output <file>      Write the report to a file instead of stdout",
    `  --target <0..1>          Required top-5 recall (default: ${DEFAULT_GATE_TARGET})`,
    `  --minimum-cases <count>  Reject a truncated corpus (default: ${DEFAULT_MINIMUM_CASES})`,
    "  --compact                Emit compact JSON",
    "  --summary                Emit gate metrics without per-case rows",
    "  -h, --help               Show this help",
    "",
    "This is a synthetic renderer round-trip gate, not a real-world MIDI accuracy benchmark.",
  ].join("\n");
}

function parseArgs(argv) {
  const parsed = {
    corpus: null,
    output: null,
    compact: false,
    summary: false,
    gateTarget: DEFAULT_GATE_TARGET,
    minimumCases: DEFAULT_MINIMUM_CASES,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") return { ...parsed, help: true };
    if (arg === "--corpus" || arg === "-o" || arg === "--output" || arg === "--target" || arg === "--minimum-cases") {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      if (arg === "--corpus") parsed.corpus = value;
      else if (arg === "-o" || arg === "--output") parsed.output = value;
      else if (arg === "--target") parsed.gateTarget = Number(value);
      else parsed.minimumCases = Number(value);
    } else if (arg === "--compact") {
      parsed.compact = true;
    } else if (arg === "--summary") {
      parsed.summary = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return parsed;
}

async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage()}\n`);
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const corpusPath = path.resolve(args.corpus || await resolveDefaultParityCorpus());
  const loaded = await loadParityCorpus(corpusPath);
  const report = await runSyntheticRoundtripGate(loaded.cases, {
    gateTarget: args.gateTarget,
    minimumCases: args.minimumCases,
  });
  report.source = {
    fixture: path.basename(corpusPath),
    byteLength: loaded.byteLength,
    sha256: loaded.sha256,
  };
  const outputDocument = args.summary ? {
    schemaVersion: report.schemaVersion,
    evidence: report.evidence,
    configuration: report.configuration,
    corpus: report.corpus,
    metrics: report.metrics,
    gate: report.gate,
    deterministicOutcomeSha256: report.deterministicOutcomeSha256,
    source: report.source,
  } : report;
  const json = `${JSON.stringify(outputDocument, null, args.compact ? 0 : 2)}\n`;
  if (args.output) await fs.writeFile(path.resolve(args.output), json, "utf8");
  else process.stdout.write(json);
  if (!report.gate.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`midi-synthetic-roundtrip: ${error.message}\n`);
    process.exitCode = 1;
  });
}
