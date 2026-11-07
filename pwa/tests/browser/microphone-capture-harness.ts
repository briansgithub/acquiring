import {
  BrowserMicrophoneCapture, createWebAudioMicrophoneTransport, type PitchResult,
} from '../../src/audio/capture';

const status = document.querySelector('#status') as HTMLOutputElement;
const proof: {
  readonly label: 'SYNTHETIC';
  current: PitchResult | null;
  starts: number;
  stops: number;
  denied: boolean;
  tracksLive: boolean;
} = { label: 'SYNTHETIC', current: null, starts: 0, stops: 0, denied: false, tracksLive: false };

let capture: BrowserMicrophoneCapture | null = null;
let oscillator: OscillatorNode | null = null;
let sourceContext: AudioContext | null = null;
let poll = 0;

function tearDownSource(): void {
  try { oscillator?.stop(); } catch { /* already stopped */ }
  oscillator = null;
  void sourceContext?.close().catch(() => undefined);
  sourceContext = null;
}

function publish(): void {
  proof.current = capture?.current ?? null;
  status.textContent = proof.current ? JSON.stringify(proof.current) : 'idle';
}

document.querySelector('#start')!.addEventListener('click', () => {
  capture?.release();
  tearDownSource();
  proof.denied = false;
  proof.starts += 1;
  sourceContext = new AudioContext();
  oscillator = sourceContext.createOscillator();
  oscillator.frequency.value = 440;
  const dest = sourceContext.createMediaStreamDestination();
  oscillator.connect(dest);
  oscillator.start();
  capture = new BrowserMicrophoneCapture(undefined, {
    now: () => performance.now(),
    onPageHide: false,
    transport: createWebAudioMicrophoneTransport({
      getUserMedia: async () => dest.stream,
    }),
  });
  capture.start(69);
  window.clearInterval(poll);
  poll = window.setInterval(() => {
    proof.tracksLive = dest.stream.getTracks().some((track) => track.readyState === 'live');
    publish();
  }, 50);
});

document.querySelector('#stop')!.addEventListener('click', () => {
  proof.stops += 1;
  capture?.stop();
  tearDownSource();
  window.clearInterval(poll);
  proof.tracksLive = false;
  publish();
});

document.querySelector('#deny')!.addEventListener('click', () => {
  capture?.release();
  tearDownSource();
  proof.denied = true;
  capture = new BrowserMicrophoneCapture(undefined, {
    onPageHide: false,
    transport: createWebAudioMicrophoneTransport({
      getUserMedia: async () => { throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }); },
    }),
  });
  capture.start(60);
  window.clearInterval(poll);
  poll = window.setInterval(publish, 50);
});

declare global { interface Window { microphoneCaptureProof: typeof proof } }
window.microphoneCaptureProof = proof;
window.addEventListener('pagehide', () => { capture?.stop(); tearDownSource(); });
