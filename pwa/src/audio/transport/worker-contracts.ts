import type {PlaybackConfig,PlaybackTimeline} from '../synth';

export const PLAYBACK_WORKER_LIMITS=Object.freeze({version:1 as const,nativeBlockFrames:256,batchFrames:4096,timeoutMs:5000,completionKeyCharacters:512});
export type PlaybackWorkerOperation=
  | {readonly kind:'load';readonly sampleRate:number;readonly timeline:PlaybackTimeline;readonly config:PlaybackConfig}
  | {readonly kind:'seek';readonly beat:number}
  | {readonly kind:'configure';readonly config:PlaybackConfig}
  | {readonly kind:'render';readonly frameCount:number};
export interface PlaybackWorkerRequest {
  readonly version:1;
  /** Positive safe integer, strictly increasing within a worker session. Never replay a render. */
  readonly requestId:number;
  /** Nonnegative safe integer. Controls may retain/increase; render must match last applied control. */
  readonly revision:number;
  readonly operation:PlaybackWorkerOperation;
}
export interface PlaybackWorkerPosition {
  readonly sampleRate:number;
  readonly beat:number;
  readonly beatsPerFrame:number;
  /** Renderer reached its one-shot end; not evidence of scheduled/output completion. */
  readonly finished:boolean;
}
export type PlaybackWorkerSuccess=
  | {readonly version:1;readonly requestId:number;readonly revision:number;readonly ok:true;readonly kind:'ack';readonly position:PlaybackWorkerPosition}
  | {readonly version:1;readonly requestId:number;readonly revision:number;readonly ok:true;readonly kind:'pcm';readonly startBeat:number;readonly position:PlaybackWorkerPosition;
     /** Exact requested length, including terminal silence. Unique transferred backing buffer, mutable elements. */
     readonly pcm:Int16Array};
export type PlaybackWorkerErrorCode='BUSY'|'INVALID_INPUT'|'NOT_LOADED'|'STALE_REVISION'|'PROTOCOL'|'WORKER_FAILED'|'ABORTED'|'TIMEOUT'|'RELEASED';
export interface PlaybackWorkerFailure {
  readonly version:1;readonly requestId:number;readonly revision:number;readonly ok:false;
  readonly error:{readonly code:PlaybackWorkerErrorCode;readonly message:string;readonly fatal:boolean};
}
export type PlaybackWorkerResponse=PlaybackWorkerSuccess|PlaybackWorkerFailure;
export interface PlaybackWorkerSession {
  /** Validate envelope/domain/resources before mutation. Never retain mutable input aliases.
   * Render in unchanged256-frame calls plus a final remainder. Any uncertain mutation failure
   * permanently drops the renderer; preflight/no-load/stale errors may be nonfatal.
   */
  handle(request:PlaybackWorkerRequest):PlaybackWorkerResponse;
  release():void;
}
export interface PlaybackWorkerPort {
  onmessage:((event:MessageEvent<unknown>)=>void)|null;
  onerror:((event:ErrorEvent)=>void)|null;
  onmessageerror:((event:MessageEvent<unknown>)=>void)|null;
  postMessage(request:PlaybackWorkerRequest):void;
  terminate():void;
}
export interface PlaybackWorkerClientOptions {readonly createWorker?:()=>PlaybackWorkerPort}
export interface PlaybackWorkerClient {
  /** Snapshot known input fields before posting, enforce renderer structural bounds and one
   * outstanding command total (BUSY never posts/queues). Resolve only matching success.
   * Already-aborted rejects without posting. Posted abort/timeout/error/malformed reply is
   * terminal: no continuing a renderer that may already have advanced. Deadline5000ms.
   */
  execute(operation:PlaybackWorkerOperation,revision:number,options?:{readonly signal?:AbortSignal}):Promise<PlaybackWorkerSuccess>;
  /** Immediate permanent termination; reject pending RELEASED, clear handlers/timer/listener. */
  release():void;
}
export class PlaybackWorkerError extends Error {
  constructor(readonly code:PlaybackWorkerErrorCode,message:string,readonly fatal:boolean,
    readonly requestId:number|null=null,readonly revision:number|null=null){super(message);this.name='PlaybackWorkerError';}
}
