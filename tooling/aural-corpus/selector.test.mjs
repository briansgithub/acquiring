import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_SETTINGS, popularityWeight, replaySelection, selectExample, xorshift32 } from './selector.mjs';

const occurrence = (id, sourceId = id) => ({ id, sourceId });
const song = (id, count = 1, popularity) => ({ id, popularity, sections: [{ id: `${id}-section`, occurrences: Array.from({ length: count }, (_, n) => occurrence(`${id}-${n}`)) }] });
const songs = [song('a'), song('b')];

test('unsigned portable PRNG has specified values including zero replacement', () => {
  const rng = xorshift32(1);
  assert.deepEqual(Array.from({ length: 3 }, () => rng() * 4294967296), [270369, 67634689, 2647435461]);
  assert.equal(xorshift32(0)(), xorshift32(0x6d2b79f5)());
  for (const invalid of [-1, 4294967296, 1.2, NaN, '1']) assert.throws(() => xorshift32(invalid));
});

test('candidate sorting, frozen context, and source familiarity make replay deterministic', () => {
  const args = { songs, seed: 930301, context: { heardSourceIds: ['a-0'] } };
  const result = selectExample(args);
  assert.deepEqual(result, selectExample({ ...args, songs: [...songs].reverse() }));
  const replay = replaySelection(JSON.parse(JSON.stringify(result.selectionContext)));
  assert.deepEqual(replay.selection, result.selection);
  assert.deepEqual(replay.draws, result.draws);
  const altered = structuredClone(result.selectionContext); altered.groups[0].weight = 7;
  assert.throws(() => replaySelection(altered), /hash mismatch/);
});

test('hierarchy gives songs identical probabilities regardless of section/loop count', () => {
  const expanded = [song('a', 30), { ...song('b'), sections: [...song('b').sections, { id: 'b-other', occurrences: [occurrence('b-extra')] }] }];
  const rng = xorshift32(987654321);
  for (let n = 0; n < 2000; n++) {
    const seed = rng() * 4294967296;
    assert.equal(selectExample({ songs, seed }).selection.songId, selectExample({ songs: expanded, seed }).selection.songId);
  }
});

test('weights treat missing scores/confidence neutrally and reject invalid values', () => {
  assert.equal(popularityWeight(null), 1);
  assert.equal(popularityWeight({ score: null, confidence: 1 }), 1);
  assert.equal(popularityWeight({ score: 1 }), 1);
  assert.equal(popularityWeight({ score: 1, confidence: 0.5 }), 1.25);
  assert.equal(popularityWeight({ score: 0, confidence: 1 }), 0.5);
  assert.throws(() => popularityWeight({ score: 2, confidence: 1 }));
  assert.throws(() => popularityWeight({ score: 1, confidence: -1 }));
});

test('statistical popularity and equal-weight distributions match expected probability', () => {
  const weighted = [song('a', 1, { score: 1, confidence: 1 }), song('b', 80, { score: 0, confidence: 1 })];
  const rng = xorshift32(881726454);
  let on = 0, off = 0;
  const trials = 12000;
  for (let n = 0; n < trials; n++) {
    const seed = rng() * 4294967296;
    on += selectExample({ songs: weighted, seed }).selection.songId === 'a';
    off += selectExample({ songs: weighted, seed, settings: { popularity: false } }).selection.songId === 'a';
  }
  assert.ok(Math.abs(on / trials - 0.75) < 0.025, `${on / trials}`);
  assert.ok(Math.abs(off / trials - 0.5) < 0.025, `${off / trials}`);
});

test('favorites, recency, and trustworthy section data remain separate factors', () => {
  const data = [song('a'), song('b'), song('c')];
  data[0].sections[0].popularity = { score: 1, confidence: 1, trustworthy: false };
  data[1].sections[0].popularity = { score: 1, confidence: 1, trustworthy: true };
  const result = selectExample({ songs: data, seed: 5, favoriteSongIds: ['a'], settings: { favorites: true }, context: { recentSongIds: ['a', 'd', 'e', 'b'] } });
  assert.deepEqual(result.selectionContext.groups.map(item => item.weight), [0.375, 0.6, 1]);
  assert.deepEqual(result.selectionContext.groups.map(item => item.sections[0].weight), [1, 1.5, 1]);
});

test('assessment filters globally fresh sources before selecting a song', () => {
  const data = [song('a'), { id: 'b', sections: [{ id: 'b-section', occurrences: [occurrence('b-transposed', 'a-0'), occurrence('b-fresh')] }] }];
  const result = selectExample({ songs: data, seed: 1, context: { assessment: true, heardSourceIds: ['a-0'], supportedOccurrenceId: 'a-0' } });
  assert.equal(result.selection.occurrenceId, 'b-fresh');
  assert.equal(result.selection.familiar, false);
  assert.equal(result.selectionContext.groups.length, 1);
  const familiar = selectExample({ songs, seed: 1, context: { assessment: true, heardSourceIds: ['a-0', 'b-0'] }, settings: { variety: false } });
  assert.equal(familiar.selection.familiar, true);
  assert.equal(familiar.selectionContext.freshPoolApplied, false);
});

test('supported reuse requires current eligibility and does not consume random draws', () => {
  const reused = selectExample({ songs, seed: 1, context: { supportedOccurrenceId: 'b-0' } });
  assert.equal(reused.selection.songId, 'b');
  assert.equal(reused.reused, true);
  assert.deepEqual(reused.draws, []);
  const missing = selectExample({ songs, seed: 1, context: { supportedOccurrenceId: 'gone' } });
  assert.equal(missing.reused, false);
  assert.equal(missing.draws.length, 3);
});

test('all four setting combinations are supported; inversion does not alter eligible weights', () => {
  for (let mask = 0; mask < 16; mask++) {
    const settings = Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((key, index) => [key, !!(mask & (1 << index))]));
    const args = { songs, seed: 7, settings };
    const a = selectExample(args);
    const b = selectExample({ ...args, settings: { ...settings, distinguishInversions: !settings.distinguishInversions } });
    assert.deepEqual(a.selection, b.selection);
    assert.deepEqual(a.selectionContext.groups, b.selectionContext.groups);
  }
});

test('empty and singleton pools, input immutability, and invalid identities', () => {
  assert.equal(selectExample({ songs: [], seed: 0 }).fallbackReason, 'no_eligible_occurrences');
  assert.equal(selectExample({ songs: [{ id: 'empty', sections: [] }], seed: 0 }).selection, null);
  const singleton = [song('only')]; const before = JSON.stringify(singleton);
  assert.equal(selectExample({ songs: singleton, seed: 0 }).selection.songId, 'only');
  assert.equal(JSON.stringify(singleton), before);
  assert.throws(() => selectExample({ songs: [song('a'), song('a')], seed: 1 }), /duplicate/);
  assert.throws(() => selectExample({ songs: [song('é')], seed: 1 }), /ASCII/);
  assert.throws(() => selectExample({ songs, seed: 1, settings: { mystery: true } }), /setting/);
});

test('shared Kotlin/Swift fixtures match the reference selector', () => {
  const fixture = JSON.parse(readFileSync(new URL('../../contracts/aural-corpus/selection-fixtures.json', import.meta.url), 'utf8'));
  for (const vector of fixture.prngVectors) {
    const random = xorshift32(vector.seed);
    assert.deepEqual(vector.uint32, vector.uint32.map(() => random() * 4294967296));
  }
  for (const scenario of fixture.scenarios) {
    const result = selectExample(scenario.input);
    assert.deepEqual(result.selection, scenario.expected.selection, scenario.name);
    assert.deepEqual(result.draws, scenario.expected.draws, scenario.name);
  }
});
