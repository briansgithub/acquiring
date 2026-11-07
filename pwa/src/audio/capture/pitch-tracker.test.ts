import { describe, expect, it } from 'vitest';
import {
  MicrophonePitchCoordinator, MicrophonePitchOwner, MicrophonePitchTracker, NO_SIGNAL, PITCH_HOLD_MS,
  PITCH_HOP_SIZE, PitchTrackingMode,
} from './index';
import type { PitchResultEstimate } from './index';

function sineHops(frequency = 440, hopCount = 8, hopSize = PITCH_HOP_SIZE, rate = 16_000): Int16Array[] {
  const hops: Int16Array[] = [];
  for (let h = 0; h < hopCount; h++) {
    hops.push(Int16Array.from({ length: hopSize }, (_, i) => {
      const n = h * hopSize + i;
      return Math.trunc(Math.sin(2 * Math.PI * frequency * n / rate) * 32767);
    }));
  }
  return hops;
}

describe('MicrophonePitchTracker hop-to-YIN publication', () => {
  it('publishes A4 from injected 16kHz hops and holds 200ms of silence', () => {
    const tracker = new MicrophonePitchTracker(69);
    tracker.start(69);
    const hops = sineHops();
    let result = tracker.current;
    hops.forEach((hop, i) => { result = tracker.pushHop(1_000 + i * 32, hop); });
    expect(result.kind).toBe('estimate');
    const live = result as PitchResultEstimate;
    expect(live.isHeld).toBe(false);
    expect(live.midi).toBeCloseTo(69, 1);
    const silence = new Int16Array(PITCH_HOP_SIZE);
    const flushedAt = 1_000 + (hops.length - 1) * 32 + 10;
    let held = result;
    for (let i = 0; i < 4; i++) held = tracker.pushHop(flushedAt, silence);
    expect(held).toMatchObject({ kind: 'estimate', isHeld: true });
    expect(tracker.pushHop(flushedAt + PITCH_HOLD_MS + 1, silence)).toBe(NO_SIGNAL);
  });

  it('feeds exclusive singing lease with melody-fast hops', () => {
    const tracker = new MicrophonePitchTracker(69);
    const coordinator = new MicrophonePitchCoordinator(tracker);
    const singing = coordinator.sourceFor(MicrophonePitchOwner.SINGING_TOOL);
    singing.claim(PitchTrackingMode.MELODY_FAST);
    singing.start(69);
    const { hopSize } = tracker.analysisSizes();
    expect(hopSize).toBe(256);
    sineHops(440, 12, hopSize).forEach((hop, i) => tracker.pushHop(2_000 + i * 16, hop));
    expect(tracker.current.kind).toBe('estimate');
    singing.stop();
    expect(tracker.current).toBe(NO_SIGNAL);
  });
});
