import type {PlaybackConfig,PlaybackTimeline} from '../synth';
import type {ApplicationAudioContextOwner} from './contracts';
import type {PlaybackIntentGuard,PlaybackIntentPhase,PlaybackIntentSnapshot} from './intent-contracts';
import type {AudioPcmQueueSink,PcmSinkClock} from './sink-contracts';
import type {PlaybackWorkerClient} from './worker-contracts';

export const PLAYBACK_TRANSPORT_LIMITS=Object.freeze({pollMs:10,targetMs:80,batchMs:20,batchMin:256,batchMax:4096});
export interface PlaybackTransportState extends Omit<PlaybackIntentSnapshot,'phase'> {
  readonly phase:PlaybackIntentPhase|'blocked';
  /** Fixed sink-selected audio clock. Null when no active sink run. */
  readonly clock:PcmSinkClock|null;
}
export interface PlaybackTransportOptions {
  readonly initialConfig:PlaybackConfig;
  readonly contextOwner?:ApplicationAudioContextOwner;
  readonly createWorkerClient?:()=>PlaybackWorkerClient;
  readonly createSink?:(owner:ApplicationAudioContextOwner)=>AudioPcmQueueSink;
}
/** Bounded async owner around accepted PlaybackIntentKernel/PcmWorkerClient/PcmQueueSink.
 * No App singleton, UI, timeline building, microphone, device retry or catalog writes.
 * Defaults borrow the stable application context; construction never creates/resumes it.
 * Validate/snapshot bounded known input fields before mutation, protect nested newer commands,
 * freeze stable snapshots and isolate subscriber exceptions/reentrancy. Reuse existing bounds
 * and snapshotWorkerOperation on independent plain snapshots; do not construct a PCM renderer.
 * After release all commands throw, observations/late promises inert; no unhandled rejections.
 */
export interface AudioPlaybackTransport {
  getSnapshot():PlaybackTransportState;
  subscribe(listener:()=>void):()=>void;
  /** Immediate intent/window start; snapshot full bounded timeline, preserve requested flag.
   * Supersede old audio generation and flush immediately. Continue only if current foreground
   * permission already allows running actual-rate output; never resume implicitly.
   */
  load(timeline:PlaybackTimeline,continuePlaying:boolean):void;
  /** Record play intent immediately; call resumeFromGesture synchronously in this stack before
   * awaiting, including zero BPM. Guard resume/priming by intent, audio generation and epoch.
   * Compatible unfinished play preserves queued PCM/renderer; finished discovery reconciles
   * pending play via kernel, then restarts at start before any stale final PCM is adopted.
   */
  playFromGesture():void;
  /** Read latest valid selected played head before immediate pause/flush; fallback last published
   * beat if lifecycle already invalidated output. In-flight/held PCM cannot later start output.
   */
  pause():void;
  pauseForScrub():boolean;
  /** Silent when resume=false, including exact end. Immediate clamped target survives old ACKs. */
  seek(beat:number,resume:boolean):void;
  reset():void;
  /** Latest config coalesces without public transport revision change. Positive changes preserve
   * queued PCM/render head and native crossfades: serialize configure after pending render and
   * enqueue its already computed batch first. Zero BPM reanchors/flushes, keeps requested intent;
   * positive restoration continues only with current foreground permission, never implicit resume.
   */
  updateConfig(config:PlaybackConfig):void;
  isCurrentCompletion(completion:PlaybackIntentGuard):boolean;
  /** Permanent/idempotent; invalidate before clearing timer/held PCM, worker termination, sink
   * release and unsubscribe. Retain borrowed application context. Remove subscribers.
   */
  release():void;
}
/** Implementation constraints:
 * - Public command revision differs from worker/sink run revision and owner audio generation.
 *   Same-revision config still needs generation/epoch guards. Reconcile pending compatible play
 *   against a finishing render before adopting it; never relabel discarded advanced PCM as new.
 * - One worker command TOTAL, one held PCM batch, one coalesced desired control/config, one10ms
 *   timeout maximum. No promise-only pump loop or timers while paused/blocked/released.
 *   Batch=min(4096,max(256,ceil(actualRate*.020/256)*256)); target80ms, sink caps authoritative.
 *   Fill priming in bounded commands until scheduled; after reply recheck capacity/permission.
 *   QUEUE_FULL retains that single computed batch and polls, never renders/discards past it.
 * - Semantic load/pause/seek/reset/zero-tempo controls may recreate a worker, or wait for old
 *   command then ACK load/seek before reuse. Posted abort/timeout/fatal error ALWAYS terminates
 *   old client; fresh load+seek is mandatory before future render. No endless automatic retry.
 * - Final render response seals sink only after successful enqueue. Renderer finished alone is
 *   not completion. Current final-enqueued generation/epoch, kernel render-ended and selected
 *   sink drain at endBeat must agree; complete once. Clear timer on completion; no walltime beat.
 * - Lifecycle invalidation clears requested intent immediately, cancels pending resume/held PCM,
 *   flushes and tears down current worker. Foreground return never restarts. Blocked gesture or
 *   continuation publishes blocked/error and clears requested, no focus-triggered retry.
 * - Read public beat only from selected sink readings or explicit command targets. Playing is a
 *   scheduled sink analogue, not proof of clock onset, speaker output or a person hearing sound.
 */
