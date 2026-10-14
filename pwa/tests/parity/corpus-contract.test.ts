import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CorpusCase } from '../../src/contracts';
const corpus = JSON.parse(readFileSync(new URL('../../../contracts/fixtures/corpus_parity.json', import.meta.url), 'utf8')) as CorpusCase[];
describe('Android shared corpus input contract', () => {
  it('loads distinct authoritative cases and intact source chord JSON', () => {
    expect(corpus.length).toBeGreaterThan(0);
    expect(new Set(corpus.map(item => item.id)).size).toBe(corpus.length);
    for (const item of corpus) {
      expect(item.id).toBeTypeOf('string');
      expect(JSON.parse(item.json)).toBeTypeOf('object');
      expect(item.key.tonic).toBeTypeOf('string');
      expect(item.key.scale).toBeTypeOf('string');
      expect(item.expectedRoman).toBeTypeOf('string');
      expect(item.expectedLetter).toBeTypeOf('string');
      expect(item.expectedPcs.every(pc => Number.isInteger(pc) && pc >= 0 && pc < 12)).toBe(true);
      expect(item.expectedMidi.every(Number.isInteger)).toBe(true);
      expect(item.expectedToneLabels.every(label => typeof label === 'string')).toBe(true);
    }
  });
});
