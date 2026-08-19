#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { analyzeMidi, MidiAnalysisError } from "../../lib/midi/analyze/index.js";

function usage() {
  return [
    "Usage: node tools/midi-analyze/index.mjs <input.mid> [options]",
    "",
    "Options:",
    "  -o, --output <file>       Write JSON to a file instead of stdout",
    "  --marker <name|index>     Analyze one MIDI marker section (default: Full Song)",
    "  --top-k <1..20>           Ranked key/chord alternatives to retain (default: 5)",
    "  --grid-beats <number>     Harmonic grid in quarter-note beats (default: 1)",
    "  --no-borrowed             Disable parallel-mode borrowed candidates",
    "  --no-applied              Disable applied-dominant candidates",
    "  --compact                 Emit compact JSON",
    "  -h, --help                Show this help",
  ].join("\n");
}

function parseArgs(argv) {
  const parsed = { input: null, output: null, compact: false, options: {} };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") return { ...parsed, help: true };
    if (arg === "-o" || arg === "--output") {
      if (!argv[index + 1]) throw new Error(`${arg} requires a file path`);
      parsed.output = argv[++index];
    } else if (arg === "--marker") {
      if (!argv[index + 1]) throw new Error("--marker requires a name or zero-based index");
      parsed.options.marker = argv[++index];
    } else if (arg === "--grid-beats") {
      if (!argv[index + 1]) throw new Error("--grid-beats requires a number");
      parsed.options.gridBeats = Number(argv[++index]);
    } else if (arg === "--top-k") {
      if (!argv[index + 1]) throw new Error("--top-k requires an integer from 1 through 20");
      parsed.options.topK = Number(argv[++index]);
    } else if (arg === "--no-borrowed") {
      parsed.options.includeBorrowed = false;
    } else if (arg === "--no-applied") {
      parsed.options.includeApplied = false;
    } else if (arg === "--compact") {
      parsed.compact = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!parsed.input) {
      parsed.input = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return parsed;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage()}\n`);
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!args.input) {
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 2;
    return;
  }

  try {
    const inputPath = resolve(args.input);
    const response = await analyzeMidi(inputPath, {
      ...args.options,
      sourceName: args.input,
    });
    const json = `${JSON.stringify(response, null, args.compact ? 0 : 2)}\n`;
    if (args.output) await writeFile(resolve(args.output), json, "utf8");
    else process.stdout.write(json);
  } catch (error) {
    const body = error instanceof MidiAnalysisError
      ? error.toJSON()
      : { name: error.name || "Error", code: "MIDI_ANALYSIS_FAILED", statusCode: 500, message: error.message };
    process.stderr.write(`${JSON.stringify(body)}\n`);
    process.exitCode = 1;
  }
}

await main();
