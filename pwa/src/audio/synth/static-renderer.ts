import { DEFAULT_WAVEFORM, instrumentMetadata, Waveform } from './instruments';
import { MAX_PLUCK_DELAY_SAMPLES, SynthVoice } from './synth-voice';

export const MAX_STATIC_PLAYBACK_MS = 30_000;
export const MAX_STATIC_VOICES = 32;
export const MAX_STATIC_VOICE_SAMPLES = 16_000_000;
export const MAX_STATIC_DELAY_SAMPLES = 1_048_576;
const INT_MAX = 2_147_483_647;

function requireInt(value: number, name: string): void {
  if (!Number.isInteger(value) || value < -2_147_483_648 || value > INT_MAX) {
    throw new RangeError(`${name} must be a Kotlin Int`);
  }
}

function validateRate(sampleRate: number): void {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 384_000) {
    throw new RangeError('Output sample rate must be an integer from 8000 through 384000');
  }
}

function validateCount(noteCount: number): void {
  if (!Number.isInteger(noteCount) || noteCount < 0 || noteCount > MAX_STATIC_VOICES) {
    throw new RangeError('Static renderer supports at most32 voices');
  }
}

/** Native sample-count arithmetic with checked resource/input limits. */
export function staticPlaybackSampleCount(durationMs: number, arpeggiate: boolean,
  noteCount: number, stepMs: number, sampleRate: number): number {
  validateRate(sampleRate);
  validateCount(noteCount);
  requireInt(durationMs, 'Duration');
  requireInt(stepMs, 'Step');
  const maximum = sampleRate * MAX_STATIC_PLAYBACK_MS / 1000;
  const stepSamples = Math.max(200, Math.trunc(sampleRate * Math.max(1, stepMs) / 1000));
  // Clamp before multiplication to avoid unsafe intermediates for huge native Int steps.
  const requested = arpeggiate && noteCount > 1
    ? noteCount * Math.min(maximum, stepSamples)
    : Math.trunc(sampleRate * Math.max(1, durationMs) / 1000);
  return Math.max(200, Math.min(maximum, requested));
}

export interface StaticRenderOptions {
  readonly freqs: readonly number[];
  readonly durationMs: number;
  readonly sampleRate: number;
  readonly arpeggiate?: boolean;
  readonly stepMs?: number;
  readonly waveform?: Waveform;
  readonly gain?: number;
  readonly shouldAbort?: () => boolean;
  /** Optional deterministic excitation; production default remains Math.random. */
  readonly random?: () => number;
}

/**
 * Pure Android static preview PCM. Output rate is explicit; no device ownership.
 * Returns null for empty input or cancellation, throws RangeError for unsafe input.
 */
export function renderStaticSamples({ freqs, durationMs, sampleRate, arpeggiate = false,
  stepMs = 80, waveform = DEFAULT_WAVEFORM, gain = 1, shouldAbort = () => false,
  random = Math.random }: StaticRenderOptions): Int16Array | null {
  const requested = staticPlaybackSampleCount(durationMs, arpeggiate, freqs.length, stepMs, sampleRate);
  instrumentMetadata(waveform);
  if (!Number.isFinite(gain)) throw new RangeError('Gain must be finite');
  const renderedGain = Math.max(0, Math.min(1, Math.fround(gain)));
  if (freqs.length === 0) return null;
  const stepSamples = Math.max(200, Math.min(INT_MAX, Math.trunc(sampleRate * Math.max(1, stepMs) / 1000)));
  const isArpeggio = arpeggiate && freqs.length > 1;
  const maximum = sampleRate * MAX_STATIC_PLAYBACK_MS / 1000;
  if (isArpeggio && stepSamples > maximum) {
    throw new RangeError('Arpeggio slot exceeds30second output limit');
  }
  const numSamples = isArpeggio
    ? Math.max(1, Math.trunc(requested / stepSamples)) * stepSamples : requested;
  const evaluations = numSamples * (isArpeggio ? 1 : freqs.length);
  if (evaluations > MAX_STATIC_VOICE_SAMPLES) throw new RangeError('Static voice work limit exceeded');
  let totalDelay = 0;
  for (const frequency of freqs) {
    if (!Number.isFinite(frequency) || frequency <= 0 || frequency > sampleRate) {
      throw new RangeError('Frequency must be positive and no greater than output rate');
    }
    if (waveform === Waveform.STRINGS) {
      const delay = Math.max(2, Math.trunc(sampleRate / frequency));
      if (delay > MAX_PLUCK_DELAY_SAMPLES) throw new RangeError('Plucked-string delay limit exceeded');
      totalDelay += delay;
      if (totalDelay > MAX_STATIC_DELAY_SAMPLES) throw new RangeError('Total plucked-string delay limit exceeded');
    }
  }
  // Native polls at sample0; perform that poll before allocating the same buffer.
  if (shouldAbort()) return null;
  const samples = new Int16Array(numSamples);
  const voices = freqs.map((frequency) => new SynthVoice(frequency, waveform, sampleRate, random));
  const attackSamples = Math.max(10, Math.min(80, Math.trunc(stepSamples * 0.08)));
  const releaseSamples = Math.max(15, Math.min(120, Math.trunc(stepSamples * 0.12)));
  for (let i = 0; i < numSamples; i++) {
    if (i > 0 && (i & 2047) === 0 && shouldAbort()) return null;
    let sum = 0;
    if (!isArpeggio) {
      const env = i < 200 ? i / 200
        : i > numSamples - 1000 ? Math.max(0, (numSamples - i) / 1000) : 1;
      for (const voice of voices) sum += voice.nextSample(env, i / sampleRate) * 0.15 * env;
    } else {
      const noteIdx = Math.min(freqs.length - 1, Math.trunc(i / stepSamples));
      const noteSampleIdx = i % stepSamples;
      const env = noteSampleIdx < attackSamples ? noteSampleIdx / attackSamples
        : noteSampleIdx > stepSamples - releaseSamples ? (stepSamples - noteSampleIdx) / releaseSamples : 1;
      sum = voices[noteIdx].nextSample(env, noteSampleIdx / sampleRate, true) * 0.25 * env;
    }
    samples[i] = Math.max(-32768, Math.min(32767, Math.trunc(sum * renderedGain * 32767)));
  }
  return samples;
}
