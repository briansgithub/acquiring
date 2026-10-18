import { describe, expect, it } from 'vitest';
import fixture from './fixtures/native-query.json';
import {
  createAuralChordConstraint as constraint, createAuralProgressionQuery as query,
  auralCanonicalChord as canonical, auralChordConstraintLabel as label,
  matchesAuralChordConstraint as matches, matchesAuralProgressionQuery as matchesQuery,
  auralProgressionQueryApi,
} from './index';
import type { AuralChordConstraint, AuralChordConstraintInput, AuralProgressionQueryInput } from './index';

type Probe = {
  kind: string; label?: string; constraint?: AuralChordConstraintInput; query?: AuralProgressionQueryInput;
  checks?: { label: string; rootLabel?: string }[]; labels?: string[]; rootLabels?: string[];
  expected: { failure?: boolean; canonical?: string; constraint?: AuralChordConstraint; label?: string;
    query?: ReturnType<typeof query>; matches?: boolean | boolean[] };
};
const groups = fixture.cases as unknown as { name: string; probes: Probe[] }[];
describe('frozen native query oracle', () => {
  it.each(groups)('$name', group => {
    for (const probe of group.probes) {
      if (probe.expected.failure) {
        expect(() => probe.kind === 'constraint' ? constraint(probe.constraint!) : query(probe.query)).toThrow(RangeError);
      } else if (probe.kind === 'canonical') expect(canonical(probe.label!)).toBe(probe.expected.canonical);
      else if (probe.kind === 'constraint') {
        const value = constraint(probe.constraint!);
        expect(value).toEqual(probe.expected.constraint);
        expect(label(value)).toBe(probe.expected.label);
        expect(probe.checks!.map(check => matches(value, check.label, check.rootLabel))).toEqual(probe.expected.matches);
      } else {
        const value = query(probe.query);
        expect(value).toEqual(probe.expected.query);
        expect(matchesQuery(value, probe.labels!, probe.rootLabels)).toBe(probe.expected.matches);
      }
    }
  });
});

describe('browser typed boundary and independent pure snapshots', () => {
  it('rejects wrong shapes/types without coercion or alias/default inventions', () => {
    for (const value of [null, true, 1, 'I', [], () => 1]) expect(() => constraint(value as never)).toThrow(TypeError);
    for (const value of [null, [], 'query', 0]) expect(() => query(value as never)).toThrow(TypeError);
    for (const value of [undefined, null, {}, 1, true, new String('I')]) expect(() => canonical(value as never)).toThrow(TypeError);
    for (const degree of ['1', null, true, 1n, {}]) expect(() => constraint({ degree } as never)).toThrow(TypeError);
    for (const degree of [0, 8, 1.5, NaN, Infinity]) expect(() => constraint({ degree })).toThrow(RangeError);
    for (const field of ['accidental', 'family', 'exact', 'inversion']) expect(() => constraint({ degree: 1, [field]: 2 } as never)).toThrow(TypeError);
    for (const field of ['accidental', 'family']) expect(() => constraint({ degree: 1, [field]: null } as never)).toThrow(TypeError);
    for (const accidental of ['b', '#', '♭♭']) expect(() => constraint({ degree: 1, accidental })).toThrow(RangeError);
    for (const family of ['Major', 'min', 'diminished']) expect(() => constraint({ degree: 1, family })).toThrow(RangeError);
    for (const version of [null, '1', true]) expect(() => query({ version } as never)).toThrow(TypeError);
    for (const version of [0, 2, 1.5, NaN, Infinity]) expect(() => query({ version })).toThrow(RangeError);
    for (const chords of [null, {}, 'I']) expect(() => query({ chords } as never)).toThrow(TypeError);
    expect(constraint({ degree: 1, accidental: undefined, family: undefined, exact: undefined, inversion: undefined }))
      .toEqual({ degree: 1, accidental: '', family: 'any', exact: null, inversion: null });
    expect(query(undefined)).toEqual({ version: 1, chords: [] });
    expect(() => matches(constraint({ degree: 1 }), 'I', null as never)).toThrow(TypeError);
    expect(() => matchesQuery(query(), [], null as never)).toThrow(TypeError);
  });

  it('validates every known input before empty-query, early-match or too-short returns', () => {
    const value = constraint({ degree: 1 });
    expect(() => matchesQuery(query(), [null] as never)).toThrow(TypeError);
    expect(() => matchesQuery(query({ chords: [value] }), ['I', null] as never)).toThrow(TypeError);
    expect(() => matchesQuery(query({ chords: [value, value] }), ['I'], [undefined] as never)).toThrow(TypeError);
    expect(() => matchesQuery({ version: 1, chords: [{ degree: 8 }] } as never, [])).toThrow(RangeError);
    expect(() => matches({ ...value, family: 'invalid' } as never, 'I')).toThrow(RangeError);
    expect(() => label({ ...value, exact: 'I', degree: 8 })).toThrow(RangeError);
    expect(() => matches({ ...value, exact: 'I', inversion: false } as never, 'I', 'different')).toThrow(TypeError);
    expect(() => query({ chords: new Array(1) })).toThrow(TypeError);
    expect(() => matchesQuery(query(), new Array(1))).toThrow(TypeError);
    for (const roots of [[], ['I', 'I']]) expect(() => matchesQuery(query(), ['I'], roots)).toThrow(RangeError);
    for (const values of [null, {}, 'I']) expect(() => matchesQuery(query(), values as never)).toThrow(TypeError);
  });

  it('applies exact string/text/count caps including constraint text and explicitly supplied roots', () => {
    const max = 'x'.repeat(4096), over = max + 'x';
    expect(canonical(max)).toBe(max);
    expect(() => canonical(over)).toThrow(RangeError);
    for (const field of ['accidental', 'family', 'exact', 'inversion']) expect(() => constraint({ degree: 1, [field]: over })).toThrow(RangeError);
    expect(matchesQuery(query(), Array(4096).fill(''))).toBe(true);
    expect(() => matchesQuery(query(), Array(4097).fill(''))).toThrow(RangeError);
    expect(() => matchesQuery(query(), [], Array(4097).fill(''))).toThrow(RangeError);
    expect(query({ chords: Array(32).fill(constraint({ degree: 1 })) }).chords).toHaveLength(32);
    expect(() => query({ chords: Array(33).fill(constraint({ degree: 1 })) })).toThrow(RangeError);
    const full = Array(256).fill(max) as string[];
    expect(matchesQuery(query(), full)).toBe(true); // omitted roots are not counted a second time
    expect(() => matchesQuery(query(), [...full, 'x'])).toThrow(RangeError);
    expect(() => matchesQuery(query(), full, full)).toThrow(RangeError);
    expect(() => matchesQuery(query({ chords: [constraint({ degree: 1, exact: 'I' })] }), full)).toThrow(RangeError);
  });

  it('caps array lengths before reading indexes and never invokes caller iterators', () => {
    let indexes = 0, iterators = 0;
    const oversized = new Proxy(new Array(4097), { get(target, key, receiver) {
      if (key === '0') { indexes++; throw Error('index touched'); }
      return Reflect.get(target, key, receiver);
    } });
    expect(() => matchesQuery(query(), oversized)).toThrow(RangeError);
    const manyChords = new Proxy(new Array(33), { get(target, key, receiver) {
      if (key === '0') { indexes++; throw Error('index touched'); }
      return Reflect.get(target, key, receiver);
    } });
    expect(() => query({ chords: manyChords })).toThrow(RangeError);
    const hostile = <T>(values: T[]): T[] => Object.defineProperty(values, Symbol.iterator, { get() { iterators++; throw Error('iterator touched'); } });
    const value = query({ chords: hostile([constraint({ degree: 1 })]) });
    expect(matchesQuery(value, hostile(['I']), hostile(['I']))).toBe(true);
    expect(indexes).toBe(0); expect(iterators).toBe(0);
    for (const count of ['1', -1, 1.5, 4097]) {
      const array = new Proxy([], { get(target, key, receiver) { return key === 'length' ? count : Reflect.get(target, key, receiver); } });
      expect(() => matchesQuery(query(), array)).toThrow(typeof count === 'string' ? TypeError : RangeError);
    }
  });

  it('reads only known fields and each logical array length/index exactly once', () => {
    const counts: Record<string, number> = {};
    const hit = (key: string) => { counts[key] = (counts[key] ?? 0) + 1; };
    const fields: Record<string, unknown> = { degree: 1, accidental: '', family: 'any', exact: 'I', inversion: null };
    const raw: Record<string, unknown> = {};
    for (const key of Object.keys(fields)) Object.defineProperty(raw, key, { get() { hit(key); return fields[key]; } });
    Object.defineProperty(raw, 'unknown', { get() { throw Error('unknown field'); } });
    const array = <T>(key: string, values: T[]) => new Proxy(values, { get(target, property, receiver) {
      if (property === 'length' || property === '0') hit(key + '.' + String(property));
      if (property === Symbol.iterator) throw Error('iterator');
      return Reflect.get(target, property, receiver);
    } });
    const chords = array('chords', [raw]);
    const input = { get version() { hit('version'); return 1; }, get chords() { hit('chords'); return chords; },
      get ignored() { throw Error('unknown query field'); } };
    expect(matchesQuery(input as never, array('labels', ['I']), array('roots', ['I']))).toBe(true);
    expect(Object.keys(counts)).toHaveLength(13);
    expect(Object.values(counts).every(count => count === 1)).toBe(true);
    const factoryCounts = { degree: 0, exact: 0 };
    expect(label({ get degree() { factoryCounts.degree++; return 1; }, get exact() { factoryCounts.exact++; return 'I'; } } as never)).toBe('I');
    expect(factoryCounts).toEqual({ degree: 1, exact: 1 });
  });

  it('keeps nested calls and budgets independent and propagates getter errors', () => {
    const full = Array(256).fill('x'.repeat(4096)) as string[];
    let calls = 0;
    const input = { get degree() { calls++; expect(matchesQuery(query(), full)).toBe(true); return 1; }, exact: 'I' };
    expect(constraint(input).exact).toBe('I'); expect(calls).toBe(1);
    const error = new Error('original getter failure');
    expect(() => constraint({ get degree() { throw error; } } as never)).toThrow(error);
    expect(() => matchesQuery(query(), new Proxy(['I'], { get(target, key, receiver) {
      if (key === '0') { expect(label(constraint({ degree: 5 }))).toBe('V'); throw error; }
      return Reflect.get(target, key, receiver);
    } }))).toThrow(error);
    expect(matchesQuery(query({ chords: [constraint({ degree: 1 })] }), ['I'])).toBe(true);
  });

  it('returns deeply frozen independent factories and a frozen six-function API', () => {
    const original = { degree: 1, accidental: '', family: 'any', exact: null, inversion: null };
    const first = constraint(original), second = constraint(original), input = [original];
    const a = query({ chords: input } as never), b = query({ chords: input } as never);
    original.degree = 5; original.family = 'minor'; input.push(original);
    expect(first).toEqual(second); expect(first).not.toBe(second);
    expect(a.chords).toHaveLength(1); expect(a.chords[0].degree).toBe(1);
    expect(a).not.toBe(b); expect(a.chords).not.toBe(b.chords); expect(a.chords[0]).not.toBe(b.chords[0]);
    expect([first, second, a, a.chords, a.chords[0], auralProgressionQueryApi].every(Object.isFrozen)).toBe(true);
    expect(() => { (a.chords as unknown[]).push(first); }).toThrow(TypeError);
    expect(Object.keys(auralProgressionQueryApi)).toHaveLength(6);
    expect(auralProgressionQueryApi.matchesAuralProgressionQuery(a, ['I'])).toBe(true);
  });
});
