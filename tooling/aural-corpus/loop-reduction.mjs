import { catalogRanges } from './miner.mjs';

export const LOOP_REDUCTION_VERSION = 'unique-transitions-1';

function prefixPeriods(tokens, offset = 0) {
  const prefix = new Int32Array(tokens.length - offset);
  for (let i = 1; i < prefix.length; i++) {
    let j = prefix[i - 1];
    while (j > 0 && tokens[offset + i] !== tokens[offset + j]) j = prefix[j - 1];
    if (tokens[offset + i] === tokens[offset + j]) j++;
    prefix[i] = j;
  }
  return prefix;
}

function redundantPrefix(prefix, length) {
  const period = length - prefix[length - 1];
  return length >= 2 * period && length > period + 1;
}

/** Identity uses full normalized tokens, never rendered Roman labels. */
export function reduceLoop(tokens) {
  if (tokens.length < 3 || !redundantPrefix(prefixPeriods(tokens), tokens.length))
    return { redundant: false, start: 0, length: tokens.length };
  const last = new Map();
  let left = 0, bestStart = 0, bestLength = 1;
  for (let edge = 0; edge < tokens.length - 1; edge++) {
    const key = JSON.stringify([tokens[edge], tokens[edge + 1]]);
    left = Math.max(left, (last.get(key) ?? -1) + 1);
    last.set(key, edge);
    const length = edge - left + 2;
    if (length > bestLength) { bestStart = left; bestLength = length; }
  }
  return { redundant: true, start: bestStart, length: bestLength };
}

/** Split implicit lengths; retain original occurrence intervals and source runs. */
export function* reducedCatalogRanges(index, ranges = catalogRanges(index)) {
  ranges.sort((a, b) => a.start - b.start || a.minLength - b.minLength);
  let sourceRank = -1, prefix;
  for (const range of ranges) {
    if (sourceRank !== range.start) {
      sourceRank = range.start;
      const pos = index.suffixArray[sourceRank];
      prefix = prefixPeriods(index.runs[index.runAt[pos]].tokens, index.offsetAt[pos]);
    }
    let low = range.minLength;
    for (let length = low; length <= range.maxLength; length++) {
      if (!redundantPrefix(prefix, length)) continue;
      if (low < length) yield { ...range, minLength: low, maxLength: length - 1 };
      low = length + 1;
    }
    if (low <= range.maxLength) yield { ...range, minLength: low };
  }
}

/** Stop each endpoint-trimming branch at its nearest visible descendant. */
export function retainedChildren(tokens) {
  if (tokens.length <= 2) return [];
  const queue = [[0, tokens.length - 1], [1, tokens.length]], visited = new Set(), result = new Map();
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const [start, end] = queue[cursor], key = `${start}:${end}`;
    if (visited.has(key) || end - start < 2) continue;
    visited.add(key);
    const child = tokens.slice(start, end);
    if (!reduceLoop(child).redundant) result.set(JSON.stringify(child), child);
    else queue.push([start, end - 1], [start + 1, end]);
  }
  return [...result.values()];
}
