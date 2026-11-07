/** Frozen 801cf798 PitchRollingIndicator geometry. CSS px = Android dp (same mapping as timeline).
 * Native animateFloatAsState tween is skipped (snap), same class of gap as the 32ms timeline tween.
 */

import { SpelledPitch, type NoteNameAccidentalPreference } from '../../domain/music';

export const TAPE_NOTE_HEIGHT_PX = 24;
export const TAPE_RANGE = 5;
/** Native 10.dp tick, 1.dp stroke. CSS px = dp. */
export const TAPE_TICK_PX = 10;
export const TAPE_TICK_STROKE_PX = 1;

export interface TapeRow {
  readonly midi: number;
  readonly label: string;
  readonly offsetPx: number;
  readonly center: boolean;
}

export function tapeNoteLabel(midi: number, preference: NoteNameAccidentalPreference = 'flats'): string {
  return SpelledPitch.fromMidi(midi, preference).displayName.replace(/\d+/g, '');
}

/** Native `Oct ${floor(midi/12)-1}`. */
export function tapeOctaveLabel(midi: number): string {
  return `Oct ${Math.floor(midi / 12) - 1}`;
}

export function tapeRows(midi: number, preference: NoteNameAccidentalPreference = 'flats'): readonly TapeRow[] {
  const start = Math.trunc(midi - TAPE_RANGE);
  const end = Math.trunc(midi + TAPE_RANGE);
  const rows: TapeRow[] = [];
  for (let m = start; m <= end; m++) {
    rows.push(Object.freeze({
      midi: m,
      label: tapeNoteLabel(m, preference),
      offsetPx: (m - midi) * TAPE_NOTE_HEIGHT_PX,
      center: Math.abs(m - midi) < 0.5,
    }));
  }
  return Object.freeze(rows);
}
