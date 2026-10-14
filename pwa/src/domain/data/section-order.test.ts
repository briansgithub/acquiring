import { describe, expect, it } from 'vitest';
import type { ExtractedSection } from '../../contracts';
import { CANONICAL_SECTION_TYPES, canonicalSectionRank, sectionTypeKey, sectionsInSongOrder } from './index';
const section = (sectionName: string | null, sectionIndex?: number): ExtractedSection => ({ sectionName, sectionIndex, chords: [] });
const ids = (values: Map<string, ExtractedSection>) => sectionsInSongOrder(values).map(([id]) => id);

describe('Android SectionOrder fixtures', () => {
  it('prefers the earliest explicit occurrence of a duplicate section type', () => {
    expect(ids(new Map([
      ['late-verse', section('Verse', 4)], ['chorus', section('Chorus', 2)],
      ['intro', section('Intro', 0)], ['first-verse', section(' verse ', 1)],
    ]))).toEqual(['intro', 'first-verse', 'chorus']);
  });
  it('uses canonical legacy order and stable unknowns', () => {
    expect(ids(new Map([
      ['custom-a', section('Theme A')], ['outro', section('Outro')], ['solo-2', section('Solo 2')],
      ['chorus', section('Chorus')], ['verse-pre', section('Verse and Pre-Chorus')], ['verse', section('Verse')],
      ['intro', section('Intro')], ['bridge', section('Bridge')], ['solo-1', section('Solo 1')],
      ['custom-b', section('Theme B')],
    ]))).toEqual(['intro', 'verse', 'verse-pre', 'chorus', 'bridge', 'solo-1', 'solo-2', 'outro', 'custom-a', 'custom-b']);
    const ranks = CANONICAL_SECTION_TYPES.map(canonicalSectionRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(sectionTypeKey('Pre-Chorus')).toBe(sectionTypeKey(' pre chorus '));
  });
  it('handles partial indices, index ties, negative indices and blank vs missing names', () => {
    const original = section('Pre–Chorus', 2);
    const sections = new Map([
      ['legacy', section('Intro', -1)], ['late', section('pre_chorus')],
      ['explicit', original], ['tie-a', section('Theme A', 2)], ['tie-b', section('Theme B', 2)],
      ['blank-a', section('')], ['blank-b', section('  ')], ['missing-a', section(null)], ['missing-b', section(null)],
    ]);
    expect(ids(sections)).toEqual(['explicit', 'tie-a', 'tie-b', 'legacy', 'blank-a', 'blank-b', 'missing-a']);
    expect(sectionsInSongOrder(sections)[0][1]).toBe(original);
    expect(sections.size).toBe(9);
    expect(canonicalSectionRank('Solo 2000')).toBe(9999);
    expect(canonicalSectionRank('Solo 2147483648')).toBe(9000);
    expect(canonicalSectionRank('Bridge and Outro')).toBe(11500);
  });
});
