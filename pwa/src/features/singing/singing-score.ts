/** Frozen 801cf798 HummingIntervalPopup displayedSlotData / getPitchColor / recordedPitchPlaybackFrequency.
 * Slot bar/cents are scored against the current effectiveTargetMidi. Unsung target placeholder is 0¢,
 * not a sung score. Flip-Flop/Record store nearest-cents; display still retargets when a target exists.
 * Rolling tape snaps (no Compose animateFloatAsState). Record/preview/request-clear are session/UI.
 */

import { SpelledPitch } from '../../domain/music';

export const PITCH_ACCURACY_GREEN_CENTS = 15;
export const PITCH_ACCURACY_YELLOW_CENTS = 50;

export const PITCH_ACCURACY_COLORS = Object.freeze({
  green: '#4CAF50',
  yellow: '#FFEB3B',
  red: '#F44336',
});

export type PitchAccuracyBand = keyof typeof PITCH_ACCURACY_COLORS;

export interface SlotPitchCapture {
  readonly midi: number;
  readonly cents: number;
  readonly label: string;
}

export interface DisplayedSlotData extends SlotPitchCapture {
  readonly source: 'target' | 'captured';
}

export function pitchAccuracyBand(cents: number): PitchAccuracyBand {
  const abs = Math.abs(cents);
  if (abs < PITCH_ACCURACY_GREEN_CENTS) return 'green';
  if (abs < PITCH_ACCURACY_YELLOW_CENTS) return 'yellow';
  return 'red';
}

export function pitchAccuracyColor(cents: number): string {
  return PITCH_ACCURACY_COLORS[pitchAccuracyBand(cents)];
}

/** Native interval badge uses roundToInt before the <15 green check. Slot gauge uses raw cents. */
export function intervalCentsClose(centsDeviation: number): boolean {
  return Math.abs(Math.round(centsDeviation)) < PITCH_ACCURACY_GREEN_CENTS;
}

/** Kotlin `(remainingMs / 1000f).roundToInt()` for the active-card countdown. */
export function remainingSeconds(remainingMs: number): number {
  return Math.round(remainingMs / 1000);
}

export function displayedSlotData(
  captured: SlotPitchCapture | null,
  effectiveTargetMidi: number | null,
): DisplayedSlotData | null {
  if (effectiveTargetMidi === null) {
    return captured === null ? null : Object.freeze({ ...captured, source: 'captured' });
  }
  if (captured === null) {
    return Object.freeze({
      midi: effectiveTargetMidi,
      cents: 0,
      label: SpelledPitch.fromMidi(effectiveTargetMidi).displayName,
      source: 'target',
    });
  }
  return Object.freeze({
    midi: captured.midi,
    cents: (captured.midi - effectiveTargetMidi) * 100,
    label: captured.label,
    source: 'captured',
  });
}

/** Native recordedPitchPlaybackFrequency: finite raw MIDI only, no quantization. */
export function recordedPitchPlaybackFrequency(midi: number | null | undefined): number | null {
  if (midi == null || !Number.isFinite(midi)) return null;
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Native playExactFrequencies: captured raw MIDI only, no extra transpose. */
export function capturedPreviewFreqs(captured: SlotPitchCapture | null): readonly number[] | null {
  const hz = recordedPitchPlaybackFrequency(captured?.midi);
  return hz == null ? null : Object.freeze([hz]);
}

export function intervalPreviewStages(
  slot1: SlotPitchCapture | null,
  slot2: SlotPitchCapture | null,
): readonly (readonly number[])[] | null {
  const first = recordedPitchPlaybackFrequency(slot1?.midi);
  const second = recordedPitchPlaybackFrequency(slot2?.midi);
  if (first == null || second == null) return null;
  return Object.freeze([
    Object.freeze([first]),
    Object.freeze([second]),
    Object.freeze([first, second]),
  ]);
}
