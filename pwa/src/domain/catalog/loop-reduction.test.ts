import { describe, expect, it } from 'vitest';
import fixture from './fixtures/native-loop.json';
import { auralReduceLoop as reduce, auralRetainedChildren as children,
  AURAL_LOOP_REDUCTION_VERSION, auralLoopReductionApi } from './index';

describe('unchanged native loop reference', () => {
  it.each(fixture.sharedCases)('shared authority case $#', sample => {
    expect(reduce(Object.freeze([...sample.tokens]))).toEqual({ redundant: sample.redundant, start: sample.start, length: sample.length });
  });
  it.each(fixture.cases)('$name', sample => {
    const tokens = Object.freeze([...sample.tokens]);
    expect(AURAL_LOOP_REDUCTION_VERSION).toBe(sample.version);
    expect(reduce(tokens)).toEqual(sample.expected.reduction);
    expect(children(tokens)).toEqual(sample.expected.children);
    expect(tokens).toEqual(sample.tokens);
  });
});

describe('browser loop input and work boundaries', () => {
  it('validates every token before short returns and rejects shapes/types without coercion', () => {
    for (const operation of [reduce, children]) {
      for (const value of [undefined, null, 'I', {}, 1, () => ['I']]) expect(() => operation(value as never)).toThrow(TypeError);
      for (const value of [undefined, null, 1, true, {}, new String('I')]) expect(() => operation([value] as never)).toThrow(TypeError);
      expect(() => operation(new Array(1))).toThrow(TypeError);
      expect(() => operation(['I', null] as never)).toThrow(TypeError);
    }
  });

  it('accepts exact input caps and rejects overflows measured as raw UTF16 units', () => {
    const max = 'x'.repeat(65536);
    expect(reduce(Array(10000).fill('')).redundant).toBe(true);
    expect(reduce(Array(128).fill(max)).redundant).toBe(true); // exactly8388608 UTF16 units
    for (const operation of [reduce, children]) {
      expect(() => operation(Array(10001).fill(''))).toThrow(RangeError);
      expect(() => operation([max + 'x'])).toThrow(RangeError);
      expect(() => operation([...Array(128).fill(max), 'x'])).toThrow(RangeError);
      expect(() => operation(['😀'.repeat(32768) + 'x'])).toThrow(RangeError);
    }
    expect(children([max, max])).toEqual([]); // full validation still applies to short input
  });

  it('enforces examined-span work before reduction and throws instead of returning an existing partial frontier', () => {
    const small = Array(100).fill('I') as string[];
    expect(children(small)).toEqual([['I', 'I']]);
    const large = Array(300).fill('I') as string[];
    const prior = [...large];
    expect(() => children(large)).toThrow(RangeError);
    expect(large).toEqual(prior);
    // The first dropLAST child is nonredundant; the later repetitive branch exhausts work.
    expect(() => children(['different', ...large])).toThrow(RangeError);
    expect(children(['I', 'I', 'I'])).toEqual([['I', 'I']]);
  });

  it('reads length/indexes once, never invokes caller iterators, and caps before copying', () => {
    const sample = fixture.cases.find(row => row.tokens.length >= 6)!;
    for (const operation of [reduce, children]) {
      let lengths = 0, indexed = 0, iterators = 0;
      const tokens = new Proxy([...sample.tokens], { get(target, key, receiver) {
        if (key === 'length') lengths++;
        else if (typeof key === 'string' && /^[0-9]+$/.test(key)) indexed++;
        else if (key === Symbol.iterator) { iterators++; throw Error('iterator'); }
        else throw Error('unknown property');
        return Reflect.get(target, key, receiver);
      } });
      operation(tokens);
      expect(lengths).toBe(1); expect(indexed).toBe(sample.tokens.length); expect(iterators).toBe(0);
      for (const count of [10001, -1, 1.5, '1']) {
        let touched = false;
        const invalid = new Proxy([], { get(target, key, receiver) {
          if (key === 'length') return count;
          if (key === '0') touched = true;
          return Reflect.get(target, key, receiver);
        } });
        expect(() => operation(invalid)).toThrow(typeof count === 'string' ? TypeError : RangeError);
        expect(touched).toBe(false);
      }
    }
  });

  it('keeps reentrant snapshots/budgets independent and propagates exact getter exceptions', () => {
    const sample = fixture.cases.find(row => row.tokens.length >= 6)!;
    const full = Array(128).fill('x'.repeat(65536)) as string[];
    let reads = 0;
    const tokens = [...sample.tokens];
    Object.defineProperty(tokens, 0, { get() { reads++; expect(reduce(full).redundant).toBe(true); return sample.tokens[0]; } });
    expect(reduce(tokens)).toEqual(sample.expected.reduction); expect(reads).toBe(1);
    reads = 0; expect(children(tokens)).toEqual(sample.expected.children); expect(reads).toBe(1);
    const error = Error('original getter error');
    for (const operation of [reduce, children]) expect(() => operation(new Proxy(['I'], { get(target, key, receiver) {
      if (key === '0') throw error; return Reflect.get(target, key, receiver);
    } }))).toThrow(error);
  });

  it('preserves raw malformed UTF16 and distinguishes structural token boundaries', () => {
    const raw = '\ud800';
    expect(reduce([raw, raw, raw])).toEqual(reduce(['I', 'I', 'I']));
    expect(children([raw, raw, raw])).toEqual([[raw, raw]]);
    const boundaries = ['a\u0000b', 'c', 'a', 'b\u0000c'];
    expect(children(boundaries)).toEqual([boundaries.slice(0, 3), boundaries.slice(1)]);
    const distinct = ['a,b', 'c', 'a', 'b,c'];
    expect(children(distinct)).toEqual([distinct.slice(0, 3), distinct.slice(1)]);
  });

  it('returns fresh deeply frozen independent reduction/child results and a frozen two-function API', () => {
    const sample = fixture.cases.find(row => row.expected.children.length > 0)!;
    const input = [...sample.tokens], result = reduce(input), first = children(input), second = children(input);
    input[0] = 'mutated'; input.push('new');
    expect(result).toEqual(sample.expected.reduction); expect(first).toEqual(sample.expected.children);
    expect(first).not.toBe(second); expect(first[0]).not.toBe(second[0]);
    expect([result, first, first[0], auralLoopReductionApi].every(Object.isFrozen)).toBe(true);
    expect(() => { (first[0] as string[]).push('mutated'); }).toThrow(TypeError);
    expect(reduce([])).not.toBe(reduce([])); expect(children([])).not.toBe(children([]));
    expect(Object.keys(auralLoopReductionApi)).toEqual(['auralReduceLoop', 'auralRetainedChildren']);
    expect(auralLoopReductionApi.auralReduceLoop(sample.tokens)).toEqual(sample.expected.reduction);
    expect(auralLoopReductionApi.auralRetainedChildren(sample.tokens)).toEqual(sample.expected.children);
  });
});
