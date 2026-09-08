import assert from "node:assert/strict";
import crypto from "node:crypto";
import { romanSignature, letterSignature } from "./sourceAccuracy.mjs";

export const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
export const historicalInputFingerprint = inputs => sha256(JSON.stringify(inputs.map(({ id, json, key }) => ({ id, json, key }))));
const sourceFields = { roman: "truthRoman", letter: "truthLetter", pcs: "truthPcs" };
const signature = (field, value) => field === "roman" ? romanSignature(value)
  : field === "letter" ? letterSignature(value) : [...value].sort((a, b) => a - b);

/** Preserve each historical success independently; totals cannot conceal a regression. */
export function evaluateHistoricalAccuracy(inputs, observations, review, interpret) {
  assert.equal(historicalInputFingerprint(inputs), review.inputFingerprint, "Historical input coverage changed without review");
  assert.equal(inputs.length, review.historicalSnapshot.inputCount);
  assert.equal(observations.length, review.historicalSnapshot.observationCount);
  assert.equal(observations.reduce((sum, row) => sum + row.occurrences, 0), review.historicalSnapshot.occurrences);
  assert.equal(new Set(inputs.map(row => row.id)).size, inputs.length, "Duplicate historical input ID");
  assert.equal(new Set(observations.map(row => row.id)).size, observations.length, "Duplicate historical observation ID");
  assert.equal(observations.reduce((sum, row) => sum + row.requiredFields.length, 0), review.requiredFieldCount);
  assert.equal(review.unexplained.length, 0, "Unexplained historical evidence cannot pass");
  const byId = new Map(observations.map(row => [row.id, row]));
  const corrections = new Map(), ambiguities = new Map(), seen = new Set();
  for (const [collection, target] of [[review.corrections, corrections], [review.ambiguities, ambiguities]]) {
    for (const item of collection) {
      const row = byId.get(item.id), key = `${item.id}:${item.field}`;
      assert.ok(row && row.inputId === item.inputId && row.requiredFields.includes(item.field), `Unknown historical review: ${key}`);
      assert.ok(!seen.has(key), `Conflicting historical review: ${key}`);
      seen.add(key);
      assert.equal(sha256(JSON.stringify(row)), item.sourceRecordSha256, `Changed historical evidence: ${key}`);
      assert.deepEqual(row[sourceFields[item.field]], item.original, `Changed original truth: ${key}`);
      assert.ok(item.reason && item.category && item.reviewedAt, `Missing review rationale: ${key}`);
      assert.ok(item.source?.url || item.evidenceReferences?.length, `Missing independent evidence: ${key}`);
      if (target === corrections) assert.ok(Object.hasOwn(item, "expected"), `Missing corrected expectation: ${key}`);
      target.set(key, item);
    }
  }
  const actual = new Map();
  for (const input of inputs) actual.set(input.id, interpret(JSON.parse(input.json), input.key));
  const failures = [], unresolved = [];
  let assertions = 0;
  for (const row of observations) {
    assert.ok(actual.has(row.inputId), `${row.id}: missing historical input`);
    assert.equal(new Set(row.requiredFields).size, row.requiredFields.length, `${row.id}: duplicate required field`);
    for (const field of row.requiredFields) {
      assert.ok(Object.hasOwn(sourceFields, field), `${row.id}: unknown required field ${field}`);
      const key = `${row.id}:${field}`;
      if (ambiguities.has(key)) { unresolved.push(ambiguities.get(key)); continue; }
      const wanted = corrections.get(key)?.expected ?? row[sourceFields[field]];
      const observed = actual.get(row.inputId)[field];
      assertions++;
      if (JSON.stringify(signature(field, observed)) !== JSON.stringify(signature(field, wanted))) {
        failures.push({ id: row.id, field, expected: wanted, actual: observed });
      }
    }
  }
  return { inputCount: inputs.length, observationCount: observations.length, occurrences: review.historicalSnapshot.occurrences,
    assertions, reviewedCorrections: corrections.size, unresolved, failures };
}
