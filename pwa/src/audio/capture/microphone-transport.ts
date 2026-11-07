import { PITCH_SAMPLE_RATE } from './pitch-publisher';

export interface MicrophoneCaptureTransport {
  start(listener: (frame: Float32Array, sampleRate: number) => void): Promise<void>;
  stop(): void;
}

export interface WebAudioMicrophoneTransportOptions {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createContext?: (options?: AudioContextOptions) => AudioContext;
}

const AUDIO_CONSTRAINTS: MediaTrackConstraints = Object.freeze({
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
  sampleRate: PITCH_SAMPLE_RATE,
});

/**
 * Dedicated capture AudioContext + ScriptProcessor. Not the playback ApplicationAudioContext.
 * ScriptProcessor quantum (4096) is a documented browser difference vs native blocking hop reads.
 * Processor feeds a muted gain so Chrome runs the callback without a monitor mix.
 */
export function createWebAudioMicrophoneTransport(
  options: WebAudioMicrophoneTransportOptions = {},
): MicrophoneCaptureTransport {
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let processor: ScriptProcessorNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let mute: GainNode | null = null;

  const getUserMedia = options.getUserMedia
    ?? ((constraints) => navigator.mediaDevices.getUserMedia(constraints));
  const createContext = options.createContext
    ?? ((contextOptions) => new AudioContext(contextOptions));

  return {
    async start(listener) {
      stream = await getUserMedia({ audio: AUDIO_CONSTRAINTS, video: false });
      try {
        context = createContext({ sampleRate: PITCH_SAMPLE_RATE });
        if (context.state === 'suspended') await context.resume();
        source = context.createMediaStreamSource(stream);
        processor = context.createScriptProcessor(4096, 1, 1);
        mute = context.createGain();
        mute.gain.value = 0;
        processor.onaudioprocess = (event) => {
          listener(event.inputBuffer.getChannelData(0).slice(), context!.sampleRate);
        };
        source.connect(processor);
        processor.connect(mute);
        mute.connect(context.destination);
      } catch (error) {
        stopTracks(stream);
        stream = null;
        throw error;
      }
    },
    stop() {
      if (processor) processor.onaudioprocess = null;
      try { processor?.disconnect(); } catch { /* already disconnected */ }
      try { source?.disconnect(); } catch { /* already disconnected */ }
      try { mute?.disconnect(); } catch { /* already disconnected */ }
      processor = null; source = null; mute = null;
      stopTracks(stream);
      stream = null;
      const closing = context;
      context = null;
      void closing?.close().catch(() => undefined);
    },
  };
}

function stopTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}
