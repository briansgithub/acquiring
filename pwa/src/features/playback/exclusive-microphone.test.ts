import {describe, expect, it} from 'vitest';
import {
  BrowserMicrophoneCapture, MicrophonePitchCoordinator, MicrophonePitchOwner, PITCH_SAMPLE_RATE,
  type MicrophoneCaptureTransport,
} from '../../audio/capture';
import {PersistentPitchPhase, PersistentPlaybackPitchController} from './persistent-pitch';
import {FLIPFLOP_REST_MS, FLIPFLOP_SLOT_MS, SingingMicrophoneSession} from '../singing/singing-microphone';

class FakeTransport implements MicrophoneCaptureTransport {
  async start(): Promise<void> { /* synthetic; tests pushAudio directly */ }
  stop(): void { /* no IO */ }
}

function sine(frequency: number, hop = 512, at = 0): Float32Array {
  return Float32Array.from({length: hop}, (_, i) => Math.sin(2 * Math.PI * frequency * (at + i) / PITCH_SAMPLE_RATE));
}

function sharedAt(now: {t: number}) {
  const capture = new BrowserMicrophoneCapture(undefined, {
    transport: new FakeTransport(), now: () => now.t, onPageHide: false,
  });
  const coordinator = new MicrophonePitchCoordinator(capture);
  const persistent = coordinator.sourceFor(MicrophonePitchOwner.PLAYBACK_PERSISTENT);
  const singing = coordinator.sourceFor(MicrophonePitchOwner.SINGING_TOOL);
  const session = new SingingMicrophoneSession({capture, source: singing, now: () => now.t});
  const controller = new PersistentPlaybackPitchController(persistent);
  return {capture, coordinator, persistent, singing, session, controller};
}

function pushTone(capture: BrowserMicrophoneCapture, now: {t: number}, hz: number): void {
  let n = 0;
  for (let i = 0; i < 16; i++) {
    capture.pushAudio(sine(hz, 512, n), PITCH_SAMPLE_RATE, now.t);
    n += 512;
  }
}

describe('shared PLAYBACK_PERSISTENT / SINGING_TOOL exclusive lease', () => {
  it('matches native permission/ownership: singing steal idles persistent; delayed persistent stop/start ignored', () => {
    const now = {t: 1_000};
    const {capture, persistent, singing, controller} = sharedAt(now);
    expect(controller.activate({kind: 'melody'}, 72, false)).toBe(true);
    expect(persistent.ownsMicrophone).toBe(true);
    expect(controller.phase).toBe(PersistentPitchPhase.AWAITING_PERMISSION);
    controller.onPermissionResult(true);
    expect(controller.phase).toBe(PersistentPitchPhase.LISTENING);
    expect(capture.isRunning).toBe(true);

    singing.claim();
    singing.start(67);
    controller.onOwnershipChanged(persistent.ownsMicrophone);
    persistent.start(80);
    persistent.stop();

    expect(persistent.ownsMicrophone).toBe(false);
    expect(singing.ownsMicrophone).toBe(true);
    expect(controller.phase).toBe(PersistentPitchPhase.IDLE);
    expect(controller.selection).toBeNull();
    expect(capture.isRunning).toBe(true);
  });

  it('singing listen steals monitoring without writing stolen pitch into slots; delayed stop cannot kill the new owner', () => {
    const now = {t: 1_000};
    const {capture, persistent, singing, session, controller} = sharedAt(now);
    controller.activate({kind: 'melody'}, 69, true);
    expect(persistent.ownsMicrophone).toBe(true);
    session.listen(1, 69);
    expect(singing.ownsMicrophone).toBe(true);
    expect(persistent.ownsMicrophone).toBe(false);
    controller.onOwnershipChanged(false);
    expect(controller.phase).toBe(PersistentPitchPhase.IDLE);
    pushTone(capture, now, 440);
    session.tick(now.t);
    expect(session.action).toMatchObject({kind: 'listening', slot: 1});
    expect(session.slot1?.label).toMatch(/A4/);
    const kept = session.slot1;

    controller.activate({kind: 'melody'}, 72, true);
    expect(persistent.ownsMicrophone).toBe(true);
    expect(singing.ownsMicrophone).toBe(false);
    session.tick(now.t);
    expect(session.action.kind).toBe('idle');
    expect(session.slot1).toEqual(kept);
    pushTone(capture, now, 880);
    session.tick(now.t);
    expect(session.action.kind).toBe('idle');
    expect(session.slot1).toEqual(kept);
    session.stop();
    persistent.start(80);
    expect(persistent.ownsMicrophone).toBe(true);
    expect(capture.isRunning).toBe(true);
  });

  it('Flip-Flop rest is self-stop, not steal; rest timer survives a persistent claim then reclaim', () => {
    const now = {t: 0};
    const {persistent, session, controller} = sharedAt(now);
    session.setFlipFlop(true);
    now.t += FLIPFLOP_SLOT_MS;
    session.tick(now.t);
    now.t += FLIPFLOP_SLOT_MS;
    session.tick(now.t);
    expect(session.action.kind).toBe('flipflop-rest');
    expect(session.ownsMicrophone).toBe(false);
    controller.activate({kind: 'melody'}, 60, true);
    expect(persistent.ownsMicrophone).toBe(true);
    session.tick(now.t);
    expect(session.action.kind).toBe('flipflop-rest');
    now.t += FLIPFLOP_REST_MS;
    session.tick(now.t);
    expect(session.action).toMatchObject({kind: 'flipflop', slot: 1});
    expect(session.ownsMicrophone).toBe(true);
    expect(persistent.ownsMicrophone).toBe(false);
  });

  it('permission denial on the singing lease surfaces Error without stopping a later persistent owner', async () => {
    const denied = new (class implements MicrophoneCaptureTransport {
      async start(): Promise<void> {
        throw Object.assign(new Error('Permission denied'), {name: 'NotAllowedError'});
      }
      stop(): void { /* no IO */ }
    })();
    const capture = new BrowserMicrophoneCapture(undefined, {
      transport: denied, now: () => 0, onPageHide: false,
    });
    const coordinator = new MicrophonePitchCoordinator(capture);
    const persistent = coordinator.sourceFor(MicrophonePitchOwner.PLAYBACK_PERSISTENT);
    const singing = coordinator.sourceFor(MicrophonePitchOwner.SINGING_TOOL);
    const session = new SingingMicrophoneSession({capture, source: singing, now: () => 0});
    const controller = new PersistentPlaybackPitchController(persistent);
    session.listen(1, 60);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    session.tick(0);
    expect(session.error).toBe('Permission denied');
    expect(session.action.kind).toBe('idle');
    expect(session.slot1).toBeNull();
    controller.activate({kind: 'melody'}, 72, true);
    expect(persistent.ownsMicrophone).toBe(true);
    session.tick(0);
    expect(session.action.kind).toBe('idle');
    expect(persistent.ownsMicrophone).toBe(true);
    session.release();
    expect(persistent.ownsMicrophone).toBe(true);
    coordinator.release();
  });

  it('injected session release stops only this lease; coordinator.release still kills capture', () => {
    const now = {t: 0};
    const {capture, coordinator, persistent, session, controller} = sharedAt(now);
    controller.activate({kind: 'melody'}, 60, true);
    session.release();
    expect(persistent.ownsMicrophone).toBe(true);
    expect(capture.isRunning).toBe(true);
    coordinator.release();
    expect(persistent.ownsMicrophone).toBe(false);
    expect(capture.isRunning).toBe(false);
  });
});
