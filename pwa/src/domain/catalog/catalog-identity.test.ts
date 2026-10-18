import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import fixture from './fixtures/native-identity.json';
import { auralPatternId, auralCatalogIdentityApi } from './index';

beforeEach(() => { vi.stubGlobal('crypto', webcrypto); }); // actual Node WebCrypto; no substitute hash
 afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const pattern = /^p_[0-9a-f]{12}_[0-9]+_[0-9a-f]{32}$/;
describe('actual WebCrypto against frozen JVM identity oracle', () => {
  it.each(fixture.cases)('$name', async group => {
    for (const sample of group.cases) {
      const tokens = Object.freeze([...sample.tokens]);
      expect(await auralPatternId(tokens, sample.view)).toBe(sample.expected);
      expect(tokens).toEqual(sample.tokens);
    }
  });
});

describe('browser identity input safety and asynchronous isolation', () => {
  it('always rejects bad shapes and scalar types as a Promise without coercion', async () => {
    for (const tokens of [undefined, null, {}, 'I', new String('I'), 1, () => ['I']]) {
      let promise!: Promise<string>;
      expect(() => { promise = auralPatternId(tokens as never, ''); }).not.toThrow();
      await expect(promise).rejects.toBeInstanceOf(TypeError);
    }
    for (const token of [undefined, null, {}, new String('I'), 1, true, 1n]) await expect(auralPatternId([token] as never, '')).rejects.toBeInstanceOf(TypeError);
    for (const view of [undefined, null, {}, new String(''), 1, true]) await expect(auralPatternId([], view as never)).rejects.toBeInstanceOf(TypeError);
    await expect(auralPatternId(new Array(1), '')).rejects.toBeInstanceOf(TypeError);
  });

  it('refuses invalid UTF16 and resource overflow before making any digest request', async () => {
    const digest = vi.spyOn(crypto.subtle, 'digest');
    for (const invalid of ['\ud800', '\udfff', 'x\ud800y', '\ud800\ud800', '\udc00\ud800']) {
      await expect(auralPatternId([invalid], '')).rejects.toBeInstanceOf(RangeError);
      await expect(auralPatternId([], invalid)).rejects.toBeInstanceOf(RangeError);
    }
    await expect(auralPatternId(Array(10001).fill(''), '')).rejects.toBeInstanceOf(RangeError);
    await expect(auralPatternId(['x'.repeat(65537)], '')).rejects.toBeInstanceOf(RangeError);
    await expect(auralPatternId([], 'x'.repeat(4097))).rejects.toBeInstanceOf(RangeError);
    await expect(auralPatternId([...Array(128).fill('x'.repeat(65536)), 'x'], '')).rejects.toBeInstanceOf(RangeError);
    await expect(auralPatternId(Array(43).fill('€'.repeat(65536)), '')).rejects.toBeInstanceOf(RangeError); // UTF8 bytes, not UTF16 count
    expect(digest).not.toHaveBeenCalled();
  });

  it('accepts exact count/string/UTF8 boundaries with real hashes and separate namespace budget', async () => {
    expect(await auralPatternId(Array(10000).fill(''), '')).toMatch(/^p_[0-9a-f]{12}_10000_[0-9a-f]{32}$/);
    expect(await auralPatternId(Array(128).fill('x'.repeat(65536)), 'v'.repeat(4096))).toMatch(/^p_[0-9a-f]{12}_128_[0-9a-f]{32}$/);
    expect(await auralPatternId(['😀'.repeat(32768)], '')).toMatch(pattern);
  }, 20000);

  it('reads length/indexes once, bounds before copying, and ignores all input iterators/unknown properties', async () => {
    let lengthReads = 0, indexReads = 0, iteratorReads = 0;
    const sample = fixture.cases[2].cases[0];
    const tokens = new Proxy([...sample.tokens], { get(target, key, receiver) {
      if (key === 'length') lengthReads++;
      else if (typeof key === 'string' && /^[0-9]+$/.test(key)) indexReads++;
      else if (key === Symbol.iterator) { iteratorReads++; throw Error('iterator'); }
      else throw Error('unknown property');
      return Reflect.get(target, key, receiver);
    } });
    const pending = auralPatternId(tokens, sample.view);
    expect(lengthReads).toBe(1); expect(indexReads).toBe(sample.tokens.length);
    expect(await pending).toBe(sample.expected); expect(iteratorReads).toBe(0);
    for (const count of [10001, -1, 1.5, '1']) {
      let copied = false;
      const invalid = new Proxy([], { get(target, key, receiver) {
        if (key === 'length') return count;
        if (key === '0') copied = true;
        return Reflect.get(target, key, receiver);
      } });
      await expect(auralPatternId(invalid, '')).rejects.toBeInstanceOf(typeof count === 'string' ? TypeError : RangeError);
      expect(copied).toBe(false);
    }
  });

  it('encodes every caller byte before the first wait so later mutation cannot change remaining tokens', async () => {
    const sample = fixture.cases[2].cases[0], tokens = [...sample.tokens];
    const original = crypto.subtle.digest.bind(crypto.subtle);
    let resume!: () => void;
    const gate = new Promise<void>(resolve => { resume = resolve; });
    const digest = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => { await gate; return original(...args); });
    const pending = auralPatternId(tokens, sample.view);
    expect(digest).toHaveBeenCalledTimes(1);
    tokens[0] = 'mutated first'; tokens[1] = 'mutated later'; tokens.length = 0;
    resume(); expect(await pending).toBe(sample.expected);
  });

  it('isolates reentrant calls/getter exceptions and performs real hashing without a shared cache', async () => {
    const outer = fixture.cases[2].cases[0], inner = fixture.cases[1].cases[0];
    let nested!: Promise<string>, reads = 0;
    const tokens = [...outer.tokens];
    Object.defineProperty(tokens, 0, { get() { reads++; nested = auralPatternId(inner.tokens, inner.view); return outer.tokens[0]; } });
    const pending = auralPatternId(tokens, outer.view);
    expect(reads).toBe(1); expect(await pending).toBe(outer.expected); expect(await nested).toBe(inner.expected);
    const error = Error('caller getter');
    await expect(auralPatternId(new Proxy(['I'], { get(target, key, receiver) {
      if (key === '0') throw error; return Reflect.get(target, key, receiver);
    } }), '')).rejects.toBe(error);
    const digest = vi.spyOn(crypto.subtle, 'digest');
    expect(await Promise.all([auralPatternId(inner.tokens, inner.view), auralPatternId(inner.tokens, inner.view)]))
      .toEqual([inner.expected, inner.expected]);
    expect(digest).toHaveBeenCalledTimes(2 * (inner.tokens.length + 1));
  });

  it('propagates real-API crypto failure without input mutation and allows a new independent call', async () => {
    const sample = fixture.cases[2].cases[0], tokens = [...sample.tokens], error = Error('crypto rejected');
    const digest = vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(error);
    await expect(auralPatternId(tokens, sample.view)).rejects.toBe(error);
    expect(tokens).toEqual(sample.tokens); expect(digest).toHaveBeenCalledTimes(1);
    expect(await auralPatternId(tokens, sample.view)).toBe(sample.expected);
    vi.stubGlobal('crypto', undefined);
    await expect(auralPatternId([], '')).rejects.toBeInstanceOf(TypeError);
  });

  it('exports a frozen one-function Promise API and preserves the query exports', async () => {
    expect(Object.isFrozen(auralCatalogIdentityApi)).toBe(true);
    expect(Object.keys(auralCatalogIdentityApi)).toEqual(['auralPatternId']);
    const sample = fixture.cases[0].cases[0];
    expect(await auralCatalogIdentityApi.auralPatternId(sample.tokens, sample.view)).toBe(sample.expected);
  });
});
