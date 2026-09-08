import assert from "node:assert/strict";
import { evaluateHistoricalAccuracy, historicalInputFingerprint, sha256 } from "./historicalAccuracy.mjs";

const inputs = [{ id: "input", json: '{"root":1}', key: { tonic: "C", scale: "major" }, expectedRoman: "I" }];
const rows = [{ id: "capture", inputId: "input", occurrences: 2, truthRoman: "I", truthLetter: "C", truthPcs: [0, 4, 7], requiredFields: ["roman", "letter", "pcs"] }];
const review = { inputFingerprint: historicalInputFingerprint(inputs), historicalSnapshot: { inputCount: 1, observationCount: 1, occurrences: 2 }, requiredFieldCount: 3,
  corrections: [], ambiguities: [], unexplained: [] };
const good = () => ({ roman: "I", letter: "C", pcs: [0, 4, 7] });
const run = (source = rows, evidence = review, interpret = good, cases = inputs) => evaluateHistoricalAccuracy(cases, source, evidence, interpret);
assert.equal(run().failures.length, 0);
assert.equal(run(rows, review, () => ({ ...good(), roman: "I(no3)" })).failures.length, 1, "Meaningful annotation loss/change must fail");
assert.equal(run(rows, review, () => ({ ...good(), pcs: [0, 7] })).failures.length, 1, "A formerly correct tone cannot disappear");
assert.throws(() => run([{ ...rows[0], requiredFields: ["roman"] }]), /equal/);
assert.throws(() => run([], review), /equal/);
assert.throws(() => run(rows, review, () => { throw new Error("decoder failure"); }), /decoder failure/);
assert.equal(run(rows, review, () => ({ ...good(), roman: "V" }), [{ ...inputs[0], expectedRoman: "V" }]).failures.length, 1,
  "Regenerating parity output must not redefine source correctness");
const correction = { id: "capture", inputId: "input", field: "roman", original: "I", expected: "I(add9)", sourceRecordSha256: sha256(JSON.stringify(rows[0])),
  category: "test-positioned-capture", reason: "Independent captured annotation", reviewedAt: "2026-09-08", source: { url: "https://example.test/source" } };
assert.equal(run(rows, { ...review, corrections: [correction] }, () => ({ ...good(), roman: "I(add9)" })).failures.length, 0);
assert.throws(() => run(rows, { ...review, corrections: [correction, correction] }), /Conflicting/);
assert.throws(() => run(rows, { ...review, corrections: [{ ...correction, original: "V" }] }), /Changed original/);
const ambiguous = run(rows, { ...review, ambiguities: [correction] });
assert.equal(ambiguous.assertions, 2, "Unresolved evidence is excluded from verified assertion totals");
assert.equal(ambiguous.unresolved.length, 1);
console.log("Historical accuracy integrity checks passed, including regression and fixture-regeneration detectors.");
