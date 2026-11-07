import {describe,expect,it} from 'vitest';
import {
  MELODY_MIN_SCORE_SAMPLES, MELODY_PITCH_SCORE_SAMPLE_MS, MelodyTimelinePitchScoreAccumulator,
  buildMelodyTimelinePitchRuns, formatMelodyTimelinePitchScore, liveMeasuredCentsError,
  melodyTimelinePitchRunAtBeat,
} from './melody-timeline-score';
import {firstSettleMs,MelodyRunSettleDetector,MELODY_PITCH_SETTLE_CAP_MS,MELODY_PITCH_SETTLE_FLOOR_MS} from './melody-run-settle';
import {
  PITCH_FEEDBACK_GREEN, PITCH_FEEDBACK_RED, PITCH_FEEDBACK_YELLOW, formatPitchCentsError,
  pitchErrorPercentage, pitchErrorToTimelineStaffSteps, pitchFeedbackColor, showsLivePitchErrorPercentage,
} from './melody-pitch-display';

const visual = (beat: number, duration: number, staffDegree: number, midi: number) =>
  ({beat, duration, staffDegree, sourceMidi: midi});

function scoreOf(runId: number, samples: number[]) {
  const accumulator = new MelodyTimelinePitchScoreAccumulator();
  accumulator.begin(runId);
  for (const sample of samples) accumulator.add(runId, sample);
  const outcome = accumulator.finish(runId);
  return outcome?.kind === 'scored' ? outcome.score : null;
}

describe('native melody timeline score kernel', () => {
  it('merges contiguous matching notes into one scoring run', () => {
    const runs = buildMelodyTimelinePitchRuns([
      visual(1, 0.5, 0, 60), visual(1.5, 0.5, 0, 60), visual(2, 0.5, 1, 62),
      visual(2.5, 0.5, 1, 63), visual(3.25, 0.5, 1, 63),
    ]);
    expect(runs).toHaveLength(4);
    expect(runs[0].beat).toBe(1);
    expect(runs[0].duration).toBe(1);
    expect(runs[0].centerBeat).toBe(1.5);
    expect(melodyTimelinePitchRunAtBeat(runs, 1.75)).toBe(runs[0]);
    expect(melodyTimelinePitchRunAtBeat(runs, 3.1)).toBeNull();
  });

  it('reports magnitude without cancelling direction', () => {
    const sharp = scoreOf(4, Array(12).fill(20));
    expect(sharp?.errorPercentage).toBe(20);
    expect(formatMelodyTimelinePitchScore(sharp!)).toBe('+20¢');
    expect(formatMelodyTimelinePitchScore(scoreOf(5, Array(12).fill(-30))!)).toBe('-30¢');
  });

  it('one wild frame does not flip badge sign or colour', () => {
    const score = scoreOf(9, [...Array(30).fill(12), -600]);
    expect(score?.errorPercentage).toBe(12);
    expect(formatMelodyTimelinePitchScore(score!)).toBe('+12¢');
    expect(pitchFeedbackColor(score!.centsErrorMagnitude)).toBe(PITCH_FEEDBACK_GREEN);
    expect(score?.sampleCount).toBe(31);
  });

  it('withholds a score until enough samples survive', () => {
    const accumulator = new MelodyTimelinePitchScoreAccumulator();
    accumulator.begin(1);
    for (let i = 0; i < MELODY_MIN_SCORE_SAMPLES - 1; i++) accumulator.add(1, 8);
    expect(accumulator.finish(1)).toEqual({kind: 'unscored', runId: 1});
    accumulator.begin(2);
    for (let i = 0; i < MELODY_MIN_SCORE_SAMPLES; i++) accumulator.add(2, 8);
    const outcome = accumulator.finish(2);
    expect(outcome?.kind).toBe('scored');
    if (outcome?.kind === 'scored') expect(outcome.score.sampleCount).toBe(MELODY_MIN_SCORE_SAMPLES);
  });

  it('clamps display percentage once and still prints a pinned run badge', () => {
    expect(formatMelodyTimelinePitchScore(scoreOf(6, [...Array(10).fill(-20), -3000])!)).toBe('-20¢');
    const far = scoreOf(7, Array(10).fill(-300))!;
    expect(far.errorPercentage).toBe(100);
    expect(formatMelodyTimelinePitchScore(far)).toBe('-300¢');
    expect(pitchFeedbackColor(far.centsErrorMagnitude)).toBe(PITCH_FEEDBACK_RED);
  });

  it('drops the direction prefix on a centred wobble', () => {
    const score = scoreOf(8, [20, -20, 21, -19, 20, -21, 19, -20, 1.5, -1])!;
    expect(formatMelodyTimelinePitchScore(score).match(/^[+-]/)).toBeNull();
    expect(Math.abs(score.signedCentsError)).toBeLessThan(5);
    expect(score.centsErrorMagnitude).toBeGreaterThan(15);
  });

  it('does not finish a run that is not active', () => {
    const accumulator = new MelodyTimelinePitchScoreAccumulator();
    accumulator.begin(3);
    for (let i = 0; i < MELODY_MIN_SCORE_SAMPLES; i++) accumulator.add(3, 5);
    expect(accumulator.finish(4)).toBeNull();
    expect(accumulator.finish(3)?.kind).toBe('scored');
  });

  it('ignores held estimates as live samples', () => {
    expect(liveMeasuredCentsError({centsError: -35, isHeld: false})).toBe(-35);
    expect(liveMeasuredCentsError({centsError: -35, isHeld: true})).toBeNull();
    expect(liveMeasuredCentsError(null)).toBeNull();
  });

  it('re-beginning a run drops samples measured against the old target', () => {
    const accumulator = new MelodyTimelinePitchScoreAccumulator();
    accumulator.begin(11);
    for (let i = 0; i < 12; i++) accumulator.add(11, 90);
    accumulator.begin(11);
    for (let i = 0; i < 12; i++) accumulator.add(11, 6);
    const outcome = accumulator.finish(11);
    expect(outcome?.kind).toBe('scored');
    if (outcome?.kind === 'scored') {
      expect(outcome.score.sampleCount).toBe(12);
      expect(outcome.score.centsErrorMagnitude).toBe(6);
    }
  });

  it('reports unscored rather than omitting a silent run', () => {
    const accumulator = new MelodyTimelinePitchScoreAccumulator();
    accumulator.begin(2);
    expect(accumulator.finish(2)).toEqual({kind: 'unscored', runId: 2});
  });
});

describe('native settle detector', () => {
  it('opens a clean attack between the floor and the cap', () => {
    const opened = firstSettleMs(new MelodyRunSettleDetector(), (elapsed) => 10 + (elapsed % 5) * 0.5);
    expect(opened).toBeGreaterThanOrEqual(MELODY_PITCH_SETTLE_FLOOR_MS);
    expect(opened!).toBeLessThan(MELODY_PITCH_SETTLE_FLOOR_MS + 64);
  });

  it('delays a scoop until the pitch stops moving', () => {
    const opened = firstSettleMs(new MelodyRunSettleDetector(), (elapsed) =>
      elapsed < 300 ? -250 + elapsed * 250 / 300 : 3 + (elapsed % 3));
    expect(opened).toBeGreaterThanOrEqual(300);
    expect(opened!).toBeLessThan(MELODY_PITCH_SETTLE_CAP_MS);
  });

  it('hard-caps even while still moving', () => {
    const opened = firstSettleMs(new MelodyRunSettleDetector(), (elapsed) => -600 + elapsed);
    expect(opened).toBeGreaterThanOrEqual(MELODY_PITCH_SETTLE_CAP_MS);
    expect(opened!).toBeLessThan(MELODY_PITCH_SETTLE_CAP_MS + MELODY_PITCH_SCORE_SAMPLE_MS * 2);
  });

  it('does not treat a frozen pitch reading as settled', () => {
    expect(firstSettleMs(new MelodyRunSettleDetector(), () => -180)).toBeGreaterThanOrEqual(MELODY_PITCH_SETTLE_CAP_MS);
  });

  it('clears the settle window on dropout', () => {
    const withDropout = firstSettleMs(new MelodyRunSettleDetector(), (elapsed) => elapsed === 160 ? null : 9 + (elapsed % 3));
    const clean = firstSettleMs(new MelodyRunSettleDetector(), (elapsed) => 9 + (elapsed % 3));
    expect(withDropout!).toBeGreaterThan(clean!);
  });
});

describe('native live percentage / colour', () => {
  it('uses historical gauge colours and signed cents formatting', () => {
    expect(pitchFeedbackColor(14.99)).toBe(PITCH_FEEDBACK_GREEN);
    expect(pitchFeedbackColor(-15)).toBe(PITCH_FEEDBACK_YELLOW);
    expect(pitchFeedbackColor(49.99)).toBe(PITCH_FEEDBACK_YELLOW);
    expect(pitchFeedbackColor(-50)).toBe(PITCH_FEEDBACK_RED);
    expect(formatPitchCentsError(0.1)).toBe('0¢');
    expect(formatPitchCentsError(12.6)).toBe('+13¢');
    expect(formatPitchCentsError(-12.6)).toBe('-13¢');
  });

  it('maps an octave of cents onto seven staff steps', () => {
    expect(pitchErrorToTimelineStaffSteps(0)).toBe(0);
    expect(pitchErrorToTimelineStaffSteps(1200)).toBeCloseTo(7, 9);
    expect(pitchErrorToTimelineStaffSteps(-600)).toBeCloseTo(-3.5, 9);
  });

  it('pins live percentage and hides it at 100', () => {
    expect(pitchErrorPercentage(0.1)).toBe(0);
    expect(pitchErrorPercentage(-12.6)).toBe(13);
    expect(showsLivePitchErrorPercentage(99.4)).toBe(true);
    expect(showsLivePitchErrorPercentage(99.5)).toBe(false);
  });
});
