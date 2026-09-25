import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reduceLoop, reducedCatalogRanges, retainedChildren } from './loop-reduction.mjs';
import { discoverPatterns, descriptor } from './miner.mjs';
import { normalizeChord } from './normalize.mjs';

const fixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/loop-reduction.json', import.meta.url)));
test('cross-platform loop fixtures', () => {
  for (const { tokens, ...expected } of fixtures) assert.deepEqual(reduceLoop(tokens), expected, tokens.join(' '));
});

function brute(tokens) {
  let period = tokens.length;
  for (let p = 1; p <= tokens.length; p++) {
    if (tokens.every((t, i) => i < p || t === tokens[i - p])) { period = p; break; }
  }
  if (tokens.length < 3 || tokens.length < 2 * period || tokens.length <= period + 1)
    return { redundant: false, start: 0, length: tokens.length };
  let best = { redundant: true, start: 0, length: 1 };
  for (let start = 0; start < tokens.length; start++) {
    const seen = new Set();
    for (let end = start + 1; end < tokens.length; end++) {
      const edge = JSON.stringify(tokens.slice(end - 1, end + 1));
      if (seen.has(edge)) break;
      seen.add(edge);
      if (end - start + 1 > best.length) best = { redundant: true, start, length: end - start + 1 };
    }
  }
  return best;
}
test('linear helper and compact ranges agree with independent exhaustive oracle', () => {
  for (let mask = 0; mask < 256; mask++) {
    const tokens = Array.from({ length: 8 }, (_, i) => mask & (1 << i) ? 'A' : 'B');
    const index = discoverPatterns([{ id: 'r', songId: 's', sectionId: 's/v', view: 'harmony', tokens,
      transitionIds: tokens.slice(1).map((_, i) => String(i)) }]);
    const expected = new Set();
    for (let start = 0; start < tokens.length; start++) for (let end = start + 2; end <= tokens.length; end++) {
      const part = tokens.slice(start, end);
      assert.deepEqual(reduceLoop(part), brute(part));
      if (!brute(part).redundant) expected.add(JSON.stringify(part));
    }
    const actual = [];
    for (const range of reducedCatalogRanges(index)) for (let n = range.minLength; n <= range.maxLength; n++)
      actual.push(JSON.stringify(descriptor(index, range, n).tokens));
    assert.equal(actual.length, new Set(actual).size);
    assert.deepEqual(new Set(actual), expected);
  }
});
test('recursive children skip redundant nodes but retain both endpoint branches', () => {
  assert.deepEqual(retainedChildren(['X','I','V','I','V']), [['X','I','V','I'], ['I','V','I'], ['V','I','V']]);
});
test('real normalized identities respect inversion and analysis views', () => {
  const key={tonic:'C',scale:'major'};
  const chords=[{root:1},{root:5},{root:1,inversion:1},{root:5,inversion:1}].map(c=>normalizeChord(c,key));
  for(const relative of [false,true]) {
    const values=chords.map(c=>relative?c.relative:c);
    assert.equal(reduceLoop(values.map(c=>c.tokens.harmony)).redundant,true);
    assert.equal(reduceLoop(values.map(c=>c.tokens.harmony_bass)).redundant,false);
  }
  const major=[2,5].map(root=>normalizeChord({root},key));
  const dorian=[1,4].map(root=>normalizeChord({root},{tonic:'D',scale:'dorian'}));
  assert.equal(reduceLoop([...major,...dorian].map(c=>c.tokens.harmony)).redundant,false);
  assert.equal(reduceLoop([...major,...dorian].map(c=>c.relative.tokens.harmony)).redundant,true);
});
