import { describe, expect, it } from 'vitest';
import { BrowserMicrophoneCapture, PITCH_SAMPLE_RATE } from '../../audio/capture';
import type { MicrophoneCaptureTransport } from '../../audio/capture';
import { LISTEN_TIMEOUT_MS, SingingMicrophoneSession } from './singing-microphone';

class FakeTransport implements MicrophoneCaptureTransport {
  async start(): Promise<void> { /* synthetic; tests pushAudio directly */ }
  stop(): void { /* no IO */ }
}

function sine(frequency: number, hop = 512, at = 0): Float32Array {
  return Float32Array.from({ length: hop }, (_, i) => Math.sin(2 * Math.PI * frequency * (at + i) / PITCH_SAMPLE_RATE));
}

describe('SingingMicrophoneSession listen/Flip-Flop', () => {
  it('listens on an explicit gesture, skips held-only writes, and times out without fabricating cents', () => {
    let now = 1_000;
    const capture = new BrowserMicrophoneCapture(undefined, {
      transport: new FakeTransport(), now: () => now, onPageHide: false,
    });
    const session = new SingingMicrophoneSession({ capture, now: () => now });
    expect(session.action.kind).toBe('idle');
    session.listen(1, 69);
    expect(session.action).toMatchObject({ kind: 'listening', slot: 1 });
    let n = 0;
    for (let i = 0; i < 16; i++) {
      capture.pushAudio(sine(440, 512, n), PITCH_SAMPLE_RATE, now);
      n += 512;
    }
    session.tick(now);
    expect(session.slot1?.label).toMatch(/A4/);
    expect(session.slot1?.cents).toBeCloseTo(0, 0);
    now += LISTEN_TIMEOUT_MS;
    session.tick(now);
    expect(session.action.kind).toBe('idle');
    session.release();
  });

  it('Flip-Flop starts at MIDI 60 from a user gesture and stop clears the lease', () => {
    const capture = new BrowserMicrophoneCapture(undefined, {
      transport: new FakeTransport(), now: () => 0, onPageHide: false,
    });
    const session = new SingingMicrophoneSession({ capture, now: () => 0 });
    session.setFlipFlop(true);
    expect(session.action).toMatchObject({ kind: 'flipflop', slot: 1 });
    session.setFlipFlop(false);
    expect(session.action.kind).toBe('idle');
    session.release();
  });
});
