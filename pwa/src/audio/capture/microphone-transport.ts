import { PITCH_SAMPLE_RATE } from './pitch-publisher';
import { CAPTURE_WORKLET_NAME } from './microphone-worklet-process';
import captureWorkletUrl from './microphone-capture-worklet.js?url&no-inline';

export { CAPTURE_WORKLET_NAME };
export const CAPTURE_WORKLET_MODULE_URL = captureWorkletUrl;

export interface MicrophoneCaptureTransport {
  start(listener: (frame: Float32Array, sampleRate: number) => void): Promise<void>;
  stop(): void;
}

export interface WebAudioMicrophoneTransportOptions {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createContext?: (options?: AudioContextOptions) => AudioContext;
  workletModuleUrl?: string;
  addWorkletModule?: (context: AudioContext, url: string) => Promise<void>;
  createWorkletNode?: (context: AudioContext, name: string) => AudioWorkletNode;
}

const AUDIO_CONSTRAINTS: MediaTrackConstraints = Object.freeze({
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
  sampleRate: PITCH_SAMPLE_RATE,
});

const WORKLET_NODE_OPTIONS: AudioWorkletNodeOptions = Object.freeze({
  numberOfInputs: 1,
  numberOfOutputs: 1,
  outputChannelCount: [1],
});

/**
 * Dedicated capture AudioContext + AudioWorklet. Not the playback ApplicationAudioContext.
 * Worklet posts copied Float32 frames; LinearPcmResampler + PcmHopEmitter still make 16kHz hops.
 * Processor feeds a muted gain so Chrome runs the graph without a monitor mix.
 * Same-origin hashed module URL (no blob:) so production CSP script-src/worker-src 'self' can load it.
 */
export function createWebAudioMicrophoneTransport(
  options: WebAudioMicrophoneTransportOptions = {},
): MicrophoneCaptureTransport {
  let generation = 0;
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let node: AudioWorkletNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let mute: GainNode | null = null;

  const getUserMedia = options.getUserMedia
    ?? ((constraints) => navigator.mediaDevices.getUserMedia(constraints));
  const createContext = options.createContext
    ?? ((contextOptions) => new AudioContext(contextOptions));
  const workletUrl = options.workletModuleUrl ?? captureWorkletUrl;
  const addWorkletModule = options.addWorkletModule
    ?? ((audioContext, url) => audioContext.audioWorklet.addModule(url));
  const createWorkletNode = options.createWorkletNode
    ?? ((audioContext, name) => new AudioWorkletNode(audioContext, name, WORKLET_NODE_OPTIONS));

  return {
    async start(listener) {
      const current = ++generation;
      teardown();
      const acquired = await getUserMedia({ audio: AUDIO_CONSTRAINTS, video: false });
      if(current !== generation) { stopTracks(acquired); return; }
      stream = acquired;
      try {
        context = createContext({ sampleRate: PITCH_SAMPLE_RATE });
        if (context.state === 'suspended') await context.resume();
        if(current !== generation)return;
        await addWorkletModule(context, workletUrl);
        if(current !== generation)return;
        source = context.createMediaStreamSource(stream);
        node = createWorkletNode(context, CAPTURE_WORKLET_NAME);
        mute = context.createGain();
        mute.gain.value = 0;
        const capture = context;
        node.port.onmessage = (event: MessageEvent<unknown>) => {
          const frame = event.data;
          if (!(frame instanceof Float32Array)) return;
          listener(frame, capture.sampleRate);
        };
        source.connect(node);
        node.connect(mute);
        mute.connect(context.destination);
      } catch (error) {
        if(current !== generation)return;
        teardown();
        throw error;
      }
    },
    stop() { ++generation; teardown(); },
  };

  function teardown(): void {
    if (node) node.port.onmessage = null;
    try { node?.disconnect(); } catch { /* already disconnected */ }
    try { source?.disconnect(); } catch { /* already disconnected */ }
    try { mute?.disconnect(); } catch { /* already disconnected */ }
    node = null; source = null; mute = null;
    stopTracks(stream);
    stream = null;
    const closing = context;
    context = null;
    if (closing) void closing.close().catch(() => undefined);
  }
}

function stopTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}
