import { catalogRanges, descriptor, getPattern, occurrences } from './miner.mjs';

export const CATALOG_VERSION = 'aural-catalog-1';
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const catalogOrder = (a, b) => b.score - a.score || b.songCount - a.songCount || b.length - a.length || compare(a.id, b.id);
export const baseScore = (length, songs, effective) => Math.log2(length) * Math.log2(1 + songs) * Math.log2(1 + effective);
export function songFactor(id, preferences = {}, context = {}) {
  const popularity = context.popularity?.[id];
  const p = preferences.popularity && Number.isFinite(popularity?.score)
    ? 1 + Math.max(0, Math.min(1, popularity.confidence ?? 0)) * (Math.max(0, Math.min(1, popularity.score)) - .5) : 1;
  const recent = (context.recentSongIds ?? []).indexOf(id);
  const r = preferences.variety && recent >= 0 && recent < 10 ? recent < 3 ? .25 : .6 : 1;
  const f = preferences.favorites && (context.favoriteSongIds ?? []).includes(id) ? 1.5 : 1;
  return p * r * f;
}

export function catalogStats(index, pattern, preferences = {}, context = {}) {
  const songs = new Map(), sections = new Set();
  for (const occurrence of occurrences(index, pattern)) {
    sections.add(occurrence.sectionId);
    if (!songs.has(occurrence.songId)) songs.set(occurrence.songId, []);
    songs.get(occurrence.songId).push(occurrence);
  }
  let effective = 0, factors = 0;
  for (const [song, matches] of songs) {
    matches.sort((a, b) => compare(a.runId, b.runId) || a.start - b.start);
    let count = 0, run = null, end = -1;
    for (const match of matches) {
      if (run !== match.runId || match.start > end) { run = match.runId; end = match.end; if (++count === 4) break; }
    }
    effective += count;
    factors += songFactor(song, preferences, context);
  }
  return { ...pattern, sectionCount: sections.size, effectiveOccurrences: effective,
    score: baseScore(pattern.length, songs.size, effective) * factors / songs.size };
}

/** Max heap. Bounds must sort ahead of exact entries on ties. */
export class CatalogHeap {
  items = [];
  static before(a, b) { return a.bound > b.bound || a.bound === b.bound && (!a.result && !!b.result || !!a.result === !!b.result && a.result && catalogOrder(a.result, b.result) < 0); }
  push(value) {
    const a = this.items; let i = a.length; a.push(value);
    while (i) { const parent = (i - 1) >> 1; if (!CatalogHeap.before(value, a[parent])) break; a[i] = a[parent]; i = parent; }
    a[i] = value;
  }
  pop() {
    const a = this.items, head = a[0], last = a.pop(); if (!a.length) return head;
    let i = 0;
    while (i * 2 + 1 < a.length) { let child = i * 2 + 1; if (child + 1 < a.length && CatalogHeap.before(a[child + 1], a[child])) child++; if (!CatalogHeap.before(a[child], last)) break; a[i] = a[child]; i = child; }
    a[i] = last; return head;
  }
}

/** Exact best-first range refinement. Only competitive lengths are materialized.
 * Session owns a frozen copy of preferences/history, making pagination reproducible.
 */
export class CatalogSession {
  constructor(index, { view = 'harmony', minLength = 2, maxLength = Infinity, search = '', preferences = {}, context = {} } = {}) {
    if (!Number.isInteger(minLength) || minLength < 2 || !(maxLength >= minLength)) throw Error('Invalid chord-count range');
    this.index = index; this.preferences = structuredClone(preferences); this.context = structuredClone(context);
    this.search = search.trim().toLowerCase(); this.heap = new CatalogHeap();
    this.factorBound = (preferences.popularity ? 1.5 : 1) * (preferences.favorites ? 1.5 : 1);
    for (const range of catalogRanges(index)) {
      if (index.runs[index.runAt[index.suffixArray[range.start]]].view !== view) continue;
      this.pushRange({ ...range, minLength: Math.max(minLength, range.minLength), maxLength: Math.min(maxLength, range.maxLength) });
    }
  }
  pushRange(range) {
    if (range.minLength > range.maxLength) return;
    this.heap.push({ range, bound: baseScore(range.maxLength, range.songCount, Math.min(range.end - range.start + 1, 4 * range.songCount)) * this.factorBound });
  }
  page(limit = 50) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw Error('Invalid page size');
    const result = [];
    while (this.heap.items.length && result.length < limit) {
      const entry = this.heap.pop();
      if (entry.result) { result.push(entry.result); continue; }
      const range = entry.range;
      if (range.maxLength > range.minLength) {
        const middle = Math.floor((range.maxLength + range.minLength) / 2);
        this.pushRange({ ...range, maxLength: middle }); this.pushRange({ ...range, minLength: middle + 1 });
      } else {
        const pattern = descriptor(this.index, range, range.minLength);
        const run = this.index.runs[this.index.runAt[pattern.sourcePosition]], start = this.index.offsetAt[pattern.sourcePosition];
        const labels = run.positions?.slice(start, start + pattern.length).map(p => run.view === 'harmony_bass' ? p.roman : p.degree) ?? pattern.tokens;
        if (this.search && !labels.join(' ').toLowerCase().includes(this.search)) continue;
        const row = { ...catalogStats(this.index, pattern, this.preferences, this.context), labels };
        this.heap.push({ result: row, bound: row.score });
      }
    }
    return result;
  }
  get hasMore() { return this.heap.items.length > 0; }
}

export function catalogChildren(index, pattern, preferences = {}, context = {}) {
  if (pattern.length <= 2) return [];
  const tokens = pattern.tokens ?? index.runs[index.runAt[pattern.sourcePosition]].tokens.slice(index.offsetAt[pattern.sourcePosition], index.offsetAt[pattern.sourcePosition] + pattern.length);
  return [...new Map([tokens.slice(0, -1), tokens.slice(1)].map(tokens => {
    const p = getPattern(index, { view: pattern.view, tokens, minSongs: 1 });
    return [p.id, catalogStats(index, p, preferences, context)];
  })).values()].sort(catalogOrder);
}
