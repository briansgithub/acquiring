/** Local pure results matching native detector and tracker value semantics. */
export interface PitchEstimate {
  readonly frequencyHz: number;
  readonly confidence: number;
  /** Normalized PCM16 root-mean-square amplitude, using divisor32768. */
  readonly rms: number;
}
export interface PitchResultEstimate {
  readonly kind: 'estimate';
  readonly midi: number;
  readonly centsError: number;
  readonly confidence: number;
  /** Held readings are display-only and must never count as new measurements. */
  readonly isHeld: boolean;
}
export type PitchResult = PitchResultEstimate | { readonly kind: 'no-signal' }
  | { readonly kind: 'error'; readonly message: string };
export const NO_SIGNAL: PitchResult = Object.freeze({ kind: 'no-signal' });
export const PITCH_SIGNAL_GATE = Object.freeze({ rms: 0.0005, confidence: 0.4 });

/** The native signal gate; invalid external estimates are never usable. */
export function isPitchEstimateSignal(estimate: PitchEstimate): boolean {
  return Number.isFinite(estimate.frequencyHz) && estimate.frequencyHz > 0
    && Number.isFinite(estimate.confidence) && estimate.confidence >= PITCH_SIGNAL_GATE.confidence && estimate.confidence <= 1
    && Number.isFinite(estimate.rms) && estimate.rms >= PITCH_SIGNAL_GATE.rms && estimate.rms <= 1;
}

/** Copies only the first dropout display transition; owns no clock or hold timeout. */
export function holdPitchResult(result: PitchResult): PitchResult {
  return result.kind === 'estimate' && !result.isHeld ? Object.freeze({ ...result, isHeld: true }) : result;
}

/** Carry a previous display hold when re-scoring a measured pitch against a new target. */
export function preservePitchHold(estimate: PitchResultEstimate, previous: PitchResult): PitchResultEstimate {
  const isHeld = previous.kind === 'estimate' && previous.isHeld;
  return estimate.isHeld === isHeld ? estimate : Object.freeze({ ...estimate, isHeld });
}
