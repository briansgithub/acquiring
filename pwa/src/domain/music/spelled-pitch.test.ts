import { describe, expect, it } from 'vitest';
import { SpelledPitch } from './index';

describe('Android written-pitch representation', () => {
  it('parses native accidentals without losing enharmonic letter or written octave', () => {
    const eSharp = SpelledPitch.parse('E♯', 4)!;
    const f = SpelledPitch.parse('F', 4)!;
    expect(eSharp.toAudioNoteNumber()).toBe(f.toAudioNoteNumber());
    expect(eSharp.noteName).toBe('E#');
    expect(eSharp.staffPosition).not.toBe(f.staffPosition);
    expect(SpelledPitch.parse(' c𝄫 ', 3)?.displayName).toBe('C♭♭3');
    expect(SpelledPitch.parse('Fx', 4)?.noteName).toBe('F##');
    expect(SpelledPitch.parse('G𝄪', 4)?.accidental).toBe(2);
    expect(SpelledPitch.parse('A♮', 4)?.accidental).toBe(0);
    expect(SpelledPitch.parse('B#', 3)?.toAudioNoteNumber()).toBe(60);
    expect(SpelledPitch.parse('Cb', 4)?.toAudioNoteNumber()).toBe(59);
    for (const input of ['', 'H', 'C4', 'C?', 'C #', 'C♮x?']) expect(SpelledPitch.parse(input, 4)).toBeNull();
  });
  it('reproduces every flat/sharp MIDI-name case from RelativeIonianContextTest', () => {
    const flats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    const sharps = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    expect(Array.from({ length: 12 }, (_, pc) => SpelledPitch.fromMidi(60 + pc).noteName)).toEqual(flats);
    expect(Array.from({ length: 12 }, (_, pc) => SpelledPitch.fromMidi(60 + pc, 'sharps').noteName)).toEqual(sharps);
    for (let midi = 0; midi <= 127; midi++) {
      for (const preference of ['flats', 'sharps'] as const) expect(SpelledPitch.fromMidi(midi, preference).toAudioNoteNumber()).toBe(midi);
    }
  });
  it('spells intervals from their written root across octaves and downward motion', () => {
    const root = SpelledPitch.parse('B', 3)!;
    expect(SpelledPitch.spellRelative(root, 63).displayName).toBe('D♯4');
    expect(SpelledPitch.spellRelative(root, 75).displayName).toBe('D♯5');
    const c = SpelledPitch.parse('C', 4)!;
    expect(SpelledPitch.spellRelative(c, 59).displayName).toBe('B3');
    expect(SpelledPitch.spellRelative(c, 66).displayName).toBe('G♭4');
    expect(SpelledPitch.spellRelative(c, 48).displayName).toBe('C3');
    expect(c.displayName).toBe('C4');
  });
});
