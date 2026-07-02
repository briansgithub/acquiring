#!/usr/bin/env node
/**
 * Scale-degree verifier CLI — fixtures, corpus batch, CI gate.
 *
 * Usage:
 *   node scripts/runScaleDegreeVerifier.mjs
 *   node scripts/runScaleDegreeVerifier.mjs --case g-major-V-ii
 *   node scripts/runScaleDegreeVerifier.mjs --corpus chord_db --tier quick
 *   node scripts/runScaleDegreeVerifier.mjs --corpus chord_db --tier full --report ../../_Decode_oracle/reports/scale_degree_report.json
 */

import path from "path";
import { fileURLToPath } from "url";
import {
  verifyInterpretedChord,
  formatVerifyReport,
  verifyScaleDegrees,
} from "../lib/scaleDegreeVerifier.js";
import { SCALE_DEGREE_FIXTURES } from "../lib/scaleDegreeVerifierFixtures.js";
import {
  CORPUS_DIRS,
  loadChordDbEntries,
  runBatch,
  summarizeBatch,
  formatBatchSummary,
  writeBatchReport,
  REPO_ROOT,
} from "../lib/scaleDegreeVerifierBatch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = {
    caseId: null,
    verbose: false,
    corpus: null,
    tier: "quick",
    limit: 0,
    report: null,
    failUnder: 100,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--case") opts.caseId = argv[++i];
    else if (a === "--verbose" || a === "-v") opts.verbose = true;
    else if (a === "--corpus") opts.corpus = argv[++i];
    else if (a === "--tier") opts.tier = argv[++i];
    else if (a === "--limit") opts.limit = Number(argv[++i]) || 0;
    else if (a === "--report") opts.report = argv[++i];
    else if (a === "--fail-under") opts.failUnder = Number(argv[++i]);
  }
  return opts;
}

function runFixture(fixture) {
  const { interpreter, verification } = verifyInterpretedChord(fixture.chord, fixture.key, fixture.opts || {});
  const degreeMatch = fixture.expectDegrees
    ? JSON.stringify(interpreter.chordDegrees) === JSON.stringify(fixture.expectDegrees)
    : true;

  const pass = verification.ok === fixture.expectOk && degreeMatch;
  const lines = [
    `${pass ? "PASS" : "FAIL"}  ${fixture.id} — ${fixture.description}`,
    formatVerifyReport(verification, { caseId: fixture.id }),
  ];

  if (!degreeMatch && fixture.expectDegrees) {
    lines.push(
      `  expected degrees: ${JSON.stringify(fixture.expectDegrees)}`,
      `  actual degrees:   ${JSON.stringify(interpreter.chordDegrees)}`,
    );
  }

  if (fixture.verbose || !pass) {
    lines.push(`  notes: ${JSON.stringify(interpreter.notes)}`);
  }

  return { pass, output: lines.join("\n") };
}

function runKnownBadExample() {
  const bad = verifyScaleDegrees({
    key: { tonic: "G", scale: "major" },
    notes: ["E3", "G#3", "B3"],
    chordDegrees: ["6", "3", "3"],
  });
  return {
    pass: !bad.ok && bad.failures.length >= 1,
    output: [
      "PASS  regression-detector (synthetic bad V/ii labels rejected)",
      formatVerifyReport(bad, { caseId: "synthetic-bad" }),
    ].join("\n"),
  };
}

function runFixtures(opts) {
  let fixtures = SCALE_DEGREE_FIXTURES;
  if (opts.caseId) {
    fixtures = fixtures.filter((f) => f.id === opts.caseId);
    if (!fixtures.length) {
      console.error(`Unknown case: ${opts.caseId}`);
      process.exit(2);
    }
  }

  let failed = 0;
  for (const fixture of fixtures) {
    const { pass, output } = runFixture({ ...fixture, verbose: opts.verbose });
    console.log(output);
    console.log("");
    if (!pass) failed++;
  }

  const badCheck = runKnownBadExample();
  console.log(badCheck.output);
  console.log("");
  if (!badCheck.pass) failed++;

  if (failed) {
    console.error(`FIXTURES: ${failed} failed`);
    return false;
  }
  console.log(`FIXTURES: all ${fixtures.length + 1} checks passed`);
  return true;
}

function runCorpus(opts) {
  const dbRoot = CORPUS_DIRS[opts.corpus];
  if (!dbRoot) {
    console.error(`Unknown corpus: ${opts.corpus}. Choose: ${Object.keys(CORPUS_DIRS).join(", ")}`);
    process.exit(2);
  }

  console.log(`Loading ${opts.corpus} tier=${opts.tier}...`);
  const entries = loadChordDbEntries(dbRoot, { tier: opts.tier, limit: opts.limit });
  console.log(`Verifying ${entries.length} chords...`);

  const results = runBatch(entries, {
    onProgress: (n, total) => {
      if (n % 500 === 0 || n === total) process.stderr.write(`  ${n}/${total}\n`);
    },
  });

  const summary = summarizeBatch(results);
  const meta = { corpus: opts.corpus, tier: opts.tier, dbRoot };
  console.log(formatBatchSummary(summary, meta));

  const reportPath = opts.report
    ? path.resolve(REPO_ROOT, opts.report)
    : path.join(REPO_ROOT, "_Decode_oracle", "reports", `scale_degree_${opts.corpus}_${opts.tier}.json`);

  writeBatchReport(summary, reportPath, meta);
  console.log(`\nReport: ${reportPath}`);

  if (summary.okPct < opts.failUnder) {
    console.error(`CORPUS: okPct ${summary.okPct}% below threshold ${opts.failUnder}%`);
    return false;
  }
  console.log(`CORPUS: ${summary.passed}/${summary.total} OK (${summary.okPct}%)`);
  return true;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.corpus) {
    const fixturesOk = opts.caseId ? true : runFixtures(opts);
    const corpusOk = runCorpus(opts);
    if (!fixturesOk || !corpusOk) process.exit(1);
    return;
  }

  if (!runFixtures(opts)) process.exit(1);
}

main();
