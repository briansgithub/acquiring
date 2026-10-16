import { PcmWorkerSession, createPcmWorkerHandler } from './pcm-worker-session';
import type { PlaybackWorkerResponse } from './worker-contracts';

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(response: PlaybackWorkerResponse, transfer: Transferable[]): void;
};
scope.onmessage = createPcmWorkerHandler(new PcmWorkerSession(), (response, transfer) => scope.postMessage(response, transfer));
