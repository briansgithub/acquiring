import { describe, expect, it } from 'vitest';
import {
  MicrophonePitchCoordinator, MicrophonePitchOwner, NO_SIGNAL, PitchPublisher, PitchTrackingMode,
} from './index';
import type { PitchEstimate } from './index';

const A4: PitchEstimate = Object.freeze({ frequencyHz: 440, confidence: 0.9, rms: 0.1 });

function settle(publisher: PitchPublisher, now = 1_000): void {
  for (let i = 0; i < 6; i++) publisher.ingestEstimate(now, A4);
}

describe('MicrophonePitchCoordinator exclusive lease', () => {
  it('lets only the claiming owner start and ignores delayed stop from the previous owner', () => {
    const tracker = new PitchPublisher(69);
    const coordinator = new MicrophonePitchCoordinator(tracker);
    const playback = coordinator.sourceFor(MicrophonePitchOwner.PLAYBACK_PERSISTENT);
    const singing = coordinator.sourceFor(MicrophonePitchOwner.SINGING_TOOL);

    playback.claim();
    expect(playback.ownsMicrophone).toBe(true);
    playback.start(69);
    settle(tracker);
    expect(tracker.current.kind).toBe('estimate');

    singing.claim(PitchTrackingMode.MELODY_FAST);
    expect(playback.ownsMicrophone).toBe(false);
    expect(singing.ownsMicrophone).toBe(true);
    expect(tracker.current).toBe(NO_SIGNAL);
    expect(tracker.analysisSizes()).toEqual({ windowSize: 2048, hopSize: 512 });

    playback.stop();
    playback.start(60);
    expect(tracker.isRunning).toBe(false);
    expect(singing.ownsMicrophone).toBe(true);

    singing.start(64);
    expect(tracker.isRunning).toBe(true);
    expect(tracker.targetMidi).toBe(64);
    expect(tracker.analysisSizes()).toEqual({ windowSize: 1024, hopSize: 256 });
  });

  it('same-owner claim keeps capture running and coordinator release kills every lease', () => {
    const tracker = new PitchPublisher(69);
    const coordinator = new MicrophonePitchCoordinator(tracker);
    const playback = coordinator.sourceFor(MicrophonePitchOwner.PLAYBACK_PERSISTENT);
    playback.claim();
    playback.start(69);
    settle(tracker);
    playback.claim();
    expect(tracker.current.kind).toBe('estimate');
    expect(playback.ownsMicrophone).toBe(true);
    coordinator.release();
    expect(playback.ownsMicrophone).toBe(false);
    expect(tracker.current).toBe(NO_SIGNAL);
    playback.claim();
    playback.start(69);
    expect(tracker.isRunning).toBe(false);
    coordinator.release();
  });
});

it('true departure revokes both old leases and requires a fresh explicit claim, not permanent disposal',()=>{
 const tracker=new PitchPublisher(69),coordinator=new MicrophonePitchCoordinator(tracker);
 const persistent=coordinator.sourceFor(MicrophonePitchOwner.PLAYBACK_PERSISTENT),singing=coordinator.sourceFor(MicrophonePitchOwner.SINGING_TOOL);
 persistent.claim(PitchTrackingMode.MELODY_FAST);persistent.start(69);coordinator.stopAll();
 expect(persistent.ownsMicrophone).toBe(false);expect(singing.ownsMicrophone).toBe(false);expect(tracker.isRunning).toBe(false);expect(tracker.current).toBe(NO_SIGNAL);
 persistent.start(60);singing.start(60);expect(tracker.isRunning).toBe(false);
 singing.claim();singing.start(64);expect(tracker.isRunning).toBe(true);expect(tracker.targetMidi).toBe(64);
 coordinator.release();coordinator.stopAll();singing.claim();singing.start(60);expect(tracker.isRunning).toBe(false);
});
