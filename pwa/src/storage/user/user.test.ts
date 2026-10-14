import { describe, expect, it } from 'vitest';
import { accountNamespace, canonicalJson } from './index';
describe('durable user commands', () => {
  it('canonicalizes object key order and preserves array order', () => {
    expect(canonicalJson({ b: 2, a: { z: 3, y: [2, 1] } })).toBe(canonicalJson({ a: { y: [2, 1], z: 3 }, b: 2 }));
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
  it('rejects values that cannot survive JSON synchronization', () => {
    expect(() => canonicalJson(NaN)).toThrow();
    expect(() => canonicalJson({ bad: undefined } as never)).toThrow();
    expect(() => canonicalJson(new Date() as never)).toThrow();
    expect(() => canonicalJson(Array(2))).toThrow();
  });
  it('isolates account IDs using their stable normalized UUID', () => {
    expect(accountNamespace('12345678-1234-ABCD-1234-123456789012')).toBe('account:12345678-1234-abcd-1234-123456789012');
    expect(() => accountNamespace('guest')).toThrow();
  });
});
