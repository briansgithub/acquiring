/** Display-only helpers from Android ChordInterpreter.kt; keep raw and normalized custom arrays distinct. */
import type { JsonObject, JsonValue, KeyInfo } from '../../contracts';
import { CHORD_QUALITIES, NOTE_TO_PC, SCALE_INTERVALS } from './tables';
import { floorMod } from './spelled-pitch';
import { getModifierValue, getNoteLabel } from './theory';

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
export const BORROWED_TAG: Readonly<Record<string, string>> = {
  minor: 'min', dorian: 'dor', phrygian: 'phr', lydian: 'lyd', mixolydian: 'mix', locrian: 'loc', major: 'maj', harmonicMinor: 'hmin', phrygianDominant: 'phdm',
};
export function lookup<T>(table: Readonly<Record<string, T>>, key: string): T | undefined { return Object.hasOwn(table, key) ? table[key] : undefined; }
export function intOrNull(value: JsonValue | undefined): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[+-]?[0-9]+$/.test(value))) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= -2147483648 && number <= 2147483647 ? number : null;
}
export function safeInt(value: JsonValue | undefined, fallback = 0): number { return intOrNull(value) ?? fallback; }
export function safeString(value: JsonValue | undefined, fallback = ''): string { return value != null && typeof value !== 'object' ? String(value) : fallback; }
export function safeBoolean(value: JsonValue | undefined): boolean { return value === true || value === 'true'; }
export function ints(value: JsonValue | undefined): number[] {
  return Array.isArray(value) ? value.map(intOrNull).filter((item): item is number => item !== null) : [];
}
export function strings(value: JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter(item => item != null && typeof item !== 'object').map(item => String(item)) : [];
}
export function customBorrowedIntervals(value: JsonValue | undefined): readonly number[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length === 0) return SCALE_INTERVALS.major;
  const result: number[] = [];
  for (let index = 0; index < 7; index++) result.push(floorMod(index < value.length ? safeInt(value[index]) : (result.at(-1) ?? 0) + 2, 12));
  return result;
}
export function rawCustomBorrowedIntervals(value: JsonValue | undefined): number[] | null {
  if (!Array.isArray(value)) return null;
  const values = ints(value); return values.length >= 7 ? values : null;
}
export function customChordQualities(intervals: readonly number[]): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const root = intervals[i];
    let third = intervals[(i + 2) % 7], fifth = intervals[(i + 4) % 7];
    if (third < root) third += 12;
    if (fifth < root) fifth += 12;
    third -= root; fifth -= root;
    return third === 3 && fifth === 6 ? 'diminished' : third === 4 && fifth === 8 ? 'augmented' : third === 4 ? 'major' : 'minor';
  });
}
export function customArrayTriadQuality(intervals: readonly number[], degree: number): string {
  const at = (index: number) => intervals[floorMod(index - 1, 7)];
  const root = at(degree), third = floorMod(at(degree + 2) - root, 12), fifth = floorMod(at(degree + 4) - root, 12);
  if (third === 4 && fifth === 7) return 'major';
  if (third === 3 && fifth === 7) return 'minor';
  if (third === 3 && fifth === 6) return 'diminished';
  if (third === 4 && fifth === 8) return 'augmented';
  return third <= 3 ? 'minor' : 'major';
}
export function customArrayPrefix(intervals: readonly number[], degree: number, key: KeyInfo): string {
  const reference = lookup(SCALE_INTERVALS, key.scale) ?? SCALE_INTERVALS.major;
  const delta = intervals[degree - 1] - reference[degree - 1];
  return delta === -2 ? '♭♭' : delta === -1 ? '♭' : delta === 1 ? '♯' : delta === 2 ? '♯♯' : '';
}
export function customArraySeventhMajor(intervals: readonly number[], degree: number): boolean {
  return floorMod(intervals[floorMod(degree + 5, 7)] - intervals[floorMod(degree - 1, 7)], 12) === 11;
}
export function isTriSubApplied(chord: JsonObject): boolean { return safeInt(chord.applied) === 5 && strings(chord.substitutions).includes('tri'); }
export function notePitchClass(note: string, uppercase = false): number | null {
  const natural = lookup(NOTE_TO_PC, uppercase ? note.slice(0, 1).toUpperCase() : note.slice(0, 1));
  return natural == null ? null : floorMod(natural + getModifierValue(note.slice(1)), 12);
}
export function isMajorSeventh(degree: number, key: KeyInfo, custom?: readonly number[]): boolean {
  try {
    const root = notePitchClass(getNoteLabel(degree, key.tonic, key.scale, custom));
    const seventh = notePitchClass(getNoteLabel(floorMod(degree - 1 + 6, 7) + 1, key.tonic, key.scale, custom));
    return root !== null && seventh !== null && (seventh - root + 12) % 12 === 11;
  } catch { return false; }
}
export function borrowedPrefix(degree: number, key: KeyInfo, scale: string): string {
  try {
    const borrowed = getNoteLabel(degree, key.tonic, scale), reference = getNoteLabel(degree, key.tonic, key.scale || 'major');
    const delta = getModifierValue(borrowed) - getModifierValue(reference);
    return delta === -2 ? '♭♭' : delta === -1 ? '♭' : delta === 1 ? '♯' : delta === 2 ? '♯♯' : '';
  } catch { return ''; }
}
export function triadQualityWithAlts(base: string, chord: JsonObject): string {
  const alterations = strings(chord.alterations);
  if (alterations.includes('#5') && base === 'diminished') return 'minor';
  if (alterations.includes('b5') && base === 'minor') return 'diminished';
  return base;
}
export function appliedTarget(chord: JsonObject, key: KeyInfo): [string, string] {
  const root = safeInt(chord.root), borrowed = safeString(chord.borrowed);
  const raw = rawCustomBorrowedIntervals(chord.borrowed), custom = raw ? customBorrowedIntervals(chord.borrowed) : null;
  const scale = custom ? 'custom' : lookup(BORROWED_TAG, borrowed) !== undefined ? borrowed : key.scale;
  const target = getNoteLabel(root, key.tonic, scale, custom ?? undefined);
  const quality = (custom ? customChordQualities(custom) : lookup(CHORD_QUALITIES, scale) ?? CHORD_QUALITIES.major)[root - 1];
  const original = getNoteLabel(root, key.tonic, key.scale);
  let shift = (notePitchClass(target) ?? 0) - (notePitchClass(original) ?? 0);
  while (shift > 6) shift -= 12;
  while (shift < -6) shift += 12;
  const prefix = shift < 0 ? '♭'.repeat(-shift) : '♯'.repeat(shift);
  const roman = quality === 'minor' || quality === 'diminished' ? (ROMAN[root] ?? '').toLowerCase() : ROMAN[root] ?? '';
  return [target, prefix + roman + (quality === 'diminished' ? '°' : quality === 'augmented' ? '+' : '')];
}
