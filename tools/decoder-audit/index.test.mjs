import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";
import { createRequire } from "node:module";

import { parseArgs, summarizeComparison } from "./index.mjs";
import { runCatalogAudit } from "./catalog.mjs";
import { selectCoverageSongs } from "./selection.mjs";
import {
  CATALOG_PRIORS_SCHEMA_VERSION,
  buildSignatureDocumentsFromRows,
} from "./signature-index.mjs";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");

test("summary keeps oracle channels separate and computes rates", () => {
  const report = summarizeComparison({
    sections: [{
      rows: [
        {
          flags: { romanExact: true, romanCore: true, pcsExact: true, bassInNotes: true, orderOk: true },
          notesOk: true,
          ok: true,
          engineError: null,
        },
        {
          flags: { romanExact: false, romanCore: true, pcsExact: false, bassInNotes: true, orderOk: false },
          notesOk: false,
          ok: false,
          engineError: "bad input",
        },
      ],
    }],
  });
  assert.equal(report.total, 2);
  assert.equal(report.romanExact, 1);
  assert.equal(report.romanCore, 2);
  assert.equal(report.engineErrors, 1);
  assert.equal(report.rates.allOk, 0.5);
});

test("argument parser requires exactly one audit source", () => {
  assert.equal(parseArgs(["--catalog", "catalog.db"]).catalog, "catalog.db");
  assert.throws(() => parseArgs([]), /exactly one/);
  assert.throws(
    () => parseArgs(["--catalog", "catalog.db", "--scrape", "scrape.json"]),
    /exactly one/,
  );
  const signatureArgs = parseArgs([
    "--catalog", "catalog.db",
    "--signature-index",
    "--manifest", "manifest-dir",
    "--output", "index.json",
    "--priors-output", "priors.json",
  ]);
  assert.equal(signatureArgs.signatureIndex, true);
  assert.throws(
    () => parseArgs(["--catalog", "catalog.db", "--signature-index"]),
    /requires --manifest/,
  );
});

function rawChord(overrides = {}) {
  return {
    root: 1,
    beat: 1,
    duration: 1,
    type: 5,
    inversion: 0,
    applied: 0,
    borrowed: "",
    adds: [],
    omits: [],
    alterations: [],
    suspensions: [],
    substitutions: [],
    isRest: false,
    ...overrides,
  };
}

function signatureFixtureRow(slug, split, chords) {
  return {
    slug,
    split,
    groupId: `${split}:${slug}`,
    componentSize: 1,
    payload: {
      section: {
        sectionName: "Full Song",
        metadata: { keys: [{ beat: 1, tonic: "C", scale: "major" }] },
        chords: chords.map((chord, index) => ({ ...chord, beat: index + 1 })),
      },
    },
  };
}

test("catalog priors use only train rows and retain extended/modifier structures", () => {
  const trainChords = [
    rawChord({ type: 9, adds: [9], _truthRoman: "must-not-leak", engNotes: ["C"] }),
    rawChord({ root: 2, type: 11, omits: [5], suspensions: [4] }),
    rawChord({ root: 3, type: 13, alterations: ["b9"], substitutions: ["tri"] }),
    rawChord({ root: 4, borrowed: null }),
    rawChord({ root: 4, borrowed: "" }),
  ];
  const trainRow = signatureFixtureRow("train-song", "train", trainChords);
  const provenance = {
    manifestId: "sha256:frozen",
    manifestVersion: 2,
    manifestRecordsSha256: "records",
    catalogDatabaseSha256: "database",
    catalogFingerprintSha256: "fingerprint",
  };
  const first = buildSignatureDocumentsFromRows([
    trainRow,
    signatureFixtureRow("validation-song", "validation", [rawChord({ root: 5, type: 7 })]),
    signatureFixtureRow("test-song", "test", [rawChord({ root: 7, type: 7 })]),
  ], provenance);
  const changed = buildSignatureDocumentsFromRows([
    trainRow,
    signatureFixtureRow("validation-song", "validation", [
      rawChord({ root: 6, type: 13, adds: [6], alterations: ["#11"] }),
    ]),
    signatureFixtureRow("test-song", "test", [
      rawChord({ root: 2, type: 11, borrowed: "dorian", suspensions: [2] }),
    ]),
  ], provenance);

  assert.deepEqual(changed.compactPriors, first.compactPriors);
  assert.notDeepEqual(changed.fullIndex, first.fullIndex);
  assert.equal(first.compactPriors.schemaVersion, CATALOG_PRIORS_SCHEMA_VERSION);
  assert.equal(first.compactPriors.summary.trainOccurrences, 5);
  assert.equal(first.compactPriors.summary.trainTransitions, 4);
  assert.equal(first.compactPriors.objects.length, 5);
  assert.deepEqual(
    new Set(first.compactPriors.objects.map((entry) => entry.chord.type)),
    new Set([5, 9, 11, 13]),
  );
  assert(first.compactPriors.objects.some((entry) => entry.chord.adds.includes(9)));
  assert(first.compactPriors.objects.some((entry) => entry.chord.omits.includes(5)));
  assert(first.compactPriors.objects.some((entry) => entry.chord.alterations.includes("b9")));
  assert(first.compactPriors.objects.some((entry) => entry.chord.suspensions.includes(4)));
  assert(first.compactPriors.objects.some((entry) => entry.chord.substitutions.includes("tri")));
  assert.equal(first.compactPriors.objects.some((entry) => "_truthRoman" in entry.chord), false);
  assert.equal(first.compactPriors.objects.some((entry) => "engNotes" in entry.chord), false);

  const rootFour = first.compactPriors.objects.filter((entry) => entry.chord.root === 4);
  assert.equal(rootFour.length, 2, "null and empty borrowed objects stay structurally distinct");
  assert.notEqual(rootFour[0].id, rootFour[1].id);
  assert.equal(first.compactPriors.transitions.starts.length, 1);
  assert.equal(first.compactPriors.transitions.bySource.length, 4);
  assert(first.compactPriors.objects.every((entry) => entry.trainOccurrences > 0));
});

test("catalog audit separates malformed rows and decodes unique valid contexts", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "decoder-audit-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const catalog = path.join(directory, "catalog.db");
  const db = new DatabaseSync(catalog);
  db.exec("CREATE TABLE songs (slug TEXT PRIMARY KEY, dataBlob BLOB)");
  const section = {
    songId: "section-1",
    sectionName: "Verse",
    metadata: { keys: [{ beat: 1, tonic: "C", scale: "major" }] },
    chords: [
      {
        root: 1, beat: 1, duration: 1, type: 5, inversion: 0, applied: 0,
        adds: [], omits: [], alterations: [], suspensions: [], substitutions: [],
        borrowed: "", isRest: false,
      },
      {
        root: 1, beat: 2, duration: 1, type: 5, inversion: 0, applied: 0,
        adds: [], omits: [], alterations: [], suspensions: [],
        borrowed: "", isRest: false,
      },
      {
        root: -1, beat: 3, duration: 1, type: 5, inversion: 0, applied: 0,
        adds: [], omits: [], alterations: [], suspensions: [], substitutions: [],
        borrowed: "", isRest: false,
      },
      { root: 0, beat: 4, duration: 1, type: 5, inversion: 0, applied: 0,
        adds: [], omits: [], alterations: [], suspensions: [], substitutions: [],
        borrowed: "", isRest: true },
    ],
  };
  db.prepare("INSERT INTO songs (slug, dataBlob) VALUES (?, ?)")
    .run("example", zlib.gzipSync(Buffer.from(JSON.stringify({ "section-1": section }))));
  db.close();

  const report = await runCatalogAudit({ catalog });
  assert.equal(report.counts.songs, 1);
  assert.equal(report.counts.chords, 4);
  assert.equal(report.counts.rests, 1);
  assert.equal(report.counts.validRows, 2);
  assert.equal(report.counts.anomalyRows, 1);
  assert.equal(report.counts.uniqueSignatures, 1);
  assert.equal(report.counts.uniqueDecoderContexts, 1);
  assert.equal(report.counts.decodedRows, 2);
  assert.equal(report.counts.decoderErrors, 0);
  assert.equal(report.normalizationCodes.substitutions_defaulted, 1);
  const selection = selectCoverageSongs({ catalog, maxSongs: 10 });
  assert.equal(selection.selected.length, 1);
  assert.equal(selection.coverage.familyRate, 1);
  assert.equal(selection.coverage.rareSignatureRate, 1);
});
