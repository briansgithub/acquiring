/** Named/measured interval port from Android SpelledInterval.kt at 801cf798. */
import { SpelledPitch } from './spelled-pitch';

export enum IntervalDirection { ASCENDING = 'ASCENDING', DESCENDING = 'DESCENDING' }
function arrow(direction: IntervalDirection): string { return direction === IntervalDirection.ASCENDING ? '↑' : '↓'; }
function qualitySpokenName(symbol: string): string {
  if (symbol === 'P') return 'perfect';
  if (symbol === 'M') return 'major';
  if (symbol === 'm') return 'minor';
  if (/^A*$/.test(symbol)) return Array<string>(symbol.length).fill('augmented').join(' ');
  if (/^d*$/.test(symbol)) return Array<string>(symbol.length).fill('diminished').join(' ');
  return symbol;
}
function ordinalName(value: number): string {
  const names = ['unison', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'octave'];
  if (value >= 1 && value <= 8) return names[value - 1];
  const suffix = value % 100 >= 11 && value % 100 <= 13 ? 'th' : value % 10 === 1 ? 'st' : value % 10 === 2 ? 'nd' : value % 10 === 3 ? 'rd' : 'th';
  return String(value) + suffix;
}
export class NamedInterval {
  constructor(readonly number: number, readonly quality: string, readonly direction: IntervalDirection, readonly directedSemitones: number) {}
  get compoundOctaves(): number { return Math.trunc((this.number - 1) / 7); }
  get directionGlyph(): string { return this.quality === 'P' && this.number === 1 ? '·' : arrow(this.direction); }
  get shorthand(): string { return this.quality + this.number + ' ' + this.directionGlyph; }
  get spokenName(): string { return qualitySpokenName(this.quality) + ' ' + ordinalName(this.number) + ', ' + this.direction.toLowerCase(); }
}
export class MeasuredInterval {
  constructor(readonly namedInterval: NamedInterval, readonly direction: IntervalDirection | null, readonly centsDeviation: number) {}
  get shorthand(): string { return this.namedInterval.quality + this.namedInterval.number + ' ' + (this.direction === null ? '·' : arrow(this.direction)); }
}

/** Written direction and generic interval size are preserved instead of respelling by pitch class. */
export function calculateNamedInterval(from: SpelledPitch, to: SpelledPitch): NamedInterval {
  const diatonicDelta = to.staffPosition - from.staffPosition, chromaticDelta = to.chromaticPosition - from.chromaticPosition;
  const direction = diatonicDelta > 0 ? IntervalDirection.ASCENDING : diatonicDelta < 0 || chromaticDelta < 0 ? IntervalDirection.DESCENDING : IntervalDirection.ASCENDING;
  const number = Math.abs(diatonicDelta) + 1;
  const directedSemitones = direction === IntervalDirection.ASCENDING ? chromaticDelta : -chromaticDelta;
  const simpleNumber = (number - 1) % 7 + 1, compoundOctaves = Math.trunc((number - 1) / 7);
  const baseline = [0, 2, 4, 5, 7, 9, 11][simpleNumber - 1] + compoundOctaves * 12;
  const deviation = directedSemitones - baseline, perfectFamily = [1, 4, 5].includes(simpleNumber);
  const quality = perfectFamily ? deviation === 0 ? 'P' : deviation > 0 ? 'A'.repeat(deviation) : 'd'.repeat(-deviation)
    : deviation === 0 ? 'M' : deviation === -1 ? 'm' : deviation > 0 ? 'A'.repeat(deviation) : 'd'.repeat(-deviation - 1);
  return new NamedInterval(number, quality, direction, directedSemitones);
}
function roundToNativeInt(value: number): number {
  // Kotlin Double.roundToInt rounds half ties toward positive infinity, saturates Int bounds and rejects NaN.
  if (Number.isNaN(value)) throw new RangeError('Cannot round NaN to an integer');
  const rounded = Math.max(-2147483648, Math.min(2147483647, Math.round(value)));
  return rounded === 0 ? 0 : rounded;
}
/** Naming uses rounded notes; measured direction deliberately uses the unrounded pitch order. */
export function calculateMeasuredInterval(fromMidi: number, toMidi: number): MeasuredInterval {
  const roundedFrom = roundToNativeInt(fromMidi), roundedTo = roundToNativeInt(toMidi);
  const fromPitch = SpelledPitch.fromMidi(roundedFrom), toPitch = SpelledPitch.spellRelative(fromPitch, roundedTo);
  const namedInterval = calculateNamedInterval(fromPitch, toPitch);
  const direction = toMidi > fromMidi ? IntervalDirection.ASCENDING : toMidi < fromMidi ? IntervalDirection.DESCENDING : null;
  const measuredSemitones = toMidi - fromMidi, idealSemitones = roundedTo - roundedFrom;
  return new MeasuredInterval(namedInterval, direction, (measuredSemitones - idealSemitones) * 100);
}
