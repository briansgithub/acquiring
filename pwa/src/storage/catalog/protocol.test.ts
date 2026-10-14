import { describe, expect, it } from 'vitest';
import { stagedPath } from './protocol';
describe('catalog staging ownership', () => {
  it('keeps an immutable attempt and known file inside the staging namespace', () => {
    expect(stagedPath('12345678-1234-1234-1234-123456789012', 'aural-catalog.db')).toBe('/staging/12345678-1234-1234-1234-123456789012/aural-catalog.db');
  });
  it('rejects arbitrary file paths and malformed attempt IDs', () => {
    expect(() => stagedPath('../active', 'aural-catalog.db')).toThrow();
    expect(() => stagedPath('12345678-1234-1234-1234-123456789012', '../user.db')).toThrow();
  });
});
