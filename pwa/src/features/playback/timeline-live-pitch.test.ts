/** Deterministic injected cents for live-halo geometry. Not SYNTHETIC oscillator, not Playwright fake/silent getUserMedia, not Pixel, not production capture. */
import {describe,expect,it} from 'vitest';
import {PITCH_FEEDBACK_GREEN,PITCH_FEEDBACK_YELLOW,formatPitchCentsError} from './melody-pitch-display';
import {MELODY_PITCH_PERCENTAGE_UPDATE_MS} from './melody-timeline-score';
import {
  TIMELINE_LIVE_HALO_RADIUS_PX,advanceSampledMelodyCents,liveMelodyMarkerY,liveMelodyPitchFromCapture,
  liveMelodyPitchLabel,paintLiveMelodyPitch,
} from './timeline-live-pitch';
import {TIMELINE_MELODY_LANE_PX,layoutPlaybackTimeline,timelineNoteHeightPx} from './timeline-layout';

const noteHeight = timelineNoteHeightPx();

describe('native live halo/marker (deterministic injected cents)', () => {
  it('rests at staff center with white 0¢ when capture has no estimate', () => {
    const live = liveMelodyPitchFromCapture(null, null);
    expect(live).toEqual({hasEstimate: false, cents: 0, sampledCents: 0});
    expect(liveMelodyPitchLabel(live)).toBe('0¢');
    expect(liveMelodyMarkerY({staffDegree: 0, cents: live.cents, hasEstimate: false, noteHeight}))
      .toBe(TIMELINE_MELODY_LANE_PX / 2 + noteHeight / 2);
  });

  it('offsets one octave of captured cents by seven staff steps, including held display', () => {
    const held = liveMelodyPitchFromCapture(
      {kind: 'estimate', midi: 72, centsError: 1200, confidence: 0.9, isHeld: true},
      1200,
    );
    expect(held.hasEstimate).toBe(true);
    expect(held.cents).toBe(1200);
    const onTarget = liveMelodyMarkerY({staffDegree: 0, cents: 0, hasEstimate: true, noteHeight});
    const octave = liveMelodyMarkerY({staffDegree: 0, cents: 1200, hasEstimate: true, noteHeight});
    expect(onTarget - octave).toBeCloseTo(7 * noteHeight, 9);
    expect(liveMelodyPitchLabel(held)).toBe(formatPitchCentsError(1200));
  });

  it('clamps the halo inside the melody lane', () => {
    const y = liveMelodyMarkerY({staffDegree: 0, cents: 12_000, hasEstimate: true, noteHeight});
    expect(y).toBe(TIMELINE_LIVE_HALO_RADIUS_PX);
  });

  it('samples the live label immediately then every 250ms of elapsed time from latest captured cents', () => {
    const first = advanceSampledMelodyCents({
      sampledCents: null, lastSampleAtMs: null, nowMs: 1_000, estimateCents: 12,
    });
    expect(first).toEqual({sampledCents: 12, lastSampleAtMs: 1_000});
    expect(advanceSampledMelodyCents({
      sampledCents: first.sampledCents, lastSampleAtMs: first.lastSampleAtMs, nowMs: 1_000 + MELODY_PITCH_PERCENTAGE_UPDATE_MS - 1, estimateCents: 40,
    }).sampledCents).toBe(12);
    expect(advanceSampledMelodyCents({
      sampledCents: first.sampledCents, lastSampleAtMs: first.lastSampleAtMs, nowMs: 1_000 + MELODY_PITCH_PERCENTAGE_UPDATE_MS, estimateCents: 40,
    }).sampledCents).toBe(40);
    expect(advanceSampledMelodyCents({
      sampledCents: 40, lastSampleAtMs: 1_250, nowMs: 1_266, estimateCents: null,
    })).toEqual({sampledCents: null, lastSampleAtMs: null});
  });

  it('paints halo then marker then native 0¢ rest label at the playhead (deterministic, not production score)', () => {
    const layout = layoutPlaybackTimeline({
      width: 320, currentBeat: 1, rootOnly: false,
      melody: [{beat: 1, duration: 1, staffDegree: 0, sourceMidi: 60}],
      chords: [],
    });
    const calls: string[] = [];
    const ctx = {
      fillStyle: '',
      font: '',
      textAlign: '',
      textBaseline: '',
      beginPath() { calls.push('begin'); },
      arc(x: number, y: number, r: number) { calls.push(`arc:${x}:${y}:${r}`); },
      fill() { calls.push(`fill:${ctx.fillStyle}`); },
      roundRect(x: number, y: number, w: number, h: number) { calls.push(`rect:${x}:${y}:${w}:${h}`); },
      fillText(text: string, x: number, y: number) { calls.push(`text:${text}@${x},${y}`); },
      measureText(text: string) { return {width: text.length * 6, fontBoundingBoxAscent: 9, fontBoundingBoxDescent: 3}; },
    };
    const live = liveMelodyPitchFromCapture(null, null);
    paintLiveMelodyPitch(ctx as unknown as CanvasRenderingContext2D, layout, live, 0);
    expect(calls.some((call) => call.startsWith(`arc:${layout.playheadX}:`))).toBe(true);
    expect(calls.filter((call) => call.startsWith('arc:')).map((call) => call.split(':')[3])).toEqual(['6', '2.5']);
    expect(calls.some((call) => call.startsWith('text:0¢@'))).toBe(true);
    expect(PITCH_FEEDBACK_GREEN).toBe('#4CAF50');
    expect(PITCH_FEEDBACK_YELLOW).toBe('#FFEB3B');
  });
});
