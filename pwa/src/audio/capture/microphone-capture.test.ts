import { describe, expect, it } from 'vitest';
import {
  BrowserMicrophoneCapture, MicrophonePitchCoordinator, MicrophonePitchOwner, NO_SIGNAL,
  PITCH_SAMPLE_RATE, PitchTrackingMode,
} from './index';
import type { MicrophoneCaptureTransport } from './index';

class FakeTransport implements MicrophoneCaptureTransport {
  listener: ((frame: Float32Array, sampleRate: number) => void) | null = null;
  starts = 0;
  stops = 0;
  fail: Error | null = null;
  gate: Promise<void> = Promise.resolve();
  async start(listener: (frame: Float32Array, sampleRate: number) => void): Promise<void> {
    this.starts += 1;
    if (this.fail) throw this.fail;
    await this.gate;
    this.listener = listener;
  }
  stop(): void { this.stops += 1; this.listener = null; }
}

function sineHop(frequency = 440, hop = 512, rate = PITCH_SAMPLE_RATE, at = 0): Float32Array {
  return Float32Array.from({ length: hop }, (_, i) => Math.sin(2 * Math.PI * frequency * (at + i) / rate));
}

async function flush(): Promise<void> { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }

describe('BrowserMicrophoneCapture injected transport', () => {
  it('does not open the microphone until start, then publishes A4 from synthetic hops', async () => {
    const transport = new FakeTransport();
    const capture = new BrowserMicrophoneCapture(undefined, { transport, now: () => 1_000, onPageHide: false });
    expect(transport.starts).toBe(0);
    capture.start(69);
    await flush();
    expect(transport.starts).toBe(1);
    let n = 0;
    for (let i = 0; i < 16; i++) {
      capture.pushAudio(sineHop(440, 512, PITCH_SAMPLE_RATE, n), PITCH_SAMPLE_RATE, 1_000 + i * 32);
      n += 512;
    }
    expect(capture.current.kind).toBe('estimate');
    expect(capture.current).toMatchObject({ isHeld: false });
    capture.stop();
    expect(capture.current).toBe(NO_SIGNAL);
    expect(transport.stops).toBeGreaterThan(0);
    capture.release();
  });

  it('fails closed on permission denial and ignores late open after stop', async () => {
    const denied = new FakeTransport();
    denied.fail = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    const capture = new BrowserMicrophoneCapture(undefined, { transport: denied, now: () => 0, onPageHide: false });
    capture.start(60);
    await Promise.resolve();
    await Promise.resolve();
    expect(capture.current).toMatchObject({ kind: 'error', message: 'Permission denied' });
    expect(capture.isRunning).toBe(false);

    let releaseGate!: () => void;
    const late = new FakeTransport();
    late.gate = new Promise<void>((resolve) => { releaseGate = resolve; });
    const delayed = new BrowserMicrophoneCapture(undefined, { transport: late, now: () => 0, onPageHide: false });
    delayed.start(60);
    delayed.stop();
    releaseGate();
    await flush();
    expect(delayed.current).toBe(NO_SIGNAL);
    expect(late.listener).toBeNull();
    delayed.release();
    capture.release();
  });

  it('exclusive singing lease stop tears down capture IO', async () => {
    const transport = new FakeTransport();
    const capture = new BrowserMicrophoneCapture(undefined, { transport, now: () => 0, onPageHide: false });
    const coordinator = new MicrophonePitchCoordinator(capture);
    const singing = coordinator.sourceFor(MicrophonePitchOwner.SINGING_TOOL);
    const playback = coordinator.sourceFor(MicrophonePitchOwner.PLAYBACK_PERSISTENT);
    singing.claim(PitchTrackingMode.STANDARD);
    singing.start(69);
    await flush();
    expect(transport.starts).toBe(1);
    playback.claim();
    await flush();
    expect(capture.current).toBe(NO_SIGNAL);
    singing.start(69);
    await flush();
    expect(capture.isRunning).toBe(false);
    capture.release();
  });
});
