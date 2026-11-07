import { PitchSmoother, PitchTrackingMode, PITCH_TRACKING_PROFILES } from './pitch-smoother';
import {
  holdPitchResult, isPitchEstimateSignal, NO_SIGNAL, preservePitchHold,
} from './pitch-results';
import type { PitchEstimate, PitchResult } from './pitch-results';

export const PITCH_HOLD_MS = 200;
export const PITCH_SAMPLE_RATE = 16_000;
export const PITCH_WINDOW_SIZE = 2048;
export const PITCH_HOP_SIZE = 512;

export interface PitchSource {
  readonly current: PitchResult;
  start(targetMidi: number, trackingMode?: PitchTrackingMode): void;
  retarget(targetMidi: number): void;
  stop(): void;
  release(): void;
}

/** Rolling analysis window matching native hop-then-copy capture. */
export class PitchHopBuffer {
  private readonly buffer: Int16Array;
  private writeIdx = 0;
  constructor(
    readonly windowSize = PITCH_WINDOW_SIZE,
    readonly hopSize = PITCH_HOP_SIZE,
  ) {
    if (!Number.isInteger(windowSize) || windowSize < 4) throw new RangeError('windowSize');
    if (!Number.isInteger(hopSize) || hopSize < 1 || hopSize > windowSize) throw new RangeError('hopSize');
    this.buffer = new Int16Array(windowSize + hopSize);
  }
  push(hop: Int16Array): Int16Array | null {
    if (hop.length !== this.hopSize) throw new RangeError('hop length');
    this.buffer.set(hop, this.writeIdx);
    this.writeIdx += hop.length;
    if (this.writeIdx < this.windowSize) return null;
    const window = this.buffer.slice(this.writeIdx - this.windowSize, this.writeIdx);
    this.buffer.copyWithin(0, this.hopSize, this.writeIdx);
    this.writeIdx -= this.hopSize;
    return window;
  }
  reset(): void { this.writeIdx = 0; }
}

function midiFromHz(frequencyHz: number): number {
  return 69 + 12 * Math.log2(frequencyHz / 440);
}

/**
 * Native capture-loop publication: gate, smoother, 200ms hold, start/stop/release.
 * Time and PCM estimates are injected so tests own the clock; getUserMedia is later.
 */
export class PitchPublisher implements PitchSource {
  private smoother: PitchSmoother;
  private result: PitchResult = NO_SIGNAL;
  private lastValidTime = 0;
  private running = false;
  private released = false;
  private trackingMode: PitchTrackingMode;

  constructor(targetMidi = 60, trackingMode = PitchTrackingMode.STANDARD) {
    this.trackingMode = trackingMode;
    this.smoother = new PitchSmoother(targetMidi, trackingMode);
  }

  get current(): PitchResult { return this.result; }
  get targetMidi(): number { return this.smoother.targetMidi; }
  get isRunning(): boolean { return this.running; }

  start(targetMidi: number, trackingMode = this.trackingMode): void {
    if (this.released) return;
    if (this.running && trackingMode === this.trackingMode) {
      this.retarget(targetMidi);
      return;
    }
    this.trackingMode = trackingMode;
    this.smoother = new PitchSmoother(targetMidi, trackingMode);
    this.result = NO_SIGNAL;
    this.lastValidTime = 0;
    this.running = true;
  }

  retarget(targetMidi: number): void {
    if (!this.running || this.released) return;
    const previous = this.result;
    const rescored = this.smoother.setTarget(targetMidi);
    if (rescored) this.result = preservePitchHold(rescored, previous);
  }

  ingestEstimate(nowMs: number, estimate: PitchEstimate): PitchResult {
    if (!this.running || this.released) return this.result;
    if (isPitchEstimateSignal(estimate)) {
      this.lastValidTime = nowMs;
      const published = this.smoother.accept(midiFromHz(estimate.frequencyHz), estimate.confidence);
      if (published) this.result = published;
      return this.result;
    }
    if (nowMs - this.lastValidTime > PITCH_HOLD_MS) {
      this.result = NO_SIGNAL;
      this.smoother.reset();
    } else {
      this.result = holdPitchResult(this.result);
    }
    return this.result;
  }

  analysisSizes(): { windowSize: number; hopSize: number } {
    const profile = PITCH_TRACKING_PROFILES[this.trackingMode];
    return {
      windowSize: profile.windowSizeOverride ?? PITCH_WINDOW_SIZE,
      hopSize: profile.hopSizeOverride ?? PITCH_HOP_SIZE,
    };
  }

  stop(): void {
    this.running = false;
    this.result = NO_SIGNAL;
  }

  release(): void {
    this.stop();
    this.released = true;
  }
}
