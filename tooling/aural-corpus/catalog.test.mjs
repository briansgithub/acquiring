import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverPatterns, getPattern, catalogRanges, descriptor } from './miner.mjs';
import { CatalogSession, catalogStats, catalogOrder, catalogChildren } from './catalog.mjs';

const run = (song, sequence, section = 'verse') => ({ id: song + '/' + section, songId: song, sectionId: song + '/' + section, view: 'harmony',
  tokens: sequence.split(' '), transitionIds: sequence.split(' ').slice(1).map((_, i) => song + '/' + section + '/' + i) });
function brute(index) {
  const all = new Map();
  for (const run of index.runs) for (let start = 0; start < run.tokens.length; start++) for (let end = start + 2; end <= run.tokens.length; end++) {
    const p = getPattern(index, { view: run.view, tokens: run.tokens.slice(start, end), minSongs: 1 }); all.set(p.id, p);
  }
  return [...all.values()];
}
test('compact ranges exhaust unique and recurring substrings exactly once, regardless of curriculum threshold', () => {
  const index = discoverPatterns([run('a', 'I V I V I'), run('b', 'I V vi IV'), run('unique', 'a b c d e f g')], { minSongs: 3 });
  const expanded = catalogRanges(index).flatMap(r => Array.from({ length: r.maxLength - r.minLength + 1 }, (_, i) => descriptor(index, r, r.minLength + i).id));
  assert.equal(new Set(expanded).size, expanded.length);
  assert.deepEqual(expanded.sort(), brute(index).map(p => p.id).sort());
});
test('lazy pagination equals exhaustive integrated sorting under every toggle combination', () => {
  const index = discoverPatterns([run('a', 'I V I V I V vi IV'), run('b', 'I V vi IV'), run('c', 'ii V I'), run('d', 'z q r s t u')]);
  const context = { popularity: { a: { score: 1, confidence: 1 }, b: { score: 0, confidence: .8 } }, favoriteSongIds: ['c'], recentSongIds: ['a'] };
  for (let mask = 0; mask < 8; mask++) {
    const preferences = { popularity: !!(mask & 1), favorites: !!(mask & 2), variety: !!(mask & 4) };
    const expected = brute(index).map(p => catalogStats(index, p, preferences, context)).sort(catalogOrder);
    const session = new CatalogSession(index, { preferences, context });
    const actual = []; while (session.hasMore) actual.push(...session.page(3));
    assert.deepEqual(actual.map(p => p.id), expected.map(p => p.id));
    assert.deepEqual(actual.map(p => p.score), expected.map(p => p.score));
  }
});
test('tree children have global counts and share identity, endpoint removal only', () => {
  const index = discoverPatterns([run('a', 'I V vi IV'), run('b', 'V vi')]);
  const root = getPattern(index, { view: 'harmony', tokens: ['I', 'V', 'vi', 'IV'], minSongs: 1 });
  const children = catalogChildren(index, root);
  const grandchildren = children.flatMap(p => catalogChildren(index, p));
  const common = grandchildren.filter(p => p.songCount === 2);
  assert.equal(common.length, 2); assert.equal(common[0].id, common[1].id); assert.equal(common[0].occurrenceCount, 2);
});
test('counts retain overlapping locations while effective frequency caps each song', () => {
  const index = discoverPatterns([run('a', 'I V I V I V I V I V I V I V I V I V I V')]);
  const p = getPattern(index, { view: 'harmony', tokens: ['I', 'V', 'I'], minSongs: 1 });
  const stats = catalogStats(index, p); assert.equal(stats.occurrenceCount, 9); assert.equal(stats.effectiveOccurrences, 4);
});
test('filters cover implicit lengths and pagination freezes mutable history', () => {
  const index = discoverPatterns([run('a', 'I V vi IV'), run('b', 'I V vi IV')]);
  const context = { recentSongIds: ['a'], favoriteSongIds: [] }, preferences = { variety: true };
  const session = new CatalogSession(index, { minLength: 3, maxLength: 3, search: 'V vi', preferences, context });
  context.recentSongIds.push('b'); preferences.variety = false;
  const rows = session.page(); assert.equal(rows.length, 2); assert.ok(rows.every(p => p.length === 3));
  assert.deepEqual(session.context.recentSongIds, ['a']); assert.equal(session.preferences.variety, true);
});
