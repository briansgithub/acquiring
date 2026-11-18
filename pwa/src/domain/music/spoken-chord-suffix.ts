/** Native spokenSuffixForChord (SpokenRootDegrees.kt, Android 3c887223, N07): which spoken chord-quality
 * suffix (minor, dominant seventh, suspended second...) Sung Number + Details adds after the root degree.
 */
import type { JsonObject, JsonValue } from '../../contracts';
import type { VoicedChord } from './chord-voicing';
import { floorMod } from './spelled-pitch';

export type SpokenChordSuffixName = 'MIN' | 'SEVEN' | 'SEV_MAJ' | 'SEV_MIN' | 'MIN_SEV_MAJ' | 'DIM' | 'DIM_SEV' | 'HALF_DIM' | 'AUG'
  | 'SUS_TWO' | 'SUS_FOUR' | 'SUS_TWO_FOUR' | 'SEVENTH_SUS_TWO' | 'SEVENTH_SUS_FOUR' | 'SEVENTH_SUS_TWO_FOUR';

const ROMAN_BASE = /^[♭♯]*([IViv]+)/u;
const ROMAN_ANNOTATIONS = /\([^)]*\)/gu;
const ROMAN_SUSPENSION = /sus([24])/gu;

/** Kotlin JsonPrimitive.intOrNull. */
function intOrNull(value: JsonValue | undefined): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[+-]?[0-9]+$/.test(value))) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= -2147483648 && number <= 2147483647 ? number : null;
}
/** Kotlin JsonPrimitive.contentOrNull. */
const contentOrNull = (value: JsonValue | undefined): string | null =>
  value == null || typeof value === 'object' ? null : String(value);
const array = (value: JsonValue | undefined): readonly JsonValue[] => Array.isArray(value) ? value : [];

export function spokenSuffixForChord(chord: JsonObject, symbol: string, voicing: VoicedChord | null): SpokenChordSuffixName | null {
  const slash = symbol.indexOf('/');
  const numerator = slash < 0 ? symbol : symbol.slice(0, slash);
  const base = ROMAN_BASE.exec(numerator);
  const suffix = base ? numerator.slice(base[0].length).replace(ROMAN_ANNOTATIONS, '') : '';
  const letterQuality = base ? null : contentOrNull(chord._letterQuality);
  const baseFirst = base?.[1]?.[0];
  const minor = baseFirst !== undefined ? baseFirst === baseFirst.toLowerCase() && baseFirst !== baseFirst.toUpperCase() : letterQuality === 'minor';
  const omittedSeventh = array(chord.omits).some((item) => intOrNull(item) === 7);
  const hasSeventh = intOrNull(chord.type) === 7 && !omittedSeventh;
  let suspensions = array(chord.suspensions).map(intOrNull).filter((degree): degree is number => degree === 2 || degree === 4);
  if (!suspensions.length) suspensions = [...suffix.matchAll(ROMAN_SUSPENSION)].map((match) => Number(match[1]));
  if (suspensions.length) {
    const two = suspensions.includes(2), four = suspensions.includes(4);
    if (two && four) return hasSeventh ? 'SEVENTH_SUS_TWO_FOUR' : 'SUS_TWO_FOUR';
    if (two) return hasSeventh ? 'SEVENTH_SUS_TWO' : 'SUS_TWO';
    return hasSeventh ? 'SEVENTH_SUS_FOUR' : 'SUS_FOUR';
  }
  const seventhTone = voicing?.tones.find((tone) => tone.degree === 7);
  const seventhInterval = voicing && seventhTone ? floorMod(seventhTone.midi - voicing.rootMidi, 12) : null;
  const majorSeventh = seventhInterval !== null ? seventhInterval === 11 : suffix.includes('△');
  if (suffix.includes('ø')) return hasSeventh ? 'HALF_DIM' : 'DIM';
  if (suffix.includes('°') || letterQuality === 'diminished') {
    if (!hasSeventh) return 'DIM';
    return seventhInterval === 10 ? 'HALF_DIM' : 'DIM_SEV';
  }
  if (suffix.includes('+') || letterQuality === 'augmented') return 'AUG';
  if (hasSeventh && majorSeventh && minor) return 'MIN_SEV_MAJ';
  if (hasSeventh && majorSeventh) return 'SEV_MAJ';
  if (hasSeventh && minor) return 'SEV_MIN';
  if (hasSeventh) return 'SEVEN';
  if (minor) return 'MIN';
  return null;
}
