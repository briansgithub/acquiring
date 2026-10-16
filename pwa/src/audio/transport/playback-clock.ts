import { STREAM_LIMITS } from '../synth';
import { PLAYBACK_CLOCK_LIMITS } from './contracts';
import type { PlaybackTimeline } from '../synth';
import type { PlaybackClockApi, PlaybackClockQueue, PlaybackClockReading, PlaybackClockSegment } from './contracts';

function rate(value:number):void {
  if (!Number.isInteger(value) || value < PLAYBACK_CLOCK_LIMITS.sampleRateMin ||
    value > PLAYBACK_CLOCK_LIMITS.sampleRateMax) throw new RangeError('Invalid playback clock rate.');
}
function frame(value:number):void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Playback frame must be a safe nonnegative integer.');
}
function windowBounds(start:number,end:number):void {
  if (!Number.isFinite(start) || !Number.isFinite(end) || Math.abs(start) > STREAM_LIMITS.absoluteBeat ||
    Math.abs(end) > STREAM_LIMITS.absoluteBeat || end - start < 1e-6) throw new RangeError('Invalid playback clock beat window.');
}
function segmentEnd(clock:PlaybackClockQueue,segment:PlaybackClockSegment):number {
  frame(segment.startFrame);
  if (!Number.isInteger(segment.frameCount) || segment.frameCount < 1 ||
    segment.frameCount > PLAYBACK_CLOCK_LIMITS.segmentFrames) throw new RangeError('Invalid playback clock segment length.');
  const end = segment.startFrame + segment.frameCount;
  frame(end);
  if (!Number.isFinite(segment.startBeat) || segment.startBeat < clock.startBeat || segment.startBeat > clock.endBeat ||
    !Number.isFinite(segment.beatsPerFrame) || segment.beatsPerFrame < 0 ||
    segment.beatsPerFrame > STREAM_LIMITS.bpm / (60 * clock.sampleRate)) throw new RangeError('Invalid playback clock segment beat/slope.');
  return end;
}
function validate(clock:PlaybackClockQueue):void {
  rate(clock.sampleRate); windowBounds(clock.startBeat,clock.endBeat); frame(clock.anchorFrame);
  if (!Number.isFinite(clock.anchorBeat) || clock.anchorBeat < clock.startBeat || clock.anchorBeat > clock.endBeat ||
    clock.completionKey !== null && typeof clock.completionKey !== 'string') throw new RangeError('Invalid playback clock anchor/key.');
  if (!Array.isArray(clock.segments) || clock.segments.length > PLAYBACK_CLOCK_LIMITS.segments) throw new RangeError('Playback clock segment limit exceeded.');
  let end = clock.anchorFrame;
  for (const segment of clock.segments) {
    if (segment.startFrame < end) throw new RangeError('Playback clock segments overlap or precede retained history.');
    end = segmentEnd(clock,segment);
  }
  if (clock.lastEndFrame === null) {
    if (clock.segments.length || clock.anchorFrame !== 0) throw new RangeError('Invalid unscheduled playback clock.');
  } else {
    frame(clock.lastEndFrame);
    if (clock.lastEndFrame !== end) throw new RangeError('Playback clock tail is inconsistent.');
  }
}
function snapshot(clock:PlaybackClockQueue):PlaybackClockQueue {
  const segments = Object.freeze(clock.segments.map(segment => Object.freeze({...segment})));
  return Object.freeze({...clock,segments});
}
function beatAt(clock:PlaybackClockQueue,segment:PlaybackClockSegment,frames:number):number {
  const advanced = frames * segment.beatsPerFrame;
  return clock.completionKey !== null ? Math.min(clock.endBeat,segment.startBeat + advanced)
    : clock.startBeat + (segment.startBeat - clock.startBeat + advanced) % (clock.endBeat - clock.startBeat);
}
function observation(clock:PlaybackClockQueue,playedFrame:number):void {
  validate(clock); frame(playedFrame);
  if (playedFrame < clock.anchorFrame) throw new RangeError('Playback clock history was pruned.');
}

export function createPlaybackClock(
  timeline:Pick<PlaybackTimeline,'startBeat'|'endBeat'|'completionKey'>,sampleRate:number,anchorBeat?:number,
):PlaybackClockQueue {
  rate(sampleRate);
  const startBeat = timeline.startBeat ?? 1, endBeat = timeline.endBeat, completionKey = timeline.completionKey ?? null;
  windowBounds(startBeat,endBeat);
  const requested = anchorBeat ?? startBeat;
  if (!Number.isFinite(requested) || completionKey !== null && typeof completionKey !== 'string') throw new RangeError('Invalid playback clock anchor/key.');
  return snapshot({sampleRate,startBeat,endBeat,completionKey,anchorFrame:0,
    anchorBeat:Math.max(startBeat,Math.min(endBeat,requested)),lastEndFrame:null,segments:[]});
}

export function appendPlaybackClock(clock:PlaybackClockQueue,segment:PlaybackClockSegment):PlaybackClockQueue {
  validate(clock);
  if (clock.segments.length >= PLAYBACK_CLOCK_LIMITS.segments) throw new RangeError('Playback clock segment limit exceeded; prune consumed mappings first.');
  const end = segmentEnd(clock,segment);
  if (segment.startFrame < (clock.lastEndFrame ?? clock.anchorFrame)) throw new RangeError('Playback clock append must be ordered without overlap.');
  return snapshot({...clock,lastEndFrame:end,segments:[...clock.segments,segment]});
}

export function readPlaybackClock(clock:PlaybackClockQueue,playedFrame:number):PlaybackClockReading {
  observation(clock,playedFrame);
  let beat = clock.anchorBeat;
  for (const segment of clock.segments) {
    if (playedFrame < segment.startFrame) break;
    const consumed = Math.min(segment.frameCount,playedFrame - segment.startFrame);
    beat = beatAt(clock,segment,consumed);
    if (consumed < segment.frameCount) break;
  }
  return Object.freeze({beat,queueDrained:clock.lastEndFrame !== null && playedFrame >= clock.lastEndFrame});
}

export function prunePlaybackClock(clock:PlaybackClockQueue,playedFrame:number):PlaybackClockQueue {
  observation(clock,playedFrame);
  let count = 0, anchorFrame = clock.anchorFrame, anchorBeat = clock.anchorBeat;
  for (const segment of clock.segments) {
    const end = segment.startFrame + segment.frameCount;
    if (end > playedFrame) break;
    count++; anchorFrame = end; anchorBeat = beatAt(clock,segment,segment.frameCount);
  }
  return snapshot({...clock,anchorFrame,anchorBeat,segments:clock.segments.slice(count)});
}

export function playbackFrameAtTime(contextTime:number,sampleRate:number):number {
  rate(sampleRate);
  if (!Number.isFinite(contextTime) || contextTime < 0) throw new RangeError('Invalid selected audio clock time.');
  const scaled = contextTime * sampleRate;
  if (!Number.isFinite(scaled) || scaled > Number.MAX_SAFE_INTEGER) throw new RangeError('Selected audio clock exceeds safe frame precision.');
  return Math.max(0,Math.floor(scaled));
}

export const playbackClockApi:PlaybackClockApi = Object.freeze({
  createPlaybackClock,appendPlaybackClock,readPlaybackClock,prunePlaybackClock,playbackFrameAtTime,
});
