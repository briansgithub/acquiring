import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auralSongRankApi, buildAuralSongRankFragment as build } from './song-rank-eligibility';
import { createAuralRankEligibility } from './rank-eligibility';
import type { AuralSongRankInput } from './song-rank-contracts';

type Pop = { songId: string; score: number | null };
type Probe = AuralSongRankInput & {
  name: string;
  expected: { rankCount: number; words: number[] };
  decodedUtf16?: { songByRank: number[][]; validSongIds: number[][]; popularityIds: number[][] };
};
type Group = { name: string; probes: Probe[] };
const native = JSON.parse(readFileSync(new URL('./fixtures/native-song-rank.json', import.meta.url), 'utf8')) as { cases: Group[] };
const groups = native.cases;

function units(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i));
  return out;
}
function base(over: Partial<AuralSongRankInput> = {}): AuralSongRankInput {
  return { songByRank: ['A'], validSongIds: ['A'], popularity: [{ songId: 'A', score: 0.5 }], percent: 50, ...over };
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

describe('unchanged native song-rank predicate, Kotlin2.2.10', () => {
  for (const group of groups) it(group.name, () => {
    for (const probe of group.probes) {
      const input = freeze(structuredClone({
        songByRank: probe.songByRank, validSongIds: probe.validSongIds, popularity: probe.popularity, percent: probe.percent,
      }));
      const before = JSON.stringify(input);
      const actual = build(input);
      expect(actual.rankCount).toBe(probe.expected.rankCount);
      expect([...actual.words]).toEqual(probe.expected.words);
      expect(actual.words.length).toBe(Math.ceil(probe.songByRank.length / 32) || 0);
      if (probe.decodedUtf16) {
        expect(probe.songByRank.map(units)).toEqual(probe.decodedUtf16.songByRank);
        expect(probe.validSongIds.map(units)).toEqual(probe.decodedUtf16.validSongIds);
        expect(probe.popularity.map(row => units(row.songId))).toEqual(probe.decodedUtf16.popularityIds);
      }
      expect(JSON.stringify(input)).toBe(before);
    }
  });
});

describe('browser domain, packing, freeze, reentry and composition', () => {
  it('rejects invalid shapes/types without coercion and still validates empty rank', () => {
    for (const input of [null, [], 'A', 1, undefined]) expect(() => build(input as never)).toThrow(TypeError);
    for (const input of [
      { ...base(), songByRank: 'A' }, { ...base(), validSongIds: {} }, { ...base(), popularity: null },
      { ...base(), percent: '50' }, { ...base(), popularity: [{ songId: 1, score: 1 }] },
      { ...base(), popularity: [{ songId: 'A', score: '1' }] }, { ...base(), songByRank: [null] },
    ]) expect(() => build(input as never)).toThrow(TypeError);
    expect(() => build({ ...base({ songByRank: [] }), percent: true } as never)).toThrow(TypeError);
  });

  it('rejects numeric/resource/duplicate bounds including unused empty-rank fields', () => {
    for (const input of [
      { ...base(), percent: -1 }, { ...base(), percent: 101 }, { ...base(), percent: 50.5 },
      { ...base(), percent: NaN }, { ...base(), percent: Infinity }, { ...base(), percent: -Infinity },
      { ...base(), popularity: [{ songId: 'A', score: NaN }] }, { ...base(), popularity: [{ songId: 'A', score: Infinity }] },
      { ...base(), popularity: [{ songId: 'A', score: 1 }, { songId: 'A', score: 0 }] },
      { ...base({ songByRank: [] }), popularity: [{ songId: 'A', score: Number.NaN }] },
    ]) expect(() => build(input)).toThrow(RangeError);
    const tooLong = new Proxy(new Array(10001), { get(target, key) {
      if (key === '0') throw Error('element touched');
      return Reflect.get(target, key);
    } });
    for (const key of ['songByRank', 'validSongIds', 'popularity'] as const)
      expect(() => build({ ...base(), [key]: tooLong } as never)).toThrow(RangeError);
    expect(build({ ...base(), songByRank: Array(10000).fill('A') }).rankCount).toBe(10000);
    expect(build({ ...base(), validSongIds: Array(10000).fill('A') }).rankCount).toBe(1);
    expect(build({ ...base(), popularity: Array.from({ length: 10000 }, (_, i) => ({ songId: String(i), score: 1 })) }).rankCount).toBe(1);
  });

  it('uses UTF16 unit budgets with exact string and aggregate boundaries', () => {
    const id = 'x'.repeat(4096);
    expect(build({ songByRank: [id], validSongIds: [id], popularity: [{ songId: id, score: 1 }], percent: 0 }).words[0]).toBe(1);
    expect(() => build({ ...base(), validSongIds: ['x'.repeat(4097)] })).toThrow(RangeError);
    const packed = Array(2048).fill('😀'.repeat(2048));
    expect(build({ songByRank: [], validSongIds: packed, popularity: [], percent: 0 }).rankCount).toBe(0);
    expect(() => build({ songByRank: [], validSongIds: packed, popularity: [{ songId: 'x', score: 1 }], percent: 0 })).toThrow(RangeError);
  });

  it('snapshots known getters/indexes once, ignores iterators/unknown fields', () => {
    const reads = new Map<string, number>(); let unknown = 0;
    const watch = (value: unknown, path = 'input'): unknown => {
      if (value === null || typeof value !== 'object') return value;
      if (Array.isArray(value)) {
        const items = value.map((v, i) => watch(v, path + '.' + i));
        return new Proxy(items, { get(target, key) {
          if (key === Symbol.iterator) throw Error('iterator');
          if (key === 'length' || typeof key === 'string' && /^\d+$/.test(key)) {
            const id = path + '.' + String(key); reads.set(id, (reads.get(id) ?? 0) + 1);
          }
          return Reflect.get(target, key);
        } });
      }
      const copy: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(value)) {
        const child = watch(v, path + '.' + key);
        Object.defineProperty(copy, key, { get() {
          const id = path + '.' + key; reads.set(id, (reads.get(id) ?? 0) + 1); return child;
        } });
      }
      Object.defineProperty(copy, 'unknown', { get() { unknown++; throw Error('unknown getter'); } });
      return copy;
    };
    const input = watch(base());
    expect(build(input as AuralSongRankInput)).toEqual(build(base()));
    expect([...reads.values()].every(n => n === 1)).toBe(true);
    expect(unknown).toBe(0);
  });

  it('owns copied values before later getters mutate originals; reentry uses independent budgets', () => {
    const popularity: Pop[] = [{ songId: 'A', score: 1 }];
    const mutated = {
      ...base(),
      popularity,
      get percent() { popularity[0]!.score = null; return 50; },
    };
    expect(build(mutated).words[0]).toBe(1);
    expect(popularity[0]!.score).toBe(null);
    let nested: ReturnType<typeof build> | undefined;
    const outer = { ...base(), get percent() { nested = build({ ...base(), percent: 0 }); return 50; } };
    expect(build(outer)).toEqual(build(base()));
    expect(nested).toEqual(build({ ...base(), percent: 0 }));
    const error = new Error('caller getter');
    expect(() => build({ ...base(), get songByRank(): string[] { throw error; } })).toThrow(error);
  });

  it('packs unsigned32 low-bit-first words with explicit zero tail padding', () => {
    const ranks = Array.from({ length: 65 }, (_, i) => i === 0 || i === 31 || i === 32 || i === 63 || i === 64 ? 'yes' : 'no');
    const packed = build({ songByRank: ranks, validSongIds: ['yes'], popularity: [{ songId: 'yes', score: 1 }, { songId: 'no', score: 0 }], percent: 0 });
    expect(packed.words.length).toBe(3);
    expect(packed.words[0]).toBe((1 | (1 << 31)) >>> 0);
    expect(packed.words[1]).toBe((1 | (1 << 31)) >>> 0);
    expect(packed.words[2]).toBe(1);
    const padded = build({ songByRank: ['yes', ...Array(32).fill('absent')], validSongIds: ['yes'], popularity: [{ songId: 'yes', score: 1 }], percent: 0 });
    expect(padded.words).toEqual(Object.freeze([1, 0]));
  });

  it('freezes a fresh independent result and API; composes accepted rank index', () => {
    const a = build(freeze(base())), b = build(base({ percent: 0 }));
    expect(a).toEqual(build(base())); expect(a).not.toBe(b);
    expect(Object.isFrozen(a)).toBe(true); expect(Object.isFrozen(a.words)).toBe(true);
    expect(Object.isFrozen(auralSongRankApi)).toBe(true);
    expect(Object.keys(auralSongRankApi)).toEqual(['buildAuralSongRankFragment']);
    expect(() => { (a.words as number[]).push(1); }).toThrow(TypeError);
    const boundary = groups.find(g => g.name === 'packed-word-boundaries')!.probes[0]!;
    const fragment = build(boundary);
    const reader = createAuralRankEligibility(Uint32Array.from(fragment.words));
    for (const rank of [0, 31, 32, 63, 64]) expect(reader.hasAny(rank, rank)).toBe(true);
    expect(reader.hasAny(1, 1)).toBe(false);
    expect(reader.hasAny(33, 62)).toBe(false);
    expect(createAuralRankEligibility(Uint32Array.from(build(base({ songByRank: [] })).words)).isEmpty).toBe(true);
    expect(auralSongRankApi.buildAuralSongRankFragment(base()).rankCount).toBe(1);
  });
});
