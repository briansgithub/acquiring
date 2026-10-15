import type { PitchResultEstimate } from './pitch-results';

export enum PitchTrackingMode { STANDARD = 'STANDARD', MELODY_FAST = 'MELODY_FAST' }
export interface PitchSmoothingSettings {
  readonly medianWindow: number;
  readonly minFramesBeforePublish: number;
  readonly emaAdmit: number;
  readonly octaveRejectSemitones: number;
  readonly octaveRejectMaxFrames: number;
}
export interface PitchTrackingProfile {
  readonly windowSizeOverride: number | null;
  readonly hopSizeOverride: number | null;
  readonly smoothing: PitchSmoothingSettings;
}
export const PITCH_TRACKING_PROFILES: Readonly<Record<PitchTrackingMode, PitchTrackingProfile>> = Object.freeze({
  [PitchTrackingMode.STANDARD]: Object.freeze({ windowSizeOverride: null, hopSizeOverride: null,
    smoothing: Object.freeze({ medianWindow: 3, minFramesBeforePublish: 2, emaAdmit: 0.3,
      octaveRejectSemitones: 6, octaveRejectMaxFrames: 3 }) }),
  [PitchTrackingMode.MELODY_FAST]: Object.freeze({ windowSizeOverride: 1024, hopSizeOverride: 256,
    smoothing: Object.freeze({ medianWindow: 1, minFramesBeforePublish: 1, emaAdmit: 1,
      octaveRejectSemitones: 6, octaveRejectMaxFrames: 1 }) }),
});

function checkTarget(target: number): void {
  if (!Number.isInteger(target) || target < -2_147_483_648 || target > 2_147_483_647) throw new RangeError('Pitch target must be a native Int');
}

/** Native bounded median-then-MIDI-EMA filter, with octave rejection/re-seeding. */
export class PitchSmoother {
  static readonly OCTAVE_REJECT_SEMITONES = 6;
  static readonly OCTAVE_REJECT_MAX_FRAMES = 3;
  static readonly MEDIAN_WINDOW = 3;
  static readonly MIN_FRAMES_BEFORE_PUBLISH = 2;
  static readonly EMA_RETAIN = 0.7;
  static readonly EMA_ADMIT = 0.3;
  private readonly settings: PitchSmoothingSettings;
  private readonly recent: number[] = [];
  private smoothedMidi = 0;
  private validFrames = 0;
  private rejectedFrames = 0;
  private lastConfidence = 0;
  private target: number;

  constructor(targetMidi: number, trackingMode = PitchTrackingMode.STANDARD) {
    checkTarget(targetMidi);
    if (!Object.values(PitchTrackingMode).includes(trackingMode)) throw new RangeError('Unknown pitch tracking mode');
    this.target = targetMidi; this.settings = PITCH_TRACKING_PROFILES[trackingMode].smoothing;
  }
  get targetMidi(): number { return this.target; }
  set targetMidi(targetMidi: number) { checkTarget(targetMidi); this.target = targetMidi; }

  accept(midi: number, confidence: number): PitchResultEstimate | null {
    if (!Number.isFinite(midi) || Math.abs(midi) > 1024) throw new RangeError('Measured MIDI must be finite and in [-1024,1024]');
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new RangeError('Confidence must be finite and in [0,1]');
    if (this.validFrames > 0 && Math.abs(midi - this.smoothedMidi) > this.settings.octaveRejectSemitones) {
      this.rejectedFrames++;
      if (this.rejectedFrames >= this.settings.octaveRejectMaxFrames) this.reset();
      return null;
    }
    this.rejectedFrames = 0;
    this.recent.push(midi);
    if (this.recent.length > this.settings.medianWindow) this.recent.shift();
    if (this.recent.length < this.settings.medianWindow) return null;
    const median = [...this.recent].sort((a, b) => a - b)[Math.trunc(this.settings.medianWindow / 2)];
    this.smoothedMidi = this.validFrames === 0 ? median
      : this.smoothedMidi * (1 - this.settings.emaAdmit) + median * this.settings.emaAdmit;
    // Only zero/warm/publishable are observed; avoid an ever-growing frame counter.
    this.validFrames = Math.min(this.settings.minFramesBeforePublish, this.validFrames + 1);
    this.lastConfidence = confidence;
    return this.validFrames < this.settings.minFramesBeforePublish ? null : this.estimate();
  }

  /** Re-scores existing measured history. This call is not a new measurement. */
  setTarget(newTarget: number): PitchResultEstimate | null {
    this.targetMidi = newTarget;
    return this.validFrames < this.settings.minFramesBeforePublish ? null : this.estimate();
  }
  retarget(newTargetMidi: number): void { this.targetMidi = newTargetMidi; this.reset(); }
  reset(): void {
    this.recent.length = 0; this.smoothedMidi = 0; this.validFrames = 0;
    this.rejectedFrames = 0; this.lastConfidence = 0;
  }
  private estimate(): PitchResultEstimate {
    return Object.freeze({ kind: 'estimate', midi: this.smoothedMidi,
      centsError: 100 * (this.smoothedMidi - this.target), confidence: this.lastConfidence, isHeld: false });
  }
}
