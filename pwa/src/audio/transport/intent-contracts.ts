import type {PlaybackTimeline} from '../synth';

export type PlaybackIntentPhase='stopped'|'buffering'|'playing'|'paused'|'completed'|'error'|'released';
export interface PlaybackIntentWindow {readonly startBeat:number;readonly endBeat:number;readonly completionKey:string|null}
export interface PlaybackIntentGuard {readonly transportRevision:number;readonly completionKey:string|null}
export interface PlaybackIntentSnapshot {
  readonly phase:PlaybackIntentPhase;
  readonly transportRevision:number;
  readonly playbackRequested:boolean;
  readonly beat:number;
  readonly bpm:number;
  readonly window:PlaybackIntentWindow|null;
  readonly renderEnded:boolean;
  readonly completion:PlaybackIntentGuard|null;
  readonly error:string|null;
}
/** Pure state only: no clocks, subscriptions, audio, workers, timers or full timeline events.
 * Constructor(initialBpm): stopped/rev0/requestedfalse/beat1/window-null/no evidence/error.
 * Snapshot/window/completion are independently frozen. Validate/snapshot known fields once
 * before mutation and recheck after caller getters: nested newer commands must survive.
 * Invalid domains throw RangeError, released commands Error, valid stale observations false.
 * Bounds: STREAM_LIMITS beat/BPM; finite BPM<=1000, negatives clamp0; safe revision before
 * increment; window span>=1e-6; default start1/keynull; key<=512/error<=1024characters.
 * Commands below increment public revision and clear completion/error/end/drain proof.
 * This revision differs from the adapter's audio generation/foreground epoch. Immediate
 * status publication is an explicit browser choice; native StateFlow phases trail commands.
 */
export interface PlaybackIntentKernelApi {
  getSnapshot():PlaybackIntentSnapshot;
  /** start beat; requested=continuePlaying; buffering iff requested&&bpm>0, else stopped. */
  load(window:Pick<PlaybackTimeline,'startBeat'|'endBeat'|'completionKey'>,continuePlaying:boolean):void;
  /** requestedtrue, preserve unfinished beat/playing phase. Known finished/completed or
   * once-only paused end restarts at start. Otherwise buffering/paused at positive/zero BPM.
   * Arm one reconciliation latch; suppress end/drain proof until observePlayReady consumes it.
   */
  play():void;
  /** Preserve last accepted played beat, requestedfalse/paused. */
  pause():void;
  /** Atomic prior requested flag, then same transition as pause. */
  pauseForScrub():boolean;
  /** Immediately clamp finite target to loaded window (else bounded raw beat); requested=resume;
   * buffering iff resume&&bpm>0, else paused. A paused end seek must remain at end.
   */
  seek(beat:number,resume:boolean):void;
  /** requestedfalse/stopped/startBeat-or1. */
  reset():void;
  /** Same immediate pause: invalidates queued resume while preserving last accepted beat. */
  pauseForLifecycle():void;
  /** NO revision increment or requested change. Requested+zero pauses and clears end/drain;
   * requested+positive preserves playing or buffers. No implicit restart. Nonrequested keeps
   * stopped/paused/completed/error and valid completion. Adapter rechecks foreground permission.
   */
  updateTempo(bpm:number):void;
  /** Current pending-play latch only: finished discovery restarts beat at start without another
   * command/revision; false preserves beat. Consume once. Adapter reconciles before new PCM.
   */
  observePlayReady(guard:PlaybackIntentGuard,rendererWasFinished:boolean):boolean;
  /** Current revision/key, loaded nonterminal/requested/positive tempo only. Supplied in-window
   * selected played beat alone advances position and publishes playing, never extrapolate.
   */
  observePlayed(guard:PlaybackIntentGuard,beat:number):boolean;
  /** Current once-only/requested/positive tempo, no pending play: records proof, never moves beat. */
  observeRenderEnded(guard:PlaybackIntentGuard):boolean;
  /** Adapter proves final PCM enqueued AND selected audio head drained at exact endBeat.
   * End/drain may arrive in either order. Both current proofs complete ONCE: requestedfalse,
   * completed/frozen revision+key receipt. Null-key loops never complete. No walltime proof.
   */
  observeFinalDrained(guard:PlaybackIntentGuard,playedBeat:number):boolean;
  /** Current error clears requested/evidence/completion; stale errors do nothing. */
  observeError(guard:PlaybackIntentGuard,message:string):boolean;
  /** Check current completed proof plus receipt revision/key, not caller snapshot flags. */
  isCurrentCompletion(completion:PlaybackIntentGuard):boolean;
  /** Permanent/idempotent; requestedfalse/released, evidence cleared; later observations false. */
  release():void;
}
