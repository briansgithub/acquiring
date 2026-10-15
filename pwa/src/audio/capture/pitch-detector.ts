import type { PitchEstimate } from './pitch-results';

export const PITCH_DETECTOR_LIMITS = Object.freeze({ minFrames: 4, maxFrames: 32_768,
  minSampleRate: 1000, maxSampleRate: 384_000, differenceOperations: 8_000_000 });

/** Pure native YIN over normalized PCM16. No capture, resampling or publication state. */
export function estimatePitch(audioBuffer: Int16Array, sampleRate: number, threshold = 0.15,
  minFreq = 65, maxFreq = 1000): PitchEstimate {
  if (!(audioBuffer instanceof Int16Array) || audioBuffer.length < PITCH_DETECTOR_LIMITS.minFrames
    || audioBuffer.length > PITCH_DETECTOR_LIMITS.maxFrames) throw new RangeError('PCM16 analysis frame length exceeds detector limits');
  if (!Number.isInteger(sampleRate) || sampleRate < PITCH_DETECTOR_LIMITS.minSampleRate
    || sampleRate > PITCH_DETECTOR_LIMITS.maxSampleRate) throw new RangeError('Pitch input sample rate exceeds limits');
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new RangeError('YIN threshold must be finite and in [0,1]');
  if (!Number.isFinite(minFreq) || !Number.isFinite(maxFreq) || minFreq <= 0 || maxFreq < minFreq
    || maxFreq > sampleRate / 2) throw new RangeError('Pitch frequency range must be positive, ordered and within Nyquist');
  const windowSize = Math.trunc(audioBuffer.length / 2);
  const maxTau = Math.min(Math.trunc(sampleRate / minFreq), windowSize - 2);
  const minTau = Math.max(1, Math.trunc(sampleRate / maxFreq));
  const searchLimit = maxTau + 1;
  if (windowSize * (searchLimit + 1) > PITCH_DETECTOR_LIMITS.differenceOperations) {
    throw new RangeError('YIN lag/sample work exceeds analysis limit');
  }
  const yin = new Float64Array(windowSize), normalized = new Float64Array(audioBuffer.length);
  let sumSquares = 0;
  for (let i = 0; i < audioBuffer.length; i++) {
    const sample = audioBuffer[i] / 32768;
    normalized[i] = sample; sumSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / audioBuffer.length);
  for (let tau = 0; tau <= searchLimit; tau++) {
    let difference = 0;
    for (let i = 0; i < windowSize; i++) {
      const delta = normalized[i] - normalized[i + tau];
      difference += delta * delta;
    }
    yin[tau] = difference;
  }
  yin[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= searchLimit; tau++) {
    runningSum += yin[tau];
    yin[tau] *= tau / runningSum;
  }
  let bestTau = -1;
  for (let tau = minTau; tau <= maxTau; tau++) if (yin[tau] < threshold) {
    let t = tau;
    while (t + 1 <= maxTau && yin[t + 1] < yin[t]) t++;
    bestTau = t; break;
  }
  if (bestTau === -1) {
    let minimum = Number.MAX_VALUE;
    for (let tau = minTau; tau <= maxTau; tau++) if (yin[tau] < minimum) {
      minimum = yin[tau]; bestTau = tau;
    }
  }
  let finalTau = bestTau;
  if (bestTau > 0 && bestTau < searchLimit) {
    const s0 = yin[bestTau - 1], s1 = yin[bestTau], s2 = yin[bestTau + 1];
    const denominator = s2 - 2 * s1 + s0;
    if (denominator > 1e-6) finalTau = bestTau + (s0 - s2) / (2 * denominator);
  }
  const frequency = bestTau !== -1 ? sampleRate / finalTau : 0;
  const confidence = bestTau !== -1 ? 1 - Math.max(0, Math.min(1, yin[bestTau])) : 0;
  return Object.freeze({ frequencyHz: frequency >= minFreq && frequency <= maxFreq ? frequency : 0, confidence, rms });
}

export const PitchDetector = Object.freeze({ estimatePitch });
