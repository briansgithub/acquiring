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
  /** Permanently stop, disconnect, remove lifecycle listeners and close the context. */
  release():Promise<void>;
}
