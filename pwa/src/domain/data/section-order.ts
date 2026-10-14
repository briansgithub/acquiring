import type { ExtractedSection } from '../../contracts';
import { intOrUndefined } from './primitives';
import { safeSectionName } from './section-metadata';

export const CANONICAL_SECTION_TYPES = [
  'Intro', 'Intro and Verse', 'Verse', 'Verse and Pre-Chorus', 'Pre-Chorus',
  'Pre-Chorus and Chorus', 'Chorus', 'Chorus Lead-Out', 'Bridge', 'Solo',
  'Instrumental', 'Pre-Outro', 'Outro',
] as const;

export function normalizeSectionType(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase().replace(/[\u2010-\u2014]/g, '-').replace(/[ \t\n\x0b\f\r]+/g, ' ');
}
export function sectionTypeKey(name: string | null | undefined): string {
  return normalizeSectionType(name).replace(/[-_ \t\n\x0b\f\r]+/g, ' ').trim();
}
export function canonicalSectionRank(name: string | null | undefined): number {
  const words = sectionTypeKey(name).replace(/[^a-z0-9]+/g, ' ').trim();
  const ordinal = Math.min(intOrUndefined(/\b([0-9]+)$/.exec(words)?.[1]) ?? 0, 999);
  const combined: [string, number][] = [
    ['intro and verse', 1000], ['verse and pre chorus', 3000],
    ['pre chorus and chorus', 5000], ['chorus lead out', 7000],
    ['bridge and outro', 11500], ['pre outro', 11000],
  ];
  for (const [phrase, rank] of combined) if (words.includes(phrase)) return rank + ordinal;
  const simple: [string, number][] = [
    ['intro', 0], ['verse', 2000], ['pre chorus', 4000], ['chorus', 6000],
    ['bridge', 8000], ['solo', 9000], ['instrumental', 10000], ['outro', 12000],
  ];
  for (const [phrase, rank] of simple) if (new RegExp('\\b' + phrase + '\\b').test(words)) return rank + ordinal;
  return 100000;
}

/** Return raw IDs and original section objects; first source position breaks ties. */
export function sectionsInSongOrder(sections: ReadonlyMap<string, ExtractedSection>): [string, ExtractedSection][] {
  const byType = new Map<string, { entry: [string, ExtractedSection]; position: number; index?: number; rank: number }>();
  let position = 0;
  for (const entry of sections) {
    const section = entry[1];
    const type = sectionTypeKey(safeSectionName(section)) || '\u0000' + position;
    const index = section.sectionIndex != null && section.sectionIndex >= 0 ? section.sectionIndex : undefined;
    const candidate = { entry, position: position++, index, rank: canonicalSectionRank(safeSectionName(section)) };
    const current = byType.get(type);
    if (!current || index !== undefined && (current.index === undefined || index < current.index)) byType.set(type, candidate);
  }
  const unique = [...byType.values()];
  const explicit = unique.some(item => item.index !== undefined);
  return unique.sort((a, b) => {
    if (explicit) {
      if (a.index !== undefined && b.index !== undefined && a.index !== b.index) return a.index - b.index;
      if (a.index !== undefined && b.index === undefined) return -1;
      if (a.index === undefined && b.index !== undefined) return 1;
    }
    return a.rank - b.rank || a.position - b.position;
  }).map(item => item.entry);
}
