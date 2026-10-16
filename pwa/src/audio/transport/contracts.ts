import type {StaticRenderOptions} from '../synth';

/** Exact frequencies bypass transpose. Rendering uses the context output rate. */
export type PreviewRequest = Omit<StaticRenderOptions, 'sampleRate'|'shouldAbort'|'random'>;
export type PreviewPhase = 'idle'|'preparing'|'playing'|'blocked'|'error'|'released';
export interface PreviewState {
  readonly phase:PreviewPhase;
  readonly revision:number;
  readonly requestId:string|null;
  readonly message?:string;
}
/** Render-clock evidence, not proof of the device volume or a human hearing sound. */
export interface PreviewReceipt {
  readonly kind:'render-started'|'ended';
  readonly requestId:string;
  readonly revision:number;
  readonly sampleRate:number;
  readonly frameCount:number;
  readonly scheduledTime:number;
  readonly contextTime:number;
  readonly nonSilent:boolean;
}
export interface PreviewOwnerOptions {
  /** Borrow the shared owner; mutually exclusive with isolated createContext. */
  readonly contextOwner?:ApplicationAudioContextOwner;
  /** Isolated/test ownership: this preview closes the returned context on release. */
  readonly createContext?:()=>AudioContext;
  readonly render?:(options:StaticRenderOptions)=>Int16Array|null|Promise<Int16Array|null>;
  readonly onReceipt?:(receipt:PreviewReceipt)=>void;
  readonly document?:Document;
  readonly window?:Window;
}
export interface AudioPreviewOwner {
  getSnapshot():PreviewState;
  subscribe(listener:()=>void):()=>void;
  /** Call from a user gesture. Settles on scheduling, failure/blocking or cancellation.
   * A render-started receipt requires subsequent progress of the running audio clock.
   */
  play(requestId:string,request:PreviewRequest):Promise<void>;
  /** Invalidate pending work before retiring the current preview with a24ms fade. */
  stop():void;
  /** Permanently stop/disconnect/remove listeners; close isolated context, retain borrowed context. */
  release():Promise<void>;
}


export type ApplicationAudioPhase = 'idle'|'ready'|'blocked'|'suspended'|'closed'|'released';
export type AudioContextInvalidationReason = 'lifecycle'|'suspended'|'closed'|'released';
export interface ApplicationAudioState {
  readonly epoch:number;
  readonly phase:ApplicationAudioPhase;
  readonly sampleRate:number|null;
  /** Explicit gesture succeeded in this foreground epoch and the context is running. */
  readonly canRender:boolean;
}
export interface ApplicationAudioContextOptions {
  readonly createContext?:()=>AudioContext;
  readonly document?:Document;
  readonly window?:Window;
}
/** One lazy actual-rate context shared by preview, stream and future capture borrowers.
 * Lifecycle/suspension invalidates permission before observers; foreground return never
 * grants permission. Borrower release disconnects only itself. Only this owner closes
 * the shared context, once and permanently. No replacement after closed/released.
 */
export interface ApplicationAudioContextOwner {
  getSnapshot():ApplicationAudioState;
  /** Lazy creation only; never resumes or grants render permission. Throws after release. */
  getContext():AudioContext;
  /** Invoke from an explicit gesture; calls resume synchronously, then settles within1500ms.
   * A stale epoch, hidden/background page, rejection or nonrunning clock cannot grant permission.
   */
  resumeFromGesture():Promise<AudioContext>;
  subscribeInvalidation(listener:(reason:AudioContextInvalidationReason)=>void):()=>void;
  release():Promise<void>;
}
