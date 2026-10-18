import { trimNativeWhitespace } from '../music/spelled-pitch';
import type {
  AuralChordConstraint, AuralChordConstraintInput, AuralChordFamily,
  AuralProgressionQuery, AuralProgressionQueryInput, AuralProgressionQueryApi,
} from './query-contracts';

const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const FAMILIES = ['any', 'major', 'minor', '7', 'maj7', 'm7'];
const MAX_TEXT = 1_048_576, MAX_STRING = 4096;
type Budget = { text: number };
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected object');
  return value as Record<string, unknown>;
}
function text(value: unknown, budget: Budget): string {
  if (typeof value !== 'string') throw new TypeError('Expected string');
  if (value.length > MAX_STRING || (budget.text += value.length) > MAX_TEXT) throw new RangeError('Text limit');
  return value;
}
function length(value: unknown, max: number): number {
  if (!Array.isArray(value)) throw new TypeError('Expected array');
  const count: unknown = value.length;
  if (typeof count !== 'number') throw new TypeError('Expected array length');
  if (!Number.isSafeInteger(count) || count < 0 || count > max) throw new RangeError('Array limit');
  return count;
}
function constraint(value: unknown, budget: Budget): AuralChordConstraint {
  const input = object(value);
  const degree = input.degree, rawAccidental = input.accidental, rawFamily = input.family;
  const rawExact = input.exact, rawInversion = input.inversion;
  if (typeof degree !== 'number') throw new TypeError('Expected degree');
  if (!Number.isInteger(degree) || degree < 1 || degree > 7) throw new RangeError('Invalid degree');
  const accidental = rawAccidental === undefined ? '' : text(rawAccidental, budget);
  const family = rawFamily === undefined ? 'any' : text(rawFamily, budget);
  const exact = rawExact === undefined || rawExact === null ? null : text(rawExact, budget);
  const inversion = rawInversion === undefined || rawInversion === null ? null : text(rawInversion, budget);
  if (accidental !== '' && accidental !== '♭' && accidental !== '♯') throw new RangeError('Invalid accidental');
  if (!FAMILIES.includes(family)) throw new RangeError('Invalid family');
  return Object.freeze({ degree, accidental, family: family as AuralChordFamily, exact, inversion });
}
function query(value: unknown, budget: Budget): AuralProgressionQuery {
  const input = object(value), rawVersion = input.version, rawChords = input.chords;
  const version = rawVersion === undefined ? 1 : rawVersion;
  if (typeof version !== 'number') throw new TypeError('Expected version');
  if (version !== 1) throw new RangeError('Invalid version');
  const chords: AuralChordConstraint[] = [];
  if (rawChords !== undefined) {
    const count = length(rawChords, 32), values = rawChords as unknown[];
    for (let i = 0; i < count; i++) chords.push(constraint(values[i], budget));
  }
  return Object.freeze({ version: 1, chords: Object.freeze(chords) });
}
function labels(value: unknown, budget: Budget): string[] {
  const count = length(value, 4096), values = value as unknown[], result: string[] = [];
  for (let i = 0; i < count; i++) result.push(text(values[i], budget));
  return result;
}
function canonical(label: string): string {
  return trimNativeWhitespace(label).replace(/^[b#]+/, prefix => prefix.replaceAll('b', '♭').replaceAll('#', '♯'))
    .replaceAll('#', '♯').replace(/b(?=[0-9])/g, '♭');
}
/** Private frozen AuralCorpus35..51 dependency; preserve permissive roman-prefix parsing. */
function startGroup(label: string) {
  const normalized = trimNativeWhitespace(label).replace(/^[b#]+/, prefix => prefix.replaceAll('b', '♭').replaceAll('#', '♯'));
  const match = /^([♭♯]*)([ivIV]+)([^/(]*)/.exec(normalized);
  if (!match) return null;
  const accidental = match[1], numeral = match[2], detail = match[3];
  const degree = ROMANS.indexOf(numeral.toUpperCase()) + 1;
  if (!degree) return null;
  const major = numeral === numeral.toUpperCase();
  const quality = detail.includes('ø') ? 'halfDiminished' : detail.includes('°') || detail.includes('o') ? 'diminished'
    : detail.includes('+') ? 'augmented' : major ? 'major' : 'minor';
  const seventh = /(?:7|9|11|13|65|43|42)/.test(detail.replace(/(?:add|sus)[0-9]+/g, ''));
  const seventhQuality = !seventh ? 'none' : detail.includes('△') || detail.includes('Δ') ? 'major'
    : quality === 'diminished' ? 'diminished' : 'minor';
  return { degree, accidental, quality, seventhQuality };
}
function compiled(value: AuralChordConstraint): AuralChordConstraint {
  return { ...value, exact: value.exact === null ? null : canonical(value.exact),
    inversion: value.inversion === null ? null : canonical(value.inversion) };
}
function matches(value: AuralChordConstraint, label: string, rootLabel: string): boolean {
  if (value.exact !== null) return rootLabel === value.exact && (value.inversion === null || label === value.inversion);
  if (label.includes('/')) return false;
  const group = startGroup(label);
  if (!group || group.degree !== value.degree || group.accidental !== value.accidental) return false;
  switch (value.family) {
    case 'any': return true;
    case 'major': case 'minor': return group.quality === value.family;
    case '7': return group.quality === 'major' && group.seventhQuality === 'minor';
    case 'maj7': return group.quality === 'major' && group.seventhQuality === 'major';
    case 'm7': return group.quality === 'minor' && group.seventhQuality === 'minor';
  }
}

export function createAuralChordConstraint(input: AuralChordConstraintInput): AuralChordConstraint {
  return constraint(input, { text: 0 });
}
export function createAuralProgressionQuery(input: AuralProgressionQueryInput = {}): AuralProgressionQuery {
  return query(input, { text: 0 });
}
export function auralChordConstraintLabel(input: AuralChordConstraint): string {
  const value = constraint(input, { text: 0 });
  return value.inversion ?? value.exact ?? value.accidental + ROMANS[value.degree - 1]
    + (value.family === 'any' ? '' : ' · ' + (value.family === 'major' ? 'Major' : value.family === 'minor' ? 'Minor' : value.family));
}
export function auralCanonicalChord(label: string): string {
  return canonical(text(label, { text: 0 }));
}
export function matchesAuralChordConstraint(input: AuralChordConstraint, label: string, rootLabel?: string): boolean {
  const budget = { text: 0 }, value = constraint(input, budget), written = text(label, budget);
  const root = rootLabel === undefined ? written : text(rootLabel, budget);
  return matches(compiled(value), canonical(written), canonical(root));
}
export function matchesAuralProgressionQuery(input: AuralProgressionQuery, inputLabels: readonly string[], rootLabels?: readonly string[]): boolean {
  const budget = { text: 0 }, value = query(input, budget), written = labels(inputLabels, budget);
  const roots = rootLabels === undefined ? written : labels(rootLabels, budget);
  if (written.length !== roots.length) throw new RangeError('Root label count must equal labels');
  if (!value.chords.length) return true;
  if (written.length < value.chords.length) return false;
  const forms = written.map(canonical), rootForms = roots === written ? forms : roots.map(canonical);
  const chords = value.chords.map(compiled);
  for (let start = 0; start <= forms.length - chords.length; start++) {
    let found = true;
    for (let i = 0; i < chords.length; i++) if (!matches(chords[i], forms[start + i], rootForms[start + i])) { found = false; break; }
    if (found) return true;
  }
  return false;
}
export const auralProgressionQueryApi: AuralProgressionQueryApi = Object.freeze({
  createAuralChordConstraint, createAuralProgressionQuery, auralChordConstraintLabel, auralCanonicalChord,
  matchesAuralChordConstraint, matchesAuralProgressionQuery,
});
