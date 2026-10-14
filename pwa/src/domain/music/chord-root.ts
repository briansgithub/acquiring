/** Written-root interpretation port from Android ChordInterpreter.kt at 801cf798. */
import type { JsonObject, JsonValue, KeyInfo } from '../../contracts';
import { CHORD_QUALITIES, SCALE_INTERVALS } from './tables';
import { floorMod, SpelledPitch } from './spelled-pitch';
import { resolveScaleDegreePitch } from './theory';

export type ChordRootContext = 'STANDARD' | 'BORROWED' | 'CUSTOM_BORROWED' | 'APPLIED'
  | 'BORROWED_APPLIED' | 'TRITONE_SUBSTITUTION';
export interface ResolvedChordRoot {
  readonly pitch: SpelledPitch;
  /** Fixed written register used by native simple-mode root playback. */
  readonly simpleModePitch: SpelledPitch;
  readonly sourceDegree: number;
  readonly effectiveDegree: number;
  readonly sourceKey: KeyInfo;
  readonly effectiveKey: KeyInfo;
  readonly customIntervals: readonly number[] | null;
  readonly chordQuality: string;
  readonly context: ChordRootContext;
  readonly genericStepsFromTonic: number;
  readonly specificSemitonesFromTonic: number;
}

function safeInt(value: JsonValue | undefined, fallback = 0): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[+-]?[0-9]+$/.test(value))) return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number >= -2147483648 && number <= 2147483647 ? number : fallback;
}
function safeString(value: JsonValue | undefined, fallback = ''): string {
  return value != null && typeof value !== 'object' ? String(value) : fallback;
}
function safeBoolean(value: JsonValue | undefined): boolean { return value === true || value === 'true'; }
function strings(value: JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter(item => item != null && typeof item !== 'object').map(item => String(item)) : [];
}
function lookup<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}
function customBorrowedIntervals(value: JsonValue | undefined): readonly number[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length === 0) return SCALE_INTERVALS.major;
  const intervals: number[] = [];
  for (let index = 0; index < 7; index++) {
    const interval = index < value.length ? safeInt(value[index]) : (intervals.at(-1) ?? 0) + 2;
    intervals.push(floorMod(interval, 12));
  }
  return intervals;
}
function customChordQualities(intervals: readonly number[]): string[] {
  return Array.from({ length: 7 }, (_, index) => {
    const root = intervals[index];
    let third = intervals[(index + 2) % 7], fifth = intervals[(index + 4) % 7];
    if (third < root) third += 12;
    if (fifth < root) fifth += 12;
    third -= root; fifth -= root;
    if (third === 3 && fifth === 6) return 'diminished';
    if (third === 4 && fifth === 8) return 'augmented';
    return third === 4 ? 'major' : 'minor';
  });
}
const NAMED_BORROWING = new Set(['minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian', 'major', 'harmonicMinor', 'phrygianDominant']);
function withOctave(pitch: SpelledPitch, octave: number): SpelledPitch {
  return new SpelledPitch(pitch.letter, pitch.accidental, octave);
}

/** Resolve spelling/context independently of chord voicing. Octave arguments match Kotlin Int. */
export function resolveChordRoot(chord: JsonObject, key: KeyInfo, referenceOctave = 3): ResolvedChordRoot | null {
  const root = safeInt(chord.root);
  if (safeBoolean(chord.isRest) || safeBoolean(chord.rest)) return null;
  if (root < 1 || root > 7) {
    if (root !== 0) return null;
    const rootName = safeString(chord._letterRootName);
    const pitch = SpelledPitch.parse(rootName, referenceOctave);
    const tonic = SpelledPitch.parse(key.tonic, referenceOctave);
    if (!pitch || !tonic) return null;
    const genericSteps = floorMod(pitch.letter.index - tonic.letter.index, 7);
    const registered = withOctave(pitch, Math.floor((tonic.staffPosition + genericSteps) / 7));
    return {
      pitch: registered, simpleModePitch: pitch, sourceDegree: root, effectiveDegree: 1,
      sourceKey: key, effectiveKey: { tonic: rootName, scale: 'major' }, customIntervals: null,
      chordQuality: safeString(chord._letterQuality, 'major'), context: 'STANDARD',
      genericStepsFromTonic: registered.staffPosition - tonic.staffPosition,
      specificSemitonesFromTonic: registered.chromaticPosition - tonic.chromaticPosition,
    };
  }
  const applied = safeInt(chord.applied);
  const borrowedName = safeString(chord.borrowed);
  const customIntervals = customBorrowedIntervals(chord.borrowed);
  const hasNamedBorrowing = NAMED_BORROWING.has(borrowedName);
  const hasBorrowedScale = borrowedName !== '' || customIntervals !== null;
  const modifiedKey = customIntervals !== null ? { tonic: key.tonic, scale: 'custom' }
    : hasNamedBorrowing ? { tonic: key.tonic, scale: borrowedName } : key;
  const target = resolveScaleDegreePitch(String(root), 0, modifiedKey, referenceOctave, customIntervals ?? undefined);
  if (!target) return null;
  const triSubstitution = applied === 5 && strings(chord.substitutions).includes('tri');
  const isApplied = applied >= 1 && applied <= 7;
  let effectiveDegree: number, effectiveKey: KeyInfo, pitch: SpelledPitch | null, context: ChordRootContext;
  let borrowedAppliedQuality: string | null = null;
  if (isApplied && !hasBorrowedScale) {
    effectiveDegree = triSubstitution ? 2 : applied;
    effectiveKey = { tonic: target.noteName, scale: 'major' };
    pitch = resolveScaleDegreePitch(triSubstitution ? 'b2' : String(applied), 0, effectiveKey, target.octave);
    context = triSubstitution ? 'TRITONE_SUBSTITUTION' : 'APPLIED';
  } else if (isApplied && hasBorrowedScale) {
    context = 'BORROWED_APPLIED';
    if (borrowedName === 'locrian' && root === 1 && applied === 1 && safeInt(chord.type, 5) < 7) {
      effectiveDegree = 1; effectiveKey = modifiedKey; pitch = target; borrowedAppliedQuality = 'minor';
    } else if (triSubstitution) {
      effectiveDegree = 2; effectiveKey = { tonic: target.noteName, scale: 'major' };
      pitch = resolveScaleDegreePitch('b2', 0, effectiveKey, target.octave);
      borrowedAppliedQuality = 'major'; context = 'TRITONE_SUBSTITUTION';
    } else if (applied === 7 && strings(chord.alterations).includes('#5')) {
      effectiveDegree = 7; effectiveKey = { tonic: target.noteName, scale: 'major' };
      pitch = resolveScaleDegreePitch('7', 0, effectiveKey, target.octave); borrowedAppliedQuality = 'minor';
    } else if (customIntervals !== null && [1, 2].includes(safeInt(chord.inversion))) {
      effectiveDegree = root; effectiveKey = modifiedKey; pitch = target; borrowedAppliedQuality = 'major';
    } else {
      effectiveDegree = applied; effectiveKey = { tonic: target.noteName, scale: 'major' };
      pitch = resolveScaleDegreePitch(String(applied), 0, effectiveKey, target.octave);
    }
  } else {
    effectiveDegree = root; effectiveKey = modifiedKey; pitch = target;
    context = customIntervals !== null ? 'CUSTOM_BORROWED' : hasNamedBorrowing ? 'BORROWED' : 'STANDARD';
  }
  if (!pitch) return null;
  const qualities = isApplied ? CHORD_QUALITIES.major : customIntervals !== null ? customChordQualities(customIntervals)
    : lookup(CHORD_QUALITIES, effectiveKey.scale) ?? CHORD_QUALITIES.major;
  let quality = borrowedAppliedQuality ?? qualities[floorMod(effectiveDegree - 1, 7)] ?? 'major';
  const alterations = strings(chord.alterations);
  if (alterations.includes('#5') && quality === 'diminished') quality = 'minor';
  else if (alterations.includes('b5') && quality === 'minor') quality = 'diminished';
  if (alterations.includes('#5') && quality === 'major') quality = 'augmented';
  const tonic = SpelledPitch.parse(key.tonic, referenceOctave);
  if (!tonic) return null;
  // Retain the source scale-degree register instead of inventing compound applied-root shifts.
  const steps = floorMod(pitch.letter.index - tonic.letter.index, 7);
  const registered = withOctave(pitch, Math.floor((tonic.staffPosition + steps) / 7));
  return {
    pitch: registered, simpleModePitch: withOctave(pitch, referenceOctave), sourceDegree: root, effectiveDegree,
    sourceKey: key, effectiveKey, customIntervals, chordQuality: quality, context,
    genericStepsFromTonic: registered.staffPosition - tonic.staffPosition,
    specificSemitonesFromTonic: registered.chromaticPosition - tonic.chromaticPosition,
  };
}
