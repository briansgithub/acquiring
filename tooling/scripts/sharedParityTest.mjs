import assert from "node:assert/strict";
import fs from "node:fs";
import { interpretChordContract } from "../../web/lib/chordContract.js";

// These snapshots establish equality, not source accuracy. The separate
// Hooktheory source gate never obtains its truth from these expected* fields.
let total = 0;
for (const name of ["corpus_parity", "hooktheory_parity", "historic_catalog_parity"]) {
  const cases = JSON.parse(fs.readFileSync(new URL(`../../contracts/fixtures/${name}.json`, import.meta.url)));
  assert.ok(cases.length > 0, `${name}: empty corpus`);
  const ids = new Set();
  for (const test of cases) {
    assert.ok(!ids.has(test.id), `${name}: duplicate ID ${test.id}`);
    ids.add(test.id);
    const actual = interpretChordContract(JSON.parse(test.json), test.key);
    const channels = { roman: "expectedRoman", letter: "expectedLetter", pcs: "expectedPcs", midi: "expectedMidi", rootMidi: "expectedRootMidi", toneLabels: "expectedToneLabels" };
    for (const [channel, field] of Object.entries(channels)) {
      assert.ok(Object.hasOwn(test, field), `${test.id}: missing ${field}`);
      assert.deepEqual(actual[channel], test[field], `${test.id}: ${channel}`);
    }
    assert.equal(actual.midi.length, actual.toneLabels.length, `${test.id}: tone-label coverage`);
    total++;
  }
  console.log(`${name}: exact equality on all six channels (${cases.length} cases)`);
}
console.log(`Shared parity passed (${total} cases; no discrepancy allowances).`);
