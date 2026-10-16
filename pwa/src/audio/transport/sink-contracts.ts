import type {PlaybackTimeline} from '../synth';
import type {ApplicationAudioContextOwner} from './contracts';
import type {PlaybackWorkerSuccess} from './worker-contracts';

export const PCM_SINK_LIMITS=Object.freeze({primeMs:80,leadMs:20,queueMs:200,batchFrames:4096,sources:512,mappings:512});
export type PcmSinkClock='output-timestamp'|'context-render';
export type PcmSinkPcm=Extract<PlaybackWorkerSuccess,{kind:'pcm'}>;
/** Opaque frozen identity: enqueue must receive this exact current object, not a forged copy. */
export interface PcmSinkRun {readonly generation:number;readonly revision:number;readonly epoch:number;readonly sampleRate:number}
export interface PcmSinkReading {
  readonly run:PcmSinkRun|null;
  readonly phase:'idle'|'priming'|'scheduled'|'released';
  readonly clock:PcmSinkClock|null;
  readonly playedFrame:number|null;
  readonly beat:number|null;
  /** Staged frames plus scheduled tail horizon (including lead/gaps) beyond selected played head. */
  readonly queuedFrames:number;
  readonly sources:number;
  readonly mappings:number;
  /** At least one scheduled buffer, no staging, selected head reached tail. Not transport completion. */
  readonly queueDrained:boolean;
}
export interface PcmQueueSinkOptions {
  readonly contextOwner?:ApplicationAudioContextOwner;
  /** Select once per begin. Default uses output timestamp when method exists, else labeled render time. */
  readonly clock?:PcmSinkClock;
}
export type PcmSinkErrorCode='INVALID_INPUT'|'BLOCKED'|'STALE_RUN'|'QUEUE_FULL'|'CLOCK_FAILED'|'AUDIO_FAILED'|'RELEASED';
export class PcmSinkError extends Error {
  constructor(readonly code:PcmSinkErrorCode,message:string){super(message);this.name='PcmSinkError';}
}
/** Synchronous buffer sink only: no resume, timers, worker commands or transport intent/completion. */
export interface AudioPcmQueueSink {
  /** Requires permitted running actual-rate owner; captures epoch and new generation, never resumes.
   * Revisions are nonnegative safe integers, retaining/increasing across begins. Validate new input
   * before replacing a current run. Select one audio clock, never blend/extrapolate/switch mid-run.
   */
  begin(revision:number,timeline:Pick<PlaybackTimeline,'startBeat'|'endBeat'|'completionKey'>,anchorBeat?:number):PcmSinkRun;
  /** Exact matching run/revision/rate; strictly increasing positive safe request IDs, no duplicates.
   * Recheck running owner permission/epoch before scheduling; invalid permission flushes BLOCKED.
   * Snapshot PCM /32768 into mono actual-rate AudioBuffers before caller may mutate its samples.
   * Prime until ceil(rate*.080), or caller final permits a short tail. Final seals this generation.
   * Integer start=max(previousEnd,ceil(context.currentTime*rate)+ceil(rate*.020)); start(start/rate).
   * Preflight cap: queued horizon <=ceil(rate*.200)+4096, retained mappings+staging<=512,
   * live sources+staging<=512; positive1..4096 frames. Reject before allocation, never drop history.
   * Initial priming only; underrun gaps hold beat. Allocation/start uncertainty flushes the run.
   */
  enqueue(run:PcmSinkRun,pcm:PcmSinkPcm,final?:boolean):void;
  /** Floor only selected audio time*rate via pure clock. Output0 holds head. Before the first
   * scheduled frame is reached, valid output-timestamp startup regressions retain the anchor.
   * After that frame is reached (and always for context-render), regressions flush CLOCK_FAILED.
   * Invalid/throwing observations always fail; clock selection never changes.
   * Prune consumed mappings independently of ended cleanup.
   * An active run with invalid owner permission/epoch is flushed BLOCKED; idle/released reads are inert.
   */
  read():PcmSinkReading;
  /** Invalidate generation before stop/disconnect. Late callbacks cannot affect replacements. */
  flush():void;
  /** Permanent/idempotent flush+unsubscribe; retains borrowed application context. */
  release():void;
}
