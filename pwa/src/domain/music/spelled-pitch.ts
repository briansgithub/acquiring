/** Written pitch port from Android SpelledInterval.kt; MIDI is a boundary representation. */
export type LetterName = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
export interface DiatonicLetter { readonly name: LetterName; readonly index: number; readonly naturalSemitone: number }
export type NoteNameAccidentalPreference = 'flats' | 'sharps';
export const DIATONIC_LETTERS: readonly DiatonicLetter[] = [
  { name: 'C', index: 0, naturalSemitone: 0 }, { name: 'D', index: 1, naturalSemitone: 2 },
  { name: 'E', index: 2, naturalSemitone: 4 }, { name: 'F', index: 3, naturalSemitone: 5 },
  { name: 'G', index: 4, naturalSemitone: 7 }, { name: 'A', index: 5, naturalSemitone: 9 },
  { name: 'B', index: 6, naturalSemitone: 11 },
];

export function floorMod(value: number, divisor: number): number { return (value % divisor + divisor) % divisor; }

/** Kotlin Char.isWhitespace trimming, including Unicode spaces but excluding FEFF/NEL. */
export function trimNativeWhitespace(value: string): string {
  return value.replace(/^[\u0009-\u000d\u001c-\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u001c-\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g, '');
}
export function normalizeWrittenAccidentals(value: string): string {
  return trimNativeWhitespace(value).replaceAll('𝄪', 'x').replaceAll('𝄫', 'bb')
    .replaceAll('♯', '#').replaceAll('♭', 'b').replaceAll('♮', '');
}

export class SpelledPitch {
  constructor(readonly letter: DiatonicLetter, readonly accidental: number, readonly octave: number) {}
  get staffPosition(): number { return this.octave * 7 + this.letter.index; }
  get chromaticPosition(): number { return this.octave * 12 + this.letter.naturalSemitone + this.accidental; }
  get noteName(): string {
    return this.letter.name + (this.accidental > 0 ? '#'.repeat(this.accidental) : 'b'.repeat(-this.accidental));
  }
  get displayName(): string { return this.noteName.replaceAll('b', '♭').replaceAll('#', '♯') + this.octave; }
  /** Android AudioPitchAdapter: C0 chromatic position becomes MIDI C-1 numbering. */
  toAudioNoteNumber(): number { return this.chromaticPosition + 12; }

  static parse(noteName: string, octave: number): SpelledPitch | null {
    const normalized = normalizeWrittenAccidentals(noteName);
    const letter = DIATONIC_LETTERS.find(value => value.name === normalized[0]?.toUpperCase());
    if (!letter || !/^[#bx]*$/.test(normalized.slice(1))) return null;
    let accidental = 0;
    for (const character of normalized.slice(1)) accidental += character === 'b' ? -1 : character === 'x' ? 2 : 1;
    return new SpelledPitch(letter, accidental, octave);
  }

  static fromMidi(midi: number, preference: NoteNameAccidentalPreference = 'flats'): SpelledPitch {
    const names = preference === 'sharps'
      ? ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
      : ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    return SpelledPitch.parse(names[floorMod(midi, 12)], Math.trunc(midi / 12) - 1)!;
  }

  static spellRelative(from: SpelledPitch, toMidi: number): SpelledPitch {
    const toChromaticPosition = toMidi - 12;
    const difference = toChromaticPosition - from.chromaticPosition;
    const octaves = Math.floor(difference / 12);
    const semitones = floorMod(difference, 12);
    const delta = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6][semitones];
    const staff = from.staffPosition + octaves * 7 + delta;
    const letter = DIATONIC_LETTERS[floorMod(staff, 7)];
    const octave = Math.floor(staff / 7);
    return new SpelledPitch(letter, toChromaticPosition - (octave * 12 + letter.naturalSemitone), octave);
  }
}
