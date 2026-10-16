import { STREAM_LIMITS } from '../synth';
import type { PlaybackTimeline } from '../synth';
import type { PlaybackIntentKernelApi, PlaybackIntentSnapshot, PlaybackIntentGuard, PlaybackIntentWindow } from './intent-contracts';

const invalid = (message: string): never => { throw new RangeError(message); };
const revision = (value: number) => Number.isSafeInteger(value) && value >= 0;
function beat(value: number): void {
  if (!Number.isFinite(value) || Math.abs(value) > STREAM_LIMITS.absoluteBeat) invalid('Beat exceeds intent domain');
}
function tempo(value: number): number {
  if (!Number.isFinite(value) || value > STREAM_LIMITS.bpm) invalid('Tempo exceeds intent domain');
  return Math.max(0,value);
}
function key(value: unknown): string|null {
  if (value !== null && (typeof value !== 'string' || value.length > 512)) return invalid('Invalid completion key');
  return value as string|null;
}
function guardSnapshot(input: PlaybackIntentGuard): PlaybackIntentGuard {
  if (!input || typeof input !== 'object') return invalid('Invalid observation guard');
  const { transportRevision, completionKey } = input;
  if (!revision(transportRevision)) return invalid('Invalid observation revision');
  return { transportRevision, completionKey: key(completionKey) };
}
const boolean = (value: boolean) => { if (typeof value !== 'boolean') invalid('Expected boolean intent'); };

/** Pure native intent semantics with immediate browser status publication. */
export class PlaybackIntentKernel implements PlaybackIntentKernelApi {
  private state: PlaybackIntentSnapshot;
  private pendingPlay = false;
  private drained = false;
  constructor(initialBpm: number) {
    this.state = Object.freeze({ phase:'stopped', transportRevision:0, playbackRequested:false,
      beat:1, bpm:tempo(initialBpm), window:null, renderEnded:false, completion:null, error:null });
  }
  getSnapshot(): PlaybackIntentSnapshot { return this.state; }
  load(input: Pick<PlaybackTimeline,'startBeat'|'endBeat'|'completionKey'>, continuePlaying: boolean): void {
    const before = this.commandState();
    boolean(continuePlaying);
    if (!input || typeof input !== 'object') return invalid('Invalid timeline window');
    const { startBeat: rawStart, endBeat, completionKey: rawKey } = input;
    const startBeat = rawStart ?? 1, completionKey = key(rawKey ?? null);
    beat(startBeat); beat(endBeat);
    if (endBeat-startBeat < 1e-6) return invalid('Invalid timeline span');
    const window = Object.freeze({ startBeat,endBeat,completionKey });
    this.unchanged(before);
    this.command({ window, beat:startBeat, playbackRequested:continuePlaying,
      phase:continuePlaying && before.bpm>0 ? 'buffering' : 'stopped' });
  }
  play(): void {
    const before = this.commandState(), window = before.window;
    const restart = before.renderEnded || before.phase==='completed' ||
      window?.completionKey != null && before.phase==='paused' && before.beat===window.endBeat;
    this.command({ playbackRequested:true, beat:restart && window ? window.startBeat : before.beat,
      phase:before.bpm<=0 ? 'paused' : before.phase==='playing' && !restart ? 'playing' : 'buffering' },true);
  }
  pause(): void { this.commandState(); this.command({ playbackRequested:false, phase:'paused' }); }
  pauseForScrub(): boolean { const requested=this.commandState().playbackRequested; this.pause(); return requested; }
  seek(target: number, resume: boolean): void {
    const before = this.commandState(); beat(target); boolean(resume);
    const window=before.window;
    this.command({ beat:window ? Math.max(window.startBeat,Math.min(window.endBeat,target)) : target,
      playbackRequested:resume, phase:resume && before.bpm>0 ? 'buffering' : 'paused' });
  }
  reset(): void {
    const before=this.commandState();
    this.command({ playbackRequested:false, beat:before.window?.startBeat ?? 1, phase:'stopped' });
  }
  pauseForLifecycle(): void { this.pause(); }
  updateTempo(input: number): void {
    const before=this.commandState(), bpm=tempo(input);
    if (before.playbackRequested && bpm===0) {
      this.drained=false;
      this.publish({ bpm, phase:'paused', renderEnded:false });
    } else this.publish({ bpm, phase:before.playbackRequested
      ? before.phase==='playing' ? 'playing' : 'buffering' : before.phase });
  }
  observePlayReady(input: PlaybackIntentGuard, rendererWasFinished: boolean): boolean {
    if (this.state.phase==='released') return false;
    boolean(rendererWasFinished);
    const before=this.state, guard=guardSnapshot(input);
    if (!this.matches(before,guard) || !this.pendingPlay || !before.playbackRequested) return false;
    this.pendingPlay=false; this.drained=false;
    this.publish({ renderEnded:false, beat:rendererWasFinished && before.window ? before.window.startBeat : before.beat });
    return true;
  }
  observePlayed(input: PlaybackIntentGuard, playedBeat: number): boolean {
    if (this.state.phase==='released') return false;
    beat(playedBeat);
    const before=this.state, guard=guardSnapshot(input);
    if (!this.matches(before,guard) || !this.active(before)) return false;
    this.inWindow(before.window!,playedBeat);
    this.publish({ beat:playedBeat, phase:'playing' });
    return true;
  }
  observeRenderEnded(input: PlaybackIntentGuard): boolean {
    if (this.state.phase==='released') return false;
    const before=this.state, guard=guardSnapshot(input);
    if (!this.matches(before,guard) || !this.once(before) || before.renderEnded) return false;
    this.publish({ renderEnded:true });
    this.complete();
    return true;
  }
  observeFinalDrained(input: PlaybackIntentGuard, playedBeat: number): boolean {
    if (this.state.phase==='released') return false;
    beat(playedBeat);
    const before=this.state, guard=guardSnapshot(input);
    if (!this.matches(before,guard) || !this.once(before) || this.drained) return false;
    this.inWindow(before.window!,playedBeat);
    if (playedBeat!==before.window!.endBeat) return false;
    this.drained=true;
    this.publish({ beat:playedBeat, phase:'playing' });
    this.complete();
    return true;
  }
  observeError(input: PlaybackIntentGuard, message: string): boolean {
    if (this.state.phase==='released') return false;
    if (typeof message!=='string' || message.length>1024) return invalid('Invalid error message');
    const before=this.state, guard=guardSnapshot(input);
    if (!this.matches(before,guard)) return false;
    this.pendingPlay=false; this.drained=false;
    this.publish({ phase:'error', playbackRequested:false, renderEnded:false, completion:null, error:message });
    return true;
  }
  isCurrentCompletion(input: PlaybackIntentGuard): boolean {
    if (this.state.phase==='released') return false;
    const before=this.state, guard=guardSnapshot(input);
    return this.matches(before,guard) && before.phase==='completed' && before.completion!==null &&
      before.renderEnded && this.drained && before.window?.completionKey!==null;
  }
  release(): void {
    if (this.state.phase==='released') return;
    this.pendingPlay=false; this.drained=false;
    this.publish({ phase:'released', playbackRequested:false, renderEnded:false, completion:null, error:null });
  }
  private commandState(): PlaybackIntentSnapshot {
    if (this.state.phase==='released') throw new Error('Intent kernel released');
    return this.state;
  }
  private unchanged(before: PlaybackIntentSnapshot): void {
    this.commandState();
    if (this.state!==before) throw new Error('Intent changed during input snapshot');
  }
  private command(patch: Partial<PlaybackIntentSnapshot>, pendingPlay=false): void {
    const next=this.state.transportRevision+1;
    if (!revision(next)) return invalid('Intent revision exhausted');
    this.pendingPlay=pendingPlay; this.drained=false;
    this.publish({ ...patch, transportRevision:next, renderEnded:false, completion:null, error:null });
  }
  private publish(patch: Partial<PlaybackIntentSnapshot>): void { this.state=Object.freeze({ ...this.state,...patch }); }
  private matches(before: PlaybackIntentSnapshot, guard: PlaybackIntentGuard): boolean {
    return this.state===before && before.phase!=='released' &&
      guard.transportRevision===before.transportRevision && guard.completionKey===(before.window?.completionKey ?? null);
  }
  private active(state: PlaybackIntentSnapshot): boolean {
    return state.window!==null && state.playbackRequested && state.bpm>0 &&
      (state.phase==='buffering' || state.phase==='playing');
  }
  private once(state: PlaybackIntentSnapshot): boolean { return this.active(state) && state.window!.completionKey!==null && !this.pendingPlay; }
  private inWindow(window: PlaybackIntentWindow, value: number): void {
    if (value<window.startBeat || value>window.endBeat) invalid('Played beat outside current window');
  }
  private complete(): void {
    if (!this.state.renderEnded || !this.drained || !this.once(this.state)) return;
    const completion=Object.freeze({ transportRevision:this.state.transportRevision, completionKey:this.state.window!.completionKey });
    this.publish({ phase:'completed', playbackRequested:false, completion });
  }
}
