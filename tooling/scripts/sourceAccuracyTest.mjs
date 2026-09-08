import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getChordSymbol, getChordLetterName } from "../../web/lib/jsonToSymbol.js";
import { chordInterpreter } from "../../web/lib/music.js";
import { canonicalRoman, canonicalLetter, romanSignature, letterSignature, noteMidi, sourceFingerprint } from "./sourceAccuracy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cases = JSON.parse(fs.readFileSync(path.join(root, "contracts/fixtures/hooktheory_parity.json"), "utf8"));
const review = JSON.parse(fs.readFileSync(path.join(root, "contracts/fixtures/hooktheory_source_review.json"), "utf8"));
const findings = JSON.parse(fs.readFileSync(path.join(root, "contracts/fixtures/hooktheory_source_findings.json"), "utf8"));
for (const item of findings.ruleAmbiguities || []) {
  assert.ok(item.rule && item.reason && item.reviewedAt && item.checkedSources?.length, "Missing unresolved rule provenance");
}
assert.equal(cases.length, review.caseCount, "Source accuracy case coverage changed without evidence review");
assert.equal(new Set(cases.map(item => item.id)).size, cases.length, "Duplicate source accuracy case ID");
assert.equal(sourceFingerprint(cases), review.sourceFingerprint, "Captured truth or source inputs changed; review evidence independently of parity export");
const corrections = new Map();
for (const collection of [review.corrections, findings.corrections]) {
  assert.equal(new Set(collection.map(item => item.id)).size, collection.length, "Duplicate source correction ID within a review collection");
  for (const item of collection) {
    const existing = corrections.get(item.id) || [];
    const fields = new Set(existing.flatMap(entry => Object.keys(entry.corrected)));
    for (const field of Object.keys(item.corrected)) assert.ok(!fields.has(field), `${item.id}: conflicting reviewed ${field}`);
    corrections.set(item.id, [...existing, item]);
  }
}
const knownIds = new Set(cases.map(item => item.id));
const derivedExpectations = new Map();
for (const item of findings.derivedRuleExpectations || []) {
  assert.ok(knownIds.has(item.id) && item.source?.url && item.reason, `Missing derived rule provenance: ${item.id}`);
  assert.ok(Array.isArray(item.pcs) && Array.isArray(item.toneRoles), `Missing derived rule expectation: ${item.id}`);
  assert.ok(!derivedExpectations.has(item.id), `Duplicate derived rule expectation: ${item.id}`);
  derivedExpectations.set(item.id, item);
}
const ambiguities = new Map();
for (const item of findings.ambiguities || []) {
  assert.ok(knownIds.has(item.id), `Unknown source ambiguity: ${item.id}`);
  assert.ok(item.reason && item.source?.url && item.source?.reviewedAt, `Missing ambiguity provenance: ${item.id}`);
  assert.ok(Array.isArray(item.fields) && item.fields.length && item.fields.every(field => ["roman", "letter", "pcs"].includes(field)), `Invalid ambiguity fields: ${item.id}`);
  assert.equal(new Set(item.fields).size, item.fields.length, `Duplicate ambiguous field: ${item.id}`);
  assert.ok(!ambiguities.has(item.id), `Duplicate source ambiguity: ${item.id}`);
  const sourceCase = cases.find(source => source.id === item.id);
  const raw = Object.fromEntries(["json", "key", "truthRoman", "truthLetter", "truthPcs"].map(field => [field, sourceCase[field]]));
  assert.deepEqual(item.original, raw, `Ambiguous source evidence changed: ${item.id}`);
  assert.equal(item.rawFingerprint, crypto.createHash("sha256").update(JSON.stringify(raw)).digest("hex"), `Ambiguous source fingerprint changed: ${item.id}`);
  ambiguities.set(item.id, item);
}
for (const item of [...review.corrections, ...findings.corrections]) {
  assert.ok(knownIds.has(item.id), `Unknown reviewed case: ${item.id}`);
  assert.ok(item.reason && item.source?.url, `Missing source provenance: ${item.id}`);
}

const failures = [];
const unresolved = [];
const totals = { roman: 0, letter: 0, pcs: 0, derivedRule: 0, interpretation: 0 };
for (const item of cases) {
  const caseCorrections = corrections.get(item.id) || [];
  for (const correction of caseCorrections) {
    for (const [field, original] of Object.entries(correction.original)) {
      assert.deepEqual(item[field], original, `${item.id}: corrected raw ${field} changed`);
    }
  }
  const truth = { truthRoman: item.truthRoman, truthLetter: item.truthLetter, truthPcs: item.truthPcs };
  for (const correction of caseCorrections) Object.assign(truth, correction.corrected);
  try {
    const chord = JSON.parse(item.json);
    const interpreted = chordInterpreter(chord, item.key);
    const actual = {
      roman: canonicalRoman(getChordSymbol(chord, item.key)),
      letter: canonicalLetter(getChordLetterName(chord, item.key)),
      pcs: [...new Set(interpreted.notes.map(noteMidi).map(midi => ((midi % 12) + 12) % 12))].sort((a, b) => a - b),
    };
    const expected = {
      roman: canonicalRoman(truth.truthRoman),
      letter: canonicalLetter(truth.truthLetter),
      pcs: [...truth.truthPcs].sort((a, b) => a - b),
    };
    const derived = derivedExpectations.get(item.id);
    if (derived) {
      for (const [field, observed, wanted] of [["derivedPcs", actual.pcs, [...derived.pcs].sort((a,b) => a-b)],
        ["derivedToneRoles", [...interpreted.chordDegrees].sort(), [...derived.toneRoles].sort()]]) {
        if (JSON.stringify(observed) === JSON.stringify(wanted)) continue;
        totals.derivedRule++;
        failures.push({ id: item.id, field, expected: wanted, actual: observed, source: derived.source });
      }
    }
    for (const field of ["roman", "letter", "pcs"]) {
      const ambiguity = ambiguities.get(item.id);
      if (ambiguity?.fields.includes(field)) {
        unresolved.push({ id: item.id, field, expected: expected[field], actual: actual[field], category: ambiguity.category, reason: ambiguity.reason, source: ambiguity.source, rawFingerprint: ambiguity.rawFingerprint });
        continue;
      }
      const signature = value => field === "roman" ? romanSignature(value) : field === "letter" ? letterSignature(value) : value;
      if (JSON.stringify(signature(actual[field])) === JSON.stringify(signature(expected[field]))) continue;
      totals[field]++;
      failures.push({ id: item.id, field, expected: expected[field], actual: actual[field] });
    }
  } catch (error) {
    totals.interpretation++;
    failures.push({ id: item.id, field: "interpretation", error: error.message });
  }
}
const summary = { caseCount: cases.length, reviewedCaseCount: corrections.size, verifiedFieldCount: cases.length * 3 - unresolved.length, derivedRuleAssertions: derivedExpectations.size * 2, unresolvedFieldCount: unresolved.length, totals, failures, unresolved, unresolvedRules: findings.ruleAmbiguities || [] };
if (process.argv.includes("--json")) console.log(JSON.stringify(summary, null, 2));
else {
  console.log(`Source accuracy: ${cases.length} cases; ${corrections.size} cases with provenance-backed corrections; discrepancies ${JSON.stringify(totals)}`);
  for (const failure of failures.slice(0, 15)) console.error(JSON.stringify(failure));
  for (const ambiguity of unresolved) console.error(`Unresolved source evidence: ${JSON.stringify(ambiguity)}`);
}
if (unresolved.length) console.error(`${unresolved.length} source fields remain explicitly unresolved; these are not counted as verified accuracy assertions.`);
for (const rule of findings.ruleAmbiguities || []) console.error(`Unresolved source rule: ${rule.rule}: ${rule.reason}`);
if (failures.length) {
  console.error(`${failures.length} source discrepancies remain. Parity expectations are not an accuracy oracle.`);
  if (!process.argv.includes("--report-only")) process.exitCode = 1;
}
