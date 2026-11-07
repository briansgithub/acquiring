import { describe, expect, it } from 'vitest';
import {
  capturedPreviewFreqs, displayedSlotData, intervalCentsClose, intervalPreviewStages,
  pitchAccuracyBand, pitchAccuracyColor, recordedPitchPlaybackFrequency, remainingSeconds,
  PITCH_ACCURACY_COLORS,
} from './singing-score';

describe('displayedSlotData native HummingIntervalPopup', () => {
  it('returns captured unchanged when there is no slot target', () => {
    expect(displayedSlotData(null, null)).toBeNull();
    const captured = { midi: 69.37, cents: 37, label: 'A4' };
    expect(displayedSlotData(captured, null)).toEqual({ ...captured, source: 'captured' });
  });

  it('placeholder 0¢ is the unsung target, not a sung score', () => {
    expect(displayedSlotData(null, 69)).toEqual({
      midi: 69, cents: 0, label: 'A4', source: 'target',
    });
  });

  it('retargets captured raw MIDI against the current effective target without mutating storage', () => {
    const captured = Object.freeze({ midi: 69.37, cents: 37, label: 'A4' });
    expect(displayedSlotData(captured, 69)?.cents).toBeCloseTo(37, 10);
    expect(displayedSlotData(captured, 81)?.cents).toBeCloseTo((69.37 - 81) * 100, 10);
    expect(captured.cents).toBe(37);
  });

  it('Flip-Flop nearest-cents storage is overwritten on display when a target exists', () => {
    const flipFlop = { midi: 69.37, cents: 37, label: 'A4' };
    expect(displayedSlotData(flipFlop, 60)?.cents).toBeCloseTo((69.37 - 60) * 100, 10);
  });
});

describe('getPitchColor bands', () => {
  it('matches native <15 green / <50 yellow / else red', () => {
    expect(pitchAccuracyBand(0)).toBe('green');
    expect(pitchAccuracyBand(14.9)).toBe('green');
    expect(pitchAccuracyBand(-14.9)).toBe('green');
    expect(pitchAccuracyBand(15)).toBe('yellow');
    expect(pitchAccuracyBand(49.9)).toBe('yellow');
    expect(pitchAccuracyBand(50)).toBe('red');
    expect(pitchAccuracyColor(0)).toBe(PITCH_ACCURACY_COLORS.green);
    expect(pitchAccuracyColor(20)).toBe(PITCH_ACCURACY_COLORS.yellow);
    expect(pitchAccuracyColor(-80)).toBe(PITCH_ACCURACY_COLORS.red);
  });
});

describe('intervalCentsClose', () => {
  it('uses rounded cents like native interval.roundToInt before <15', () => {
    expect(intervalCentsClose(14.4)).toBe(true);
    expect(intervalCentsClose(14.6)).toBe(false);
    expect(intervalCentsClose(-14.6)).toBe(false);
    expect(intervalCentsClose(15)).toBe(false);
    expect(intervalCentsClose(0)).toBe(true);
  });
});

describe('remainingSeconds', () => {
  it('matches Kotlin remainingMs/1000f roundToInt', () => {
    expect(remainingSeconds(3000)).toBe(3);
    expect(remainingSeconds(2500)).toBe(3);
    expect(remainingSeconds(2400)).toBe(2);
    expect(remainingSeconds(500)).toBe(1);
    expect(remainingSeconds(499)).toBe(0);
    expect(remainingSeconds(0)).toBe(0);
  });
});

describe('recordedPitchPlaybackFrequency', () => {
  it('uses captured fractional MIDI without quantizing', () => {
    const expected = 440 * 2 ** (0.37 / 12);
    expect(recordedPitchPlaybackFrequency(69.37)).toBeCloseTo(expected, 9);
    expect(recordedPitchPlaybackFrequency(69.37)).not.toBeCloseTo(440, 6);
  });

  it('requires a real finite capture', () => {
    expect(recordedPitchPlaybackFrequency(null)).toBeNull();
    expect(recordedPitchPlaybackFrequency(Number.NaN)).toBeNull();
    expect(recordedPitchPlaybackFrequency(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('preview freqs are literal captured Hz with no extra transpose', () => {
    expect(capturedPreviewFreqs(null)).toBeNull();
    const hz = recordedPitchPlaybackFrequency(69.37)!;
    expect(capturedPreviewFreqs({ midi: 69.37, cents: 37, label: 'A4' })).toEqual([hz]);
    expect(intervalPreviewStages(
      { midi: 69.37, cents: 37, label: 'A4' },
      { midi: 73, cents: 0, label: 'C5' },
    )).toEqual([
      [hz],
      [recordedPitchPlaybackFrequency(73)],
      [hz, recordedPitchPlaybackFrequency(73)],
    ]);
  });
});
