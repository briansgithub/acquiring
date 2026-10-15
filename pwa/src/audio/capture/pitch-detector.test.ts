import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import native from './fixtures/native-pitch.json';
import { estimatePitch, isPitchEstimateSignal, PITCH_DETECTOR_LIMITS, PITCH_SIGNAL_GATE, PitchDetector,
  PitchTrackingMode, PITCH_TRACKING_PROFILES } from './index';

function pcm(encoded: string): Int16Array {
  const bytes = Buffer.from(encoded, 'base64');
  return Int16Array.from({ length: bytes.length / 2 }, (_, i) => bytes.readInt16LE(i * 2));
}
function sine(frequency: number, phase = 0, length = 2048, rate = 16000): Int16Array {
  return Int16Array.from({ length }, (_, i) => Math.trunc(Math.sin(2 * Math.PI * frequency * i / rate + phase) * 32767));
}
function harmonic(frequency: number, partials: number, phase = 0, length = 2048): Int16Array {
  const raw = Float64Array.from({ length }, (_, i) => {
    let value = 0;
    for (let k = 1; k <= partials; k++) {
      if (k * frequency >= 8000) break;
      value += (1 / k) * Math.sin(2 * Math.PI * k * frequency * i / 16000 + phase * k * 0.7);
    }
    return value;
  });
  let peak = 0;
  for (const value of raw) peak = Math.max(peak, Math.abs(value));
  return Int16Array.from(raw, (value) => Math.trunc(value / peak * 26000));
}
const cents = (measured: number, expected: number) => 1200 * (Math.log(measured / expected) / Math.log(2));

describe('independent frozen native YIN and signal-gate fixtures', () => {
  it('matches all62native-generated PCM estimates exactly, including noise, low amplitudes, range and odd frames', () => {
    expect(native.authority).toBe('801cf7984171d772afc4406ddb5c79c0cb7fd20a');
    expect(native.detector).toHaveLength(62);
    for (const fixture of native.detector) {
      const bytes = Buffer.from(fixture.pcm16le, 'base64');
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sha256);
      const result = estimatePitch(pcm(fixture.pcm16le), fixture.sampleRate, fixture.threshold, fixture.minFreq, fixture.maxFreq);
      expect(result, fixture.label).toEqual({ frequencyHz: fixture.frequencyHz, confidence: fixture.confidence, rms: fixture.rms });
      expect(isPitchEstimateSignal(result), fixture.label).toBe(fixture.signal);
    }
  });

  it('matches18actual native gate edge outputs without creating MIDI/scoring ownership', () => {
    expect(PITCH_SIGNAL_GATE).toEqual({ rms: 0.0005, confidence: 0.4 });
    expect(native.gates).toHaveLength(18);
    for (const fixture of native.gates) expect(isPitchEstimateSignal(fixture)).toBe(fixture.signal);
  });

  it('rejects all20frozen native seeded Gaussian noise windows at the native0.4confidence gate', () => {
    const noise = native.detector.filter((fixture) => fixture.label.startsWith('gaussian-'));
    expect(noise).toHaveLength(20);
    for (const fixture of noise) {
      const result = PitchDetector.estimatePitch(pcm(fixture.pcm16le), 16000);
      expect(result.confidence).toBeLessThan(0.4);
      expect(isPitchEstimateSignal(result)).toBe(false);
    }
  });
});

describe('native synthetic pitch accuracy and normalized amplitude', () => {
  it('detects the exact reference/local-minimum descent regressions within five cents', () => {
    for (const frequency of [440, 82.41]) {
      const result = estimatePitch(sine(frequency), 16000);
      expect(Math.abs(result.frequencyHz - frequency)).toBeLessThanOrEqual(1);
      expect(Math.abs(cents(result.frequencyHz, frequency))).toBeLessThanOrEqual(5);
      expect(result.confidence).toBeGreaterThan(0.9);
    }
  });

  it('covers945native vocal-range/phase/partial combinations within five cents and without octave errors', () => {
    let worst = 0, cases = 0;
    for (let frequency = 80; frequency <= 600; frequency += 5) for (const phase of [0, 1.1, 2.4]) {
      for (const partials of [1, 4, 8]) {
        const result = estimatePitch(partials === 1 ? sine(frequency, phase) : harmonic(frequency, partials, phase), 16000);
        expect(result.frequencyHz, `${frequency}/${phase}/H${partials}`).toBeGreaterThan(0);
        const error = Math.abs(cents(result.frequencyHz, frequency));
        expect(error, `${frequency}/${phase}/H${partials}`).toBeLessThan(600);
        worst = Math.max(worst, error); cases++;
      }
    }
    expect(cases).toBe(945);
    expect(worst).toBeLessThanOrEqual(5);
  }, 30_000);

  it('maximum-speed1024frame windows detect10native sine/harmonic cases within eight cents', () => {
    const length = PITCH_TRACKING_PROFILES[PitchTrackingMode.MELODY_FAST].windowSizeOverride!;
    expect(length).toBe(1024);
    expect(PITCH_TRACKING_PROFILES[PitchTrackingMode.MELODY_FAST].hopSizeOverride).toBe(256);
    for (const frequency of [82.41, 110, 220, 440, 587.33]) {
      for (const signal of [sine(frequency, 0, length), harmonic(frequency, 6, 0, length)]) {
        const result = estimatePitch(signal, 16000);
        expect(result.frequencyHz).toBeGreaterThan(0);
        expect(Math.abs(cents(result.frequencyHz, frequency))).toBeLessThanOrEqual(8);
      }
    }
  });

  it('normalizes RMS by32768 and retains no-period confidence for silence and DC', () => {
    expect(estimatePitch(new Int16Array(2048), 16000)).toEqual({ frequencyHz: 0, confidence: 0, rms: 0 });
    expect(estimatePitch(new Int16Array(2048).fill(-32768), 16000)).toEqual({ frequencyHz: 0, confidence: 0, rms: 1 });
    expect(estimatePitch(new Int16Array(2048).fill(32767), 16000).rms).toBe(32767 / 32768);
    expect(estimatePitch(sine(220), 16000).rms).toBeGreaterThan(0.5);
    const full = sine(440), half = Int16Array.from(full, (sample) => Math.trunc(sample / 2));
    const a = estimatePitch(full, 16000), b = estimatePitch(half, 16000);
    expect(b.rms / a.rms).toBeCloseTo(0.5, 4);
    expect(b.frequencyHz).toBeCloseTo(a.frequencyHz, 3);
    expect(b.confidence).toBeCloseTo(a.confidence, 5);
  });

  it('preserves odd-frame RMS and short no-search windows rather than inventing a pitch', () => {
    const even = sine(440), odd = new Int16Array(2049); odd.set(even); odd[2048] = -32768;
    const a = estimatePitch(even, 16000), b = estimatePitch(odd, 16000);
    expect(b.frequencyHz).toBe(a.frequencyHz); expect(b.confidence).toBe(a.confidence);
    expect(b.rms * b.rms).toBeCloseTo((a.rms * a.rms * 2048 + 1) / 2049, 12);
    const short = estimatePitch(Int16Array.of(32767, -32768, 0, 0), 16000);
    expect(short.frequencyHz).toBe(0); expect(short.confidence).toBe(0);
    expect(short.rms).toBeCloseTo(Math.sqrt(((32767 / 32768) ** 2 + 1) / 4), 12);
    expect(isPitchEstimateSignal(short)).toBe(false);
  });

  it('keeps confidence independent of final frequency-range rejection and supports native global-minimum fallback', () => {
    const signal = sine(440);
    const ranged = estimatePitch(signal, 16000, 0.15, 440, 440);
    expect(ranged.frequencyHz).toBe(0);
    expect(ranged.confidence).toBeGreaterThan(0.9);
    expect(isPitchEstimateSignal(ranged)).toBe(false);
    // Threshold0 disables first-period selection; exact native fallback chooses
    // a lower subharmonic for this signal. Preserve that behavior explicitly.
    expect(estimatePitch(signal, 16000, 0).frequencyHz).toBe(146.67255416193012);
    expect(estimatePitch(sine(55), 16000, 0.15, 40, 110).frequencyHz).toBeGreaterThan(50);
    expect(estimatePitch(sine(1500), 16000, 0.15, 65, 2000).frequencyHz).toBeGreaterThan(1400);
  });
});

describe('detector input and work limits', () => {
  it('rejects invalid frames, rates, search bounds and excessive lag work before scratch allocation', () => {
    for (const length of [0, 1, 2, 3, PITCH_DETECTOR_LIMITS.maxFrames + 1]) {
      expect(() => estimatePitch(new Int16Array(length), 16000)).toThrow(RangeError);
    }
    expect(() => estimatePitch(new Float32Array(2048) as unknown as Int16Array, 16000)).toThrow(RangeError);
    for (const rate of [NaN, Infinity, 0, 999, 16000.5, 384001]) expect(() => estimatePitch(new Int16Array(2048), rate)).toThrow(RangeError);
    for (const threshold of [NaN, Infinity, -0.01, 1.01]) expect(() => estimatePitch(new Int16Array(2048), 16000, threshold)).toThrow(RangeError);
    for (const [min, max] of [[0, 1000], [-1, 1000], [1000, 65], [65, Infinity], [NaN, 1000], [65, 8001]]) {
      expect(() => estimatePitch(new Int16Array(2048), 16000, 0.15, min, max)).toThrow(RangeError);
    }
    expect(() => estimatePitch(new Int16Array(32768), 384000)).toThrow(RangeError);
    expect(() => estimatePitch(new Int16Array(32768), 16000, 0.15, Number.MIN_VALUE, 1000)).toThrow(RangeError);
    expect(estimatePitch(new Int16Array(PITCH_DETECTOR_LIMITS.maxFrames), 16000).frequencyHz).toBe(0);
  });

  it('never treats malformed external frequency/confidence/amplitude as a usable signal', () => {
    const valid = { frequencyHz: 440, confidence: 0.9, rms: 0.5 };
    for (const invalid of [NaN, Infinity, -1]) {
      expect(isPitchEstimateSignal({ ...valid, frequencyHz: invalid })).toBe(false);
      expect(isPitchEstimateSignal({ ...valid, confidence: invalid })).toBe(false);
      expect(isPitchEstimateSignal({ ...valid, rms: invalid })).toBe(false);
    }
    expect(isPitchEstimateSignal({ ...valid, rms: 1.1 })).toBe(false);
    expect(isPitchEstimateSignal({ ...valid, confidence: 1.1 })).toBe(false);
  });
});
