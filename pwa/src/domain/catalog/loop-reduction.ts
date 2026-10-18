import type { AuralLoopReduction, AuralLoopReductionApi } from './loop-contracts';

export const AURAL_LOOP_REDUCTION_VERSION = 'unique-transitions-1' as const;
function snapshot(value: unknown): string[] {
  if (!Array.isArray(value)) throw new TypeError('Expected tokens array');
  const count: unknown = value.length;
  if (typeof count !== 'number') throw new TypeError('Expected array length');
  if (!Number.isSafeInteger(count) || count < 0 || count > 10000) throw new RangeError('Token limit');
  const result: string[] = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    const token: unknown = value[i];
    if (typeof token !== 'string') throw new TypeError('Expected token string');
    total += token.length;
    if (token.length > 65536 || total > 8_388_608) throw new RangeError('UTF16 text limit');
    result.push(token);
  }
  return result;
}
/** Native KMP and directed transition window over a private snapshot span. */
function reduce(tokens: readonly string[], offset: number, n: number): AuralLoopReduction {
  if (n < 3) return { redundant: false, start: 0, length: n };
  const prefix = new Int32Array(n);
  for (let i = 1; i < n; i++) {
    let j = prefix[i - 1];
    while (j > 0 && tokens[offset + i] !== tokens[offset + j]) j = prefix[j - 1];
    if (tokens[offset + i] === tokens[offset + j]) j++;
    prefix[i] = j;
  }
  const period = n - prefix[n - 1];
  if (n < 2 * period || n <= period + 1) return { redundant: false, start: 0, length: n };
  const last = new Map<string, Map<string, number>>();
  let left = 0, bestStart = 0, bestLength = 1;
  for (let edge = 0; edge < n - 1; edge++) {
    const first = tokens[offset + edge], second = tokens[offset + edge + 1];
    let pairs = last.get(first);
    if (!pairs) { pairs = new Map(); last.set(first, pairs); }
    left = Math.max(left, (pairs.get(second) ?? -1) + 1);
    pairs.set(second, edge);
    const length = edge - left + 2;
    if (length > bestLength) { bestStart = left; bestLength = length; }
  }
  return { redundant: true, start: bestStart, length: bestLength };
}
type Node = { children: Map<string, Node>; terminal: boolean };
function node(): Node { return { children: new Map(), terminal: false }; }
export function auralReduceLoop(input: readonly string[]): AuralLoopReduction {
  const tokens = snapshot(input);
  return Object.freeze(reduce(tokens, 0, tokens.length));
}
export function auralRetainedChildren(input: readonly string[]): readonly (readonly string[])[] {
  const tokens = snapshot(input), n = tokens.length, result: (readonly string[])[] = [];
  if (n <= 2) return Object.freeze(result);
  const queue: [number, number][] = [[0, n - 1], [1, n]];
  const visited = new Set<number>(), contents = node();
  let cursor = 0, examined = 0, output = 0;
  while (cursor < queue.length) {
    const span = queue[cursor++], start = span[0], end = span[1], count = end - start;
    // n<=10000 makes this pair encoding injective and safely below 2^53.
    const key = start * (n + 1) + end;
    if (count < 2 || visited.has(key)) continue;
    if (visited.size >= 65536 || examined + count > 2_000_000) throw new RangeError('Loop work limit');
    visited.add(key); examined += count; // charge BEFORE span reduction or copying
    if (reduce(tokens, start, count).redundant) {
      queue.push([start, end - 1], [start + 1, end]); // native dropLAST then dropFIRST BFS order
    } else {
      let entry = contents;
      for (let i = start; i < end; i++) {
        let next = entry.children.get(tokens[i]);
        if (!next) { next = node(); entry.children.set(tokens[i], next); }
        entry = next;
      }
      if (!entry.terminal) {
        if (output + count > 2_000_000) throw new RangeError('Loop output limit');
        output += count; entry.terminal = true;
        result.push(Object.freeze(tokens.slice(start, end)));
      }
    }
  }
  return Object.freeze(result);
}
export const auralLoopReductionApi: AuralLoopReductionApi = Object.freeze({ auralReduceLoop, auralRetainedChildren });
