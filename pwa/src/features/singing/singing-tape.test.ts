import {noteNameAccidentalPreference} from '../../domain/music';
import { describe, expect, it } from 'vitest';
import { TAPE_NOTE_HEIGHT_PX, TAPE_TICK_PX, TAPE_TICK_STROKE_PX, tapeOctaveLabel, tapeRows } from './singing-tape';

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

  it('tick geometry is native 10.dp × 1.dp with CSS px = dp', () => {
    expect(TAPE_TICK_PX).toBe(10);
    expect(TAPE_TICK_STROKE_PX).toBe(1);
  });

  it('octave caption matches native floor(midi/12)-1', () => {
    expect(tapeOctaveLabel(69)).toBe('Oct 4');
    expect(tapeOctaveLabel(69.37)).toBe('Oct 4');
    expect(tapeOctaveLabel(60)).toBe('Oct 4');
    expect(tapeOctaveLabel(59.9)).toBe('Oct 3');
  });
});


it('section signature changes tape spelling only: geometry, MIDI and row selection stay identical',()=>{
 const cases=[{tonic:'D',scale:'major',sharp:true},{tonic:'E',scale:'dorian',sharp:true},{tonic:'Ab',scale:'major',sharp:false},{tonic:'G',scale:'dorian',sharp:false},{tonic:'C',scale:'major',sharp:false},{tonic:'A',scale:'minor',sharp:false}];
 for(const key of cases){
  const rows=tapeRows(69.37,noteNameAccidentalPreference(key));
  expect(rows.map(({label,...geometry})=>geometry)).toEqual(tapeRows(69.37).map(({label,...geometry})=>geometry));
  expect(rows.find(row=>row.midi===70)?.label).toBe(key.sharp?'A♯':'B♭');
  expect(rows.find(row=>row.midi===66)?.label).toBe(key.sharp?'F♯':'G♭');
 }
});
