import { snapshotWorkerOperation, validWorkerRevision } from './pcm-worker-session';
import { PlaybackWorkerError, PLAYBACK_WORKER_LIMITS as LIMITS } from './worker-contracts';
import type { PlaybackWorkerClient, PlaybackWorkerClientOptions, PlaybackWorkerOperation, PlaybackWorkerPort,
  PlaybackWorkerRequest, PlaybackWorkerSuccess, PlaybackWorkerErrorCode } from './worker-contracts';

interface Pending {
  readonly request: PlaybackWorkerRequest;
  readonly resolve: (result: PlaybackWorkerSuccess) => void;
  readonly reject: (error: PlaybackWorkerError) => void;
  timer?: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  abort?: () => void;
}
const codes: readonly PlaybackWorkerErrorCode[] = ['BUSY','INVALID_INPUT','NOT_LOADED','STALE_REVISION','PROTOCOL','WORKER_FAILED','ABORTED','TIMEOUT','RELEASED'];
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** One command at a time; uncertainty permanently terminates this renderer session. */
export class PcmWorkerClient implements PlaybackWorkerClient {
  private worker: PlaybackWorkerPort | null = null;
  private pending: Pending | null = null;
  private released = false;
  private nextId = 1;
  private revision = 0;
  private loaded = false;
  private sampleRate = 0;
  constructor(private readonly options: PlaybackWorkerClientOptions = {}) {}

  execute(input: PlaybackWorkerOperation, revision: number, options?: { readonly signal?: AbortSignal }): Promise<PlaybackWorkerSuccess> {
    const reject = (code: PlaybackWorkerErrorCode, message: string, fatal = false) =>
      Promise.reject<PlaybackWorkerSuccess>(new PlaybackWorkerError(code, message, fatal));
    if (this.released) return reject('RELEASED', 'Client released', true);
    if (this.pending) return reject('BUSY', 'A command is already pending');
    if (options?.signal?.aborted) return reject('ABORTED', 'Already aborted');
    let operation: PlaybackWorkerOperation;
    try {
      if (!validWorkerRevision(revision)) throw new RangeError('Invalid revision');
      operation = snapshotWorkerOperation(input);
    } catch { return reject('INVALID_INPUT', 'Invalid bounded operation'); }
    if (operation.kind !== 'load' && !this.loaded) return reject('NOT_LOADED', 'Load required');
    if (operation.kind === 'render' ? revision !== this.revision : revision < this.revision)
      return reject('STALE_REVISION', 'Revision does not match applied state');
    if (!Number.isSafeInteger(this.nextId)) { this.release(); return reject('PROTOCOL', 'Request identity exhausted', true); }
    const request: PlaybackWorkerRequest = Object.freeze({ version: 1, requestId: this.nextId++, revision, operation });
    return new Promise((resolve, rejectPromise) => {
      const pending: Pending = { request, resolve, reject: rejectPromise, signal: options?.signal };
      this.pending = pending;
      try {
        if (!this.worker) {
          const worker: PlaybackWorkerPort = this.options.createWorker?.() ??
            new Worker(new URL('./pcm-worker.ts', import.meta.url), { type: 'module' });
          // A factory may synchronously release this client.
          if (this.released) { worker.terminate(); return; }
          this.worker = worker;
          worker.onmessage = event => this.receive(event.data);
          worker.onerror = () => this.terminate('WORKER_FAILED', 'Worker error');
          worker.onmessageerror = () => this.terminate('WORKER_FAILED', 'Worker message could not be decoded');
        }
        if (this.pending !== pending) return;
        pending.abort = () => this.terminate('ABORTED', 'Posted command aborted');
        pending.signal?.addEventListener('abort', pending.abort, { once: true });
        if (pending.signal?.aborted) { this.settle(undefined, new PlaybackWorkerError('ABORTED', 'Aborted before posting', false, request.requestId, revision)); return; }
        pending.timer = setTimeout(() => this.terminate('TIMEOUT', 'Worker deadline exceeded'), LIMITS.timeoutMs);
        this.worker.postMessage(request);
      } catch { this.terminate('WORKER_FAILED', 'Worker creation or posting failed'); }
    });
  }

  release(): void { this.terminate('RELEASED', 'Client released'); }

  private receive(data: unknown): void {
    if (this.released) return;
    const pending = this.pending;
    try {
      if (!pending || !record(data) || data.version !== 1 || data.requestId !== pending.request.requestId ||
          data.revision !== pending.request.revision || typeof data.ok !== 'boolean') throw new Error();
      if (!data.ok) {
        const error = data.error;
        if (!record(error) || !codes.includes(error.code as PlaybackWorkerErrorCode) || typeof error.message !== 'string' ||
            error.message.length > 1024 || typeof error.fatal !== 'boolean') throw new Error();
        const code = error.code as PlaybackWorkerErrorCode;
        if (!error.fatal && !['INVALID_INPUT','NOT_LOADED','STALE_REVISION'].includes(code)) throw new Error();
        if (error.fatal) this.terminate(code, error.message);
        else this.settle(undefined, new PlaybackWorkerError(code, error.message, false, pending.request.requestId, pending.request.revision));
        return;
      }
      const operation = pending.request.operation;
      const position = data.position;
      const expectedRate = operation.kind === 'load' ? operation.sampleRate : this.sampleRate;
      if (!record(position) || position.sampleRate !== expectedRate || !finite(position.beat) ||
          Math.abs(position.beat) > 1000000 || !finite(position.beatsPerFrame) ||
          position.beatsPerFrame < 0 || position.beatsPerFrame > 1000 / (60 * expectedRate) ||
          typeof position.finished !== 'boolean') throw new Error();
      let success: PlaybackWorkerSuccess;
      const positionSnapshot = Object.freeze({ sampleRate: expectedRate, beat: position.beat,
        beatsPerFrame: position.beatsPerFrame, finished: position.finished });
      const identity = { version: 1 as const, requestId: pending.request.requestId, revision: pending.request.revision, ok: true as const };
      if (operation.kind === 'render') {
        if (data.kind !== 'pcm' || !finite(data.startBeat) || Math.abs(data.startBeat) > 1000000 ||
            !(data.pcm instanceof Int16Array) || !(data.pcm.buffer instanceof ArrayBuffer) ||
            data.pcm.length !== operation.frameCount || data.pcm.byteOffset !== 0 ||
            data.pcm.buffer.byteLength !== operation.frameCount * 2) throw new Error();
        success = Object.freeze({ ...identity, kind: 'pcm', startBeat: data.startBeat, position: positionSnapshot, pcm: data.pcm });
      } else {
        if (data.kind !== 'ack') throw new Error();
        this.revision = pending.request.revision;
        this.loaded = true;
        this.sampleRate = expectedRate;
        success = Object.freeze({ ...identity, kind: 'ack', position: positionSnapshot });
      }
      this.settle(success);
    } catch { this.terminate('PROTOCOL', 'Malformed or mismatched worker response'); }
  }
  private settle(result?: PlaybackWorkerSuccess, error?: PlaybackWorkerError): void {
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;
    clearTimeout(pending.timer);
    if (pending.abort) pending.signal?.removeEventListener('abort', pending.abort);
    if (error) pending.reject(error); else pending.resolve(result!);
  }
  private terminate(code: PlaybackWorkerErrorCode, message: string): void {
    if (this.released) return;
    this.released = true;
    const pending = this.pending, worker = this.worker;
    this.worker = null;
    if (worker) {
      worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null;
      try { worker.terminate(); } catch { /* Termination remains permanent even if the host throws. */ }
    }
    this.settle(undefined, new PlaybackWorkerError(code, message, true,
      pending?.request.requestId ?? null, pending?.request.revision ?? null));
  }
}
