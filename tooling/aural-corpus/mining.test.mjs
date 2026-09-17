import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { discoverPatterns, getPattern, hydrateIndex, occurrences, patternTokens } from './miner.mjs';
import { calculateCoverage, selectPatterns } from './coverage.mjs';

function run(song, tokens, section = 'verse', view = 'harmony') {
  return { id: `${view}/${song}/${section}`, songId: song, sectionId: `${song}/${section}`, revision: 'source-1', view,
    tokens: typeof tokens === 'string' ? tokens.split(' ') : tokens,
    transitionIds: Array.from({ length: (typeof tokens === 'string' ? tokens.split(' ') : tokens).length - 1 },
      (_, i) => `${song}/${section}/edge-${i}`) };
}
const resolve = (index, tokens, view = 'harmony') => {
  const pattern = getPattern(index, { view, tokens: typeof tokens === 'string' ? tokens.split(' ') : tokens });
  assert.ok(pattern, `Missing pattern: ${tokens}`); return pattern;
};

function brutePatterns(runs, minSongs = 2) {
  const patterns = new Map();
  for (const r of runs) for (let start = 0; start < r.tokens.length - 1; start++) for (let end = start + 1; end < r.tokens.length; end++) {
    const tokens = r.tokens.slice(start, end + 1); const key = JSON.stringify([r.view, tokens]);
    if (!patterns.has(key)) patterns.set(key, { view: r.view, tokens, songs: new Set(), matches: [] });
    const pattern = patterns.get(key); pattern.songs.add(r.songId); pattern.matches.push(`${r.id}:${start}:${end}`);
  }
  return [...patterns.values()].filter(pattern => pattern.songs.size >= minSongs);
}

function bruteCoverage(runs, patterns) {
  const edges = new Set(); const windows = new Map();
  for (const r of runs) for (const pattern of patterns) {
    if (r.view !== pattern.view) continue;
    for (let p = 0; p <= r.tokens.length - pattern.tokens.length; p++) {
      if (!pattern.tokens.every((token, offset) => r.tokens[p + offset] === token)) continue;
      for (let e = p; e < p + pattern.tokens.length - 1; e++) edges.add(r.transitionIds[e]);
      for (let k = 2; k <= pattern.tokens.length; k++) {
        if (!windows.has(k)) windows.set(k, new Set());
        for (let s = p; s <= p + pattern.tokens.length - k; s++) windows.get(k).add(`${r.id}/${s}`);
      }
    }
  }
  return { edges, windows };
}

test('overlaps union physical transitions while repeated locations remain separate', () => {
  const runs = [run('a', 'I V I V I'), run('b', 'I V I V I')];
  const index = discoverPatterns(runs);
  const three = resolve(index, 'I V I');
  assert.equal(three.songCount, 2); assert.equal(three.occurrenceCount, 4);
  assert.equal([...occurrences(index, three)].length, 4);
  const report = calculateCoverage(index, [three]).harmony;
  assert.equal(report.transitionCount, 8); assert.equal(report.coveredTransitions, 8);
  assert.equal(report.sequenceCoverage[3].total, 4);
  assert.equal(report.sequenceCoverage[4].total, 0);
  const combined = calculateCoverage(index, [three, resolve(index, 'V I V')]).harmony;
  assert.equal(combined.coveredTransitions, 8);
  assert.equal(combined.sequenceCoverage[3].total, 6);
});

test('shared endpoint chords do not double-count or concatenate into longer sequences', () => {
  const runs = [run('a', 'I V I'), run('b', 'I V I')];
  const index = discoverPatterns(runs);
  const pairs = [resolve(index, 'I V'), resolve(index, 'V I')];
  const pairCoverage = calculateCoverage(index, pairs).harmony;
  assert.equal(pairCoverage.coveredTransitions, 4);
  assert.equal(pairCoverage.sequenceCoverage[2].total, 4);
  assert.equal(pairCoverage.sequenceCoverage[3].total, 0);
  const longer = calculateCoverage(index, [...pairs, resolve(index, 'I V I')]).harmony;
  assert.equal(longer.coveredTransitions, 4);
  assert.equal(longer.sequenceCoverage[3].total, 2);
});

test('arbitrary implicit lengths and overlapping occurrences match brute-force discovery', () => {
  let seed = 941;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let trial = 0; trial < 80; trial++) {
    const runs = Array.from({ length: 3 + random(4) }, (_, song) =>
      run(`s${song % 3}`, Array.from({ length: 3 + random(8) }, () => ['I', 'ii', 'V'][random(3)]), `part${song}`));
    const index = discoverPatterns(runs);
    const expected = brutePatterns(runs);
    for (const p of expected) {
      const actual = resolve(index, p.tokens, p.view);
      assert.equal(actual.songCount, p.songs.size);
      assert.equal(actual.occurrenceCount, p.matches.length);
      assert.deepEqual([...occurrences(index, actual)].map(o => `${o.runId}:${o.start}:${o.end}`).sort(), p.matches.sort());
      assert.deepEqual(patternTokens(index, actual), p.tokens);
    }
    const represented = index.intervals.reduce((n, interval) => n + interval.maxLength - interval.minLength + 1, 0);
    assert.equal(represented, expected.length);
    for (const candidate of index.candidates) assert.ok(expected.some(p => p.view === candidate.view && p.tokens.join(',') === candidate.tokens.join(',')));
  }
});

test('exact coverage agrees with a physical-ID/window oracle on randomized overlaps', () => {
  let seed = 152;
  const random = n => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed % n; };
  for (let trial = 0; trial < 30; trial++) {
    const runs = Array.from({ length: 4 }, (_, i) => run(`s${i}`, Array.from({ length: 12 }, () => ['I', 'IV', 'V'][random(3)])));
    const index = discoverPatterns(runs);
    const candidates = index.candidates.filter(() => random(3) === 0);
    const actual = calculateCoverage(index, candidates).harmony;
    const expected = bruteCoverage(runs, candidates);
    assert.equal(actual.coveredTransitions, expected.edges.size);
    for (const [length, record] of Object.entries(actual.sequenceCoverage)) assert.equal(record.total, expected.windows.get(Number(length))?.size || 0);
  }
});

test('longer structures survive pair saturation and supersession never inflates coverage', () => {
  const runs = [run('a', 'I V vi IV'), run('b', 'I V vi IV')];
  const index = discoverPatterns(runs);
  const usefulness = Object.fromEntries(index.candidates.map(p => [p.id, p.length === 2 ? 100 : 1]));
  const selected = selectPatterns(index, runs, { targetCoverage: 1, structureMinSongs: 2, usefulness });
  const result = selected.views.harmony;
  assert.equal(result.coverage, 1);
  assert.ok(result.selected.some(p => p.length === 4 && p.reason === 'longer-structure'));
  assert.equal(result.coveredTransitions, 6);
  assert.equal(result.sequenceCoverage[4].total, 2);
  assert.ok(result.superseded.length >= 3);
  assert.ok(result.superseded.every(p => p.supersededBy.length));
  assert.equal(result.selected.reduce((n, p) => n + p.additionalTransitions, 0), 6);
  const full = calculateCoverage(index, index.candidates).harmony;
  assert.equal(full.coveredTransitions, result.coveredTransitions);
});

test('per-selected total, additional and cumulative sequence reports are exact', () => {
  const runs = [run('a', 'I V vi IV I V'), run('b', 'I V vi IV I V'), run('c', 'I V ii V I')];
  const index = discoverPatterns(runs);
  const result = selectPatterns(index, runs, { structureMinSongs: 2 }).views.harmony;
  let previous = { edges: new Set(), windows: new Map() };
  const prefix = [];
  for (const p of result.selected) {
    prefix.push(p);
    const own = bruteCoverage(runs, [p]); const combined = bruteCoverage(runs, prefix);
    assert.equal(p.totalTransitions, own.edges.size);
    assert.equal(p.withinPatternRepeatedTransitionVisits, p.occurrenceCount * (p.length - 1) - own.edges.size);
    assert.equal(p.additionalTransitions, combined.edges.size - previous.edges.size);
    for (const [length, entry] of Object.entries(p.sequenceCoverage)) {
      const k = Number(length);
      assert.equal(entry.total, own.windows.get(k)?.size || 0);
      assert.equal(entry.additional, (combined.windows.get(k)?.size || 0) - (previous.windows.get(k)?.size || 0));
      assert.equal(entry.cumulative, combined.windows.get(k)?.size || 0);
      assert.equal(entry.overlappingVisits, p.occurrenceCount * Math.max(0, p.length - k + 1) - entry.total);
    }
    previous = combined;
  }
});

test('song support differs from occurrence count and patterns do not cross sections', () => {
  const runs = [run('a', 'I V I V I V'), run('a', 'I V I V', 'chorus'), run('b', 'vi IV'), run('c', 'I V')];
  const index = discoverPatterns(runs);
  const pair = resolve(index, 'I V');
  assert.equal(pair.occurrenceCount, 6); assert.equal(pair.songCount, 2);
  assert.equal(getPattern(index, { view: 'harmony', tokens: ['V', 'vi'] }), null);
  assert.equal(getPattern(index, { view: 'harmony', tokens: ['I', 'V', 'I'] }), null);
  assert.equal(getPattern(discoverPatterns(runs, { minSongs: 1 }), { view: 'harmony', tokens: ['I', 'V', 'I'] }).occurrenceCount, 3);
});

test('musical views are independent even when they share physical transitions', () => {
  const runs = [run('a', 'I V'), run('b', 'I V'), run('a', 'I V', 'verse', 'harmony_bass'), run('b', 'I V', 'verse', 'harmony_bass')];
  const index = discoverPatterns(runs);
  const first = resolve(index, 'I V'); const bass = resolve(index, 'I V', 'harmony_bass');
  assert.notEqual(first.id, bass.id);
  assert.equal(first.songCount, 2); assert.equal(first.occurrenceCount, 2);
  const result = calculateCoverage(index, [first, bass]);
  assert.equal(result.harmony.coveredTransitions, 2); assert.equal(result.harmony_bass.coveredTransitions, 2);
});

test('physical IDs deduplicate repeated representations but not distinct locations', () => {
  const a = run('a', 'I V'); const b = { ...run('b', 'I V'), transitionIds: a.transitionIds };
  const index = discoverPatterns([a, b]);
  const result = calculateCoverage(index, [resolve(index, 'I V')]).harmony;
  assert.equal(result.transitionCount, 1); assert.equal(result.coveredTransitions, 1);
  assert.equal(result.sequenceCoverage[2].total, 2);
});

test('unchanged pattern IDs survive new dictionary ranks, input ordering and source revisions', () => {
  const runs = [run('b', 'ii V I'), run('a', 'ii V I')];
  const first = discoverPatterns(runs);
  const second = discoverPatterns([...runs].reverse());
  assert.deepEqual(first.candidates.map(p => ({ ...p })), second.candidates.map(p => ({ ...p })));
  const larger = discoverPatterns([...runs.map(r => ({ ...r, revision: 'changed-source' })), run('new', '#I bIII I')]);
  assert.equal(resolve(first, 'ii V I').id, resolve(larger, 'ii V I').id);
  assert.notEqual(resolve(first, 'ii V I').id, resolve(discoverPatterns(runs, { normalizationVersion: 'new-rules' }), 'ii V I').id);
  assert.deepEqual(selectPatterns(first), selectPatterns(second));
});

test('serialized compact indexes can resolve implicit lengths and reproduce selection', () => {
  const index = discoverPatterns([run('a', 'I vi ii V I'), run('b', 'I vi ii V I')]);
  const saved = JSON.parse(JSON.stringify(index, (_, value) => ArrayBuffer.isView(value) ? Array.from(value) : value));
  const restored = hydrateIndex(saved);
  assert.deepEqual(resolve(index, 'vi ii V'), resolve(restored, 'vi ii V'));
  assert.deepEqual(selectPatterns(index), selectPatterns(restored));
  assert.throws(() => hydrateIndex({ ...saved, version: 'unknown' }), /Unsupported/);
});

test('frequent reusable fragments outrank a rare long passage and within-song repetition is capped only for ranking', () => {
  const runs = Array.from({ length: 20 }, (_, i) => run(`common${i}`, 'I V'));
  const rare = Array.from({ length: 11 }, (_, i) => `rare${i}`);
  runs.push(run('rareA', rare), run('rareB', rare));
  const index = discoverPatterns(runs);
  const result = selectPatterns(index).views.harmony;
  assert.deepEqual(result.selected[0].tokens, ['I', 'V']);
  const repeated = [run('a', Array.from({ length: 60 }, (_, i) => i % 2 ? 'V' : 'I')),
    run('b', Array.from({ length: 60 }, (_, i) => i % 2 ? 'V' : 'I'))];
  const repeatedIndex = discoverPatterns(repeated);
  const usefulness = Object.fromEntries(repeatedIndex.candidates.map(p => [p.id, p.length === 2 ? 1000 : 1]));
  const repeatedResult = selectPatterns(repeatedIndex, repeated, { structureMinSongs: 100, usefulness }).views.harmony;
  const pair = repeatedResult.selected.find(p => p.tokens.join(' ') === 'I V');
  assert.equal(pair.occurrenceCount, 60);
  assert.equal(pair.effectiveOccurrences, 8);
});

test('uncertain/unavailable transitions cannot be hidden by the eligible denominator', () => {
  const runs = [run('a', 'I V I'), run('b', 'I V I')]; const index = discoverPatterns(runs);
  const result = selectPatterns(index, runs, { observedTransitionCounts: { harmony: 10 }, structureMinSongs: 2 }).views.harmony;
  assert.equal(result.coverage, 1); assert.equal(result.observedCoverage, 0.4); assert.equal(result.targetReached, false);
  assert.throws(() => calculateCoverage(index, [], { observedTransitionCounts: { harmony: 1 } }), /denominator/);
  assert.throws(() => calculateCoverage(index, [], { observedTransitionCounts: { harmony: NaN } }), /denominator/);
});

test('empty, one-chord and invalid corpora fail safely', () => {
  const empty = discoverPatterns([]);
  assert.deepEqual(empty.candidates, []); assert.deepEqual(selectPatterns(empty).views, {});
  const single = discoverPatterns([run('a', 'I'), run('b', 'I')]);
  assert.equal(single.candidates.length, 0); assert.equal(selectPatterns(single).views.harmony.targetReached, false);
  assert.throws(() => discoverPatterns([run('a', 'I V'), run('a', 'I V')]), /Duplicate/);
  assert.throws(() => discoverPatterns([{ ...run('a', 'I V'), transitionIds: [] }]), /stable transition/);
  assert.throws(() => discoverPatterns([], { minSongs: 0 }), /minSongs/);
  assert.throws(() => selectPatterns(empty, [], { targetCoverage: 2 }), /targetCoverage/);
  assert.throws(() => selectPatterns(single, [run('different', 'I'), run('b', 'I')]), /discovery corpus/);
});

test('long repetitive corpora keep implicit lengths compact and do not impose a length cap', () => {
  const tokens = Array.from({ length: 1500 }, (_, i) => i % 2 ? 'V' : 'I');
  const runs = [run('a', tokens), run('b', tokens)];
  const index = discoverPatterns(runs);
  const long = resolve(index, tokens.slice(0, 1201));
  assert.equal(long.length, 1201); assert.equal(long.occurrenceCount, 300);
  assert.ok(index.intervals.length < tokens.length * 2);
  assert.equal(Object.keys(index.candidates[0]).includes('tokens'), false);
  const report = selectPatterns(index, runs, { structureMinSongs: 2 });
  assert.equal(report.views.harmony.coverage, 1);
  assert.equal(report.views.harmony.sequenceCoverage[1500].total, 2);
});

test('40,000-song offline performance and full coverage', { skip: process.env.AURAL_CORPUS_BENCHMARK !== '1' }, t => {
  const runs = Array.from({ length: 40000 }, (_, s) => run(`s${s}`,
    Array.from({ length: 40 }, (_, i) => ['I', 'V', 'vi', 'IV', 'ii', 'V/V'][(i + s % 13) % 6])));
  const started = performance.now(); const index = discoverPatterns(runs); const mined = performance.now();
  const result = selectPatterns(index); const completed = performance.now();
  assert.equal(result.views.harmony.coverage, 1);
  assert.equal(result.views.harmony.sequenceCoverage[40].total, 40000);
  assert.ok(index.intervals.length < 1000);
  t.diagnostic(JSON.stringify({ songs: runs.length, tokens: 1600000, suffixIntervals: index.intervals.length,
    selected: result.selected.length, miningSeconds: (mined - started) / 1000,
    selectionSeconds: (completed - mined) / 1000, residentBytes: process.memoryUsage().rss,
    peakResidentKiB: process.resourceUsage().maxRSS }));
});
