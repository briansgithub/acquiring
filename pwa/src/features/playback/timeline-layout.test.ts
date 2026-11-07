import {describe,expect,it} from 'vitest';
import type {ExtractedSection,JsonObject,JsonValue} from '../../contracts';
import {preparePlaybackSection} from './section-model';
import {
  TIMELINE_HEIGHT_PX,
  TIMELINE_MELODY_LANE_PX,
  TIMELINE_PIXELS_PER_BEAT,
  buildChordTimelineVisuals,
  buildMelodyTimelineVisuals,
  layoutPlaybackTimeline,
  melodyTimelineStaffDegree,
  timelineNoteHeightPx,
} from './timeline-layout';

const section = (notes: JsonValue[], chords: JsonObject[], keys?: JsonValue[]): ExtractedSection => ({
  chords,
  notes,
  metadata: keys ? {keys} : undefined,
});

describe('native PlaybackView timeline geometry, CSS px = dp', () => {
  it('clamps staff height from 88/28 into 5..10 (always 5 in CSS=dp space)', () => {
    expect(timelineNoteHeightPx()).toBe(5);
    expect(timelineNoteHeightPx(280)).toBe(10);
    expect(timelineNoteHeightPx(140)).toBe(5);
  });

  it('hides the whole timeline in root-only/simple mode', () => {
    const layout = layoutPlaybackTimeline({
      width: 320, currentBeat: 2, rootOnly: true,
      melody: [{beat: 1, duration: 1, staffDegree: 1}],
      chords: [{beat: 1, duration: 2, rest: false}],
    });
    expect(layout.visible).toBe(false);
    expect(layout.height).toBe(0);
    expect(layout.melody).toEqual([]);
    expect(layout.chords).toEqual([]);
  });

  it('centers the playhead and translates content by (currentBeat-1)*60', () => {
    const layout = layoutPlaybackTimeline({
      width: 200, currentBeat: 3, rootOnly: false,
      melody: [{beat: 3, duration: 1, staffDegree: 0}],
      chords: [{beat: 1, duration: 4, rest: false}],
    });
    expect(layout.visible).toBe(true);
    expect(layout.height).toBe(TIMELINE_HEIGHT_PX);
    expect(layout.playheadX).toBe(100);
    expect(layout.translationX).toBe(100 - 2 * TIMELINE_PIXELS_PER_BEAT);
    expect(layout.melody[0]).toMatchObject({x: 120, y: TIMELINE_MELODY_LANE_PX / 2, width: 60, height: 5, active: true, culled: false});
    expect(layout.chords[0]).toMatchObject({x: 0, y: TIMELINE_MELODY_LANE_PX, width: 240, height: 40, active: true});
  });

  it('uses half-open active windows and culls off-screen events', () => {
    const layout = layoutPlaybackTimeline({
      width: 60, currentBeat: 2, rootOnly: false,
      melody: [
        {beat: 1, duration: 1, staffDegree: 1},
        {beat: 2, duration: 1, staffDegree: 1},
      ],
      chords: [{beat: 10, duration: 1, rest: false}],
    });
    expect(layout.melody[0].active).toBe(false);
    expect(layout.melody[1].active).toBe(true);
    expect(layout.melody[1].y).toBe(44 - 5);
    expect(layout.chords[0].culled).toBe(true);
  });
});

describe('native melody/chord visual construction', () => {
  it('omits melody rests, keeps chord rests, and uses rawDegree + octave*7', () => {
    const source = section(
      [{sd: '1', beat: 1, duration: 1, octave: 0}, {sd: '1', beat: 2, duration: 1, isRest: true}, {sd: '5', beat: 3, duration: 2, octave: 1}],
      [{root: 1, type: 5, beat: 1, duration: 2}, {beat: 3, duration: 1, isRest: true}],
    );
    const visuals = buildMelodyTimelineVisuals(preparePlaybackSection(source).melody, source, false);
    expect(visuals.map((row) => [row.beat, row.staffDegree])).toEqual([
      [1, melodyTimelineStaffDegree('1', 0)],
      [3, melodyTimelineStaffDegree('5', 1)],
    ]);
    expect(melodyTimelineStaffDegree('5', 1)).toBe(12);
    expect(buildChordTimelineVisuals(source)).toEqual([
      {beat: 1, duration: 2, rest: false},
      {beat: 3, duration: 1, rest: true},
    ]);
  });

  it('Major-lock staff uses accepted ionianContextStaffDegree fallback to raw', () => {
    const source = section(
      [{sd: '1', beat: 1, duration: 1, octave: 0}],
      [{root: 1, type: 5, beat: 1, duration: 1}],
      [{tonic: 'D', scale: 'minor', beat: 1}],
    );
    const locked = buildMelodyTimelineVisuals(preparePlaybackSection(source).melody, source, true);
    const unlocked = buildMelodyTimelineVisuals(preparePlaybackSection(source).melody, source, false);
    expect(locked[0].staffDegree).not.toBe(unlocked[0].staffDegree);
    expect(unlocked[0].staffDegree).toBe(1);
  });
});

describe('browser integrity', () => {
  it('rejects nonfinite layout inputs and freezes output', () => {
    const args = {width: 100, currentBeat: 1, rootOnly: false, melody: [], chords: []};
    expect(() => layoutPlaybackTimeline({...args, width: NaN})).toThrow(RangeError);
    expect(() => layoutPlaybackTimeline({...args, currentBeat: Infinity})).toThrow(RangeError);
    expect(() => layoutPlaybackTimeline({...args, width: -1})).toThrow(RangeError);
    const layout = layoutPlaybackTimeline(args);
    expect(Object.isFrozen(layout)).toBe(true);
    expect(Object.isFrozen(layout.melody)).toBe(true);
  });
});
