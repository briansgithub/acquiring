import { describe, expect, it } from 'vitest';
import native from './fixtures/native-pitch.json';
import { holdPitchResult, NO_SIGNAL, PITCH_TRACKING_PROFILES, PitchSmoother, PitchTrackingMode,
  preservePitchHold } from './index';
import type { PitchResult, PitchResultEstimate } from './index';

function settle(smoother: PitchSmoother, midi = 60, confidence = 0.9): PitchResultEstimate {
  let result: PitchResultEstimate | null = null;
  for (let i = 0; i < 6; i++) result = smoother.accept(midi, confidence);
  return result!;
}

describe('native profile and independent smoothing transcripts', () => {
  it('retains both frozen native profiles and public constants', () => {
    expect(PITCH_TRACKING_PROFILES).toEqual({
      STANDARD: { windowSizeOverride: null, hopSizeOverride: null, smoothing: { medianWindow: 3,
        minFramesBeforePublish: 2, emaAdmit: 0.3, octaveRejectSemitones: 6, octaveRejectMaxFrames: 3 } },
      MELODY_FAST: { windowSizeOverride: 1024, hopSizeOverride: 256, smoothing: { medianWindow: 1,
        minFramesBeforePublish: 1, emaAdmit: 1, octaveRejectSemitones: 6, octaveRejectMaxFrames: 1 } },
    });
    expect([PitchSmoother.MEDIAN_WINDOW, PitchSmoother.MIN_FRAMES_BEFORE_PUBLISH, PitchSmoother.EMA_RETAIN,
      PitchSmoother.EMA_ADMIT, PitchSmoother.OCTAVE_REJECT_SEMITONES, PitchSmoother.OCTAVE_REJECT_MAX_FRAMES])
      .toEqual([3, 2, 0.7, 0.3, 6, 3]);
    expect(Object.isFrozen(PITCH_TRACKING_PROFILES)).toBe(true);
    for (const profile of Object.values(PITCH_TRACKING_PROFILES)) {
      expect(Object.isFrozen(profile)).toBe(true); expect(Object.isFrozen(profile.smoothing)).toBe(true);
    }
  });

  it('matches all68frozen native standard/fast operations and published fields exactly', () => {
    let count = 0;
    for (const fixture of native.smoother) {
      const smoother = new PitchSmoother(60, fixture.mode as PitchTrackingMode);
      for (const operation of fixture.operations) {
        let result: PitchResultEstimate | null = null;
        switch (operation.action) {
          case 'accept': result = smoother.accept(operation.midi, operation.confidence); break;
          case 'setTarget': result = smoother.setTarget(operation.midi); break;
          case 'retarget': smoother.retarget(operation.midi); break;
          case 'targetProperty': smoother.targetMidi = operation.midi; break;
          default: smoother.reset(); break;
        }
        expect(result, `${fixture.mode}/${count}`).toEqual(operation.result == null ? null : { kind: 'estimate', ...operation.result });
        expect(smoother.targetMidi).toBe(operation.targetMidi); count++;
      }
    }
    expect(count).toBe(68);
  });
});

describe('native smoother invariants and note changes', () => {
  it('warms up four raw frames and derives every published cents value from the same smoothed MIDI', () => {
    const smoother = new PitchSmoother(60);
    expect(smoother.accept(60, 0.9)).toBeNull(); expect(smoother.accept(60, 0.9)).toBeNull(); expect(smoother.accept(60, 0.9)).toBeNull();
    expect(smoother.accept(60, 0.9)).not.toBeNull();
    for (const midi of [60, 60.2, 59.8, 60.1, 60.4, 60.3, 59.9, 60.05, 61.2, 60.7, 60, 59.6]) {
      const result = smoother.accept(midi, 0.71)!;
      expect(result.centsError).toBe(100 * (result.midi - 60));
      expect(result.confidence).toBe(0.71); expect(result.isHeld).toBe(false);
    }
  });

  it('median rejects an isolated nearby outlier and octave rejection discards a single harmonic lock', () => {
    const smoother = new PitchSmoother(60); settle(smoother);
    for (const midi of [63, 60]) expect(Math.abs(smoother.accept(midi, 0.9)!.midi - 60)).toBeLessThan(0.5);
    expect(smoother.accept(72, 0.9)).toBeNull();
    expect(smoother.accept(60, 0.9)!.midi).toBeCloseTo(60, 1);
    // Exactly six semitones is admitted (native comparison is strictly greater).
    expect(smoother.accept(66, 0.9)).not.toBeNull();
  });

  it('re-seeds a sustained jump in both standard and maximum-speed profiles', () => {
    const standard = new PitchSmoother(60); settle(standard);
    const afterJump = Array.from({ length: 8 }, () => standard.accept(72, 0.9)).filter((value) => value !== null);
    expect(afterJump.length).toBeGreaterThan(0);
    expect(afterJump.at(-1)!.midi).toBeCloseTo(72, 1);
    const fast = new PitchSmoother(60, PitchTrackingMode.MELODY_FAST);
    expect(fast.accept(60.25, 0.9)!.midi).toBe(60.25);
    expect(fast.accept(60.75, 0.9)!.midi).toBe(60.75);
    expect(fast.accept(72, 0.9)).toBeNull(); expect(fast.accept(72, 0.9)!.midi).toBe(72);
  });

  it('history-preserving target moves retain measured pitch/confidence and never manufacture certainty', () => {
    const smoother = new PitchSmoother(60);
    expect(smoother.setTarget(64)).toBeNull();
    settle(smoother, 60); smoother.accept(60, 0.42);
    const rescored = smoother.setTarget(72)!;
    expect(rescored.midi).toBe(60); expect(rescored.centsError).toBe(-1200); expect(rescored.confidence).toBe(0.42);
    for (let i = 0; i < 4; i++) {
      const result = smoother.accept(60, 0.8)!;
      expect(result.midi).toBe(60); expect(result.centsError).toBe(-1200);
    }
  });

  it('reset/retarget clear measured history and refill the native warm-up against the new target', () => {
    const smoother = new PitchSmoother(60); settle(smoother); smoother.setTarget(64); smoother.reset();
    expect(smoother.setTarget(67)).toBeNull();
    for (let i = 0; i < 3; i++) expect(smoother.accept(67, 0.9)).toBeNull();
    expect(smoother.accept(67, 0.9)!.centsError).toBe(0);
    smoother.retarget(69);
    for (let i = 0; i < 3; i++) expect(smoother.accept(69, 0.9)).toBeNull();
    expect(smoother.accept(69, 0.9)!.centsError).toBe(0);
  });
});

describe('dropout display and measured freshness semantics', () => {
  it('copies a dropout hold once, preserves it through target re-scoring and clears it only on a new accept', () => {
    const smoother = new PitchSmoother(60); const fresh = settle(smoother, 60, 0.42);
    const held = holdPitchResult(fresh) as PitchResultEstimate;
    expect(held).toEqual({ ...fresh, isHeld: true });
    expect(held).not.toBe(fresh); expect(fresh.isHeld).toBe(false);
    expect(holdPitchResult(held)).toBe(held);
    const rescored = preservePitchHold(smoother.setTarget(64)!, held);
    expect(rescored).toEqual({ ...held, centsError: -400 });
    expect(preservePitchHold(smoother.setTarget(64)!, fresh).isHeld).toBe(false);
    const next = smoother.accept(60, 0.61)!;
    expect(next.isHeld).toBe(false); expect(next.confidence).toBe(0.61); expect(next.centsError).toBe(-400);
  });

  it('never creates a held reading from no signal/error or from an unmeasured/reset target', () => {
    const error: PitchResult = { kind: 'error', message: 'external capture error' };
    expect(holdPitchResult(NO_SIGNAL)).toBe(NO_SIGNAL); expect(holdPitchResult(error)).toBe(error);
    const smoother = new PitchSmoother(60);
    expect(smoother.setTarget(64)).toBeNull(); settle(smoother, 64); smoother.reset();
    expect(smoother.setTarget(67)).toBeNull();
    for (let i = 0; i < 3; i++) expect(smoother.accept(67, 0.9)).toBeNull();
    expect(smoother.accept(67, 0.9)!.isHeld).toBe(false);
    // Timed200ms publication expiry is deliberately owned by a future capture adapter.
  });
});

describe('bounded smoother inputs', () => {
  it('rejects invalid mode/targets/frames without changing measured state or confidence', () => {
    for (const target of [NaN, Infinity, 0.5, -2147483649, 2147483648]) expect(() => new PitchSmoother(target)).toThrow(RangeError);
    expect(() => new PitchSmoother(60, 'unknown' as PitchTrackingMode)).toThrow(RangeError);
    const smoother = new PitchSmoother(60), reference = new PitchSmoother(60); settle(smoother); settle(reference);
    for (const midi of [NaN, Infinity, -Infinity, 1025, -1025]) expect(() => smoother.accept(midi, 0.9)).toThrow(RangeError);
    for (const confidence of [NaN, Infinity, -0.1, 1.1]) expect(() => smoother.accept(60, confidence)).toThrow(RangeError);
    for (const target of [NaN, Infinity, 0.5, 2147483648]) {
      expect(() => smoother.setTarget(target)).toThrow(RangeError);
      expect(() => smoother.retarget(target)).toThrow(RangeError);
      expect(() => { smoother.targetMidi = target; }).toThrow(RangeError);
    }
    expect(smoother.targetMidi).toBe(60);
    expect(smoother.accept(60.25, 0.42)).toEqual(reference.accept(60.25, 0.42));
    expect(smoother.setTarget(64)).toEqual(reference.setTarget(64));
  });

  it('keeps stable output through long runs with fixed bounded history', () => {
    const smoother = new PitchSmoother(60); let result: PitchResultEstimate | null = null;
    for (let i = 0; i < 100_000; i++) result = smoother.accept(60, 0.9);
    expect(result).toEqual({ kind: 'estimate', midi: 60, centsError: 0, confidence: 0.9, isHeld: false });
  });
});
