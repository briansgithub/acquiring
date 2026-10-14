import type { KeyInfo } from '../../contracts';
import { NOTE_TO_PC, SCALE_INTERVALS, MAJOR_LABELS, MINOR_LABELS } from './tables';
import { floorMod, normalizeWrittenAccidentals, SpelledPitch, trimNativeWhitespace } from './spelled-pitch';

export function normalizeTonic(tonic: string): string { return trimNativeWhitespace(tonic); }
export function getModifierValue(text: string): number {
  let value = 0;
  for (const character of text) {
    if (character === '#' || character === '♯') value++;
    else if (character === 'b' || character === '♭') value--;
    else if (character === 'x') value += 2;
  }
  return value;
}
function nativePositiveInt(text: string): number | null {
  if (!/^[0-9]+$/.test(text)) return null;
  const value = Number(text);
  return value <= 2147483647 ? value : null;
}
/** The permissive legacy MIDI helper collects digits; written pitch resolution is stricter. */
export function getRawDegree(sd: string): number { return nativePositiveInt(sd.replace(/[^0-9]/g, '')) ?? 1; }
function lookup<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

export function generateScaleLabels(tonic: string, intervals: readonly number[]): string[] {
  const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const normalized = normalizeTonic(tonic);
  const base = normalized.slice(0, 1).toUpperCase();
  const index = letters.indexOf(base);
  if (index === -1) return letters;
  if (intervals.length < 7) throw new RangeError('Scale intervals must contain seven degrees');
  const tonicPc = floorMod((lookup(NOTE_TO_PC, base) ?? 0) + getModifierValue(normalized.slice(1)), 12);
  return letters.map((_, degree) => {
    const targetPc = (tonicPc + intervals[degree]) % 12;
    const letter = letters[(index + degree) % 7];
    for (const accidental of ['', 'b', '#', 'bb', '##', 'x']) {
      const candidate = letter + accidental;
      if ((lookup(NOTE_TO_PC, candidate) ?? -1) === targetPc) return candidate;
    }
    let alteration = floorMod(targetPc - (lookup(NOTE_TO_PC, letter) ?? 0), 12);
    if (alteration > 6) alteration -= 12;
    return letter + (alteration < 0 ? 'b'.repeat(-alteration) : '#'.repeat(alteration));
  });
}

export function getNoteLabel(degree: number | string, tonic: string, scale: string, customIntervals?: readonly number[]): string {
  if (typeof degree === 'string') {
    const base = getNoteLabel(getRawDegree(degree), tonic, scale, customIntervals);
    const accidental = getModifierValue(base.slice(1)) + getModifierValue(degree);
    return base.slice(0, 1) + (accidental < 0 ? 'b'.repeat(-accidental) : '#'.repeat(accidental));
  }
  const normalized = normalizeTonic(tonic);
  const intervals = scale === 'custom' && customIntervals != null
    ? customIntervals : lookup(SCALE_INTERVALS, scale) ?? SCALE_INTERVALS.major;
  const labels = (scale === 'major' ? lookup(MAJOR_LABELS, normalized)
    : scale === 'minor' ? lookup(MINOR_LABELS, normalized) : undefined) ?? generateScaleLabels(normalized, intervals);
  return labels[floorMod(degree - 1, 7)] ?? 'C';
}

export function resolveScaleDegreePitch(
  sd: string, relativeOctave: number, key: KeyInfo, baseOctave = 4, customIntervals?: readonly number[],
): SpelledPitch | null {
  const normalized = normalizeWrittenAccidentals(sd);
  if (!/^[#bx]*[1-9][0-9]*$/.test(normalized)) return null;
  const rawDegree = nativePositiveInt(normalized.replace(/^[#bx]*/, ''));
  if (rawDegree === null) return null;
  const degreeBase0 = rawDegree - 1;
  const base = SpelledPitch.parse(getNoteLabel(floorMod(degreeBase0, 7) + 1, key.tonic, key.scale, customIntervals), 0);
  const tonic = SpelledPitch.parse(key.tonic, baseOctave);
  if (!base || !tonic) return null;
  const staff = tonic.staffPosition + degreeBase0 + relativeOctave * 7;
  return new SpelledPitch(base.letter, base.accidental + getModifierValue(normalized), Math.floor(staff / 7));
}

export function getDegreeLabelFromSpelling(pitch: SpelledPitch, key: KeyInfo): string {
  const tonic = SpelledPitch.parse(key.tonic, pitch.octave);
  if (!tonic) return '';
  const degree = floorMod(pitch.letter.index - tonic.letter.index, 7) + 1;
  const expected = resolveScaleDegreePitch(String(degree), 0, key, pitch.octave);
  if (!expected) return '';
  const alteration = pitch.accidental - expected.accidental;
  return (alteration > 0 ? '♯'.repeat(alteration) : '♭'.repeat(-alteration)) + degree + '\u0302';
}

/** Native audio pitch helper; intentionally retains its lookup/fallback and degree-zero semantics. */
export function getMidiNote(sd: string, octave: number, key: KeyInfo): number {
  const degreeBase0 = getRawDegree(sd) - 1;
  const tonicPc = lookup(NOTE_TO_PC, normalizeTonic(key.tonic)) ?? 0;
  const intervals = lookup(SCALE_INTERVALS, key.scale) ?? SCALE_INTERVALS.major;
  const absolute = tonicPc + intervals[floorMod(degreeBase0, 7)] + getModifierValue(sd);
  return (5 + octave + Math.trunc(degreeBase0 / 7) + Math.floor(absolute / 12)) * 12 + floorMod(absolute, 12);
}

function closestDegreeLabel(relativePc: number, intervals: readonly number[], preferHigher: boolean): string {
  let bestDegree = 1, bestDifference = 99;
  for (let i = 0; i < 7; i++) {
    const difference = relativePc - intervals[i];
    const absolute = Math.abs(difference > 6 ? difference - 12 : difference < -6 ? difference + 12 : difference);
    if (absolute < bestDifference || preferHigher && absolute === bestDifference && i + 1 > bestDegree) {
      bestDifference = absolute; bestDegree = i + 1;
    }
  }
  const difference = relativePc - intervals[bestDegree - 1];
  const normalized = difference > 6 ? difference - 12 : difference < -6 ? difference + 12 : difference;
  const prefix = normalized === -1 ? '♭' : normalized === -2 ? '♭♭' : normalized === 1 ? '♯' : normalized === 2 ? '♯♯' : '';
  return prefix + bestDegree + '\u0302';
}
export function getDegreeLabelFromMidi(midi: number, key: KeyInfo): string {
  const tonicPc = lookup(NOTE_TO_PC, normalizeTonic(key.tonic)) ?? 0;
  return closestDegreeLabel((midi % 12 - tonicPc + 12) % 12, lookup(SCALE_INTERVALS, key.scale) ?? SCALE_INTERVALS.major, false);
}
export function getRelativeDegreeLabel(midi: number, rootMidi: number): string {
  return closestDegreeLabel((midi % 12 - rootMidi % 12 + 12) % 12, SCALE_INTERVALS.major, true);
}
