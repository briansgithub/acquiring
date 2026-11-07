/** Frozen 801cf798 PlaybackView.kt 1323-1403 live halo/marker/label. CSS px = dp.
 * Marker follows captured estimate cents including held (display, not banking).
 * No-signal still draws a white halo at the target staff; live 0¢ is the native rest gauge, not a banked score.
 * Native 32ms marker tween is skipped this slice (snap). Label samples on wall-clock 250ms, not interval ticks.
 */
import type {PitchResultEstimate} from '../../audio/capture';
import {
  formatPitchCentsError, pitchErrorToTimelineStaffSteps, pitchFeedbackColor,
} from './melody-pitch-display';
import {MELODY_PITCH_PERCENTAGE_UPDATE_MS} from './melody-timeline-score';
import {melodyTimelineDisplayCents} from './persistent-pitch';
import {TIMELINE_MELODY_LANE_PX, type PlaybackTimelineLayout} from './timeline-layout';

export const TIMELINE_LIVE_HALO_RADIUS_PX = 6;
export const TIMELINE_LIVE_MARKER_RADIUS_PX = 2.5;
export const TIMELINE_LIVE_LABEL_GAP_PX = 8;
export const TIMELINE_LIVE_LABEL_PAD_X_PX = 5;
export const TIMELINE_LIVE_LABEL_PAD_Y_PX = 2;
export const TIMELINE_LIVE_HALO_ALPHA = 0.28;
export const TIMELINE_LIVE_LABEL_FONT_PX = 11;

export interface LiveMelodyPitch {
  readonly hasEstimate: boolean;
  readonly cents: number;
  readonly sampledCents: number;
}

export function liveMelodyPitchFromCapture(
  estimate: PitchResultEstimate | null,
  sampledCents: number | null,
): LiveMelodyPitch {
  const cents = melodyTimelineDisplayCents(estimate);
  return Object.freeze({
    hasEstimate: estimate != null,
    cents,
    sampledCents: sampledCents ?? cents,
  });
}

export function liveMelodyPitchLabel(live: LiveMelodyPitch): string {
  return formatPitchCentsError(live.sampledCents);
}

export function advanceSampledMelodyCents(input: {
  readonly sampledCents: number | null;
  readonly lastSampleAtMs: number | null;
  readonly nowMs: number;
  readonly estimateCents: number | null;
  readonly intervalMs?: number;
}): {sampledCents: number | null; lastSampleAtMs: number | null} {
  if (input.estimateCents == null) return {sampledCents: null, lastSampleAtMs: null};
  if (input.lastSampleAtMs == null) return {sampledCents: input.estimateCents, lastSampleAtMs: input.nowMs};
  const interval = input.intervalMs ?? MELODY_PITCH_PERCENTAGE_UPDATE_MS;
  if (input.nowMs - input.lastSampleAtMs >= interval) {
    return {sampledCents: input.estimateCents, lastSampleAtMs: input.nowMs};
  }
  return {sampledCents: input.sampledCents, lastSampleAtMs: input.lastSampleAtMs};
}

export function liveMelodyMarkerY(input: {
  readonly staffDegree: number | null;
  readonly cents: number;
  readonly hasEstimate: boolean;
  readonly noteHeight: number;
  readonly melodyLanePx?: number;
}): number {
  const lane = input.melodyLanePx ?? TIMELINE_MELODY_LANE_PX;
  const melodyBaseY = lane / 2;
  const targetY = input.staffDegree == null
    ? melodyBaseY
    : melodyBaseY - input.staffDegree * input.noteHeight + input.noteHeight / 2;
  const offset = input.hasEstimate
    ? pitchErrorToTimelineStaffSteps(input.cents) * input.noteHeight
    : 0;
  const halo = TIMELINE_LIVE_HALO_RADIUS_PX;
  const raw = targetY - offset;
  return Math.min(Math.max(raw, halo), Math.max(lane - halo, halo));
}

export function paintLiveMelodyPitch(
  ctx: CanvasRenderingContext2D,
  layout: PlaybackTimelineLayout,
  live: LiveMelodyPitch,
  staffDegree: number | null,
): void {
  const markerY = liveMelodyMarkerY({
    staffDegree, cents: live.cents, hasEstimate: live.hasEstimate, noteHeight: layout.noteHeight,
  });
  const color = live.hasEstimate ? pitchFeedbackColor(live.cents) : '#ffffff';
  const x = layout.playheadX;
  ctx.beginPath();
  ctx.fillStyle = rgba(color, TIMELINE_LIVE_HALO_ALPHA);
  ctx.arc(x, markerY, TIMELINE_LIVE_HALO_RADIUS_PX, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(x, markerY, TIMELINE_LIVE_MARKER_RADIUS_PX, 0, Math.PI * 2);
  ctx.fill();

  const label = liveMelodyPitchLabel(live);
  const labelColor = live.hasEstimate ? pitchFeedbackColor(live.sampledCents) : '#ffffff';
  ctx.font = `700 ${TIMELINE_LIVE_LABEL_FONT_PX}px sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  const metrics = ctx.measureText(label);
  const ascent = metrics.fontBoundingBoxAscent || 9;
  const descent = metrics.fontBoundingBoxDescent || 3;
  const width = metrics.width + TIMELINE_LIVE_LABEL_PAD_X_PX * 2;
  const height = ascent + descent + TIMELINE_LIVE_LABEL_PAD_Y_PX * 2;
  const right = x - TIMELINE_LIVE_LABEL_GAP_PX;
  const left = right - width;
  const top = markerY - height / 2;
  const baseline = markerY + (ascent - descent) / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.76)';
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, height / 2);
  ctx.fill();
  ctx.fillStyle = labelColor;
  ctx.fillText(label, right - TIMELINE_LIVE_LABEL_PAD_X_PX, baseline);
}

function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.startsWith('#') ? hex.slice(1) : hex, 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${alpha})`;
}
