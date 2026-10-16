import { describe, expect, it } from 'vitest';
import native from './fixtures/native-clock.json';
import {
  appendPlaybackClock, createPlaybackClock, playbackClockApi, playbackFrameAtTime,
  prunePlaybackClock, readPlaybackClock,
} from './playback-clock';
import type { PlaybackClockQueue, PlaybackClockSegment } from './contracts';
const window = {startBeat:1,endBeat:5};
const segment = (overrides:Partial<PlaybackClockSegment> = {}):PlaybackClockSegment =>
  ({startFrame:0,frameCount:1000,startBeat:1,beatsPerFrame:.002,...overrides});

describe('pure selected-audio-clock mapping', () => {
  it('matches14 independently captured unchanged native head cases', () => {
    expect(native.authority).toBe('801cf7984171d772afc4406ddb5c79c0cb7fd20a');
    expect(native.cases).toHaveLength(14);
    expect(native.audibleBeatSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(native.clockSegmentSha256).toMatch(/^[0-9a-f]{64}$/);
    for (const row of native.cases) {
      let clock = createPlaybackClock(row,row.sampleRate,row.anchorBeat);
      for (const value of row.segments) clock = appendPlaybackClock(clock,value);
      expect(readPlaybackClock(clock,row.playedFrame).beat,row.label).toBeCloseTo(row.expectedBeat,12);
    }
  });

  it('holds the anchor during lead, endpoints across finite gaps, and the tail without wall-time extrapolation', () => {
    let clock = createPlaybackClock(window,1000);
    clock = appendPlaybackClock(clock,segment({startFrame:100,frameCount:200,beatsPerFrame:.001}));
    clock = appendPlaybackClock(clock,segment({startFrame:600,frameCount:100,startBeat:1.2}));
    for (const [frame,beat] of [[0,1],[99,1],[100,1],[300,1.2],[599,1.2],[600,1.2],[650,1.3],[700,1.4],[50000,1.4]]) {
      expect(readPlaybackClock(clock,frame).beat).toBeCloseTo(beat,12);
      expect(readPlaybackClock(clock,frame).queueDrained).toBe(frame >= 700);
    }
  });

  it('distinguishes once-only beat completion from padded queue drainage and preserves drainage after pruning all', () => {
    let clock = appendPlaybackClock(createPlaybackClock({endBeat:1.1,completionKey:'once'},1000),segment({frameCount:256}));
    expect(readPlaybackClock(clock,50)).toEqual({beat:1.1,queueDrained:false});
    expect(readPlaybackClock(clock,255).queueDrained).toBe(false);
    clock = prunePlaybackClock(clock,256);
    expect(clock.segments).toHaveLength(0);
    expect(clock.lastEndFrame).toBe(256);
    expect(readPlaybackClock(clock,256)).toEqual({beat:1.1,queueDrained:true});
    clock = appendPlaybackClock(clock,segment({startFrame:300,frameCount:16,startBeat:1.1,beatsPerFrame:0}));
    expect(readPlaybackClock(clock,299)).toEqual({beat:1.1,queueDrained:false});
    expect(readPlaybackClock(clock,316)).toEqual({beat:1.1,queueDrained:true});
    expect(readPlaybackClock(createPlaybackClock(window,1000),999999).queueDrained).toBe(false);
  });

  it('prunes only consumed segments, retains gap mapping, and rejects observations before saved history', () => {
    let clock = appendPlaybackClock(createPlaybackClock(window,1000),segment({frameCount:100}));
    clock = appendPlaybackClock(clock,segment({startFrame:300,frameCount:100,startBeat:1.2,beatsPerFrame:.001}));
    const pruned = prunePlaybackClock(clock,250);
    expect(pruned.anchorFrame).toBe(100);
    expect(pruned.anchorBeat).toBeCloseTo(1.2,12);
    expect(pruned.segments).toHaveLength(1);
    for (const at of [100,250,300,350,400,10000]) expect(readPlaybackClock(pruned,at)).toEqual(readPlaybackClock(clock,at));
    expect(() => readPlaybackClock(pruned,99)).toThrow(RangeError);
    expect(() => prunePlaybackClock(pruned,99)).toThrow(RangeError);
    expect(prunePlaybackClock(clock,99).segments).toHaveLength(2);
  });

  it('returns independently frozen snapshots without freezing or retaining mutable caller containers', () => {
    const timeline = {startBeat:1,endBeat:5}, input = {...segment()};
    const initial = createPlaybackClock(timeline,1000), appended = appendPlaybackClock(initial,input);
    timeline.endBeat = 9; input.startBeat = 4;
    expect(appended.endBeat).toBe(5);
    expect(appended.segments[0].startBeat).toBe(1);
    expect(initial.segments).toHaveLength(0);
    const cloned = prunePlaybackClock(appended,0);
    expect(cloned).not.toBe(appended);
    expect(cloned.segments).not.toBe(appended.segments);
    expect(cloned.segments[0]).not.toBe(appended.segments[0]);
    for (const value of [initial,initial.segments,appended,appended.segments,appended.segments[0],readPlaybackClock(appended,0)]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(playbackClockApi.readPlaybackClock).toBe(readPlaybackClock);
  });

  it('rejects overlap and overflow instead of evicting unplayed mappings; pruning frees bounded capacity', () => {
    const initial = createPlaybackClock(window,1000);
    const segments = Array.from({length:512},(_,i) => segment({startFrame:i,frameCount:1,beatsPerFrame:0}));
    const full:PlaybackClockQueue = {...initial,segments,lastEndFrame:512};
    expect(() => appendPlaybackClock(full,segment({startFrame:512,frameCount:1}))).toThrow(RangeError);
    const pruned = prunePlaybackClock(full,256);
    expect(appendPlaybackClock(pruned,segment({startFrame:512,frameCount:1})).segments).toHaveLength(257);
    expect(full.segments).toHaveLength(512);
    const clock = appendPlaybackClock(initial,segment({startFrame:100,frameCount:100}));
    expect(() => appendPlaybackClock(clock,segment({startFrame:199}))).toThrow(RangeError);
    expect(appendPlaybackClock(clock,segment({startFrame:200})).segments).toHaveLength(2);
    for (const patch of [{startFrame:-1},{startFrame:.5},{startFrame:Number.MAX_SAFE_INTEGER},
      {frameCount:0},{frameCount:65537},{frameCount:1.5},{startBeat:0},{startBeat:6},
      {startBeat:NaN},{beatsPerFrame:-1},{beatsPerFrame:Infinity},{beatsPerFrame:.02}]) {
      expect(() => appendPlaybackClock(initial,segment(patch))).toThrow(RangeError);
    }
  });

  it('bounds rate/window/slope/frames and clamps finite requested anchors natively', () => {
    expect(createPlaybackClock(window,1000,-1e100).anchorBeat).toBe(1);
    expect(createPlaybackClock(window,384000,1e100).anchorBeat).toBe(5);
    for (const value of [999,384001,1.5,NaN,Infinity]) expect(() => createPlaybackClock(window,value)).toThrow(RangeError);
    for (const value of [{endBeat:1},{endBeat:1+1e-7},{endBeat:Infinity},{endBeat:1000001},{startBeat:-1000001,endBeat:5}]) {
      expect(() => createPlaybackClock(value,1000)).toThrow(RangeError);
    }
    expect(() => createPlaybackClock(window,1000,NaN)).toThrow(RangeError);
    for (const value of [-1,.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) {
      expect(() => readPlaybackClock(createPlaybackClock(window,1000),value)).toThrow(RangeError);
    }
    const max = appendPlaybackClock(createPlaybackClock(window,1000),segment({frameCount:65536,beatsPerFrame:1000/(60*1000)}));
    expect(max.lastEndFrame).toBe(65536);
  });

  it('conservatively floors one chosen audio time source, rejecting unsafe arithmetic', () => {
    expect(playbackFrameAtTime(0,1000)).toBe(0);
    expect(playbackFrameAtTime(.0019,1000)).toBe(1);
    expect(playbackFrameAtTime(1.5,44100)).toBe(66150);
    for (const value of [-1,NaN,Infinity,Number.MAX_VALUE]) expect(() => playbackFrameAtTime(value,1000)).toThrow(RangeError);
    expect(() => playbackFrameAtTime(1,999)).toThrow(RangeError);
    expect(() => playbackFrameAtTime((Number.MAX_SAFE_INTEGER+1)/1000,1000)).toThrow(RangeError);
  });
});
