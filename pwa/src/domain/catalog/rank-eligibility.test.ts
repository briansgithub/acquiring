import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import native from './fixtures/native-rank-eligibility.json';
import { createAuralRankEligibility, auralRankEligibilityApi } from './rank-eligibility';

describe('unchanged native rank eligibility, Kotlin2.2.10', () => {
  for (const row of native.cases) it(row.name, () => {
    const input = new Uint32Array(row.words), reader = createAuralRankEligibility(input);
    expect(reader.isEmpty).toBe(row.isEmpty);
    expect(row.spans.map(([start, end]) => reader.hasAny(start!, end!))).toEqual(row.expected);
    input.fill(0xffffffff);
    expect(row.spans.map(([start, end]) => reader.hasAny(start!, end!))).toEqual(row.afterMutation);
  });
});

describe('browser domain and ownership', () => {
  it('uses a subview and cross-realm Uint32Array without caller properties', () => {
    const storage = new Uint32Array([0xffffffff, 1, 0, 8, 0xffffffff]);
    const input = storage.subarray(1, 4);
    for (const key of ['constructor', 'length', 'buffer', 'byteOffset', 'set', Symbol.iterator])
      Object.defineProperty(input, key, { get() { throw new Error('caller surface used'); } });
    const reader = createAuralRankEligibility(input);
    expect(reader.hasAny(0, 0)).toBe(true);
    expect(reader.hasAny(1, 66)).toBe(false);
    expect(reader.hasAny(67, 67)).toBe(true);
    expect(reader.hasAny(68, 1000)).toBe(false);
    const foreign = runInNewContext('new Uint32Array([1,0,8])') as Uint32Array;
    expect(createAuralRankEligibility(foreign).hasAny(67, 67)).toBe(true);
  });
  it('rejects wrong brands, proxies, detached and shared buffers', () => {
    for (const input of [null, {}, [], new Uint8Array(4), new Float32Array(1), new Proxy(new Uint32Array(1), {})])
      expect(() => createAuralRankEligibility(input as Uint32Array)).toThrow(TypeError);
    const detached = new Uint32Array([1]);
    structuredClone(detached.buffer, { transfer: [detached.buffer] });
    expect(() => createAuralRankEligibility(detached)).toThrow(TypeError);
    expect(() => createAuralRankEligibility(new Uint32Array(new SharedArrayBuffer(4)))).toThrow(TypeError);
    const sharedForeign = runInNewContext('new Uint32Array(new SharedArrayBuffer(4))') as Uint32Array;
    expect(() => createAuralRankEligibility(sharedForeign)).toThrow(TypeError);
  });
  it('rejects non-signed32 endpoints before empty or reversed early exits', () => {
    const reader = createAuralRankEligibility(new Uint32Array());
    for (const value of [NaN, Infinity, -Infinity, 0.1, -2147483649, 2147483648]) {
      expect(() => reader.hasAny(value, 0)).toThrow(RangeError);
      expect(() => reader.hasAny(10, value)).toThrow(RangeError);
    }
    for (const value of ['0', null, undefined, 1n, {}])
      expect(() => reader.hasAny(value as number, 0)).toThrow(TypeError);
    expect(reader.hasAny(-2147483648, 2147483647)).toBe(false);
    expect(reader.hasAny(0, -1)).toBe(false);
  });
  it('accepts the exact packed-word cap and refuses one beyond', () => {
    expect(createAuralRankEligibility(new Uint32Array(8388608)).isEmpty).toBe(true);
    expect(() => createAuralRankEligibility(new Uint32Array(8388609))).toThrow(RangeError);
  });
  it('freezes a minimal independent API and keeps different readers isolated', () => {
    const a = createAuralRankEligibility(new Uint32Array([1]));
    const b = createAuralRankEligibility(new Uint32Array([2]));
    expect(Object.isFrozen(a)).toBe(true); expect(Object.isFrozen(auralRankEligibilityApi)).toBe(true);
    expect(Object.keys(a).sort()).toEqual(['hasAny', 'isEmpty']);
    expect(a.hasAny(0, 0)).toBe(true); expect(b.hasAny(0, 0)).toBe(false);
    expect(a.hasAny(1, 1)).toBe(false); expect(b.hasAny(1, 1)).toBe(true);
    expect(auralRankEligibilityApi.createAuralRankEligibility(new Uint32Array()).isEmpty).toBe(true);
  });
});
