import { MAX_STATIC_PLAYBACK_MS, MAX_STATIC_VOICES, renderStaticSamples } from '../synth';
import type { AudioPreviewOwner, PreviewOwnerOptions, PreviewReceipt, PreviewRequest, PreviewState } from './contracts';

const FADE_SECONDS = 0.024;
const RESUME_WAIT_MS = 1500;
const PREPARATION_WAIT_MS = 5000;
const CLOCK_POLL_MS = 20;

type Pending = { revision:number; requestId:string; settle:()=>void; timer:ReturnType<typeof setTimeout> };
type Voice = {
  source:AudioBufferSourceNode; gain:GainNode; revision:number; requestId:string;
  frameCount:number; scheduledTime:number; nonSilent:boolean; started:boolean;
  poll?:ReturnType<typeof setInterval>; retirement?:ReturnType<typeof setTimeout>;
};

/** Owns only static one-shot preview playback. Construct in tests; use the singleton in production. */
export class PreviewOwner implements AudioPreviewOwner {
  private context?:AudioContext;
  private state:PreviewState = Object.freeze({phase:'idle', revision:0, requestId:null});
  private readonly listeners = new Set<()=>void>();
  private readonly render:NonNullable<PreviewOwnerOptions['render']>;
  private readonly doc?:Document;
  private readonly win?:Window;
  private revision = 0;
  private pending?:Pending;
  private current?:Voice;
  private fading?:Voice;
  private released = false;
  private releaseResult?:Promise<void>;

  constructor(private readonly options:PreviewOwnerOptions = {}) {
    this.render = options.render ?? renderStaticSamples;
    this.doc = options.document ?? (typeof document === 'undefined' ? undefined : document);
    this.win = options.window ?? (typeof window === 'undefined' ? undefined : window);
    this.doc?.addEventListener('visibilitychange', this.onVisibility);
    this.win?.addEventListener('blur', this.onLeave);
    this.win?.addEventListener('pagehide', this.onLeave);
  }

  getSnapshot = ():PreviewState => this.state;
  subscribe = (listener:()=>void):(()=>void) => {
    if (this.released) return () => {};
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** resume() runs in this synchronous stack, before promise continuations or rendering. */
  play(requestId:string, request:PreviewRequest):Promise<void> {
    if (this.released) return Promise.resolve();
    this.invalidate(false);
    const revision = this.revision;
    let settle!:()=>void;
    const result = new Promise<void>((resolve) => { settle = resolve; });
    const pending:Pending = {revision, requestId, settle, timer:setTimeout(() => {
      this.fail(pending, 'blocked', 'Audio could not start. Try another explicit gesture.');
    }, RESUME_WAIT_MS)};
    this.pending = pending;
    try {
      // Copy caller-owned values before any await; never retain their mutable array.
      if (!Array.isArray(request.freqs) || request.freqs.length > MAX_STATIC_VOICES) {
        throw new RangeError('Static preview supports at most32 voices.');
      }
      const snapshot:PreviewRequest = {...request, freqs:[...request.freqs]};
      if (this.doc?.hidden) {
        this.fail(pending, 'blocked', 'Preview is unavailable while the page is hidden.');
        return result;
      }
      const context = this.getContext();
      if (context.state === 'closed') throw new Error('Audio context is closed.');
      const resumed = context.resume();
      if (this.isPending(pending)) this.update('preparing', requestId);
      void Promise.resolve(resumed).then(async () => {
        if (!this.isPending(pending)) return;
        if (context.state !== 'running') {
          this.fail(pending, 'blocked', 'Audio is suspended. Try another explicit gesture.');
          return;
        }
        clearTimeout(pending.timer);
        pending.timer = setTimeout(() => {
          this.fail(pending, 'error', 'Preview preparation timed out.');
        }, PREPARATION_WAIT_MS);
        const pcm = await this.render({...snapshot, sampleRate:context.sampleRate,
          shouldAbort:() => !this.isPending(pending)});
        if (!this.isPending(pending)) return;
        if (context.state !== 'running') {
          this.fail(pending, 'blocked', 'Audio is no longer running.');
          return;
        }
        if (pcm !== null && (!(pcm instanceof Int16Array) ||
          pcm.length > Math.floor(context.sampleRate * MAX_STATIC_PLAYBACK_MS / 1000))) {
          throw new RangeError('Preview PCM must be signed16 samples within the30second limit.');
        }
        if (pcm === null || pcm.length === 0) {
          this.finish(pending);
          this.update('idle', null);
          return;
        }
        this.schedule(context, pending, requestId, pcm);
      }).catch(() => {
        this.fail(pending, context.state === 'suspended' ? 'blocked' : 'error',
          'Unable to prepare or start preview audio.');
      });
    } catch {
      this.fail(pending, 'error', 'Unable to create or start preview audio.');
    }
    return result;
  }

  stop():void {
    if (this.released) return;
    this.invalidate(false);
    this.update('idle', null);
  }

  release():Promise<void> {
    if (this.releaseResult) return this.releaseResult;
    let finish!:()=>void;
    this.releaseResult = new Promise<void>((resolve) => { finish = resolve; });
    this.released = true;
    this.invalidate(true);
    this.doc?.removeEventListener('visibilitychange', this.onVisibility);
    this.win?.removeEventListener('blur', this.onLeave);
    this.win?.removeEventListener('pagehide', this.onLeave);
    this.context?.removeEventListener('statechange', this.onContextState);
    this.update('released', null);
    this.listeners.clear();
    // Release remains permanent even when the browser rejects close().
    try { void Promise.resolve(this.context?.close()).then(finish, finish); }
    catch { finish(); }
    return this.releaseResult;
  }

  private getContext():AudioContext {
    if (!this.context) {
      this.context = this.options.createContext?.() ?? new AudioContext();
      this.context.addEventListener('statechange', this.onContextState);
    }
    return this.context;
  }

  private isPending(pending:Pending):boolean {
    return !this.released && this.pending === pending && this.revision === pending.revision;
  }

  private finish(pending:Pending):void {
    clearTimeout(pending.timer);
    if (this.pending === pending) this.pending = undefined;
    pending.settle();
  }

  private fail(pending:Pending, phase:'blocked'|'error', message:string):void {
    if (!this.isPending(pending)) return;
    this.finish(pending);
    this.update(phase, pending.requestId, message);
  }

  private schedule(context:AudioContext, pending:Pending, requestId:string, pcm:Int16Array):void {
    const buffer = context.createBuffer(1, pcm.length, context.sampleRate);
    const floats = buffer.getChannelData(0);
    let nonSilent = false;
    for (let i = 0; i < pcm.length; i++) {
      floats[i] = pcm[i] / 32768;
      nonSilent ||= pcm[i] !== 0;
    }
    let source:AudioBufferSourceNode|undefined;
    let gain:GainNode|undefined;
    try {
      source = context.createBufferSource();
      gain = context.createGain();
      source.buffer = buffer;
      source.loop = false;
      source.connect(gain);
      gain.connect(context.destination);
      const voice:Voice = {source, gain, revision:pending.revision, requestId,
        frameCount:pcm.length, scheduledTime:context.currentTime, nonSilent, started:false};
      gain.gain.setValueAtTime(1, voice.scheduledTime);
      source.onended = () => this.onEnded(voice);
      this.current = voice;
      source.start(voice.scheduledTime);
      voice.poll = setInterval(() => this.checkClock(voice), CLOCK_POLL_MS);
      this.finish(pending);
      this.update('playing', requestId);
    } catch (error) {
      if (this.current?.source === source) this.current = undefined;
      if (source) { source.onended = null; try { source.stop(); } catch {} source.disconnect(); }
      gain?.disconnect();
      throw error;
    }
  }

  private checkClock(voice:Voice):void {
    const context = this.context;
    if (!context || this.current !== voice || voice.revision !== this.revision || this.released) return;
    if (context.state !== 'running') {
      this.onContextState();
      return;
    }
    // A timer is only a poll trigger: the running audio clock is the evidence.
    if (!voice.started && context.currentTime > voice.scheduledTime) {
      voice.started = true;
      this.receipt('render-started', voice);
    }
  }

  private onEnded(voice:Voice):void {
    if (this.current === voice && voice.revision === this.revision && !this.released) {
      this.checkClock(voice);
      if (this.current === voice && voice.revision === this.revision && voice.started) {
        this.receipt('ended', voice);
      }
      if (this.current === voice && voice.revision === this.revision) {
        this.current = undefined;
        this.dispose(voice);
        this.update('idle', null);
      }
    } else {
      this.dispose(voice);
    }
  }

  private receipt(kind:PreviewReceipt['kind'], voice:Voice):void {
    const context = this.context!;
    const receipt:PreviewReceipt = Object.freeze({kind, requestId:voice.requestId, revision:voice.revision,
      sampleRate:context.sampleRate, frameCount:voice.frameCount, scheduledTime:voice.scheduledTime,
      contextTime:context.currentTime, nonSilent:voice.nonSilent});
    try { this.options.onReceipt?.(receipt); } catch { /* Observers cannot retain audio ownership. */ }
  }

  /** Invalidate and settle first, then retire sound; no stale continuation can register a source. */
  private invalidate(immediate:boolean):void {
    ++this.revision;
    if (this.pending) this.finish(this.pending);
    if (this.fading) this.dispose(this.fading);
    const voice = this.current;
    this.current = undefined;
    if (!voice) return;
    clearInterval(voice.poll);
    if (immediate || this.context?.state !== 'running') {
      this.dispose(voice);
      return;
    }
    const now = this.context.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(1, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
      voice.source.stop(now + FADE_SECONDS);
      this.fading = voice;
      // onended normally frees the voice. Bound retained nodes even if the clock freezes.
      voice.retirement = setTimeout(() => this.dispose(voice), 100);
    } catch {
      this.dispose(voice);
    }
  }

  private dispose(voice:Voice):void {
    clearInterval(voice.poll);
    clearTimeout(voice.retirement);
    voice.source.onended = null;
    try { voice.source.stop(); } catch {}
    try { voice.source.disconnect(); } catch {}
    try { voice.gain.disconnect(); } catch {}
    voice.source.buffer = null;
    if (this.current === voice) this.current = undefined;
    if (this.fading === voice) this.fading = undefined;
  }

  private update(phase:PreviewState['phase'], requestId:string|null, message?:string):void {
    this.state = Object.freeze({phase, revision:this.revision, requestId, ...(message ? {message} : {})});
    for (const listener of this.listeners) {
      try { listener(); } catch { /* Observers cannot interrupt cancellation/cleanup. */ }
    }
  }

  private readonly onLeave = ():void => {
    if (this.released) return;
    this.invalidate(true);
    this.update('idle', null);
  };
  private readonly onVisibility = ():void => { if (this.doc?.hidden) this.onLeave(); };
  private readonly onContextState = ():void => {
    if (this.released || this.context?.state === 'running') return;
    if (!this.current && this.context?.state !== 'closed') return;
    const phase = this.context?.state === 'closed' ? 'error' : 'blocked';
    this.invalidate(true);
    this.update(phase, null, 'Audio stopped. A new explicit gesture is required.');
  };
}

let productionOwner:PreviewOwner|undefined;
/** A released production owner stays released; creating a second output owner is never implicit. */
export function getPreviewOwner():AudioPreviewOwner {
  return productionOwner ??= new PreviewOwner();
}
