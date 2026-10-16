import type {
  ApplicationAudioContextOptions, ApplicationAudioContextOwner, ApplicationAudioPhase,
  ApplicationAudioState, AudioContextInvalidationReason,
} from './contracts';

const RESUME_WAIT_MS = 1500;
type PendingResume = {
  readonly epoch:number;
  readonly promise:Promise<AudioContext>;
  readonly resolve:(context:AudioContext)=>void;
  readonly reject:(reason:Error)=>void;
  readonly timer:ReturnType<typeof setTimeout>;
  attempt:number;
};

/** Application lifetime owner. Feature owners borrow its context and own only their nodes. */
export class ApplicationAudioContext implements ApplicationAudioContextOwner {
  private context?:AudioContext;
  private readonly doc?:Document;
  private readonly win?:Window;
  private readonly listeners = new Set<(reason:AudioContextInvalidationReason)=>void>();
  private state:ApplicationAudioState = Object.freeze({epoch:0,phase:'idle',sampleRate:null,canRender:false});
  private epoch = 0;
  private windowFocused:boolean;
  private pageActive = true;
  private pending?:PendingResume;
  private released = false;
  private releaseResult?:Promise<void>;

  constructor(private readonly options:ApplicationAudioContextOptions = {}) {
    this.doc = options.document ?? (typeof document === 'undefined' ? undefined : document);
    this.win = options.window ?? (typeof window === 'undefined' ? undefined : window);
    this.windowFocused = typeof this.doc?.hasFocus === 'function' ? this.doc.hasFocus() : true;
    this.doc?.addEventListener('visibilitychange',this.onVisibility);
    this.win?.addEventListener('blur',this.onBlur);
    this.win?.addEventListener('focus',this.onFocus);
    this.win?.addEventListener('pagehide',this.onPageHide);
    this.win?.addEventListener('pageshow',this.onPageShow);
  }

  getSnapshot = ():ApplicationAudioState => this.state;

  getContext():AudioContext {
    if (this.released) throw new Error('Application audio is released.');
    if (this.state.phase === 'closed' || this.context?.state === 'closed') {
      if (this.state.phase !== 'closed') this.invalidate('closed');
      throw new Error('Application audio context is closed.');
    }
    if (!this.context) {
      try {
        this.context = this.options.createContext?.() ?? new AudioContext();
        this.context.addEventListener('statechange',this.onContextState);
        if (this.context.state === 'closed') {
          this.invalidate('closed');
          throw new Error('Application audio context is closed.');
        }
        this.publish(this.state.phase,false);
      } catch (error) {
        if (!this.released && this.getSnapshot().phase !== 'closed') this.publish('blocked',false);
        throw error;
      }
    }
    return this.context;
  }

  resumeFromGesture():Promise<AudioContext> {
    if (this.released || this.state.phase === 'closed') {
      return Promise.reject(new Error('Application audio is unavailable.'));
    }
    if (!this.foreground()) {
      if (this.pending || this.state.canRender) this.invalidate('lifecycle');
      if (!this.released && this.getSnapshot().phase !== 'closed') this.publish('blocked',false);
      return Promise.reject(new Error('Audio requires a new gesture in the foreground page.'));
    }
    let context:AudioContext;
    try { context = this.getContext(); }
    catch (error) { return Promise.reject(error); }

    let pending = this.pending;
    if (!pending) {
      let resolve!:(context:AudioContext)=>void, reject!:(reason:Error)=>void;
      const promise = new Promise<AudioContext>((yes,no) => { resolve = yes; reject = no; });
      const epoch = this.epoch;
      pending = {epoch,promise,resolve,reject,attempt:0,timer:setTimeout(() => {
        if (this.pending === pending && this.epoch === epoch) this.invalidate('suspended','blocked');
      },RESUME_WAIT_MS)};
      this.pending = pending;
    }
    // Coalesce callers within this epoch, but invoke resume in every gesture stack.
    // Only the newest native attempt can settle their shared bounded promise.
    const attempt = ++pending.attempt;
    try {
      const resumed = context.resume();
      void Promise.resolve(resumed).then(() => {
        if (!this.current(pending,attempt)) return;
        if (!this.foreground()) { this.invalidate('lifecycle'); return; }
        if (context.state === 'closed') { this.invalidate('closed'); return; }
        if (context.state !== 'running') { this.invalidate('suspended','blocked'); return; }
        this.pending = undefined;
        clearTimeout(pending.timer);
        this.publish('ready',true);
        pending.resolve(context);
      },() => {
        if (this.current(pending,attempt)) {
          if (context.state === 'closed') this.invalidate('closed');
          else this.invalidate('suspended','blocked');
        }
      });
    } catch {
      if (this.current(pending,attempt)) {
        if (context.state === 'closed') this.invalidate('closed');
          else this.invalidate('suspended','blocked');
      }
    }
    return pending.promise;
  }

  subscribeInvalidation(listener:(reason:AudioContextInvalidationReason)=>void):()=>void {
    if (this.released) return () => {};
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  release():Promise<void> {
    if (this.releaseResult) return this.releaseResult;
    let finish!:()=>void;
    this.releaseResult = new Promise<void>((resolve) => { finish = resolve; });
    this.released = true;
    this.doc?.removeEventListener('visibilitychange',this.onVisibility);
    this.win?.removeEventListener('blur',this.onBlur);
    this.win?.removeEventListener('focus',this.onFocus);
    this.win?.removeEventListener('pagehide',this.onPageHide);
    this.win?.removeEventListener('pageshow',this.onPageShow);
    this.context?.removeEventListener('statechange',this.onContextState);
    this.invalidate('released');
    this.listeners.clear();
    try {
      if (this.context && this.context.state !== 'closed') void Promise.resolve(this.context.close()).then(() => finish(),() => finish());
      else finish();
    } catch { finish(); }
    return this.releaseResult;
  }

  private foreground():boolean { return this.windowFocused && this.pageActive && !this.doc?.hidden; }

  private current(pending:PendingResume, attempt:number):boolean {
    return !this.released && this.pending === pending && pending.epoch === this.epoch && pending.attempt === attempt;
  }

  private publish(phase:ApplicationAudioPhase,canRender:boolean):void {
    this.state = Object.freeze({epoch:this.epoch,phase,sampleRate:this.context?.sampleRate ?? null,canRender});
  }

  private invalidate(reason:AudioContextInvalidationReason, phase?:ApplicationAudioPhase):void {
    const epoch = ++this.epoch;
    this.publish(phase ?? (reason === 'lifecycle' ? 'suspended' : reason),false);
    const pending = this.pending;
    this.pending = undefined;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Application audio was invalidated: ' + reason));
    }
    // Snapshot listeners. A reentrant release/new invalidation supersedes this notification.
    for (const listener of [...this.listeners]) {
      if (this.epoch !== epoch) break;
      try { listener(reason); } catch { /* A borrower cannot prevent other borrowers stopping. */ }
    }
  }

  private readonly onBlur = ():void => {
    if (this.released) return;
    this.windowFocused = false;
    this.invalidate('lifecycle');
  };
  private readonly onFocus = ():void => { if (!this.released) this.windowFocused = true; };
  private readonly onPageHide = ():void => {
    if (this.released) return;
    this.pageActive = false;
    this.invalidate('lifecycle');
  };
  private readonly onPageShow = ():void => { if (!this.released) this.pageActive = true; };
  private readonly onVisibility = ():void => {
    if (!this.released && this.doc?.hidden) this.invalidate('lifecycle');
  };
  private readonly onContextState = ():void => {
    if (this.released) return;
    if (this.context?.state === 'closed') this.invalidate('closed');
    else if (this.context?.state !== 'running') this.invalidate('suspended');
    // An external resume must never grant permission in a new foreground epoch.
  };
}

let applicationOwner:ApplicationAudioContext|undefined;
/** Stable production owner, including after permanent application release. */
export function getApplicationAudioContextOwner():ApplicationAudioContextOwner {
  return applicationOwner ??= new ApplicationAudioContext();
}