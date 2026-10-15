import { instrumentMetadata, Waveform } from './instruments';

const TAU = 2 * Math.PI;
/** Explicit allocation ceiling; ordinary musical pitches need far fewer samples. */
export const MAX_PLUCK_DELAY_SAMPLES = 65_536;
const CHURCH_RANKS: readonly (readonly [number, number])[] = [
  [1, 0.16], [2, 0.44], [4, 0.18], [6, 0.10],
  [8, 0.07], [12, 0.035], [16, 0.015],
];

function wrapUnitPhase(value: number): number {
  return value >= 1 || value < 0 ? value - Math.floor(value) : value;
}

/**
 * Android SynthVoice's pure stateful oscillator. The caller applies the outer
 * amplitude envelope; envelope here only controls electric-piano FM depth.
 * No playback, mixing, user volume, PCM conversion, or audio-device ownership.
 */
export class SynthVoice {
  private phase = 0;
  private modPhase = 0;
  private readonly instrumentGain: number;
  private readonly delayLine: Float64Array;
  private delayPointer = 0;
  private readonly churchOrganPartials: readonly (readonly [number, number])[];

  constructor(
    readonly frequencyHz: number,
    private readonly waveform: Waveform,
    private readonly sampleRate: number,
    random: () => number = Math.random,
  ) {
    this.instrumentGain = instrumentMetadata(waveform).gain;
    // Bound hostile input before allocation and phase arithmetic. Frequencies
    // through the output rate retain native alias behavior; no global bandlimit.
    if (!Number.isInteger(sampleRate) || sampleRate <= 0 || sampleRate > 384_000) {
      throw new RangeError('Sample rate must be an integer from 1 through 384000');
    }
    if (!Number.isFinite(frequencyHz) || frequencyHz <= 0 || frequencyHz > sampleRate) {
      throw new RangeError('Frequency must be positive and no greater than sample rate');
    }
    this.churchOrganPartials = waveform === Waveform.CHURCH_ORGAN
      ? CHURCH_RANKS.filter(([ratio]) => frequencyHz * 0.5 * ratio < sampleRate * 0.5)
      : [];
    if (waveform === Waveform.STRINGS) {
      const length = Math.max(2, Math.trunc(sampleRate / frequencyHz));
      if (length > MAX_PLUCK_DELAY_SAMPLES) {
        throw new RangeError('Plucked-string delay exceeds allocation limit');
      }
      this.delayLine = new Float64Array(length);
      for (let index = 0; index < length; index++) {
        const value = random();
        if (!Number.isFinite(value) || value < 0 || value >= 1) {
          throw new RangeError('Random source must return a finite value in [0, 1)');
        }
        this.delayLine[index] = value * 2 - 1;
      }
      for (let index = 1; index < length; index++) {
        this.delayLine[index] = this.delayLine[index] * 0.35 + this.delayLine[index - 1] * 0.65;
      }
    } else {
      this.delayLine = new Float64Array(0);
    }
  }

  nextSample(envelope: number, elapsedSeconds: number, arpeggiated = false): number {
    // Reject before advancing either phase or the delay line.
    if (!Number.isFinite(envelope) || envelope < 0 || envelope > 1) {
      throw new RangeError('Envelope must be finite and in [0, 1]');
    }
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0
      || !Number.isFinite(TAU * 5.5 * elapsedSeconds)) {
      throw new RangeError('Elapsed time must be finite, nonnegative and safe for modulation');
    }
    let wave: number;
    const radians = TAU * this.phase;
    switch (this.waveform) {
      case Waveform.SINE: wave = Math.sin(radians); break;
      case Waveform.SQUARE: wave = this.phase < 0.5 ? 1 : -1; break;
      case Waveform.SAWTOOTH: wave = this.phase * 2 - 1; break;
      case Waveform.TRIANGLE:
        wave = this.phase < 0.5 ? 4 * this.phase - 1 : 3 - 4 * this.phase;
        break;
      case Waveform.STRINGS: {
        const output = this.delayLine[this.delayPointer];
        const next = (this.delayPointer + 1) % this.delayLine.length;
        this.delayLine[this.delayPointer] = (output + this.delayLine[next]) * 0.497;
        this.delayPointer = next;
        wave = output;
        break;
      }
      case Waveform.ELECTRIC_PIANO: {
        const modulationRatio = arpeggiated ? 1.5 : 2;
        const modulationIndex = (arpeggiated ? 3 : 2) * envelope;
        const modulator = Math.sin(TAU * this.modPhase) * modulationIndex;
        wave = Math.sin(radians + modulator);
        this.modPhase = wrapUnitPhase(this.modPhase + this.frequencyHz * modulationRatio / this.sampleRate);
        break;
      }
      case Waveform.WARM_ORGAN:
        wave = 0.68 * Math.sin(radians) + 0.22 * Math.sin(radians * 2) + 0.10 * Math.sin(radians * 3);
        break;
      case Waveform.CHURCH_ORGAN:
        wave = 0;
        for (const [ratio, weight] of this.churchOrganPartials) {
          wave += weight * Math.sin(TAU * this.modPhase * ratio);
        }
        this.modPhase = wrapUnitPhase(this.modPhase + this.frequencyHz * 0.5 / this.sampleRate);
        break;
      case Waveform.CLARINET:
        wave = 0.74 * Math.sin(radians) + 0.19 * Math.sin(radians * 3) + 0.07 * Math.sin(radians * 5);
        break;
      case Waveform.FLUTE: {
        const vibratoPhase = this.phase + 0.0025 * Math.sin(TAU * this.modPhase);
        const fluteRadians = TAU * vibratoPhase;
        wave = 0.91 * Math.sin(fluteRadians) + 0.07 * Math.sin(fluteRadians * 2)
          + 0.02 * Math.sin(fluteRadians * 4);
        this.modPhase = wrapUnitPhase(this.modPhase + 5.2 / this.sampleRate);
        break;
      }
      case Waveform.REED_ORGAN:
        wave = 0.54 * Math.sin(radians) + 0.25 * Math.sin(radians * 2)
          + 0.14 * Math.sin(radians * 3) + 0.07 * Math.sin(radians * 4);
        break;
      case Waveform.MARIMBA:
        wave = 0.82 * Math.sin(radians) * Math.exp(-3 * elapsedSeconds)
          + 0.18 * Math.sin(radians * 3) * Math.exp(-9 * elapsedSeconds);
        break;
      case Waveform.VIBRAPHONE: {
        const ring = Math.exp(-0.75 * elapsedSeconds);
        const tremolo = 0.88 + 0.12 * Math.sin(TAU * 5.5 * elapsedSeconds);
        const modulationIndex = 1.35 * Math.exp(-1.6 * elapsedSeconds);
        const modulator = Math.sin(TAU * this.modPhase) * modulationIndex;
        wave = Math.sin(radians + modulator) * ring * tremolo;
        this.modPhase = wrapUnitPhase(this.modPhase + this.frequencyHz * 4 / this.sampleRate);
        break;
      }
    }
    this.phase = wrapUnitPhase(this.phase + this.frequencyHz / this.sampleRate);
    return wave * this.instrumentGain;
  }
}
