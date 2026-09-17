import { occurrences, patternTokens } from './miner.mjs';

export const SELECTOR_VERSION = 'aural-coverage-1';
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

class MaxHeap {
  values = [];
  better(a, b) {
    return a.priority > b.priority || (a.priority === b.priority &&
      (a.pattern.songCount > b.pattern.songCount || (a.pattern.songCount === b.pattern.songCount &&
        (a.pattern.length > b.pattern.length || (a.pattern.length === b.pattern.length && compare(a.pattern.id, b.pattern.id) < 0)))));
  }
  push(value) {
    let p = this.values.length; this.values.push(value);
    while (p > 0) {
      const parent = (p - 1) >>> 1;
      if (!this.better(value, this.values[parent])) break;
      this.values[p] = this.values[parent]; p = parent;
    }
    this.values[p] = value;
  }
  pop() {
    const result = this.values[0]; const last = this.values.pop();
    if (this.values.length) {
      let p = 0;
      while (p * 2 + 1 < this.values.length) {
        let child = p * 2 + 1;
        if (child + 1 < this.values.length && this.better(this.values[child + 1], this.values[child])) child++;
        if (!this.better(this.values[child], last)) break;
        this.values[p] = this.values[child]; p = child;
      }
      this.values[p] = last;
    }
    return result;
  }
  get size() { return this.values.length; }
}

/** Range minima over suffix ranks skip already-explained patterns in O(log n). */
class RangeMinimum {
  constructor(n) {
    this.size = 1; while (this.size < n) this.size *= 2;
    this.values = new Uint32Array(this.size * 2);
  }
  set(at, value) {
    let p = at + this.size; this.values[p] = value;
    while ((p >>= 1) > 0) {
      const next = Math.min(this.values[p * 2], this.values[p * 2 + 1]);
      if (next === this.values[p]) break;
      this.values[p] = next;
    }
  }
  query(start, end) {
    let lo = start + this.size; let hi = end + this.size; let result = Infinity;
    while (lo <= hi) {
      if (lo & 1) result = Math.min(result, this.values[lo++]);
      if (!(hi & 1)) result = Math.min(result, this.values[hi--]);
      lo >>= 1; hi >>= 1;
    }
    return result;
  }
}

function groupedOccurrences(index, pattern) {
  // Integer sorting avoids allocating an object for every suffix posting. The
  // backing array is shared by the per-run slices, not copied for every group.
  const positions = index.suffixArray.slice(pattern.intervalStart, pattern.intervalEnd + 1);
  positions.sort();
  const groups = new Map();
  let start = 0; let runIndex = -1;
  for (let i = 0; i < positions.length; i++) {
    const position = positions[i]; const nextRun = index.runAt[position];
    if (runIndex !== nextRun) {
      if (runIndex >= 0) groups.set(runIndex, positions.subarray(start, i));
      start = i; runIndex = nextRun;
    }
    positions[i] = index.offsetAt[position];
  }
  if (runIndex >= 0) groups.set(runIndex, positions.subarray(start));
  return groups;
}

function mergedEdges(starts, length) {
  const intervals = [];
  for (const start of starts) {
    const end = start + length - 1; // Exclusive edge end, inclusive chord end.
    if (intervals.length && start <= intervals[intervals.length - 1][1])
      intervals[intervals.length - 1][1] = Math.max(end, intervals[intervals.length - 1][1]);
    else intervals.push([start, end]);
  }
  return intervals;
}

function effectiveOccurrences(index, pattern, groups) {
  const perSong = new Map();
  for (const [r, starts] of groups) {
    const song = index.runs[r].songId;
    let count = perSong.get(song) || 0;
    let end = -1;
    for (const start of starts) {
      if (count >= 4) break;
      if (start > end) { count++; end = start + pattern.length - 1; }
    }
    perSong.set(song, count);
  }
  return [...perSong.values()].reduce((n, count) => n + count, 0);
}

function baseScore(pattern, effective, config) {
  const usefulness = config.usefulness?.[pattern.id] ?? 1;
  if (!Number.isFinite(usefulness) || usefulness < 0) throw new Error(`Invalid usefulness multiplier for ${pattern.id}`);
  return Math.log2(1 + pattern.songCount) * Math.log2(1 + effective) * Math.log2(pattern.length) * usefulness;
}

function createContext(index, view) {
  const edgeIds = new Map();
  const edgeOrdinals = new Map();
  let maxLength = 0;
  const runIndices = [];
  for (let r = 0; r < index.runs.length; r++) {
    const run = index.runs[r]; if (run.view !== view) continue;
    runIndices.push(r); maxLength = Math.max(maxLength, run.tokens.length);
    const ordinals = new Uint32Array(run.transitionIds.length);
    for (let p = 0; p < run.transitionIds.length; p++) {
      const id = run.transitionIds[p];
      if (!edgeIds.has(id)) edgeIds.set(id, edgeIds.size);
      ordinals[p] = edgeIds.get(id);
    }
    edgeOrdinals.set(r, ordinals);
  }
  const lengths = new Float64Array(maxLength + 2);
  for (const r of runIndices) lengths[index.runs[r].tokens.length]++;
  const denominators = new Float64Array(maxLength + 2);
  let activeRuns = 0; let count = 0;
  for (let k = maxLength; k >= 1; k--) { activeRuns += lengths[k]; count += activeRuns; denominators[k] = count; }
  const suffixRankAt = new Int32Array(index.runAt.length).fill(-1);
  for (let rank = 0; rank < index.suffixArray.length; rank++) suffixRankAt[index.suffixArray[rank]] = rank;
  return { index, view, edgeIds, edgeOrdinals, runIndices, maxLength, denominators, suffixRankAt,
    evaluationSeen: new Uint32Array(edgeIds.size), evaluationGeneration: 0 };
}

class CoverageState {
  constructor(context) {
    this.context = context;
    this.edges = new Uint8Array(context.edgeIds.size);
    this.coveredTransitions = 0;
    this.coveredLength = new Uint32Array(context.index.runAt.length);
    this.lengthHistogram = new Float64Array(context.maxLength + 2);
    this.lengthFenwick = new Float64Array(context.maxLength + 2);
    this.coveredChordStarts = 0;
    this.minimum = new RangeMinimum(context.index.suffixArray.length);
    this.ownerAt = new Int32Array(context.index.runAt.length).fill(-1);
    this.owners = [];
    this.version = 0;
  }
  explains(pattern) {
    return this.minimum.query(pattern.intervalStart, pattern.intervalEnd) >= pattern.length;
  }
  sequenceCounts(maximum = this.context.maxLength) {
    const counts = new Float64Array(maximum + 2);
    let prefix = 0;
    for (let p = maximum; p > 0; p -= p & -p) prefix += this.lengthFenwick[p];
    let sum = this.coveredChordStarts - prefix;
    for (let k = maximum; k >= 1; k--) { sum += this.lengthHistogram[k]; counts[k] = sum; }
    return counts;
  }
  recordLength(length, delta) {
    this.lengthHistogram[length] += delta;
    for (let p = length; p < this.lengthFenwick.length; p += p & -p) this.lengthFenwick[p] += delta;
  }
  evaluate(pattern) {
    const { index, edgeOrdinals, evaluationSeen } = this.context;
    const groups = groupedOccurrences(index, pattern);
    let stamp = ++this.context.evaluationGeneration;
    if (stamp >= 0xffffffff) { evaluationSeen.fill(0); stamp = this.context.evaluationGeneration = 1; }
    let totalTransitions = 0; let additionalTransitions = 0; let additionalSequences = 0;
    for (const [r, starts] of groups) {
      for (const start of starts) if (this.coveredLength[index.runStarts[r] + start] < pattern.length) additionalSequences++;
      const ordinals = edgeOrdinals.get(r);
      for (const [start, end] of mergedEdges(starts, pattern.length))
        for (let p = start; p < end; p++) {
          const id = ordinals[p];
          if (evaluationSeen[id] === stamp) continue;
          evaluationSeen[id] = stamp; totalTransitions++;
          if (!this.edges[id]) additionalTransitions++;
        }
    }
    return {
      effectiveOccurrences: effectiveOccurrences(index, pattern, groups), totalTransitions,
      additionalTransitions, additionalSequences,
    };
  }
  add(pattern) {
    const { index, edgeOrdinals, suffixRankAt } = this.context;
    const groups = groupedOccurrences(index, pattern);
    const owner = this.owners.length; this.owners.push(pattern.id);
    for (const [r, starts] of groups) {
      const ordinals = edgeOrdinals.get(r);
      const intervals = mergedEdges(starts, pattern.length);
      for (const [start, end] of intervals) for (let p = start; p < end; p++) {
        if (!this.edges[ordinals[p]]) { this.edges[ordinals[p]] = 1; this.coveredTransitions++; }
      }
      // Visit each chord in an occurrence union once. The latest eligible start
      // supplies the greatest end, preserving contained-window semantics.
      let occurrence = 0; let farthest = -1;
      for (const [start, end] of intervals) for (let p = start; p <= end; p++) {
        while (occurrence < starts.length && starts[occurrence] <= p) farthest = starts[occurrence++] + pattern.length - 1;
        const value = farthest - p + 1;
        const at = index.runStarts[r] + p; const previous = this.coveredLength[at];
        if (value > previous) {
          if (previous) this.recordLength(previous, -1);
          else this.coveredChordStarts++;
          this.recordLength(value, 1);
          this.coveredLength[at] = value; this.ownerAt[at] = owner;
          this.minimum.set(suffixRankAt[at], value);
        }
      }
    }
    this.version++;
  }
}

function standaloneSequences(index, pattern, maxLength) {
  // A length-a chord span contributes max(0,a-k+1) windows of length k.
  // Adjacent equal-length spans have increasing ends; subtract their overlap.
  const slopes = new Float64Array(maxLength + 3); const intercepts = new Float64Array(maxLength + 3);
  const addTriangle = (length, sign) => {
    if (length < 2) return;
    slopes[2] -= sign; slopes[length + 1] += sign;
    intercepts[2] += sign * (length + 1); intercepts[length + 1] -= sign * (length + 1);
  };
  for (const starts of groupedOccurrences(index, pattern).values()) {
    let previousEnd = -1;
    for (const start of starts) {
      addTriangle(pattern.length, 1);
      addTriangle(Math.max(0, previousEnd - start + 1), -1);
      previousEnd = start + pattern.length - 1;
    }
  }
  const counts = new Float64Array(maxLength + 2);
  let slope = 0; let intercept = 0;
  for (let k = 2; k <= maxLength; k++) { slope += slopes[k]; intercept += intercepts[k]; counts[k] = slope * k + intercept; }
  return counts;
}

function sequenceReport(context, counts, before = null, totals = null, maximum = context.maxLength, pattern = null) {
  const result = {};
  for (let k = 2; k <= maximum; k++) {
    const denominator = context.denominators[k];
    if (!denominator) continue;
    result[k] = { total: totals ? totals[k] : counts[k], additional: counts[k] - (before?.[k] || 0),
      cumulative: counts[k], denominator, coverage: counts[k] / denominator };
    if (pattern) result[k].overlappingVisits = pattern.occurrenceCount * Math.max(0, pattern.length - k + 1) - result[k].total;
  }
  return result;
}

/** Exact union report for arbitrary resolved patterns; views remain independent. */
export function calculateCoverage(index, patterns, config = {}) {
  const result = {};
  const views = config.view ? [config.view] : [...new Set(index.runs.map(run => run.view))].sort(compare);
  for (const view of views) {
    const context = createContext(index, view); const state = new CoverageState(context);
    for (const pattern of patterns) if (pattern.view === view) state.add(pattern);
    const observed = config.observedTransitionCounts?.[view] ?? context.edgeIds.size;
    if (!Number.isSafeInteger(observed) || observed < context.edgeIds.size) throw new Error('Observed denominator must include every eligible transition');
    result[view] = {
      transitionCount: context.edgeIds.size, coveredTransitions: state.coveredTransitions,
      coverage: context.edgeIds.size ? state.coveredTransitions / context.edgeIds.size : 0,
      observedTransitionCount: observed, observedCoverage: observed ? state.coveredTransitions / observed : 0,
      sequenceCoverage: sequenceReport(context, state.sequenceCounts()),
    };
  }
  return result;
}

/**
 * Lazy greedy coverage followed by an independent longer-structure pass.
 * Marginal gains are recomputed only when a candidate reaches the heap top;
 * range-minimum coverage skips fully explained suffix intervals without scanning
 * their occurrences. No discovered input/pattern is removed by selection.
 */
export function selectPatterns(index, runs = index.runs, config = {}) {
  if (runs.length !== index.runs.length) throw new Error('Selection must use the discovery corpus');
  if (runs !== index.runs) {
    const expected = new Map(index.runs.map(run => [run.id, run]));
    for (const run of runs) {
      const original = expected.get(run.id);
      if (!original || (run !== original &&
        (['view', 'songId', 'sectionId', 'revision'].some(field => run[field] !== original[field]) ||
        run.tokens.length !== original.tokens.length || run.tokens.some((token, i) => token !== original.tokens[i]) ||
        run.transitionIds.length !== original.transitionIds.length || run.transitionIds.some((id, i) => id !== original.transitionIds[i]))))
        throw new Error('Selection must use the discovery corpus');
      expected.delete(run.id);
    }
  }
  const target = config.targetCoverage ?? 0.8;
  const structureMinSongs = config.structureMinSongs ?? 5;
  if (!Number.isFinite(target) || target < 0 || target > 1) throw new Error('targetCoverage must be between zero and one');
  if (!Number.isInteger(structureMinSongs) || structureMinSongs < 1) throw new Error('structureMinSongs must be positive');
  const result = { version: SELECTOR_VERSION, targetCoverage: target, views: {}, selected: [] };
  for (const view of [...new Set(index.runs.map(run => run.view))].sort(compare)) {
    const context = createContext(index, view); let state = new CoverageState(context);
    const candidates = index.candidates.filter(pattern => pattern.view === view);
    const chosen = []; const chosenIds = new Set();
    const observed = config.observedTransitionCounts?.[view] ?? context.edgeIds.size;
    if (!Number.isSafeInteger(observed) || observed < context.edgeIds.size) throw new Error('Observed denominator must include every eligible transition');
    const heap = new MaxHeap();
    for (const pattern of candidates) {
      const upper = baseScore(pattern, Math.min(pattern.occurrenceCount, 4 * pattern.songCount), config);
      heap.push({ pattern, priority: upper *
        (Math.min(context.edgeIds.size, pattern.occurrenceCount * (pattern.length - 1)) / (context.edgeIds.size || 1) +
          pattern.occurrenceCount / context.denominators[pattern.length]), stamp: -1 });
    }
    while (heap.size && state.coveredTransitions < observed * target) {
      const node = heap.pop();
      if (state.explains(node.pattern)) continue;
      if (node.stamp !== state.version) {
        const evidence = state.evaluate(node.pattern);
        if (!evidence.additionalTransitions) continue;
        node.priority = baseScore(node.pattern, evidence.effectiveOccurrences, config) *
          (evidence.additionalTransitions / (context.edgeIds.size || 1) + evidence.additionalSequences / context.denominators[node.pattern.length]);
        node.stamp = state.version; heap.push(node); continue;
      }
      state.add(node.pattern); chosen.push({ pattern: node.pattern, reason: 'transition-coverage' }); chosenIds.add(node.pattern.id);
    }
    const structures = new MaxHeap();
    for (const pattern of candidates) if (pattern.length > 2 && pattern.songCount >= structureMinSongs && !chosenIds.has(pattern.id))
      structures.push({ pattern, priority: baseScore(pattern, Math.min(pattern.occurrenceCount, 4 * pattern.songCount), config), exact: false });
    while (structures.size) {
      const node = structures.pop();
      if (state.explains(node.pattern)) continue;
      if (!node.exact) {
        node.priority = baseScore(node.pattern, effectiveOccurrences(index, node.pattern, groupedOccurrences(index, node.pattern)), config);
        node.exact = true; structures.push(node); continue;
      }
      state.add(node.pattern); chosen.push({ pattern: node.pattern, reason: 'longer-structure' }); chosenIds.add(node.pattern.id);
    }
    const beforeSupersession = state.coveredTransitions;
    const beforeSequenceCounts = state.sequenceCounts();
    state = new CoverageState(context);
    const retained = new Set(); const superseded = [];
    for (const choice of [...chosen].sort((a, b) => b.pattern.length - a.pattern.length || compare(a.pattern.id, b.pattern.id))) {
      const pattern = choice.pattern;
      if (state.explains(pattern)) {
        const owners = new Set();
        for (const occurrence of occurrences(index, pattern)) {
          const position = index.runStarts[occurrence.runIndex] + occurrence.start;
          owners.add(state.owners[state.ownerAt[position]]);
        }
        superseded.push({ id: pattern.id, view, length: pattern.length, supersededBy: [...owners].sort(compare) });
      } else { retained.add(pattern.id); state.add(pattern); }
    }
    const afterSequenceCounts = state.sequenceCounts();
    if (state.coveredTransitions !== beforeSupersession || afterSequenceCounts.some((n, k) => k >= 2 && n !== beforeSequenceCounts[k]))
      throw new Error('Supersession changed coverage');
    state = new CoverageState(context);
    const selected = [];
    for (const choice of chosen) {
      if (!retained.has(choice.pattern.id)) continue;
      const pattern = choice.pattern; const evidence = state.evaluate(pattern);
      const before = state.sequenceCounts(pattern.length); const beforeTransitions = state.coveredTransitions;
      state.add(pattern); const after = state.sequenceCounts(pattern.length);
      selected.push({
        ...pattern, tokens: patternTokens(index, pattern), reason: choice.reason,
        effectiveOccurrences: evidence.effectiveOccurrences, priorityScore: baseScore(pattern, evidence.effectiveOccurrences, config),
        totalTransitions: evidence.totalTransitions, additionalTransitions: state.coveredTransitions - beforeTransitions,
        withinPatternRepeatedTransitionVisits: pattern.occurrenceCount * (pattern.length - 1) - evidence.totalTransitions,
        overlappingTransitions: evidence.totalTransitions - evidence.additionalTransitions,
        redundantTransitionFraction: evidence.totalTransitions ? 1 - evidence.additionalTransitions / evidence.totalTransitions : 0,
        cumulativeTransitions: state.coveredTransitions,
        cumulativeCoverage: context.edgeIds.size ? state.coveredTransitions / context.edgeIds.size : 0,
        cumulativeObservedCoverage: observed ? state.coveredTransitions / observed : 0,
        // A pattern cannot add windows longer than itself. Omitted lengths have
        // zero total/additional coverage and retain the previous cumulative
        // count; final per-view coverage still reports every corpus length.
        sequenceCoverage: sequenceReport(context, after, before, standaloneSequences(index, pattern, pattern.length), pattern.length, pattern),
      });
    }
    const metrics = {
      selected, superseded, transitionCount: context.edgeIds.size, coveredTransitions: state.coveredTransitions,
      coverage: context.edgeIds.size ? state.coveredTransitions / context.edgeIds.size : 0,
      observedTransitionCount: observed, observedCoverage: observed ? state.coveredTransitions / observed : 0,
      targetReached: observed > 0 && state.coveredTransitions >= target * observed,
      sequenceCoverage: sequenceReport(context, state.sequenceCounts()),
      candidateCount: candidates.length,
    };
    result.views[view] = metrics; result.selected.push(...selected);
  }
  return result;
}
