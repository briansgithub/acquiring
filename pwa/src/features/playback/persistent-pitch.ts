/** Frozen 801cf798 PersistentPlaybackPitchPractice.kt selection/controller, no fabricated cents. */
import type {ExclusivePitchSource, PitchResult, PitchResultEstimate} from '../../audio/capture';
import {PitchTrackingMode} from '../../audio/capture';
import {singingOctaveSemitones} from '../singing/singing-octave';

export type PersistentPitchSelection =
  | {readonly kind: 'simple-root'}
  | {readonly kind: 'chord-tone'; readonly requestedIndex: number}
  | {readonly kind: 'melody'};

export type PersistentPitchCardPosition =
  | {readonly kind: 'simple-root'}
  | {readonly kind: 'chord-tone'; readonly displayedIndex: number}
  | {readonly kind: 'melody-current'};

export interface PlaybackPitchCardTarget {readonly sourceMidi: number; readonly label: string}

export interface ResolvedPersistentPitchTarget {
  readonly sourceMidi: number;
  readonly label: string;
  readonly position: PersistentPitchCardPosition;
}

export function effectiveTargetMidi(target: ResolvedPersistentPitchTarget, globalTranspose: number, octaveOffset: number): number {
  return (target.sourceMidi + globalTranspose + singingOctaveSemitones(octaveOffset)) | 0;
}

export function clampedChordToneIndex(requestedIndex: number, toneCount: number): number | null {
  if (toneCount <= 0) return null;
  return Math.max(0, Math.min(toneCount - 1, requestedIndex));
}

export function resolvePersistentPitchTarget(
  selection: PersistentPitchSelection | null,
  simpleRoot: PlaybackPitchCardTarget | null,
  chordTones: readonly PlaybackPitchCardTarget[],
  melody: PlaybackPitchCardTarget | null,
): ResolvedPersistentPitchTarget | null {
  if (selection?.kind === 'simple-root') {
    return simpleRoot ? Object.freeze({sourceMidi: simpleRoot.sourceMidi, label: simpleRoot.label, position: {kind: 'simple-root' as const}}) : null;
  }
  if (selection?.kind === 'chord-tone') {
    const displayed = clampedChordToneIndex(selection.requestedIndex, chordTones.length);
    if (displayed == null) return null;
    const tone = chordTones[displayed];
    return Object.freeze({sourceMidi: tone.sourceMidi, label: tone.label, position: {kind: 'chord-tone' as const, displayedIndex: displayed}});
  }
  if (selection?.kind === 'melody') {
    return melody ? Object.freeze({sourceMidi: melody.sourceMidi, label: melody.label, position: {kind: 'melody-current' as const}}) : null;
  }
  return null;
}

export function retargetPitchResult(result: PitchResult, targetMidi: number): PitchResult {
  if (result.kind !== 'estimate') return result;
  return Object.freeze({...result, centsError: (result.midi - targetMidi) * 100});
}

export function melodyTimelinePitchEstimate(
  selection: PersistentPitchSelection | null,
  resolvedTarget: ResolvedPersistentPitchTarget | null,
  pitchResult: PitchResult | null,
): PitchResultEstimate | null {
  if (selection?.kind !== 'melody') return null;
  if (resolvedTarget != null && resolvedTarget.position.kind !== 'melody-current') return null;
  return pitchResult?.kind === 'estimate' ? pitchResult : null;
}

export function melodyTimelineDisplayCents(estimate: PitchResultEstimate | null): number {
  return estimate?.centsError ?? 0;
}

export function trackingModeForPersistentPitchSelection(selection: PersistentPitchSelection): PitchTrackingMode {
  return selection.kind === 'melody' ? PitchTrackingMode.MELODY_FAST : PitchTrackingMode.STANDARD;
}

export enum PersistentPitchPhase { IDLE = 'IDLE', AWAITING_PERMISSION = 'AWAITING_PERMISSION', LISTENING = 'LISTENING' }

const PERSISTENT_LATCH_PLACEHOLDER_MIDI = 60;

export class PersistentPlaybackPitchController {
  selection: PersistentPitchSelection | null = null;
  phase = PersistentPitchPhase.IDLE;
  errorMessage: string | null = null;
  private initialTargetMidi: number | null = null;
  constructor(private readonly pitchSource: ExclusivePitchSource) {}

  activate(newSelection: PersistentPitchSelection, targetMidi: number | null, hasRecordPermission: boolean): boolean {
    this.cancel();
    this.errorMessage = null;
    this.selection = newSelection;
    const midi = targetMidi ?? PERSISTENT_LATCH_PLACEHOLDER_MIDI;
    this.initialTargetMidi = midi;
    this.pitchSource.claim(trackingModeForPersistentPitchSelection(newSelection));
    if (hasRecordPermission) {
      this.pitchSource.start(midi);
      this.phase = PersistentPitchPhase.LISTENING;
      return false;
    }
    this.phase = PersistentPitchPhase.AWAITING_PERMISSION;
    return true;
  }

  onPermissionResult(granted: boolean): void {
    if (this.phase !== PersistentPitchPhase.AWAITING_PERMISSION) return;
    const targetMidi = this.initialTargetMidi;
    if (granted && targetMidi != null && this.pitchSource.ownsMicrophone) {
      this.pitchSource.start(targetMidi);
      this.phase = PersistentPitchPhase.LISTENING;
      return;
    }
    if (this.pitchSource.ownsMicrophone) this.pitchSource.stop();
    this.selection = null;
    this.initialTargetMidi = null;
    this.phase = PersistentPitchPhase.IDLE;
    if (!granted) this.errorMessage = 'Microphone permission denied';
  }

  onOwnershipChanged(ownsMicrophone: boolean): void {
    if (ownsMicrophone || this.phase === PersistentPitchPhase.IDLE) return;
    this.selection = null;
    this.initialTargetMidi = null;
    this.phase = PersistentPitchPhase.IDLE;
  }

  updateTarget(targetMidi: number): void {
    if (this.phase !== PersistentPitchPhase.LISTENING) return;
    this.initialTargetMidi = targetMidi;
    this.pitchSource.retarget(targetMidi);
  }

  cancel(): void {
    this.pitchSource.stop();
    this.selection = null;
    this.initialTargetMidi = null;
    this.phase = PersistentPitchPhase.IDLE;
  }

  fail(message: string): void {
    this.cancel();
    this.errorMessage = message;
  }

  clearError(): void { this.errorMessage = null; }
}
