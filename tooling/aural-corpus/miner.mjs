import { createHash } from 'node:crypto';

export const MINER_VERSION = 'aural-suffix-1';
const MULTIPLIERS = [16777619, 2246822519, 3266489917, 668265263];

/** Stable, locale-independent ordering is also used by the SQLite exporter. */
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function countingSort(input, output, ranks, distance, classes, counts) {
  counts.fill(0, 0, classes + 1);
  for (let i = 0; i < input.length; i++) counts[input[i] + distance < ranks.length ? ranks[input[i] + distance] : 0]++;
  let total = 0;
  for (let i = 0; i <= classes; i++) { const n = counts[i]; counts[i] = total; total += n; }
  for (let i = 0; i < input.length; i++) {
    const p = input[i]; const key = p + distance < ranks.length ? ranks[p + distance] : 0;
    output[counts[key]++] = p;
  }
}

/** Prefix doubling with integer radix sorting: O(n log n), no suffix comparators. */
function suffixArrayOf(symbols) {
  const n = symbols.length;
  let sa = Uint32Array.from({ length: n }, (_, i) => i);
  if (!n) return sa;
  let ranks = symbols.slice();
  let next = new Uint32Array(n);
  const scratch = new Uint32Array(n);
  const counts = new Uint32Array(n + 1);
  let classes = 0;
  for (const rank of ranks) classes = Math.max(classes, rank);
  countingSort(sa, scratch, ranks, 0, classes, counts);
  sa.set(scratch);
  for (let distance = 1; distance < n; distance *= 2) {
    countingSort(sa, scratch, ranks, distance, classes, counts);
    countingSort(scratch, sa, ranks, 0, classes, counts);
    let group = 1;
    next[sa[0]] = group;
    for (let i = 1; i < n; i++) {
      const a = sa[i - 1]; const b = sa[i];
      if (ranks[a] !== ranks[b] ||
          (a + distance < n ? ranks[a + distance] : 0) !== (b + distance < n ? ranks[b + distance] : 0)) group++;
      next[b] = group;
    }
    [ranks, next] = [next, ranks];
    classes = group;
    if (classes === n) break;
  }
  return sa;
}

function lcpOf(symbols, sa, remaining) {
  const inverse = new Uint32Array(symbols.length);
  for (let i = 0; i < sa.length; i++) inverse[sa[i]] = i;
  const lcp = new Uint32Array(sa.length);
  let common = 0;
  for (let p = 0; p < symbols.length; p++) {
    const rank = inverse[p];
    if (!rank) { common = 0; continue; }
    const previous = sa[rank - 1];
    common = Math.min(common, remaining[p], remaining[previous]);
    while (common < remaining[p] && common < remaining[previous] && symbols[p + common] === symbols[previous + common]) common++;
    lcp[rank] = common;
    if (common) common--;
  }
  return lcp;
}

function suffixIntervals(lcp) {
  const result = [];
  const stack = [{ depth: 0, start: 0 }];
  for (let i = 0; i <= lcp.length; i++) {
    const depth = i === lcp.length ? 0 : lcp[i];
    let start = i - 1;
    while (stack[stack.length - 1].depth > depth) {
      const node = stack.pop();
      result.push({ start: node.start, end: i - 1, maxLength: node.depth });
      start = node.start;
    }
    if (stack[stack.length - 1].depth < depth) stack.push({ depth, start });
  }
  for (const interval of result) interval.minLength = Math.max(2, Math.max(lcp[interval.start], lcp[interval.end + 1] || 0) + 1);
  return result.filter(interval => interval.maxLength >= interval.minLength);
}

/** Offline distinct-song range queries with last-occurrence Fenwick counts. */
function annotateSongs(intervals, sa, runAt, runs) {
  const heads = new Int32Array(sa.length).fill(-1);
  const next = new Int32Array(intervals.length).fill(-1);
  for (let i = 0; i < intervals.length; i++) {
    const end = intervals[i].end;
    next[i] = heads[end]; heads[end] = i;
  }
  const tree = new Int32Array(sa.length + 1);
  const add = (at, delta) => { for (let p = at + 1; p < tree.length; p += p & -p) tree[p] += delta; };
  const sum = at => { let n = 0; for (let p = at + 1; p > 0; p -= p & -p) n += tree[p]; return n; };
  const last = new Map();
  for (let i = 0; i < sa.length; i++) {
    const song = runs[runAt[sa[i]]].songId;
    if (last.has(song)) add(last.get(song), -1);
    add(i, 1); last.set(song, i);
    for (let q = heads[i]; q >= 0; q = next[q]) intervals[q].songCount = sum(i) - sum(intervals[q].start - 1);
  }
}

function hashSupport(runs, dictionary, runStarts, size) {
  const tokenHashes = dictionary.map(token => {
    const digest = createHash('sha256').update(token).digest();
    return MULTIPLIERS.map((_, i) => digest.readUInt32LE(i * 4));
  });
  const maxLength = runs.reduce((max, run) => Math.max(max, run.tokens.length), 0);
  const powers = MULTIPLIERS.map(multiplier => {
    const values = new Uint32Array(maxLength + 1); values[0] = 1;
    for (let i = 1; i < values.length; i++) values[i] = Math.imul(values[i - 1], multiplier);
    return values;
  });
  const tokenIndex = new Map(dictionary.map((token, i) => [token, i]));
  const prefixes = MULTIPLIERS.map(() => new Uint32Array(size + 1));
  for (let r = 0; r < runs.length; r++) {
    for (let p = 0; p < runs[r].tokens.length; p++) {
      const hashes = tokenHashes[tokenIndex.get(runs[r].tokens[p])]; const at = runStarts[r] + p;
      for (let h = 0; h < 4; h++) prefixes[h][at + 1] = Math.imul(prefixes[h][at], MULTIPLIERS[h]) + hashes[h];
    }
  }
  return { powers, prefixes };
}

function patternId(index, position, length, view) {
  // Four independent rolling 32-bit components permit O(1) substring IDs.
  // Token hashes depend on text, never corpus-local dictionary ranks.
  const fingerprint = MULTIPLIERS.map((_, h) =>
    ((index._hash.prefixes[h][position + length] - Math.imul(index._hash.prefixes[h][position], index._hash.powers[h][length])) >>> 0)
      .toString(16).padStart(8, '0')).join('');
  const namespace = createHash('sha256').update(`${index.normalizationVersion}\0${view}`).digest('hex').slice(0, 12);
  return `p_${namespace}_${length}_${fingerprint}`;
}

export function descriptor(index, interval, length) {
  const sourcePosition = index.suffixArray[interval.start];
  const run = index.runs[index.runAt[sourcePosition]];
  const result = {
    id: patternId(index, sourcePosition, length, run.view), view: run.view, length,
    songCount: interval.songCount, occurrenceCount: interval.end - interval.start + 1,
    intervalStart: interval.start, intervalEnd: interval.end, sourcePosition,
  };
  // Deliberately excluded from JSON serialization: expanding every suffix's text
  // would recreate quadratic storage. Selected export records can materialize it.
  Object.defineProperty(result, 'tokens', { get: () => patternTokens(index, result), enumerable: false });
  return result;
}

/**
 * Discover all recurring contiguous patterns, compressed as suffix intervals and
 * implicit length ranges. Never reads previous indexes or removes covered input.
 * Runs require stable id/view/songId/sectionId, tokens and N-1 transitionIds.
 * Export typed arrays as numeric arrays/BLOBs and compact scalar descriptors.
 */
export function discoverPatterns(inputRuns, config = {}) {
  const minSongs = config.minSongs ?? 2;
  if (!Number.isInteger(minSongs) || minSongs < 1) throw new Error('minSongs must be a positive integer');
  const runs = [...inputRuns].sort((a, b) => compare(a.view, b.view) || compare(a.id, b.id));
  const seen = new Set();
  for (const run of runs) {
    if (![run.id, run.view, run.songId, run.sectionId].every(value => typeof value === 'string' && value.length && !value.includes('\0')) ||
        !Array.isArray(run.tokens)) throw new Error('Invalid normalized run');
    if (seen.has(run.id)) throw new Error(`Duplicate run id: ${run.id}`);
    seen.add(run.id);
    if (!run.tokens.every(token => typeof token === 'string' && token.length)) throw new Error(`Invalid token in ${run.id}`);
    if (!Array.isArray(run.transitionIds) || run.transitionIds.length !== Math.max(0, run.tokens.length - 1) || run.transitionIds.some(id => !id))
      throw new Error(`Expected one stable transition ID per harmonic edge in ${run.id}`);
  }
  const dictionary = [...new Set(runs.flatMap(run => run.tokens))].sort(compare);
  const scoped = [...new Set(runs.flatMap(run => run.tokens.map(token => `${run.view}\0${token}`)))].sort(compare);
  const ranks = new Map(scoped.map((token, i) => [token, i + runs.length + 1]));
  const size = runs.reduce((n, run) => n + run.tokens.length + 1, 0);
  if (size >= 0x7fffffff) throw new Error('Corpus exceeds the explicit 32-bit suffix-index capacity; partition by view/source snapshot');
  const symbols = new Uint32Array(size);
  const runAt = new Int32Array(size).fill(-1);
  const offsetAt = new Int32Array(size).fill(-1);
  const remaining = new Uint32Array(size);
  const runStarts = new Uint32Array(runs.length);
  let at = 0;
  for (let r = 0; r < runs.length; r++) {
    const run = runs[r]; runStarts[r] = at;
    for (let p = 0; p < run.tokens.length; p++, at++) {
      symbols[at] = ranks.get(`${run.view}\0${run.tokens[p]}`); runAt[at] = r; offsetAt[at] = p; remaining[at] = run.tokens.length - p;
    }
    symbols[at++] = r + 1; // Unique delimiters sort before all musical tokens.
  }
  const fullSa = suffixArrayOf(symbols);
  const fullLcp = lcpOf(symbols, fullSa, remaining);
  const suffixArray = fullSa.slice(runs.length);
  const lcp = fullLcp.slice(runs.length);
  if (lcp.length) lcp[0] = 0;
  const intervals = suffixIntervals(lcp);
  annotateSongs(intervals, suffixArray, runAt, runs);
  const recurring = intervals.filter(interval => interval.songCount >= minSongs);
  const index = {
    version: MINER_VERSION, normalizationVersion: config.normalizationVersion ?? 'aural-normalization-1', minSongs,
    runs, tokenDictionary: dictionary, suffixArray, runAt, offsetAt, runStarts, lcp,
    intervals: recurring, candidates: [],
  };
  Object.defineProperty(index, '_hash', { value: hashSupport(runs, dictionary, runStarts, size), enumerable: false });
  for (const interval of recurring) {
    index.candidates.push(descriptor(index, interval, interval.maxLength));
    if (interval.minLength === 2 && interval.maxLength > 2) index.candidates.push(descriptor(index, interval, 2));
  }
  index.candidates.sort((a, b) => compare(a.id, b.id));
  return index;
}

export function patternTokens(index, pattern) {
  const position = pattern.sourcePosition ?? index.suffixArray[pattern.intervalStart];
  return index.runs[index.runAt[position]].tokens.slice(index.offsetAt[position], index.offsetAt[position] + pattern.length);
}

/** Rehydrate persisted numeric arrays/BLOB-decoded arrays without rerunning mining. */
export function hydrateIndex(saved) {
  if (saved.version !== MINER_VERSION) throw new Error(`Unsupported suffix-index version: ${saved.version}`);
  const index = { ...saved };
  for (const [field, Type] of Object.entries({ suffixArray: Uint32Array, runAt: Int32Array, offsetAt: Int32Array,
    runStarts: Uint32Array, lcp: Uint32Array })) {
    if (!Array.isArray(saved[field]) && !ArrayBuffer.isView(saved[field])) throw new Error(`Expected numeric array for ${field}`);
    index[field] = Type.from(saved[field]);
  }
  Object.defineProperty(index, '_hash', { value: hashSupport(index.runs, index.tokenDictionary, index.runStarts, index.runAt.length), enumerable: false });
  index.candidates = saved.candidates.map(pattern => {
    const restored = { ...pattern };
    Object.defineProperty(restored, 'tokens', { get: () => patternTokens(index, restored), enumerable: false });
    return restored;
  });
  return index;
}

/** Every overlap is returned; end is inclusive, so edge offsets are [start,end). */
export function* occurrences(index, pattern) {
  for (let i = pattern.intervalStart; i <= pattern.intervalEnd; i++) {
    const position = index.suffixArray[i]; const runIndex = index.runAt[position];
    const run = index.runs[runIndex]; const start = index.offsetAt[position];
    yield { runId: run.id, runIndex, view: run.view, songId: run.songId, sectionId: run.sectionId,
      revision: run.revision, start, end: start + pattern.length - 1, suffixRank: i };
  }
}

/** Resolve arbitrary implicit lengths without expanding every substring. */
export function getPattern(index, { view, tokens, minSongs = index.minSongs }) {
  if (!Array.isArray(tokens) || tokens.length < 2) return null;
  const compareSuffix = rank => {
    const pos = index.suffixArray[rank]; const run = index.runs[index.runAt[pos]];
    const viewOrder = compare(run.view, view); if (viewOrder) return viewOrder;
    const start = index.offsetAt[pos];
    for (let p = 0; p < tokens.length; p++) {
      if (start + p >= run.tokens.length) return -1;
      const order = compare(run.tokens[start + p], tokens[p]); if (order) return order;
    }
    return 0;
  };
  let lo = 0; let hi = index.suffixArray.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (compareSuffix(mid) < 0) lo = mid + 1; else hi = mid; }
  const start = lo;
  hi = index.suffixArray.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (compareSuffix(mid) <= 0) lo = mid + 1; else hi = mid; }
  const end = lo - 1;
  if (end < start) return null;
  const songs = new Set();
  for (let rank = start; rank <= end; rank++) songs.add(index.runs[index.runAt[index.suffixArray[rank]]].songId);
  if (songs.size < minSongs) return null;
  return descriptor(index, { start, end, songCount: songs.size }, tokens.length);
}

/** Disjoint suffix-tree edges cover EVERY observed substring of length >= 2.
 * Internal edges include within-song repetitions; leaf edges include unique material.
 * Educational support thresholds must never be applied to this catalog.
 */
export function catalogRanges(index) {
  const ranges = suffixIntervals(index.lcp);
  annotateSongs(ranges, index.suffixArray, index.runAt, index.runs);
  for (let rank = 0; rank < index.suffixArray.length; rank++) {
    const pos = index.suffixArray[rank];
    const maxLength = index.runs[index.runAt[pos]].tokens.length - index.offsetAt[pos];
    const minLength = Math.max(2, 1 + Math.max(index.lcp[rank], index.lcp[rank + 1] || 0));
    if (minLength <= maxLength) ranges.push({ start: rank, end: rank, minLength, maxLength, songCount: 1 });
  }
  return ranges;
}
