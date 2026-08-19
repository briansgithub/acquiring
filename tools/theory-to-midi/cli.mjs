#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { AUGMENTATION_FAMILY_IDS, renderSectionToMidi } from "../../lib/midi/render/index.mjs";

const HELP = `Usage:
  npm run theory-to-midi -- <section.json> [output.mid] [options]

Options:
  -o, --output <path>              MIDI output path
      --sidecar <path>             Provenance JSON path (default: <output>.provenance.json)
      --no-sidecar                 Do not write the provenance sidecar
      --section <id|name|index>    Select a section from a wrapper document
      --augmentation-family <id>  Apply a seeded texture recipe
      --transpose <semitones>      Deterministic pitch transposition
      --seed <value>               Augmentation seed (default: 0)
      --velocity-jitter <0..1>     Per-event velocity jitter
      --velocity-scale <number>    Multiply source velocities
      --timing-jitter <ticks>      Start-time jitter in 192-PPQ ticks
      --duration-jitter <ticks>    Duration jitter in 192-PPQ ticks
      --permute-tracks             Deterministically permute track order
      --merge-tracks               Merge this section's tracks into one track
      --drop-out-of-range          Drop pitches outside 0..127 after transposition
      --force-root-position        Render every chord in root position
  -h, --help                       Show this help
`;

function valueAfter(args, index, flag) {
  if (index + 1 >= args.length) {
    throw new Error(`${flag} requires a value`);
  }
  return args[index + 1];
}

function numberValue(value, flag) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${flag} requires a finite number`);
  return number;
}

export function parseArguments(argv) {
  const options = {
    positionals: [],
    writeSidecar: true,
    augmentation: {},
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "-h" || argument === "--help") {
      options.help = true;
    } else if (argument === "-o" || argument === "--output") {
      options.output = valueAfter(argv, index, argument);
      index += 1;
    } else if (argument === "--sidecar") {
      options.sidecar = valueAfter(argv, index, argument);
      index += 1;
    } else if (argument === "--no-sidecar") {
      options.writeSidecar = false;
    } else if (argument === "--section") {
      options.section = valueAfter(argv, index, argument);
      index += 1;
    } else if (argument === "--augmentation-family" || argument === "--recipe") {
      const recipe = valueAfter(argv, index, argument);
      if (!AUGMENTATION_FAMILY_IDS.includes(recipe)) {
        throw new Error(`${argument} must be one of ${AUGMENTATION_FAMILY_IDS.join(", ")}`);
      }
      options.augmentation.recipe = recipe;
      index += 1;
    } else if (argument === "--transpose") {
      options.augmentation.transposeSemitones = numberValue(valueAfter(argv, index, argument), argument);
      index += 1;
    } else if (argument === "--seed") {
      options.augmentation.seed = valueAfter(argv, index, argument);
      index += 1;
    } else if (argument === "--velocity-jitter") {
      options.augmentation.velocityJitter = numberValue(valueAfter(argv, index, argument), argument);
      index += 1;
    } else if (argument === "--velocity-scale") {
      options.augmentation.velocityScale = numberValue(valueAfter(argv, index, argument), argument);
      index += 1;
    } else if (argument === "--timing-jitter") {
      options.augmentation.timingJitterTicks = numberValue(valueAfter(argv, index, argument), argument);
      index += 1;
    } else if (argument === "--duration-jitter") {
      options.augmentation.durationJitterTicks = numberValue(valueAfter(argv, index, argument), argument);
      index += 1;
    } else if (argument === "--permute-tracks") {
      options.augmentation.permuteTracks = true;
    } else if (argument === "--merge-tracks") {
      options.augmentation.mergeTracks = true;
    } else if (argument === "--drop-out-of-range") {
      options.augmentation.outOfRange = "drop";
    } else if (argument === "--force-root-position") {
      options.forceRootPosition = true;
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    } else {
      options.positionals.push(argument);
    }
  }
  return options;
}

function looksLikeSection(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && (Array.isArray(value.chords) || Array.isArray(value.notes)
      || (value.notes && typeof value.notes === "object"));
}

function wrappedSections(document) {
  if (Array.isArray(document)) {
    return document.map((section, index) => ({ key: String(index), section }));
  }
  if (Array.isArray(document?.sections)) {
    return document.sections.map((entry, index) => ({
      key: String(index),
      section: looksLikeSection(entry) ? entry : entry?.json,
      wrapper: entry,
    }));
  }
  if (document?.sections && typeof document.sections === "object") {
    return Object.entries(document.sections).map(([key, entry]) => ({
      key,
      section: looksLikeSection(entry) ? entry : entry?.json,
      wrapper: entry,
    }));
  }
  if (looksLikeSection(document?.json)) {
    return [{ key: "0", section: document.json, wrapper: document }];
  }
  return [];
}

function candidateLabels(candidate, index) {
  const section = candidate.section || {};
  const wrapper = candidate.wrapper || {};
  return [
    candidate.key,
    String(index),
    section.songId,
    section.stringSongId,
    section.sectionName,
    section.name,
    wrapper.songId,
    wrapper.name,
  ].filter((value) => value !== undefined && value !== null).map(String);
}

export function selectSection(document, selector) {
  if (looksLikeSection(document)) return document;
  const candidates = wrappedSections(document).filter((candidate) => looksLikeSection(candidate.section));
  if (!candidates.length) {
    throw new Error("Input is not an ExtractedSection or a document containing ExtractedSections");
  }
  if (selector === undefined) {
    if (candidates.length === 1) return candidates[0].section;
    throw new Error(`Input contains ${candidates.length} sections; choose one with --section`);
  }
  const selected = candidates.find((candidate, index) => (
    candidateLabels(candidate, index).includes(String(selector))
  ));
  if (!selected) throw new Error(`No section matches ${JSON.stringify(selector)}`);
  return selected.section;
}

function defaultOutputPath(inputPath) {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.mid`);
}

function hasAugmentation(options) {
  return Object.keys(options.augmentation).length > 0;
}

export async function run(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(HELP);
    return null;
  }
  const inputPath = options.positionals[0];
  if (!inputPath) throw new Error("Missing input JSON path\n\n" + HELP);
  const outputPath = path.resolve(options.output || options.positionals[1] || defaultOutputPath(inputPath));
  const sidecarPath = path.resolve(options.sidecar || `${outputPath}.provenance.json`);
  const input = JSON.parse(await fs.readFile(path.resolve(inputPath), "utf8"));
  const section = selectSection(input, options.section);
  const rendered = renderSectionToMidi(section, {
    forceRootPosition: options.forceRootPosition,
    augmentation: hasAugmentation(options) ? options.augmentation : null,
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, rendered.bytes);
  if (options.writeSidecar) {
    await fs.mkdir(path.dirname(sidecarPath), { recursive: true });
    await fs.writeFile(sidecarPath, `${JSON.stringify(rendered.sidecar, null, 2)}\n`, "utf8");
  }

  const summary = {
    input: path.resolve(inputPath),
    output: outputPath,
    sidecar: options.writeSidecar ? sidecarPath : null,
    ppq: rendered.sidecar.render.ppq,
    midiFormat: rendered.sidecar.render.midiFormat,
    rendererFamilyId: rendered.sidecar.rendererFamilyId,
    tracks: rendered.sidecar.render.tracks,
    sourceSha256: rendered.sidecar.sourceSha256,
    midiSha256: rendered.sidecar.midiSha256,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  run().catch((error) => {
    process.stderr.write(`theory-to-midi: ${error.message}\n`);
    process.exitCode = 1;
  });
}
