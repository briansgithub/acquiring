import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import native from './fixtures/native-static.json';
import { INSTRUMENTS, MAX_STATIC_VOICES, renderStaticSamples, staticPlaybackSampleCount, Waveform } from './index';

const midiHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const chordNotes = [48, 52, 55, 58, 62, 65, 69];
function random(seed = 0x12345678): () => number {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function preview(waveform: Waveform, notes = chordNotes, arpeggiate = false, gain = 1, durationMs = 450,
  seed = 0x12345678): Int16Array {
  return renderStaticSamples({ freqs: notes.map(midiHz), waveform, durationMs, arpeggiate,
    gain, sampleRate: 44_100, stepMs: 80, random: random(seed) })!;
}
function weightedPower(samples: Int16Array): number {
  // Native InstrumentVolumeTest three stable44.1kHz A-weighting biquads.
  const sections = [
    [0.2557411252042577, 0.5114822504085154, 0.2557411252042577, -0.14053608242071078, 0.004937597615540203],
    [1, -2, 1, -1.884901217428792, 0.8864214718161674],
    [1, -2, 1, -1.9941388812663283, 0.9941474694445309],
  ];
  const delays = sections.map(() => [0, 0]);
  let power = 0;
  for (const sample of samples) {
    let value = sample / 32767;
    for (let j = 0; j < sections.length; j++) {
      const c = sections[j], d = delays[j];
      const input = value - c[3] * d[0] - c[4] * d[1];
      value = c[0] * input + c[1] * d[0] + c[2] * d[1];
      d[1] = d[0]; d[0] = input;
    }
    power += value * value;
  }
  return power / samples.length;
}

describe('native static preview parity', () => {
  it('matches every sample in52 independently captured native JVM PCM buffers', () => {
    expect(native.authority).toBe('801cf7984171d772afc4406ddb5c79c0cb7fd20a');
    expect(native.cases).toHaveLength(52);
    for (const fixture of native.cases) {
      const expected = Buffer.from(fixture.pcm16le, 'base64');
      expect(createHash('sha256').update(expected).digest('hex')).toBe(fixture.sha256);
      const actual = renderStaticSamples({ freqs: native.midiNotes.map(midiHz), durationMs: native.durationMs,
        stepMs: native.stepMs, waveform: fixture.waveform as Waveform, sampleRate: fixture.sampleRate,
        arpeggiate: fixture.arpeggiate, gain: fixture.gain, random: random() })!;
      expect(actual.length).toBe(fixture.samples);
      let maximumDifference = 0;
      actual.forEach((sample, i) => { maximumDifference = Math.max(maximumDifference, Math.abs(sample - expected.readInt16LE(i * 2))); });
      expect(maximumDifference, `${fixture.waveform}/${fixture.sampleRate}/${fixture.arpeggiate}`).toBe(0);
    }
  });

  it('retains native checked duration caps, minimum samples and single-note arpeggio behavior', () => {
    for (const rate of [8000, 44_100, 48_000, 96_000, 384_000]) {
      for (const duration of [48_700, 2_147_483_647]) {
        expect(staticPlaybackSampleCount(duration, false, 1, 80, rate)).toBe(rate * 30);
      }
      expect(staticPlaybackSampleCount(0, false, 1, 80, rate)).toBe(Math.max(200, Math.trunc(rate / 1000)));
      expect(staticPlaybackSampleCount(100, true, 1, 80, rate)).toBe(rate / 10);
      expect(staticPlaybackSampleCount(450, true, 3, 70, rate)).toBe(Math.trunc(rate * 70 / 1000) * 3);
      expect(staticPlaybackSampleCount(450, true, 32, 2_147_483_647, rate)).toBe(rate * 30);
    }
    expect(renderStaticSamples({ freqs: [], durationMs: 450, sampleRate: 44_100 })).toBeNull();
  });

  it('matches native silent edges, slot completion and sine discontinuity limits', () => {
    const block = preview(Waveform.SINE, [60, 64, 67]);
    expect(Math.abs(block[0]) / 32767).toBeLessThan(0.01);
    expect(Math.abs(block.at(-1)!) / 32767).toBeLessThan(0.01);
    const arpeggio = renderStaticSamples({ freqs: [60, 64, 67].map(midiHz), waveform: Waveform.SINE,
      durationMs: 450, sampleRate: 44_100, arpeggiate: true, stepMs: 70 })!;
    expect(arpeggio.length % 3087).toBe(0);
    expect(Math.abs(arpeggio.at(-1)!) / 32767).toBeLessThan(0.01);
    let slew = 0;
    for (let i = 1; i < arpeggio.length; i++) slew = Math.max(slew, Math.abs(arpeggio[i] - arpeggio[i - 1]));
    expect(slew / 32767).toBeLessThan(0.15);
    //30second cap cuts a long chord only on a complete native slot.
    const chopped = renderStaticSamples({ freqs: Array(32).fill(440), durationMs: 450, sampleRate: 8000,
      waveform: Waveform.SINE, arpeggiate: true, stepMs: 1700 })!;
    expect(chopped.length).toBe(17 * 13_600);
    expect(chopped.length).toBeLessThanOrEqual(8000 * 30);
    expect(Math.abs(chopped.at(-1)!) / 32767).toBeLessThan(0.01);
  });

  it('preserves native short-buffer attack priority even when attack and release overlap', () => {
    const samples = renderStaticSamples({ freqs: [1000], durationMs: -1, sampleRate: 8000,
      waveform: Waveform.SQUARE })!;
    expect(samples.length).toBe(200);
    expect(samples[0]).toBe(0);
    expect(samples[100]).toBe(Math.trunc(-0.49 * 0.15 * 0.5 * 32767));
    // Native short buffers use the attack branch throughout; do not invent a fade fix.
    expect(samples[199]).toBe(Math.trunc(-0.49 * 0.15 * (199 / 200) * 32767));
  });

  it('all13 presets retain native dense-preview/arpeggio headroom across three transpositions', () => {
    for (const { waveform } of INSTRUMENTS) for (const transpose of [-12, 0, 12]) {
      for (const arpeggiate of [false, true]) {
        const samples = preview(waveform, chordNotes.map((n) => n + transpose), arpeggiate);
        expect(samples.some((sample) => sample !== 0), `${waveform} silent`).toBe(true);
        expect(samples.every((sample) => sample !== -32768 && sample !== 32767), `${waveform} clips`).toBe(true);
      }
    }
  });

  it('retains native weighted preview loudness tolerance using the six representative notes', () => {
    function level(waveform: Waveform, duration: number): number {
      const notes = [48, 55, 60, 64, 69, 72];
      return notes.reduce((sum, midi) => {
        const repeats = waveform === Waveform.STRINGS ? 8 : 1;
        let power = 0;
        for (let repeat = 0; repeat < repeats; repeat++) {
          power += weightedPower(preview(waveform, [midi], false, 1, duration, 0x12345678 + repeat * 997));
        }
        return sum + 10 * Math.log10(power / repeats);
      }, 0) / notes.length;
    }
    const sustained = level(Waveform.SINE, 300), attack = level(Waveform.SINE, 100);
    for (const { waveform, isPlucked } of INSTRUMENTS) {
      const usesAttack = isPlucked || waveform === Waveform.MARIMBA;
      const difference = level(waveform, usesAttack ? 100 : 300) - (usesAttack ? attack : sustained);
      expect(Number.isFinite(difference)).toBe(true);
      expect(Math.abs(difference), `${waveform}: ${difference}dB`).toBeLessThan(isPlucked ? 6 : 1.5);
    }
  });

  it('preserves mute, quarter gain and Float gain semantics in the PCM', () => {
    for (const { waveform } of INSTRUMENTS) for (const arpeggiate of [false, true]) {
      const full = preview(waveform, chordNotes, arpeggiate);
      const quarter = preview(waveform, chordNotes, arpeggiate, 0.25);
      const mute = preview(waveform, chordNotes, arpeggiate, 0);
      let error = 0;
      full.forEach((sample, i) => { error = Math.max(error, Math.abs(quarter[i] - sample * 0.25)); });
      expect(error).toBeLessThanOrEqual(1);
      expect(mute.every((sample) => sample === 0)).toBe(true);
    }
    expect(preview(Waveform.SINE, [60], false, -1)).toEqual(preview(Waveform.SINE, [60], false, 0));
    expect(preview(Waveform.SINE, [60], false, 2)).toEqual(preview(Waveform.SINE, [60], false, 1));
    expect(preview(Waveform.SINE, [60], false, 0.123456789)).toEqual(preview(Waveform.SINE, [60], false, Math.fround(0.123456789)));
    const clipped = preview(Waveform.SQUARE, Array(32).fill(48));
    expect(clipped.some((sample) => sample === 32767)).toBe(true);
    expect(clipped.some((sample) => sample === -32768)).toBe(true);
  });
});

describe('static cancellation and resource bounds', () => {
  const base = { freqs: [440], durationMs: 1000, sampleRate: 48_000, waveform: Waveform.STRINGS };
  it('returns no partial buffer and polls exactly at native0/2048sample boundaries', () => {
    let rng = 0, polls = 0;
    expect(renderStaticSamples({ ...base, random: () => { rng++; return 0.5; }, shouldAbort: () => true })).toBeNull();
    expect(rng).toBe(0);
    expect(renderStaticSamples({ ...base, shouldAbort: () => ++polls === 2 })).toBeNull();
    expect(polls).toBe(2);
    polls = 0;
    const samples = renderStaticSamples({ ...base, waveform: Waveform.SINE, durationMs: 100,
      shouldAbort: () => { polls++; return false; } })!;
    expect(polls).toBe(Math.ceil(samples.length / 2048));
  });

  it('rejects invalid samples/rates/gains and oversized work/delays before allocation or callbacks', () => {
    let calls = 0;
    const callbacks = { random: () => { calls++; return 0.5; }, shouldAbort: () => { calls++; return false; } };
    for (const sampleRate of [NaN, Infinity, 0, 7999, 48_000.5, 384_001]) {
      expect(() => renderStaticSamples({ ...base, ...callbacks, sampleRate })).toThrow(RangeError);
    }
    for (const frequency of [NaN, Infinity, 0, -1, 48_001, Number.MIN_VALUE]) {
      expect(() => renderStaticSamples({ ...base, ...callbacks, freqs: [frequency] })).toThrow(RangeError);
    }
    for (const gain of [NaN, Infinity, -Infinity]) {
      expect(() => renderStaticSamples({ ...base, ...callbacks, gain })).toThrow(RangeError);
    }
    for (const durationMs of [NaN, Infinity, 0.5, 2_147_483_648]) {
      expect(() => renderStaticSamples({ ...base, ...callbacks, durationMs })).toThrow(RangeError);
    }
    for (const stepMs of [NaN, 0.5, 2_147_483_648]) {
      expect(() => renderStaticSamples({ ...base, ...callbacks, stepMs })).toThrow(RangeError);
    }
    expect(() => renderStaticSamples({ ...base, ...callbacks, freqs: Array(MAX_STATIC_VOICES + 1).fill(440) })).toThrow(RangeError);
    expect(() => renderStaticSamples({ ...base, ...callbacks, freqs: Array(32).fill(440), durationMs: 30_000 })).toThrow(RangeError);
    expect(() => renderStaticSamples({ ...base, ...callbacks, freqs: Array(32).fill(48_000 / 65_536) })).toThrow(RangeError);
    expect(() => renderStaticSamples({ ...base, ...callbacks, freqs: [440, 880], arpeggiate: true, stepMs: 30_001 })).toThrow(RangeError);
    expect(calls).toBe(0);
  });
});
