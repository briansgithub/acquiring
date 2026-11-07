/** Frozen 801cf798 PersistentPlaybackPitchPractice.kt run grouping + banked median badges. */
export const MELODY_MIN_SCORE_SAMPLES = 8;
export const MELODY_MAX_SCORE_SAMPLES = 512;
export const MELODY_PITCH_SCORE_SAMPLE_MS = 16;
export const MELODY_PITCH_PERCENTAGE_UPDATE_MS = 250;
const MELODY_SCORE_DIRECTION_DEADBAND_CENTS = 5;
const MELODY_RUN_CONTIGUITY_EPSILON = 1e-6;

export interface MelodyTimelinePitchVisual {
  readonly beat: number;
  readonly duration: number;
  readonly staffDegree: number;
  readonly sourceMidi: number | null;
}

export interface MelodyTimelinePitchRun {
  readonly id: number;
  readonly beat: number;
  readonly duration: number;
  readonly staffDegree: number;
  readonly sourceMidi: number | null;
  readonly endBeat: number;
  readonly centerBeat: number;
}

export interface MelodyTimelinePitchScore {
  readonly errorPercentage: number;
  readonly signedCentsError: number;
  readonly centsErrorMagnitude: number;
  readonly sampleCount: number;
}

export type MelodyRunScoreOutcome =
  | {readonly kind: 'scored'; readonly runId: number; readonly score: MelodyTimelinePitchScore}
  | {readonly kind: 'unscored'; readonly runId: number};

export function buildMelodyTimelinePitchRuns(
  visuals: readonly MelodyTimelinePitchVisual[],
): readonly MelodyTimelinePitchRun[] {
  const sorted = visuals.filter((visual) => visual.duration > 0).slice().sort((a, b) => a.beat - b.beat);
  if (!sorted.length) return Object.freeze([]);
  const runs: MelodyTimelinePitchRun[] = [];
  let first = sorted[0];
  let endBeat = first.beat + first.duration;
  const finish = () => {
    runs.push(Object.freeze({
      id: runs.length, beat: first.beat, duration: endBeat - first.beat,
      staffDegree: first.staffDegree, sourceMidi: first.sourceMidi,
      endBeat, centerBeat: first.beat + (endBeat - first.beat) / 2,
    }));
  };
  for (const visual of sorted.slice(1)) {
    const touches = visual.beat <= endBeat + MELODY_RUN_CONTIGUITY_EPSILON;
    const same = visual.staffDegree === first.staffDegree && visual.sourceMidi === first.sourceMidi;
    if (touches && same) endBeat = Math.max(endBeat, visual.beat + visual.duration);
    else { finish(); first = visual; endBeat = visual.beat + visual.duration; }
  }
  finish();
  return Object.freeze(runs);
}

export function melodyTimelinePitchRunAtBeat(
  runs: readonly MelodyTimelinePitchRun[],
  beat: number,
): MelodyTimelinePitchRun | null {
  for (let i = runs.length - 1; i >= 0; i--) {
    if (beat >= runs[i].beat && beat < runs[i].endBeat) return runs[i];
  }
  return null;
}

export function formatMelodyTimelinePitchScore(score: MelodyTimelinePitchScore): string {
  const prefix = score.signedCentsError <= -MELODY_SCORE_DIRECTION_DEADBAND_CENTS ? '-'
    : score.signedCentsError >= MELODY_SCORE_DIRECTION_DEADBAND_CENTS ? '+' : '';
  return `${prefix}${Math.round(score.centsErrorMagnitude)}¢`;
}

export function liveMeasuredCentsError(estimate: {centsError: number; isHeld: boolean} | null | undefined): number | null {
  if (!estimate || estimate.isHeld || !Number.isFinite(estimate.centsError)) return null;
  return estimate.centsError;
}

export class MelodyTimelinePitchScoreAccumulator {
  private activeRunId: number | null = null;
  private readonly samples = new Float64Array(MELODY_MAX_SCORE_SAMPLES);
  private storedCount = 0;

  begin(runId: number): void {
    this.clear();
    this.activeRunId = runId;
  }

  add(runId: number, centsError: number): void {
    if (runId !== this.activeRunId || !Number.isFinite(centsError) || this.storedCount >= this.samples.length) return;
    this.samples[this.storedCount++] = centsError;
  }

  finish(runId: number): MelodyRunScoreOutcome | null {
    if (runId !== this.activeRunId) return null;
    const count = this.storedCount;
    const outcome: MelodyRunScoreOutcome = count < MELODY_MIN_SCORE_SAMPLES
      ? {kind: 'unscored', runId}
      : {kind: 'scored', runId, score: reduceSamples(this.samples, count)};
    this.clear();
    return outcome;
  }

  clear(): void {
    this.activeRunId = null;
    this.storedCount = 0;
  }
}

function reduceSamples(samples: Float64Array, count: number): MelodyTimelinePitchScore {
  const signed = Array.from(samples.subarray(0, count)).sort((a, b) => a - b);
  const magnitudes = signed.map(Math.abs).sort((a, b) => a - b);
  const medianMagnitude = magnitudes[count >> 1];
  return Object.freeze({
    errorPercentage: Math.min(100, Math.max(0, Math.round(medianMagnitude))),
    signedCentsError: signed[count >> 1],
    centsErrorMagnitude: medianMagnitude,
    sampleCount: count,
  });
}
