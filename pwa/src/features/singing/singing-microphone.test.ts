import { describe, expect, it } from 'vitest';
import { BrowserMicrophoneCapture, PITCH_SAMPLE_RATE } from '../../audio/capture';
import type { MicrophoneCaptureTransport } from '../../audio/capture';
import {
  AUTO_LISTEN_MS, FLIPFLOP_REST_MS, FLIPFLOP_SLOT_MS, LISTEN_TIMEOUT_MS, RECORD_TIMEOUT_MS,
  SingingMicrophoneSession, formatSungIntervalCents, sungInterval,
} from './singing-microphone';

class FakeTransport implements MicrophoneCaptureTransport {
  async start(): Promise<void> { /* synthetic; tests pushAudio directly */ }
  stop(): void { /* no IO */ }
}

function sine(frequency: number, hop = 512, at = 0): Float32Array {
  return Float32Array.from({ length: hop }, (_, i) => Math.sin(2 * Math.PI * frequency * (at + i) / PITCH_SAMPLE_RATE));
}

function sessionAt(now: { t: number }): SingingMicrophoneSession {
  const capture = new BrowserMicrophoneCapture(undefined, {
    transport: new FakeTransport(), now: () => now.t, onPageHide: false,
  });
  return new SingingMicrophoneSession({ capture, now: () => now.t });
}

describe('SingingMicrophoneSession listen/Flip-Flop', () => {
  it('listens on an explicit gesture, skips held-only writes, and times out without fabricating cents', () => {
    const now = { t: 1_000 };
    const session = sessionAt(now);
    expect(session.action.kind).toBe('idle');
    expect(session.optedIn).toBe(false);
    session.listen(1, 69);
    expect(session.optedIn).toBe(true);
    expect(session.action).toMatchObject({ kind: 'listening', slot: 1 });
    let n = 0;
    for (let i = 0; i < 16; i++) {
      session.capture.pushAudio(sine(440, 512, n), PITCH_SAMPLE_RATE, now.t);
      n += 512;
    }
    session.tick(now.t);
    expect(session.slot1?.label).toMatch(/A4/);
    expect(session.slot1?.cents).toBeCloseTo(0, 0);
    expect(session.remainingMs(now.t)).toBe(LISTEN_TIMEOUT_MS);
    now.t += 500;
    expect(session.remainingMs(now.t)).toBe(LISTEN_TIMEOUT_MS - 500);
    now.t += LISTEN_TIMEOUT_MS - 500;
    session.tick(now.t);
    expect(session.action.kind).toBe('idle');
    expect(session.remainingMs(now.t)).toBe(0);
    expect(session.optedIn).toBe(true);
    session.release();
    expect(session.optedIn).toBe(false);
  });

  it('Flip-Flop starts at MIDI 60 from a user gesture and stop clears the lease', () => {
    const session = sessionAt({ t: 0 });
    session.setFlipFlop(true);
    expect(session.optedIn).toBe(true);
    expect(session.action).toMatchObject({ kind: 'flipflop', slot: 1 });
    expect(session.remainingMs()).toBe(FLIPFLOP_SLOT_MS);
    session.setFlipFlop(false);
    expect(session.action.kind).toBe('idle');
    expect(session.optedIn).toBe(true);
    session.release();
  });

  it('Flip-Flop rests 2s after slot 2 with the mic stopped, then resumes slot 1', () => {
    const now = { t: 0 };
    const session = sessionAt(now);
    session.setFlipFlop(true);
    expect(session.capture.isRunning).toBe(true);
    now.t += FLIPFLOP_SLOT_MS;
    session.tick(now.t);
    expect(session.action).toMatchObject({ kind: 'flipflop', slot: 2 });
    expect(session.capture.isRunning).toBe(true);
    now.t += FLIPFLOP_SLOT_MS;
    session.tick(now.t);
    expect(session.action.kind).toBe('flipflop-rest');
    expect(session.capture.isRunning).toBe(false);
    expect(session.remainingMs(now.t)).toBe(0);
    if (session.action.kind !== 'flipflop-rest') throw new Error('expected rest');
    expect(session.action.until).toBe(now.t + FLIPFLOP_REST_MS);
    now.t += FLIPFLOP_REST_MS - 1;
    session.tick(now.t);
    expect(session.action.kind).toBe('flipflop-rest');
    expect(session.capture.isRunning).toBe(false);
    now.t += 1;
    session.tick(now.t);
    expect(session.action).toMatchObject({ kind: 'flipflop', slot: 1 });
    expect(session.capture.isRunning).toBe(true);
    session.release();
  });

  it('policy A first-load auto-listen starts while idle, including without prior opt-in', () => {
    const session = sessionAt({ t: 0 });
    expect(session.optedIn).toBe(false);
    expect(session.maybeAutoListen(1, 69)).toBe(true);
    expect(session.optedIn).toBe(true);
    expect(session.action).toMatchObject({ kind: 'listening', slot: 1, targetMidi: 69 });
    expect(session.capture.isRunning).toBe(true);
    expect(session.maybeAutoListen(1, 60)).toBe(false);
    session.stop();
    expect(session.maybeAutoListen(1, 60)).toBe(true);
    expect(session.action).toMatchObject({ kind: 'listening', slot: 1, targetMidi: 60 });
    session.setFlipFlop(true);
    expect(session.maybeAutoListen(1, 69)).toBe(false);
    expect(AUTO_LISTEN_MS).toBe(800);
    session.release();
  });

  it('permission denial surfaces Error, returns idle, and does not invent cents', async () => {
    const denied = new (class implements MicrophoneCaptureTransport {
      async start(): Promise<void> {
        throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
      }
      stop(): void { /* no IO */ }
    })();
    const capture = new BrowserMicrophoneCapture(undefined, {
      transport: denied, now: () => 0, onPageHide: false,
    });
    const session = new SingingMicrophoneSession({ capture, now: () => 0 });
    session.maybeAutoListen(1, 60);
    expect(session.action.kind).toBe('listening');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    session.tick(0);
    expect(session.error).toBe('Permission denied');
    expect(session.action.kind).toBe('idle');
    expect(session.slot1).toBeNull();
    expect(session.capture.isRunning).toBe(false);
    session.release();
  });

  it('measured interval uses accepted calculateMeasuredInterval on raw slot MIDI', () => {
    expect(sungInterval(null, { midi: 64, cents: 0, label: 'E4' })).toBeNull();
    const interval = sungInterval(
      { midi: 60.1, cents: 10, label: 'C4' },
      { midi: 64.1, cents: 10, label: 'E4' },
    );
    expect(interval?.shorthand).toBe('M3 ↑');
    expect(interval?.centsDeviation).toBeCloseTo(0, 8);
    expect(formatSungIntervalCents(15)).toBe('+15¢');
    expect(formatSungIntervalCents(-30.4)).toBe('-30¢');
  });

  it('Record clears the slot, writes nearest-cents, and times out without fabricating silence', () => {
    const now = { t: 0 };
    const session = sessionAt(now);
    session.listen(1, 69);
    let hops = 0;
    for (let i = 0; i < 16; i++) {
      session.capture.pushAudio(sine(440, 512, hops), PITCH_SAMPLE_RATE, now.t);
      hops += 512;
    }
    session.tick(now.t);
    expect(session.slot1).not.toBeNull();
    session.record(1);
    expect(session.action).toMatchObject({ kind: 'recording', slot: 1 });
    expect(session.slot1).toBeNull();
    expect(session.remainingMs(now.t)).toBe(RECORD_TIMEOUT_MS);
    session.release();
    const silent = sessionAt(now);
    silent.record(1);
    now.t += RECORD_TIMEOUT_MS;
    silent.tick(now.t);
    expect(silent.action.kind).toBe('idle');
    expect(silent.slot1).toBeNull();
    silent.record(2);
    let n = 0;
    for (let i = 0; i < 16; i++) {
      silent.capture.pushAudio(sine(440, 512, n), PITCH_SAMPLE_RATE, now.t);
      n += 512;
    }
    silent.tick(now.t);
    expect(silent.slot2?.label).toMatch(/A4/);
    expect(Math.abs(silent.slot2?.cents ?? 99)).toBeLessThan(15);
    silent.release();
  });

  it('clearSlots drops captured pitches without stopping a later listen', () => {
    const now = { t: 0 };
    const session = sessionAt(now);
    session.listen(1, 60);
    let hops = 0;
    for (let i = 0; i < 16; i++) {
      session.capture.pushAudio(sine(440, 512, hops), PITCH_SAMPLE_RATE, now.t);
      hops += 512;
    }
    session.tick(now.t);
    session.stop();
    expect(session.slot1).not.toBeNull();
    session.clearSlots();
    expect(session.slot1).toBeNull();
    expect(session.slot2).toBeNull();
    expect(session.action.kind).toBe('idle');
    session.release();
  });

  it('clearCollapsedToolState stops listen and drops captured pitches', () => {
    const now = { t: 0 };
    const session = sessionAt(now);
    session.listen(1, 60);
    let hops = 0;
    for (let i = 0; i < 16; i++) {
      session.capture.pushAudio(sine(440, 512, hops), PITCH_SAMPLE_RATE, now.t);
      hops += 512;
    }
    session.tick(now.t);
    expect(session.slot1).not.toBeNull();
    expect(session.action.kind).toBe('listening');
    session.clearCollapsedToolState();
    expect(session.slot1).toBeNull();
    expect(session.slot2).toBeNull();
    expect(session.action.kind).toBe('idle');
    session.release();
  });
});

it('true-background clear cancels Flip-Flop rest and cannot reacquire when the rest deadline passes',()=>{
 const now={t:1000},session=sessionAt(now);session.setFlipFlop(true);
 now.t+=FLIPFLOP_SLOT_MS;session.tick();now.t+=FLIPFLOP_SLOT_MS;session.tick();expect(session.action.kind).toBe('flipflop-rest');
 session.clearCollapsedToolState();now.t+=FLIPFLOP_REST_MS;session.tick();expect(session.action.kind).toBe('idle');expect(session.ownsMicrophone).toBe(false);expect(session.capture.isRunning).toBe(false);expect(session.slot1).toBeNull();expect(session.slot2).toBeNull();session.release();
});

it('interrupted exit restores passive slots without mic intent or ownership',()=>{const session=sessionAt({t:1000});const pitch={midi:69,cents:0,label:'A4'};session.clearCollapsedToolState();session.restorePassiveSlots(pitch,pitch);expect(session.slot1).toEqual(pitch);expect(session.slot2).toEqual(pitch);expect(session.action.kind).toBe('idle');expect(session.ownsMicrophone).toBe(false);expect(session.capture.isRunning).toBe(false);session.record(1);session.restorePassiveSlots(pitch,pitch);expect(session.slot1).toBeNull();session.release();});
