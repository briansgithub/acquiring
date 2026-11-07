import { estimatePitch } from './pitch-detector';
import {
  PITCH_SAMPLE_RATE, PitchHopBuffer, PitchPublisher, type PitchSource,
} from './pitch-publisher';
import type { PitchResult } from './pitch-results';
import { PitchTrackingMode } from './pitch-smoother';

/**
 * Native capture-loop owner minus AudioRecord/getUserMedia: hop buffer, YIN, 200ms hold.
 * PCM hops and nowMs are injected so tests own the clock.
 */
export class MicrophonePitchTracker implements PitchSource {
  private readonly publisher: PitchPublisher;
  private buffer: PitchHopBuffer;

  constructor(targetMidi = 60, trackingMode = PitchTrackingMode.STANDARD) {
    this.publisher = new PitchPublisher(targetMidi, trackingMode);
    this.buffer = this.makeBuffer();
  }

  get current(): PitchResult { return this.publisher.current; }
  get targetMidi(): number { return this.publisher.targetMidi; }
  get isRunning(): boolean { return this.publisher.isRunning; }
  analysisSizes(): { windowSize: number; hopSize: number } { return this.publisher.analysisSizes(); }

  start(targetMidi: number, trackingMode?: PitchTrackingMode): void {
    this.publisher.start(targetMidi, trackingMode);
    this.buffer = this.makeBuffer();
  }

  retarget(targetMidi: number): void { this.publisher.retarget(targetMidi); }

  pushHop(nowMs: number, hop: Int16Array): PitchResult {
    const window = this.buffer.push(hop);
    if (!window) return this.publisher.current;
    return this.publisher.ingestEstimate(nowMs, estimatePitch(window, PITCH_SAMPLE_RATE));
  }

  stop(): void {
    this.publisher.stop();
    this.buffer.reset();
  }

  release(): void {
    this.publisher.release();
    this.buffer.reset();
  }

  private makeBuffer(): PitchHopBuffer {
    const { windowSize, hopSize } = this.publisher.analysisSizes();
    return new PitchHopBuffer(windowSize, hopSize);
  }
}
