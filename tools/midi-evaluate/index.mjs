#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  aggregateEvaluationReports,
  evaluateAnalysis,
  evaluateFrozenDevelopmentPromotion,
} from "../../lib/midi/evaluate/index.mjs";

function usage() {
  return `Usage:
  midi-evaluate truth-section.json analysis.json [--output report.json] [--beat-tolerance 0.25]
  midi-evaluate corpus corpus-manifest.json [--output aggregate.json] [--frozen-development]
  midi-evaluate aggregate reports.json [--output aggregate.json] [--split development] [--manifest-id ID]
  midi-evaluate promote baseline-aggregate.json candidate-aggregate.json [--output decision.json]

Corpus manifests contain a non-empty "pairs" (or "entries") array. Each pair needs an id,
truth, and analysis (inline JSON or a path relative to the manifest), and may name lane,
rendererFamilyId, or familyHoldoutKey. A promotable report also requires frozen=true,
split=development, and a stable manifestId.`;
}

function parseArgs(argv) {
  const options = { positionals: [] };
  const valueOptions = new Map([
    ["--output", "output"],
    ["--beat-tolerance", "beatTolerance"],
    ["--split", "split"],
    ["--partition", "split"],
    ["--manifest-id", "manifestId"],
    ["--minimum-gain", "minimumGain"],
    ["--maximum-regression", "maximumRegression"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--frozen-development") options.frozenDevelopment = true;
    else if (valueOptions.has(arg)) {
      const value = argv[index + 1];
      if (value == null || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      options[valueOptions.get(arg)] = value;
      index += 1;
    } else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    else options.positionals.push(arg);
  }
  return options;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function resolveJsonValue(value, baseDirectory, label) {
  if (typeof value === "string") return readJson(path.resolve(baseDirectory, value));
  if (value && typeof value === "object" && typeof value.path === "string") {
    return readJson(path.resolve(baseDirectory, value.path));
  }
  if (value && typeof value === "object") return value;
  throw new Error(`${label} must be inline JSON or a JSON file path`);
}

async function writeResult(value, outputPath) {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  if (!outputPath) {
    process.stdout.write(json);
    return;
  }
  const resolved = path.resolve(outputPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, json);
}

function aggregateOptions(options, source = {}) {
  return {
    split: options.split ?? source.split ?? source.partition,
    frozenDevelopment: options.frozenDevelopment || source.frozen === true,
    manifestId: options.manifestId ?? source.manifestId,
  };
}

async function evaluatePair(options) {
  const truthPath = options.positionals[0];
  const analysisPath = options.positionals[1];
  if (!truthPath || !analysisPath) throw new Error(usage());
  const report = evaluateAnalysis(
    await readJson(path.resolve(truthPath)),
    await readJson(path.resolve(analysisPath)),
    { beatTolerance: options.beatTolerance == null ? 0.25 : Number(options.beatTolerance) },
  );
  await writeResult(report, options.output);
  return report;
}

async function evaluateCorpus(options) {
  const manifestPath = options.positionals[0];
  if (!manifestPath) throw new Error(usage());
  const resolvedManifest = path.resolve(manifestPath);
  const baseDirectory = path.dirname(resolvedManifest);
  const manifest = await readJson(resolvedManifest);
  const pairs = manifest.pairs ?? manifest.entries;
  if (!Array.isArray(pairs) || !pairs.length) throw new Error("Corpus manifest requires a non-empty pairs array");
  const aggregateConfig = aggregateOptions(options, manifest);
  if (aggregateConfig.frozenDevelopment) {
    const normalizedSplit = aggregateConfig.split === "dev" ? "development" : aggregateConfig.split;
    if (normalizedSplit !== "development") throw new Error("Frozen-development corpus split must be development");
    if (!aggregateConfig.manifestId) throw new Error("Frozen-development corpus requires manifestId");
    if (pairs.some((pair) => !(pair.id ?? pair.pairId))) {
      throw new Error("Every frozen-development pair requires id or pairId");
    }
  }
  const sharedSignatureCounts = manifest.signatureCounts
    ? await resolveJsonValue(manifest.signatureCounts, baseDirectory, "signatureCounts")
    : undefined;
  const reports = [];
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index];
    const truth = await resolveJsonValue(pair.truth, baseDirectory, `pairs[${index}].truth`);
    const analysis = await resolveJsonValue(pair.analysis, baseDirectory, `pairs[${index}].analysis`);
    const metadata = { ...(pair.metadata || {}) };
    const explicitMetadata = {
      id: pair.id ?? pair.pairId,
      pairId: pair.pairId ?? pair.id,
      songId: pair.songId,
      compositionGroupId: pair.compositionGroupId,
      evaluationLane: pair.evaluationLane ?? pair.lane,
      artifactKind: pair.artifactKind,
      rendererFamilyId: pair.rendererFamilyId,
      familyHoldoutKey: pair.familyHoldoutKey,
      split: pair.split ?? aggregateConfig.split,
      manifestId: aggregateConfig.manifestId,
      frozen: aggregateConfig.frozenDevelopment,
    };
    for (const [field, value] of Object.entries(explicitMetadata)) {
      if (value !== undefined) metadata[field] = value;
    }
    const report = evaluateAnalysis(truth, analysis, {
      beatTolerance: options.beatTolerance == null ? manifest.beatTolerance ?? 0.25 : Number(options.beatTolerance),
      rareSignatures: pair.rareSignatures ?? manifest.rareSignatures,
      signatureCounts: pair.signatureCounts ?? sharedSignatureCounts,
      rareOccurrenceThreshold: manifest.rareOccurrenceThreshold,
      evaluationMetadata: metadata,
    });
    reports.push({ report, metadata });
  }
  const aggregate = aggregateEvaluationReports(reports, aggregateConfig);
  await writeResult(aggregate, options.output);
  return aggregate;
}

async function aggregateReports(options) {
  const inputPath = options.positionals[0];
  if (!inputPath) throw new Error(usage());
  const source = await readJson(path.resolve(inputPath));
  const reports = Array.isArray(source) ? source : source.reports ?? source.entries ?? source.songReports;
  if (!Array.isArray(reports) || !reports.length) {
    throw new Error("Aggregate input requires a non-empty reports array");
  }
  const aggregate = aggregateEvaluationReports(reports, aggregateOptions(options, source));
  await writeResult(aggregate, options.output);
  return aggregate;
}

async function promote(options) {
  const baselinePath = options.positionals[0];
  const candidatePath = options.positionals[1];
  if (!baselinePath || !candidatePath) throw new Error(usage());
  const decision = evaluateFrozenDevelopmentPromotion(
    await readJson(path.resolve(baselinePath)),
    await readJson(path.resolve(candidatePath)),
    {
      minimumGain: options.minimumGain == null ? undefined : Number(options.minimumGain),
      maximumRegression: options.maximumRegression == null ? undefined : Number(options.maximumRegression),
    },
  );
  await writeResult(decision, options.output);
  if (!decision.promoted) process.exitCode = 2;
  return decision;
}

export async function main(argv = process.argv.slice(2)) {
  const command = ["corpus", "aggregate", "promote"].includes(argv[0]) ? argv[0] : "pair";
  const options = parseArgs(command === "pair" ? argv : argv.slice(1));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return null;
  }
  if (command === "corpus") return evaluateCorpus(options);
  if (command === "aggregate") return aggregateReports(options);
  if (command === "promote") return promote(options);
  return evaluatePair(options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`midi-evaluate: ${error.message}\n`);
    process.exitCode = 1;
  });
}
