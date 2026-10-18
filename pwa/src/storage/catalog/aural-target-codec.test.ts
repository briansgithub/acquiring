import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import fixture from '../../domain/catalog/fixtures/native-target.json';
import { decodeAuralCatalogRun as decode, createAuralCatalogTarget as target } from './aural-target-codec';
import type { AuralRunBlobInput, AuralDecodedCatalogRun, AuralCatalogPatternTarget } from './aural-target-contracts';
interface Probe {
  name: string; rowId: number; stableId: string; view: string; song: string; section: string; revision: string;
  supportsModeAnalysis: boolean; tokensGzip: string; positionsGzip: string; tokensRaw: string; positionsRaw: string; keyRaw: string; sourceKeyRaw: string;
  suffix: number[]; start: number; end: number; length: number; snapshotId: string;
  expected: { failure?: boolean; run?: AuralDecodedCatalogRun; target?: AuralCatalogPatternTarget & { failure?: boolean } };
}
const groups = fixture.cases as unknown as { name: string; probes: Probe[] }[];
function input(probe: Probe): AuralRunBlobInput {
  return { id: probe.rowId, stableId: probe.stableId, view: probe.view, song: probe.song, section: probe.section,
    revision: probe.revision, supportsModeAnalysis: probe.supportsModeAnalysis,
    tokens: new Uint8Array(Buffer.from(probe.tokensGzip, 'base64')), positions: new Uint8Array(Buffer.from(probe.positionsGzip, 'base64')),
    keyJson: probe.keyRaw, sourceKeyJson: probe.sourceKeyRaw };
}
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('actual native complete run and target reference', () => {
  it.each(groups)('$name', async group => {
    for (const probe of group.probes) {
      if (probe.expected.failure) { await expect(decode(input(probe))).rejects.toMatchObject({ code: 'INTEGRITY' }); continue; }
      const run = await decode(input(probe));
      expect(run).toEqual(probe.expected.run);
      expect([run, run.tokens, run.positions, run.positions[0], run.positions[0]?.notes, run.key, run.sourceKey].filter(Boolean).every(Object.isFrozen)).toBe(true);
      const span = { offset: probe.suffix[1], length: probe.length, start: probe.start, end: probe.end, snapshotId: probe.snapshotId };
      if (probe.expected.target!.failure) await expect(target(run, span)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
      else expect(await target(run, span)).toEqual(probe.expected.target);
    }
  });
});

const base = groups[0].probes[0];
const gzip = (value: string | Uint8Array): Uint8Array => new Uint8Array(gzipSync(value));
const positions = (patch: Record<string, unknown> = {}): string => JSON.stringify([{ ...JSON.parse(base.positionsRaw)[0], ...patch }]);
const span = { offset: 0, length: 1, start: 0, end: 77, snapshotId: base.snapshotId };
function changed(patch: Partial<AuralRunBlobInput> = {}): AuralRunBlobInput { return { ...input(base), ...patch }; }

describe('bounded browser codec and target behavior', () => {
  it('uses actual gzip only, refuses corruption/invalid UTF8, and never leaks raw data in errors', async () => {
    for (const tokens of [new TextEncoder().encode(base.tokensRaw), gzip(base.tokensRaw).slice(0, 8), gzip(new Uint8Array([0xc3, 0x28]))]) {
      await expect(decode(changed({ tokens }))).rejects.toMatchObject({ name: 'CatalogError', code: 'INTEGRITY' });
    }
    await expect(decode(changed({ tokens: gzip('secret malformed raw data') }))).rejects.toMatchObject({ message: 'Invalid aural catalog data' });
    for (const value of [null, {}, []]) await expect(decode(value as never)).rejects.toMatchObject({ code: 'INTEGRITY' });
    await expect(decode(changed({ tokens: [] as never }))).rejects.toMatchObject({ code: 'INTEGRITY' });
    await expect(decode(changed({ supportsModeAnalysis: 1 as never }))).rejects.toMatchObject({ code: 'INTEGRITY' });
  });

  it('validates every known duplicate in encounter order, ignores unknowns, and preserves raw numeric eligibility', async () => {
    for (const raw of [positions().replace('"degree":"V7"', '"degree":1,"degree":"V7"'),
      positions().replace('"startIndex":0', '"startIndex":1.0,"startIndex":0'),
      positions().replace('"roman":"V65"', '"varyingBass":17,"varyingBass":false,"roman":"V65"')]) {
      await expect(decode(changed({ positions: gzip(raw) }))).rejects.toMatchObject({ code: 'INTEGRITY' });
    }
    await expect(decode(changed({ keyJson: '{"tonic":17,"tonic":"C","scale":"major"}' }))).rejects.toMatchObject({ code: 'INTEGRITY' });
    const escapedInt = positions().replace('"startIndex":0', '"startIndex":"' + String.fromCharCode(92) + 'u0031"');
    await expect(decode(changed({ positions: gzip(escapedInt) }))).rejects.toMatchObject({ code: 'INTEGRITY' });
    const valid = positions().replace('"degree":"V7"', '"degree":"old","degree":"new","unknown":{"__proto__":{"polluted":true}}');
    const run = await decode(changed({ positions: gzip(valid) }));
    expect(run.positions[0].degree).toBe('new'); expect(Object.getPrototypeOf(run.positions[0])).toBe(Object.prototype);
    expect(Object.hasOwn(run.positions[0], 'unknown')).toBe(false); expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
  });

  it('captures every used field/byte once before awaits and never reads legacy sourceKeyJson or byte iterators', async () => {
    const original = input(base), counts: Record<string, number> = {};
    for (const bytes of [original.tokens, original.positions]) {
      Object.defineProperty(bytes, Symbol.iterator, { get() { throw Error('byte iterator'); } });
      Object.defineProperty(bytes, 'constructor', { get() { throw Error('byte constructor'); } });
    }
    const row = new Proxy(original, { get(object, key, receiver) {
      if (typeof key !== 'string' || !Object.hasOwn(object, key)) throw Error('unknown field');
      counts[key] = (counts[key] ?? 0) + 1; return Reflect.get(object, key, receiver);
    } });
    const pending = decode(row);
    original.tokens.fill(0); original.positions.fill(0);
    (original as { view: string }).view = 'mutated'; (original as { keyJson: string }).keyJson = 'invalid';
    expect(await pending).toEqual(base.expected.run);
    expect(Object.values(counts).every(n => n === 1)).toBe(true); expect(Object.keys(counts)).toHaveLength(11);
    const legacy = changed({ supportsModeAnalysis: false });
    Object.defineProperty(legacy, 'sourceKeyJson', { get() { throw Error('legacy unused source getter'); } });
    const run = await decode(legacy);
    expect(run.sourceKey).toEqual(run.key); expect(run.sourceKey).not.toBe(run.key);
    const error = Error('caller hook');
    await expect(decode(new Proxy(changed(), { get(object, key, receiver) {
      if (key === 'id') throw error; return Reflect.get(object, key, receiver);
    } }))).rejects.toMatchObject({ code: 'INTEGRITY', message: 'Invalid aural catalog data' });
  });

  it('enforces compressed/inflated/key/string/token budgets with actual decompression', async () => {
    await expect(decode(changed({ tokens: new Uint8Array(8 * 1048576 + 1) }))).rejects.toMatchObject({ code: 'LIMIT' });
    await expect(decode(changed({ positions: new Uint8Array(8 * 1048576 + 1) }))).rejects.toMatchObject({ code: 'LIMIT' });
    const exact = base.tokensRaw.padEnd(16 * 1048576, ' ');
    expect((await decode(changed({ tokens: gzip(exact) }))).tokens).toEqual(base.expected.run!.tokens);
    await expect(decode(changed({ tokens: gzip(exact + ' ') }))).rejects.toMatchObject({ code: 'LIMIT' });
    const keyAtCap = base.keyRaw.padEnd(65536, ' ');
    expect((await decode(changed({ keyJson: keyAtCap, sourceKeyJson: keyAtCap }))).key).toEqual(base.expected.run!.key);
    await expect(decode(changed({ sourceKeyJson: keyAtCap + ' ' }))).rejects.toMatchObject({ code: 'LIMIT' });
    await expect(decode(changed({ keyJson: JSON.stringify({ tonic: '€'.repeat(30000), scale: '' }) }))).rejects.toMatchObject({ code: 'LIMIT' });
    const max = 'x'.repeat(65536);
    expect((await decode(changed({ tokens: gzip(JSON.stringify(Array(128).fill(max))) }))).tokens).toHaveLength(128);
    await expect(decode(changed({ tokens: gzip(JSON.stringify([...Array(128).fill(max), 'x'])) }))).rejects.toMatchObject({ code: 'LIMIT' });
    await expect(decode(changed({ tokens: gzip(JSON.stringify([max + 'x'])) }))).rejects.toMatchObject({ code: 'LIMIT' });
    await expect(decode(changed({ view: 'x'.repeat(4097) }))).rejects.toMatchObject({ code: 'LIMIT' });
  }, 20000);

  it('bounds collections/depth/JSON tokens and keeps nested calls independent', async () => {
    expect((await decode(changed({ tokens: gzip(JSON.stringify(Array(10000).fill(''))) }))).tokens).toHaveLength(10000);
    await expect(decode(changed({ tokens: gzip(JSON.stringify(Array(10001).fill(''))) }))).rejects.toMatchObject({ code: 'LIMIT' });
    expect((await decode(changed({ positions: gzip(positions({ notes: Array(10000).fill(0) })) }))).positions[0].notes).toHaveLength(10000);
    await expect(decode(changed({ positions: gzip(positions({ notes: Array(10001).fill(0) })) }))).rejects.toMatchObject({ code: 'LIMIT' });
    const nested = (n: number) => { let result: unknown = 0; for (let i = 0; i < n; i++) result = [result]; return result; };
    expect((await decode(changed({ positions: gzip(positions({ unknown: nested(30) })) }))).positions).toEqual(base.expected.run!.positions);
    await expect(decode(changed({ positions: gzip(positions({ unknown: nested(31) })) }))).rejects.toMatchObject({ code: 'LIMIT' });
    const many = Array.from({ length: 13 }, () => Array(10000).fill(0));
    await expect(decode(changed({ positions: gzip(positions({ unknown: many })) }))).rejects.toMatchObject({ code: 'LIMIT' });
    let inner!: Promise<AuralDecodedCatalogRun>, calls = 0;
    const outer = changed(); Object.defineProperty(outer, 'id', { get() { calls++; inner = decode(changed()); return base.rowId; } });
    expect(await decode(outer)).toEqual(base.expected.run); expect(await inner).toEqual(base.expected.run); expect(calls).toBe(1);
  });

  it('implements bounded Java finite Double rounding and original Int/Boolean lexical rules', async () => {
    const cases: [string, number][] = [['0x1p-1074', Number.MIN_VALUE], ['0x1p-1075', 0], ['0x3p-1075', 2 * Number.MIN_VALUE],
      ['0x1.fffffffffffffp1023', Number.MAX_VALUE], ['0x1.00000000000008p0', 1], ['0x1.00000000000018p0', 1 + 2 ** -51], ['-0x0p999999999999999999999', -0]];
    for (const [value, expected] of cases) expect((await decode(changed({ positions: gzip(positions({ startBeat: value })) }))).positions[0].startBeat).toBe(expected);
    for (const value of ['0x1.fffffffffffff8p1023', '1e309', 'NaN', 'Infinity']) await expect(decode(changed({ positions: gzip(positions({ startBeat: value })) }))).rejects.toMatchObject({ code: 'INTEGRITY' });
    expect((await decode(changed({ positions: gzip(positions({ startBeat: '0x1p-' + '9'.repeat(10000) })) }))).positions[0].startBeat).toBe(0);
    await expect(decode(changed({ positions: gzip(positions({ startBeat: '0x1p' + '9'.repeat(10000) })) }))).rejects.toMatchObject({ code: 'INTEGRITY' });
    await expect(decode(changed({ positions: gzip(positions({ varyingBass: ' true ' })) }))).rejects.toMatchObject({ code: 'INTEGRITY' });
    await expect(decode(changed({ positions: gzip(positions({ startIndex: ' 1 ' })) }))).rejects.toMatchObject({ code: 'INTEGRITY' });
  });

  it('snapshots only used target values before actual identity awaits and preserves identity refusal', async () => {
    const decoded = await decode(input(base));
    const run = { ...decoded, tokens: [...decoded.tokens], positions: decoded.positions.map(p => ({ ...p, notes: [...p.notes] })) };
    Object.defineProperty(run, 'id', { get() { throw Error('unused target id'); } });
    Object.defineProperty(run.positions[0], 'roman', { get() { throw Error('unused target roman'); } });
    const original = crypto.subtle.digest.bind(crypto.subtle); let resume!: () => void;
    const gate = new Promise<void>(resolve => { resume = resolve; });
    vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => { await gate; return original(...args); });
    const request = { ...span }, pending = target(run, request);
    run.tokens[0] = 'mutated'; run.positions[0].degree = 'mutated'; run.view = 'mutated'; request.snapshotId = 'mutated';
    resume(); const result = await pending;
    expect(result).toEqual(base.expected.target); expect([result, result.tokens, result.labels].every(Object.isFrozen)).toBe(true);
    await expect(target({ ...decoded, tokens: [String.fromCharCode(0xd800)] }, span)).rejects.toBeInstanceOf(RangeError);
    for (const patch of [{ offset: -1 }, { length: -1 }, { length: 10001 }, { offset: 2 }, { start: 2147483648 }, { end: NaN }]) {
      await expect(target(decoded, { ...span, ...patch })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    }
    const zero = await target(decoded, { ...span, offset: 1, length: 0, start: -2147483648, end: 2147483647 });
    expect(zero.tokens).toEqual([]); expect(zero.start).toBe(-2147483648); expect(zero.end).toBe(2147483647);
    const again = await decode(input(base)); expect(again).not.toBe(decoded); expect(again.key).not.toBe(decoded.key);
  });
});
