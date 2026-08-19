#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { analyzeMidi } from "../../lib/midi/analyze/index.js";

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))];
}

function round(value) {
  return Number(value.toFixed(3));
}

export async function runBenchmark(input, options = {}) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const iterations = Math.max(1, Math.min(100, Math.floor(Number(options.iterations ?? 5))));
  const warmups = Math.max(0, Math.min(10, Math.floor(Number(options.warmups ?? 1))));
  const maxMs = Number(options.maxMs ?? 30_000);
  const analyzerOptions = {
    topK: Number(options.topK ?? 5),
    sourceName: options.sourceName || "benchmark.mid",
  };

  for (let index = 0; index < warmups; index += 1) {
    await analyzeMidi(bytes, analyzerOptions);
  }

  const samples = [];
  let maximumRssDeltaBytes = 0;
  let deterministicDigest = null;
  for (let index = 0; index < iterations; index += 1) {
    const rssBefore = process.memoryUsage().rss;
    const started = performance.now();
    const result = await analyzeMidi(bytes, analyzerOptions);
    const elapsedMs = performance.now() - started;
    const rssAfter = process.memoryUsage().rss;
    maximumRssDeltaBytes = Math.max(maximumRssDeltaBytes, Math.max(0, rssAfter - rssBefore));
    const digest = createHash("sha256").update(JSON.stringify(result)).digest("hex");
    deterministicDigest ??= digest;
    if (digest !== deterministicDigest) {
      const error = new Error("Repeated analysis produced different JSON output");
      error.code = "NONDETERMINISTIC_ANALYSIS";
      throw error;
    }
    samples.push(elapsedMs);
  }

  const maximum = Math.max(...samples);
  return {
    schemaVersion: "midi-analysis-benchmark/v1",
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    source: {
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
    configuration: { iterations, warmups, maxMs, topK: analyzerOptions.topK },
    elapsedMs: {
      samples: samples.map(round),
      minimum: round(Math.min(...samples)),
      median: round(percentile(samples, 0.5)),
      p95: round(percentile(samples, 0.95)),
      maximum: round(maximum),
    },
    maximumRssDeltaBytes,
    deterministicDigest,
    passed: maximum <= maxMs,
  };
}

function usage() {
  return [
    "Usage: node tools/midi-analyze/benchmark.mjs input.mid [options]",
    "",
    "Options:",
    "  --iterations <1..100>  Measured runs (default: 5)",
    "  --warmups <0..10>       Warmup runs (default: 1)",
    "  --top-k <1..20>         Analyzer alternatives (default: 5)",
    "  --max-ms <number>       Maximum allowed time for any run (default: 30000)",
  ].join("\n");
}

async function main(argv = process.argv.slice(2)) {
  if (!argv.length || argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const inputPath = argv[0];
  const value = (name, fallback) => {
    const index = argv.indexOf(name);
    return index >= 0 ? Number(argv[index + 1]) : fallback;
  };
  const report = await runBenchmark(await fs.readFile(inputPath), {
    iterations: value("--iterations", 5),
    warmups: value("--warmups", 1),
    topK: value("--top-k", 5),
    maxMs: value("--max-ms", 30_000),
    sourceName: inputPath,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`midi-benchmark: ${error.message}\n`);
    process.exitCode = 1;
  });
}
