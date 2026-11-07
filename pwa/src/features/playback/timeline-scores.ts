/** Frozen 801cf798 PlaybackView.kt 1221-1277 banked melody-run badges. CSS px = dp. */
import {pitchFeedbackColor} from './melody-pitch-display';
import {
  buildMelodyTimelinePitchRuns,
  formatMelodyTimelinePitchScore,
  type MelodyRunScoreOutcome,
  type MelodyTimelinePitchVisual,
} from './melody-timeline-score';
import {
  TIMELINE_MELODY_LANE_PX, TIMELINE_PIXELS_PER_BEAT, timelineNoteHeightPx,
  type PlaybackTimelineLayout,
} from './timeline-layout';

export function paintMelodyRunScores(
  ctx: CanvasRenderingContext2D,
  melody: readonly MelodyTimelinePitchVisual[],
  scores: ReadonlyMap<number, MelodyRunScoreOutcome>,
  layout: PlaybackTimelineLayout,
): void {
  if (!scores.size) return;
  const runs = buildMelodyTimelinePitchRuns(melody);
  const noteHeight = layout.noteHeight || timelineNoteHeightPx();
  const melodyBaseY = TIMELINE_MELODY_LANE_PX / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '700 11px sans-serif';
  for (const [runId, outcome] of scores) {
    const run = runs[runId]; if (!run) continue;
    const label = outcome.kind === 'scored' ? formatMelodyTimelinePitchScore(outcome.score) : '·';
    const color = outcome.kind === 'scored' ? pitchFeedbackColor(outcome.score.centsErrorMagnitude) : 'rgba(255,255,255,0.45)';
    const centerX = (run.centerBeat - 1) * TIMELINE_PIXELS_PER_BEAT;
    const screenX = centerX + layout.translationX;
    const metrics = ctx.measureText(label);
    const width = metrics.width + 10;
    if (screenX + width / 2 < 0 || screenX - width / 2 > layout.width) continue;
    const ascent = metrics.fontBoundingBoxAscent || 9;
    const descent = metrics.fontBoundingBoxDescent || 3;
    const height = ascent + descent + 4;
    const noteTopY = melodyBaseY - run.staffDegree * noteHeight;
    const desiredBaseline = noteTopY - 4 - descent;
    const baseline = Math.max(desiredBaseline, ascent + 2);
    const top = baseline + (-ascent) - 2;
    ctx.fillStyle = 'rgba(0,0,0,0.76)';
    ctx.beginPath();
    ctx.roundRect(centerX - width / 2, top, width, height, height / 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(label, centerX, baseline);
  }
}
