import { describe, expect, it } from 'vitest';
import native from './fixtures/native-random.json';
import {
  KotlinRandom, jvmStringHash, kotlinListText, kotlinUIntHex, parseKotlinLongSeed, wrapKotlinInt,
} from './kotlin-random';
import type { KotlinListValue } from './kotlin-random';

// Expected sequences come only from native Kotlin2.2.10, in the producer's exact draw order.
describe('private Kotlin2.2.10 Random(Long) native anchors', () => {
  for (const row of native.cases) {
    it('matches complete native draw order for seed ' + row.seed, () => {
      const rng = new KotlinRandom(row.seed);
      expect(Array.from({length:8}, () => rng.nextInt())).toEqual(row.raw);
      expect(row.bitCounts.map(count => rng.nextBits(count))).toEqual(row.bits);
      expect(row.bounds.map(bound => rng.nextInt(bound))).toEqual(row.bounded);
      expect(Array.from({length:64}, () => rng.nextInt(1073741825))).toEqual(row.rejection);
      expect(row.rejectionDraws).toBeGreaterThan(64);
      expect([
        rng.nextInt(-10, 10), rng.nextInt(-2147483648, 0),
        rng.nextInt(-2147483648, 2147483647), rng.nextInt(-2000000000, 2000000000),
      ]).toEqual(row.ranges);
      expect(Array.from({length:4}, () => rng.nextDouble())).toEqual(row.doubles);
      const values = Object.freeze([...row.values]);
      expect(rng.shuffled(values)).toEqual(row.shuffle);
      expect(rng.shuffled(values)).toEqual(row.secondShuffle);
      expect(rng.shuffled([])).toEqual(row.empty);
      expect(rng.shuffled(['only'])).toEqual(row.singleton);
      expect(rng.choose(values)).toBe(row.chosen);
      expect(rng.choose(['only'])).toBe(row.singleChoice);
      expect(Array.from({length:3}, () => rng.nextInt())).toEqual(row.tail);
      expect(values).toEqual(row.values);
    });
  }

  it('keeps exact canonical signed64 seeds, including neighboring values above Number precision', () => {
    for (const row of native.cases) expect(parseKotlinLongSeed(row.seed).toString()).toBe(row.seed);
    for (const value of ['', '00', '-0', '+1', '01', ' 1', '1 ', '1\n', '1.0', '1e2',
      '9223372036854775808', '-9223372036854775809', '1'.repeat(100)]) {
      expect(() => new KotlinRandom(value)).toThrow(RangeError);
    }
    expect(() => parseKotlinLongSeed(1 as unknown as string)).toThrow(RangeError);
    expect(native.cases.find(row => row.seed === '9007199254740992')?.raw)
      .not.toEqual(native.cases.find(row => row.seed === '9007199254740993')?.raw);
    expect(native.cases.find(row => row.seed === '1')?.raw)
      .not.toEqual(native.cases.find(row => row.seed === '4294967297')?.raw);
  });

  it('rejects invalid domains before consuming random state', () => {
    const rng = new KotlinRandom('1');
    const untouched = new KotlinRandom('1');
    for (const value of [0, -1, 1.5, NaN, Infinity, 2147483648]) expect(() => rng.nextInt(value)).toThrow(RangeError);
    for (const value of [-1, 33, 0.5, NaN]) expect(() => rng.nextBits(value)).toThrow(RangeError);
    expect(() => rng.nextInt(8, 8)).toThrow(RangeError);
    expect(() => rng.nextInt(2, 1)).toThrow(RangeError);
    expect(() => rng.nextInt(-2147483649, 1)).toThrow(RangeError);
    expect(() => rng.choose([])).toThrow(RangeError);
    expect(rng.nextInt()).toBe(untouched.nextInt());
  });

  it('retains native no-draw shuffle and draw-consuming singleton choice/bits0', () => {
    const rng = new KotlinRandom('0');
    const reference = new KotlinRandom('0');
    expect(rng.shuffled([])).toEqual([]);
    expect(rng.shuffled(['only'])).toEqual(['only']);
    expect(rng.nextInt()).toBe(reference.nextInt());
    expect(rng.choose(['only'])).toBe('only');
    reference.nextInt();
    expect(rng.nextBits(0)).toBe(0);
    reference.nextInt();
    expect(rng.nextInt()).toBe(reference.nextInt());
  });

  it('copies lists by bounded index without consulting an overridden iterator', () => {
    const values = ['I', 'V', 'vi'];
    Object.defineProperty(values, Symbol.iterator, {value:() => {throw new Error('unexpected iterator');}});
    const rng = new KotlinRandom('1');
    expect(rng.shuffled(values).slice().sort()).toEqual(['I', 'V', 'vi'].sort());
    expect(values[0]).toBe('I');
  });
});

describe('JVM identity formatting for native generator inputs', () => {
  it('matches UTF16 String.hashCode and unsigned unpadded hex, including surrogate pairs and lone surrogates', () => {
    for (const row of native.hashes) {
      expect(jvmStringHash(String.fromCharCode(...row.utf16))).toBe(row.hash);
      expect(kotlinUIntHex(jvmStringHash(String.fromCharCode(...row.utf16)))).toBe(row.hex);
    }
    expect(kotlinUIntHex(-1)).toBe('ffffffff');
    expect(kotlinUIntHex(0)).toBe('0');
  });

  it('matches nested Kotlin List.toString and joinToString used by fingerprints', () => {
    for (const row of native.lists) {
      const value = row.value as KotlinListValue[];
      expect(kotlinListText(value)).toBe(row.text);
      const joined = value.map(kotlinListText).join('|');
      expect(joined).toBe(row.joined);
      expect(jvmStringHash(joined)).toBe(row.hash);
      expect(kotlinUIntHex(jvmStringHash(joined))).toBe(row.hex);
    }
  });

  it('matches wrapped Int conversions and rejects unsupported identity types', () => {
    for (const [input, output] of native.wrap) expect(wrapKotlinInt(input)).toBe(output);
    expect(() => wrapKotlinInt(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
    expect(() => kotlinUIntHex(2147483648)).toThrow(RangeError);
    expect(() => kotlinListText(1.5)).toThrow(RangeError);
    expect(() => kotlinListText({} as KotlinListValue)).toThrow(TypeError);
    expect(() => jvmStringHash(null as unknown as string)).toThrow(TypeError);
  });
});
