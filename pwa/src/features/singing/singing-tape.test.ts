import { describe, expect, it } from 'vitest';
import { TAPE_NOTE_HEIGHT_PX, tapeOctaveLabel, tapeRows } from './singing-tape';

describe('PitchRollingIndicator snap tape', () => {
  it('uses trunc ±5 MIDI like Kotlin toInt and 24px=dp row height', () => {
    const rows = tapeRows(69.37);
    expect(rows[0]?.midi).toBe(64);
    expect(rows.at(-1)?.midi).toBe(74);
    expect(rows.find((row) => row.midi === 69)).toEqual({
      midi: 69, label: 'A', offsetPx: (69 - 69.37) * TAPE_NOTE_HEIGHT_PX, center: true,
    });
    expect(rows.find((row) => row.midi === 64)?.center).toBe(false);
  });

  it('octave caption matches native floor(midi/12)-1', () => {
    expect(tapeOctaveLabel(69)).toBe('Oct 4');
    expect(tapeOctaveLabel(69.37)).toBe('Oct 4');
    expect(tapeOctaveLabel(60)).toBe('Oct 4');
    expect(tapeOctaveLabel(59.9)).toBe('Oct 3');
  });
});
