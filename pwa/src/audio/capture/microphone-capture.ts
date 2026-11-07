import { LinearPcmResampler, PcmHopEmitter, float32ToPcm16 } from './pitch-pcm';
import { MicrophonePitchTracker } from './pitch-tracker';
import {
  createWebAudioMicrophoneTransport, type MicrophoneCaptureTransport,
} from './microphone-transport';
import type { PitchSource } from './pitch-publisher';
import type { PitchResult } from './pitch-results';
import { PitchTrackingMode } from './pitch-smoother';

export interface BrowserMicrophoneCaptureOptions {
  transport?: MicrophoneCaptureTransport;
  now?: () => number;
  onPageHide?: boolean;
}

/**
 * getUserMedia hop clock into MicrophonePitchTracker. start() is opt-in; expand must not call it.
 * In-flight getUserMedia is serialized so a superseded open cannot stop the new session.
 */
export class BrowserMicrophoneCapture implements PitchSource {
  private generation = 0;
  private live = false;
  private activeMode: PitchTrackingMode | null = null;
  private queue: Promise<void> = Promise.resolve();
  private readonly resampler = new LinearPcmResampler();
  private hops = new PcmHopEmitter();
  private readonly transport: MicrophoneCaptureTransport;
  private readonly now: () => number;
  private readonly pageHide?: () => void;
  private released = false;

  constructor(
    private readonly tracker = new MicrophonePitchTracker(),
    options: BrowserMicrophoneCaptureOptions = {},
  ) {
    this.transport = options.transport ?? createWebAudioMicrophoneTransport();
    this.now = options.now ?? (() => performance.now());
    if (options.onPageHide !== false && typeof window !== 'undefined') {
      this.pageHide = () => { this.stop(); };
      window.addEventListener('pagehide', this.pageHide);
    }
  }

  get current(): PitchResult { return this.tracker.current; }
  get isRunning(): boolean { return this.tracker.isRunning; }

  start(targetMidi: number, trackingMode?: PitchTrackingMode): void {
    if (this.released) return;
    const mode = trackingMode ?? this.activeMode ?? PitchTrackingMode.STANDARD;
    const retargetOnly = this.tracker.isRunning && this.live && this.activeMode === mode;
    this.tracker.start(targetMidi, mode);
    this.activeMode = mode;
    if (retargetOnly) return;
    this.hops = new PcmHopEmitter(this.tracker.analysisSizes().hopSize);
    this.resampler.reset();
    const generation = ++this.generation;
    this.live = true;
    this.queue = this.queue.then(() => this.open(generation), () => this.open(generation));
  }

  retarget(targetMidi: number): void { this.tracker.retarget(targetMidi); }

  pushAudio(frame: Float32Array, sampleRate: number, nowMs = this.now()): PitchResult {
    if (this.released || !this.tracker.isRunning) return this.tracker.current;
    const pcm = this.resampler.push(float32ToPcm16(frame), sampleRate);
    for (const hop of this.hops.push(pcm)) this.tracker.pushHop(nowMs, hop);
    return this.tracker.current;
  }

  stop(): void {
    const generation = ++this.generation;
    this.live = false;
    this.activeMode = null;
    this.resampler.reset();
    this.hops.reset();
    this.tracker.stop();
    this.transport.stop(); // retire active tracks now, not after pending permission/module work
    this.queue = this.queue.then(() => {
      if (this.generation === generation) this.transport.stop();
    }, () => {
      if (this.generation === generation) this.transport.stop();
    });
  }

  release(): void {
    this.stop();
    this.released = true;
    this.tracker.release();
    if (this.pageHide) window.removeEventListener('pagehide', this.pageHide);
  }

  private async open(generation: number): Promise<void> {
    this.transport.stop();
    if (generation !== this.generation) return;
    try {
      await this.transport.start((frame, sampleRate) => {
        if (generation !== this.generation) return;
        this.pushAudio(frame, sampleRate);
      });
      if (generation !== this.generation) this.transport.stop();
    } catch (error) {
      if (generation !== this.generation) return;
      this.live = false;
      const message = error instanceof Error && error.message ? error.message : 'Microphone capture failed';
      this.tracker.fail(message);
    }
  }
}
