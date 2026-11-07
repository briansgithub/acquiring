import { describe, expect, it } from 'vitest';
import {
  NO_SIGNAL, PITCH_HOLD_MS, PITCH_HOP_SIZE, PITCH_WINDOW_SIZE, PitchHopBuffer, PitchPublisher,
  PitchTrackingMode,
} from './index';
import type { PitchEstimate, PitchResultEstimate } from './index';

const A4: PitchEstimate = Object.freeze({ frequencyHz: 440, confidence: 0.9, rms: 0.1 });
const SILENCE: PitchEstimate = Object.freeze({ frequencyHz: 0, confidence: 0, rms: 0 });

function settleLive(publisher: PitchPublisher, now = 1_000): PitchResultEstimate {
  let result = publisher.current;
  for (let i = 0; i < 6; i++) result = publisher.ingestEstimate(now, A4);
  expect(result.kind).toBe('estimate');
  return result as PitchResultEstimate;
}

describe('PitchHopBuffer native hop-then-copy', () => {
  it('returns a window only after 2048 samples and then every 512', () => {
    const hopsUntilWindow = PITCH_WINDOW_SIZE / PITCH_HOP_SIZE;
    const buffer = new PitchHopBuffer();
    for (let i = 0; i < hopsUntilWindow - 1; i++) {
      expect(buffer.push(new Int16Array(PITCH_HOP_SIZE))).toBeNull();
    }
    const first = buffer.push(new Int16Array(PITCH_HOP_SIZE).fill(7));
    expect(first).toHaveLength(PITCH_WINDOW_SIZE);
    expect(first![PITCH_WINDOW_SIZE - 1]).toBe(7);
    expect(buffer.push(new Int16Array(PITCH_HOP_SIZE).fill(9))).toHaveLength(PITCH_WINDOW_SIZE);
  });
});

describe('PitchPublisher 200ms hold publication', () => {
  it('stays no-signal until start, then publishes after smoother warm-up', () => {
    const publisher = new PitchPublisher(69);
    expect(publisher.ingestEstimate(0, A4)).toBe(NO_SIGNAL);
    publisher.start(69);
    expect(publisher.isRunning).toBe(true);
    const live = settleLive(publisher);
    expect(live.isHeld).toBe(false);
    expect(live.midi).toBeCloseTo(69, 6);
    expect(live.centsError).toBeCloseTo(0, 6);
  });

  it('holds the first dropout frame and clears after 200ms', () => {
    const publisher = new PitchPublisher(69);
    publisher.start(69);
    const live = settleLive(publisher, 1_000);
    const held = publisher.ingestEstimate(1_000 + PITCH_HOLD_MS, SILENCE);
    expect(held).toMatchObject({ kind: 'estimate', midi: live.midi, isHeld: true });
    expect(publisher.ingestEstimate(1_000 + PITCH_HOLD_MS, SILENCE)).toBe(held);
    expect(publisher.ingestEstimate(1_001 + PITCH_HOLD_MS, SILENCE)).toBe(NO_SIGNAL);
  });

  it('carries hold across retarget and ignores ingest after stop/release', () => {
    const publisher = new PitchPublisher(69);
    publisher.start(69);
    settleLive(publisher, 500);
    const held = publisher.ingestEstimate(500 + PITCH_HOLD_MS, SILENCE) as PitchResultEstimate;
    expect(held.isHeld).toBe(true);
    publisher.retarget(64);
    expect(publisher.current).toMatchObject({ kind: 'estimate', isHeld: true });
    expect((publisher.current as PitchResultEstimate).centsError).toBeCloseTo(500, 4);
    publisher.stop();
    expect(publisher.current).toBe(NO_SIGNAL);
    expect(publisher.ingestEstimate(800, A4)).toBe(NO_SIGNAL);
    publisher.start(69);
    settleLive(publisher, 900);
    publisher.release();
    expect(publisher.current).toBe(NO_SIGNAL);
    publisher.start(69);
    expect(publisher.ingestEstimate(1_000, A4)).toBe(NO_SIGNAL);
  });

  it('uses melody-fast analysis sizes', () => {
    const publisher = new PitchPublisher(60, PitchTrackingMode.MELODY_FAST);
    expect(publisher.analysisSizes()).toEqual({ windowSize: 1024, hopSize: 256 });
  });
});
