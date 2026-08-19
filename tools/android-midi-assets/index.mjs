#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  canonicalizePriors,
  decodeCatalogPriors,
  encodeCatalogPriors,
  priorManifest,
  stableJson,
} from "./priors.mjs";

function parseArgs(argv) {
  const options = {
    input: path.resolve("lib/midi/analyze/catalog-priors.json"),
    outputDir: path.resolve("midi_data/android"),
    verify: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input") options.input = path.resolve(argv[++index]);
    else if (token === "--output-dir") options.outputDir = path.resolve(argv[++index]);
    else if (token === "--verify") options.verify = true;
    else if (token === "--help" || token === "-h") options.help = true;
    else throw new TypeError(`Unknown option: ${token}`);
  }
  return options;
}

function usage() {
  return [
    "Usage: node tools/android-midi-assets/index.mjs [options]",
    "",
    "Options:",
    "  --input <catalog-priors.json>",
    "  --output-dir <directory>",
    "  --verify  Decode and compare every prior row before writing",
  ].join("\n");
}

async function atomicWrite(filename, bytes) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp-${process.pid}`;
  try {
    await fs.writeFile(temporary, bytes, { flag: "wx" });
    await fs.rename(temporary, filename);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

export async function generateAndroidMidiAssets(options) {
  const sourceBytes = await fs.readFile(options.input);
  const priors = JSON.parse(sourceBytes.toString("utf8"));
  const binary = encodeCatalogPriors(priors);
  if (options.verify) {
    const expected = canonicalizePriors(priors);
    const actual = decodeCatalogPriors(binary);
    if (stableJson(expected) !== stableJson(actual)) {
      throw new Error("Decoded Android priors do not match the canonical JSON priors");
    }
  }
  const binaryName = "catalog-priors-v1.bin";
  const manifest = priorManifest(binary, priors, binaryName);
  await atomicWrite(path.join(options.outputDir, binaryName), binary);
  await atomicWrite(
    path.join(options.outputDir, "catalog-priors-v1.manifest.json"),
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
  );
  return { binary, manifest };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await generateAndroidMidiAssets(options);
  process.stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`android-midi-assets: ${error.message}\n`);
    process.exitCode = 1;
  });
}
