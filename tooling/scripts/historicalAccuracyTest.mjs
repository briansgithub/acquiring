import assert from "node:assert/strict";
import fs from "node:fs";
import { interpretChordContract } from "../../web/lib/chordContract.js";
import { evaluateHistoricalAccuracy, sha256 } from "./historicalAccuracy.mjs";

const read = name => fs.readFileSync(new URL(`../../contracts/fixtures/${name}.json`, import.meta.url), "utf8");
const inputs = JSON.parse(read("historic_catalog_parity"));
const sourceText = read("historic_catalog_accuracy");
const observations = JSON.parse(sourceText);
const review = JSON.parse(read("historic_catalog_review"));
assert.equal(sha256(sourceText), review.sourceAccuracySha256, "Historical source assertions changed without independent review");
const findings = JSON.parse(read("hooktheory_source_findings"));
for (const correction of review.corrections) {
  for (const reference of correction.evidenceReferences || []) {
    assert.equal(reference.file, review.sourceRuleEvidenceFile);
    assert.equal(findings.liveChecks[reference.liveCheckIndex]?.url, reference.url, `${correction.id}: missing live rule evidence`);
    assert.ok(findings.liveChecks[reference.liveCheckIndex].keyboardNotes?.length, `${correction.id}: missing keyboard evidence`);
  }
}
const result = evaluateHistoricalAccuracy(inputs, observations, review, interpretChordContract);
if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`Historical accuracy: ${result.assertions} assertions; ${result.inputCount} inputs; ${result.occurrences} captured occurrences; ${result.failures.length} unexplained regressions.`);
  for (const failure of result.failures.slice(0, 20)) console.error(JSON.stringify(failure));
}
for (const item of result.unresolved) console.error(`Unresolved historical source: ${item.id} ${item.field}: ${item.reason}`);
if (result.failures.length) process.exitCode = 1;
