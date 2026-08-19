#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { runCatalogAudit } from "./catalog.mjs";
import { selectCoverageSongs } from "./selection.mjs";
import { buildCatalogSignatureIndex, writeSignatureDocuments } from "./signature-index.mjs";

const require = createRequire(import.meta.url);
const { compareSong } = require("../../_Decode_oracle/compare.js");

export function summarizeComparison(comparison) {
  const rows = (comparison.sections || []).flatMap((section) => section.rows || []);
  const count = (predicate) => rows.reduce((total, row) => total + (predicate(row) ? 1 : 0), 0);
  const total = rows.length;
  const ratio = (value) => total ? value / total : 0;
  const metrics = {
    total,
    romanExact: count((row) => row.flags?.romanExact),
    romanCore: count((row) => row.flags?.romanCore),
    pitchClassesExact: count((row) => row.flags?.pcsExact),
    bassMatch: count((row) => row.flags?.bassInNotes),
    noteOrder: count((row) => row.flags?.orderOk),
    notesOk: count((row) => row.notesOk),
    allOk: count((row) => row.ok),
    engineErrors: count((row) => Boolean(row.engineError)),
  };
  metrics.rates = Object.fromEntries(
    Object.entries(metrics)
      .filter(([name]) => name !== "total" && name !== "rates")
      .map(([name, value]) => [name, ratio(value)]),
  );
  return metrics;
}

export function parseArgs(argv) {
  const options = {
    lane: "both",
    output: null,
    scrape: null,
    catalog: null,
    selectOracle: false,
    signatureIndex: false,
    manifest: null,
    priorsOutput: null,
    maxSongs: 250,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--scrape") options.scrape = argv[++index];
    else if (arg === "--catalog") options.catalog = argv[++index];
    else if (arg === "--select-oracle") options.selectOracle = true;
    else if (arg === "--signature-index") options.signatureIndex = true;
    else if (arg === "--manifest") options.manifest = argv[++index];
    else if (arg === "--priors-output") options.priorsOutput = argv[++index];
    else if (arg === "--max-songs") options.maxSongs = Number(argv[++index]);
    else if (arg === "--lane") options.lane = argv[++index];
    else if (arg === "--output") options.output = argv[++index];
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.help && Boolean(options.scrape) === Boolean(options.catalog)) {
    throw new Error("provide exactly one of --scrape or --catalog");
  }
  if (!options.help && options.signatureIndex) {
    if (!options.catalog || options.scrape) throw new Error("--signature-index requires --catalog");
    if (!options.manifest) throw new Error("--signature-index requires --manifest");
    if (!options.output) throw new Error("--signature-index requires --output");
    if (!options.priorsOutput) throw new Error("--signature-index requires --priors-output");
  }
  if (!options.help && options.signatureIndex && options.selectOracle) {
    throw new Error("--signature-index and --select-oracle are mutually exclusive");
  }
  if (!['raw', 'truth-enriched', 'both'].includes(options.lane)) {
    throw new Error("--lane must be raw, truth-enriched, or both");
  }
  return options;
}

function usage() {
  return [
    "Usage: decoder-audit --scrape scrape.json [--lane raw|truth-enriched|both] [--output report.json]",
    "       decoder-audit --catalog catalog.db [--output report.json]",
    "       decoder-audit --catalog catalog.db --select-oracle [--max-songs 250] [--output queue.json]",
    "       decoder-audit --catalog catalog.db --signature-index --manifest manifest-dir",
    "         --output full-index.json --priors-output catalog-priors.json",
    "",
    "The raw lane decodes only stored Hooktheory JSON. The truth-enriched lane is",
    "reported separately and may use rendered symbols to supplement missing fields.",
    "The catalog lane streams every song, quarantines malformed rows, and decodes",
    "each unique valid chord/key context through the strictly raw engine path.",
    "The signature-index lane verifies the frozen manifest/catalog hashes, writes",
    "all-split audit counts, and derives analyzer priors only from training rows.",
  ].join("\n");
}

export async function runDecoderAudit({
  scrape,
  catalog,
  lane = "both",
  selectOracle = false,
  signatureIndex = false,
  manifest = null,
  maxSongs = 250,
}) {
  if (catalog) {
    if (signatureIndex) {
      return buildCatalogSignatureIndex({
        catalog,
        manifestDir: manifest,
        progress: (counts) => process.stderr.write(
          `decoder-audit signature-index: scanned ${counts.songs} songs\n`,
        ),
      });
    }
    if (selectOracle) return selectCoverageSongs({ catalog, maxSongs });
    return runCatalogAudit({
      catalog,
      progress: (counts) => process.stderr.write(
        `decoder-audit: scanned ${counts.songs} songs / ${counts.soundingChords} sounding chords\n`,
      ),
    });
  }
  const source = JSON.parse(await fs.readFile(scrape, "utf8"));
  const lanes = lane === "both" ? ["raw", "truth-enriched"] : [lane];
  const reports = {};
  for (const currentLane of lanes) {
    const comparison = await compareSong(source, { lane: currentLane });
    reports[currentLane] = {
      summary: summarizeComparison(comparison),
      comparison,
    };
  }
  return {
    schemaVersion: "decoder-audit/v1",
    generatedAt: new Date().toISOString(),
    source: path.resolve(scrape),
    lanes: reports,
  };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const report = await runDecoderAudit(options);
    if (options.signatureIndex) {
      await writeSignatureDocuments(report, {
        output: options.output,
        priorsOutput: options.priorsOutput,
      });
      process.stdout.write(`${JSON.stringify({
        ok: true,
        manifestId: report.fullIndex.manifestId,
        output: path.resolve(options.output),
        priorsOutput: path.resolve(options.priorsOutput),
        signatures: report.fullIndex.signatures.length,
        trainObjects: report.compactPriors.objects.length,
        trainOccurrences: report.compactPriors.summary.trainOccurrences,
      }, null, 2)}\n`);
      return;
    }
    const json = `${JSON.stringify(report, null, 2)}\n`;
    if (options.output) {
      await fs.mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
      await fs.writeFile(options.output, json);
    } else {
      process.stdout.write(json);
    }
  } catch (error) {
    process.stderr.write(`decoder-audit: ${error.message}\n`);
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
