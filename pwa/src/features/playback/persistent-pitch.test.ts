import {describe,expect,it} from 'vitest';
import {PitchTrackingMode, type ExclusivePitchSource, type PitchResult} from '../../audio/capture';
import {
  PersistentPitchPhase, PersistentPlaybackPitchController, effectiveTargetMidi, melodyTimelineDisplayCents,
  melodyTimelinePitchEstimate, resolvePersistentPitchTarget, retargetPitchResult,
  trackingModeForPersistentPitchSelection,
} from './persistent-pitch';

class FakeExclusive implements ExclusivePitchSource {
  current: PitchResult = {kind: 'no-signal'};
  ownsMicrophone = false;
  claimedModes: PitchTrackingMode[] = [];
  startedTargets: number[] = [];
  retargetedTargets: number[] = [];
  claim(mode = PitchTrackingMode.STANDARD) { this.claimedModes.push(mode); this.ownsMicrophone = true; }
  start(midi: number) { this.startedTargets.push(midi); }
  retarget(midi: number) { this.retargetedTargets.push(midi); }
  stop() { this.ownsMicrophone = false; }
  release() { this.stop(); }
}

describe('native persistent pitch selection/controller', () => {
  it('clamps chord-tone display per chord while keeping the requested index', () => {
    const selection = {kind: 'chord-tone' as const, requestedIndex: 2};
    const two = [{sourceMidi: 60, label: '60'}, {sourceMidi: 64, label: '64'}];
    const four = [...two, {sourceMidi: 67, label: '67'}, {sourceMidi: 71, label: '71'}];
    expect(resolvePersistentPitchTarget(selection, null, two, null)?.position).toEqual({kind: 'chord-tone', displayedIndex: 1});
    expect(resolvePersistentPitchTarget(selection, null, four, null)?.sourceMidi).toBe(67);
    expect(resolvePersistentPitchTarget(selection, null, [], null)).toBeNull();
  });

  it('resolves root and melody only when the current event is pitched', () => {
    expect(resolvePersistentPitchTarget({kind: 'simple-root'}, {sourceMidi: 48, label: 'r'}, [], null)?.position).toEqual({kind: 'simple-root'});
    expect(resolvePersistentPitchTarget({kind: 'melody'}, null, [], {sourceMidi: 72, label: 'm'})?.position).toEqual({kind: 'melody-current'});
    expect(resolvePersistentPitchTarget({kind: 'melody'}, null, [], null)).toBeNull();
  });

  it('retargets cents without changing captured midi', () => {
    const retargeted = retargetPitchResult({kind: 'estimate', midi: 69.25, centsError: -975, confidence: 0.91, isHeld: false}, 69);
    expect(retargeted).toMatchObject({kind: 'estimate', midi: 69.25, centsError: 25, confidence: 0.91});
  });

  it('melody timeline feedback uses melody estimates even without a current note', () => {
    const estimate = {kind: 'estimate' as const, midi: 72.2, centsError: 20, confidence: 0.9, isHeld: false};
    const target = {sourceMidi: 72, label: '1̂', position: {kind: 'melody-current' as const}};
    expect(melodyTimelinePitchEstimate({kind: 'melody'}, target, estimate)).toBe(estimate);
    expect(melodyTimelinePitchEstimate({kind: 'melody'}, null, estimate)).toBe(estimate);
    expect(melodyTimelineDisplayCents(estimate)).toBe(20);
    expect(melodyTimelinePitchEstimate({kind: 'simple-root'}, target, estimate)).toBeNull();
  });

  it('only persistent melody uses MELODY_FAST', () => {
    expect(trackingModeForPersistentPitchSelection({kind: 'melody'})).toBe(PitchTrackingMode.MELODY_FAST);
    expect(trackingModeForPersistentPitchSelection({kind: 'simple-root'})).toBe(PitchTrackingMode.STANDARD);
    expect(trackingModeForPersistentPitchSelection({kind: 'chord-tone', requestedIndex: 2})).toBe(PitchTrackingMode.STANDARD);
    expect(PitchTrackingMode.MELODY_FAST).toBe('MELODY_FAST');
  });

  it('permission-delayed melody activation retains fast tracking', () => {
    const source = new FakeExclusive();
    const controller = new PersistentPlaybackPitchController(source);
    expect(controller.activate({kind: 'melody'}, 72, false)).toBe(true);
    expect(source.claimedModes).toEqual([PitchTrackingMode.MELODY_FAST]);
    controller.onPermissionResult(true);
    expect(source.startedTargets).toEqual([72]);
    expect(controller.phase).toBe(PersistentPitchPhase.LISTENING);
  });

  it('latches without a resolved target at midi 60', () => {
    const source = new FakeExclusive();
    const controller = new PersistentPlaybackPitchController(source);
    expect(controller.activate({kind: 'melody'}, null, true)).toBe(false);
    expect(controller.selection).toEqual({kind: 'melody'});
    expect(source.startedTargets).toEqual([60]);
  });

  it('retargets without reclaiming', () => {
    const source = new FakeExclusive();
    const controller = new PersistentPlaybackPitchController(source);
    controller.activate({kind: 'melody'}, 72, true);
    controller.updateTarget(74);
    expect(source.startedTargets).toEqual([72]);
    expect(source.retargetedTargets).toEqual([74]);
    expect(source.claimedModes).toHaveLength(1);
  });

  it('effective target includes transpose and octave offset', () => {
    const resolved = {sourceMidi: 60, label: '1̂', position: {kind: 'simple-root' as const}};
    expect(effectiveTargetMidi(resolved, 5, 1)).toBe(77);
    expect(effectiveTargetMidi(resolved, 5, 0)).toBe(65);
  });
});
