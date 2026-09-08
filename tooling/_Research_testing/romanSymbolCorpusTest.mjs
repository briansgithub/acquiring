/** Rendering coverage; independent source accuracy is asserted by sourceAccuracyTest.mjs. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getChordSymbol } from '../../web/lib/jsonToSymbol.js';
import { tokenizeRomanNumeral, romanNumeralVerticalExtents, romanNumeralToHtml } from '../../web/lib/romanNumeralCanvas.js';

let checked = 0;
for (const name of ['corpus_parity', 'hooktheory_parity', 'historic_catalog_parity']) {
  const cases = JSON.parse(fs.readFileSync(new URL(`../../contracts/fixtures/${name}.json`, import.meta.url)));
  assert.ok(cases.length > 0, `${name}: missing rendering coverage`);
  for (const row of cases) {
    const chord = typeof row.json === 'string' ? JSON.parse(row.json) : row.json;
    const symbol = getChordSymbol(chord, row.key);
    assert.equal(symbol, row.expectedRoman, `${row.id}: rendering input differs from shared contract`);
    const tokens = tokenizeRomanNumeral(symbol);
    if (symbol) {
      assert.ok(tokens.some(token => token.kind === 'base' && token.text), `${row.id}: no Roman base`);
      const extents = romanNumeralVerticalExtents(symbol, 20);
      assert.ok(Number.isFinite(extents.above) && Number.isFinite(extents.below), `${row.id}: invalid extents`);
      assert.ok(romanNumeralToHtml(symbol).length > 0, `${row.id}: empty rendered symbol`);
    } else {
      assert.equal(tokens.length, 0, `${row.id}: empty chord must not render stale tokens`);
    }
    checked++;
  }
}
console.log(`Roman rendering passed: ${checked} shared cases. Source accuracy has a separate strict gate.`);
