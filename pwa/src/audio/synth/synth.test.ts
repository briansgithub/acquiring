import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/native-samples.json';
import {
  DEFAULT_WAVEFORM, INSTRUMENTS, instrumentMetadata, decodeInstrument,
  MAX_PLUCK_DELAY_SAMPLES, SynthVoice, Waveform,
} from './index';

function seededRandom(): () => number {
  let state = 0x12345678;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function render(waveform: Waveform, frequency = 440, sampleRate = 48_000,
  count = 4800, elapsedOffset = 0): Float64Array {
  const voice = new SynthVoice(frequency, waveform, sampleRate, seededRandom());
  return Float64Array.from({ length: count }, (_, i) => voice.nextSample(1, elapsedOffset + i / sampleRate));
}

function power(samples: Float64Array): number {
  return samples.reduce((sum, value) => sum + value * value, 0) / samples.length;
}

function amplitude(samples: Float64Array, frequency: number, sampleRate = 48_000): number {
  let sine = 0;
  let cosine = 0;
  samples.forEach((value, n) => {
    sine += value * Math.sin(2 * Math.PI * frequency * n / sampleRate);
    cosine += value * Math.cos(2 * Math.PI * frequency * n / sampleRate);
  });
  return 2 * Math.hypot(sine, cosine) / samples.length;
}

describe('native instrument catalog', () => {
  it('retains all13 identifiers, exact native labels, categories, menu order and gains', () => {
    expect(INSTRUMENTS.map(({ waveform, displayName, gain, categoryName, isPlucked }) =>
      [waveform, displayName, gain, categoryName, isPlucked])).toEqual([
      ['CHURCH_ORGAN', 'Church Organ', 1.57, 'Synths', false],
      ['ELECTRIC_PIANO', 'Electric Piano', 0.61, 'Synths', false],
      ['MARIMBA', 'Marimba', 1.31, 'Synths', false],
      ['REED_ORGAN', 'Reed Organ', 1.26, 'Synths', false],
      ['STRINGS', 'Strings', 1.74, 'Synths', true],
      ['CLARINET', 'Synth Clarinet', 1.13, 'Synths', false],
      ['FLUTE', 'Synth Flute', 1.09, 'Synths', false],
      ['VIBRAPHONE', 'Vibraphone', 0.65, 'Synths', false],
      ['WARM_ORGAN', 'Warm Organ', 1.22, 'Synths', false],
      ['SAWTOOTH', 'Sawtooth', 0.74, 'Waveforms', false],
      ['SINE', 'Sine', 1, 'Waveforms', false],
      ['SQUARE', 'Square', 0.49, 'Waveforms', false],
      ['TRIANGLE', 'Triangle', 1.18, 'Waveforms', false],
    ]);
    expect(Object.values(Waveform)).toEqual(INSTRUMENTS.map((value) => value.waveform));
    expect(Object.isFrozen(INSTRUMENTS)).toBe(true);
    expect(INSTRUMENTS.every(Object.isFrozen)).toBe(true);
  });

  it('defaults invalid or absent native persisted identifiers to Synth Clarinet', () => {
    expect(DEFAULT_WAVEFORM).toBe(Waveform.CLARINET);
    for (const identifier of [null, undefined, '', 'clarinet', 'CLARINET ', 'NYLON_GUITAR', '__proto__']) {
      expect(decodeInstrument(identifier)).toBe(Waveform.CLARINET);
    }
    for (const { waveform } of INSTRUMENTS) expect(decodeInstrument(waveform)).toBe(waveform);
    expect(() => instrumentMetadata('__proto__' as Waveform)).toThrow(RangeError);
  });

  it('translates SynthFluteTest finite render and Synths category', () => {
    expect(instrumentMetadata(Waveform.FLUTE).displayName).toBe('Synth Flute');
    expect(instrumentMetadata(Waveform.FLUTE).categoryName).toBe('Synths');
    expect(Number.isFinite(new SynthVoice(440, Waveform.FLUTE, 48_000).nextSample(1, 0))).toBe(true);
  });
});

describe('native JVM samples captured independently of the TypeScript port', () => {
  it('matches52 native cases through20000 state transitions, including seeded strings and FM arpeggios', () => {
    expect(fixtures.authority).toBe('801cf7984171d772afc4406ddb5c79c0cb7fd20a');
    expect(fixtures.cases).toHaveLength(52);
    for (const fixture of fixtures.cases) {
      const voice = new SynthVoice(fixture.frequencyHz, fixture.waveform as Waveform,
        fixture.sampleRate, seededRandom());
      let checkpoint = 0;
      for (let n = 0; n <= fixtures.checkpoints.at(-1)!; n++) {
        const sample = voice.nextSample(0.2 + 0.8 * Math.exp(-n / fixture.sampleRate),
          n / fixture.sampleRate, fixture.arpeggiated);
        if (n === fixtures.checkpoints[checkpoint]) {
          expect(sample, `${fixture.waveform}/${fixture.frequencyHz}/${fixture.arpeggiated} sample${n}`)
            .toBeCloseTo(fixture.samples[checkpoint++], 10);
        }
      }
      expect(checkpoint).toBe(fixtures.checkpoints.length);
    }
  });
});

describe('signal and state regressions', () => {
  it('all13 presets have finite nonzero energy and bounded per-voice amplitude across notes and rates', () => {
    // Representative notes from native InstrumentVolumeTest plus the upper register.
    for (const sampleRate of [8000, 44_100, 48_000, 96_000]) {
      for (const midi of [48, 55, 60, 64, 69, 72, 96]) {
        for (const instrument of INSTRUMENTS) {
          const samples = render(instrument.waveform, 440 * 2 ** ((midi - 69) / 12),
            sampleRate, sampleRate / 10);
          const label = `${instrument.waveform}/${midi}/${sampleRate}`;
          expect(samples.every(Number.isFinite), label).toBe(true);
          expect(power(samples), label).toBeGreaterThan(1e-6);
          expect(samples.every((value) => Math.abs(value) <= instrument.gain + 1e-12), label).toBe(true);
        }
      }
    }
  });

  it('keeps oscillator phase continuous across caller block boundaries and independent between voices', () => {
    for (const { waveform } of INSTRUMENTS) {
      const voice = new SynthVoice(440, waveform, 48_000, seededRandom());
      const separateVoice = new SynthVoice(440, waveform, 48_000, seededRandom());
      const blocks = [0, 1, 127, 256, 1416];
      const actual: number[] = [];
      let n = 0;
      for (const size of blocks) for (let j = 0; j < size; j++, n++) {
        actual.push(voice.nextSample(1, n / 48_000));
      }
      expect(actual).toEqual(Array.from(render(waveform, 440, 48_000, n)));
      expect(separateVoice.nextSample(1, 0)).toBe(actual[0]);
    }
  });

  it('preserves clarinet odd-harmonic spectrum and per-voice compensation', () => {
    const samples = render(Waveform.CLARINET, 480);
    expect(amplitude(samples, 480)).toBeCloseTo(0.74 * 1.13, 10);
    expect(amplitude(samples, 1440)).toBeCloseTo(0.19 * 1.13, 10);
    expect(amplitude(samples, 2400)).toBeCloseTo(0.07 * 1.13, 10);
    expect(amplitude(samples, 960)).toBeLessThan(1e-10);
    expect(amplitude(render(Waveform.SINE, 480), 480)).toBeCloseTo(1, 10);
  });

  it('keeps the church-organ suboctave ranks and filters every rank at or above Nyquist', () => {
    const low = render(Waveform.CHURCH_ORGAN, 480);
    for (const [ratio, weight] of [[1, 0.16], [2, 0.44], [4, 0.18], [6, 0.10],
      [8, 0.07], [12, 0.035], [16, 0.015]]) {
      expect(amplitude(low, 240 * ratio)).toBeCloseTo(weight * 1.57, 10);
    }
    // At8kHz the retained ranks are4/8/16kHz. Unfiltered32/64kHz ranks
    // would fold onto16kHz and measurably corrupt its expected amplitude.
    const high = render(Waveform.CHURCH_ORGAN, 8000);
    expect(amplitude(high, 4000)).toBeCloseTo(0.16 * 1.57, 10);
    expect(amplitude(high, 8000)).toBeCloseTo(0.44 * 1.57, 10);
    expect(amplitude(high, 16000)).toBeCloseTo(0.18 * 1.57, 10);
    const cutoff = render(Waveform.CHURCH_ORGAN, 48_000);
    expect(cutoff.every((value) => value === 0)).toBe(true);
  });

  it('retains native aliasing of basic waves rather than silently replacing their synthesis', () => {
    const voice = new SynthVoice(6000, Waveform.SQUARE, 8000);
    expect(Array.from({ length: 8 }, (_, n) => voice.nextSample(1, n / 8000)))
      .toEqual([0.49, -0.49, -0.49, 0.49, 0.49, -0.49, -0.49, 0.49]);
  });

  it('leaves the outer amplitude envelope to callers and applies electric-piano envelope to FM depth', () => {
    const sine = new SynthVoice(480, Waveform.SINE, 48_000);
    const piano = new SynthVoice(480, Waveform.ELECTRIC_PIANO, 48_000);
    for (let n = 0; n < 100; n++) {
      expect(piano.nextSample(0, n / 48_000)).toBeCloseTo(sine.nextSample(0, n / 48_000) * 0.61, 12);
    }
    expect(sine.nextSample(0, 1)).not.toBeNaN();
    const block = new SynthVoice(440, Waveform.ELECTRIC_PIANO, 48_000);
    const arpeggio = new SynthVoice(440, Waveform.ELECTRIC_PIANO, 48_000);
    block.nextSample(1, 0);
    arpeggio.nextSample(1, 0, true);
    expect(block.nextSample(1, 1 / 48_000)).not.toBe(arpeggio.nextSample(1, 1 / 48_000, true));
  });

  it('preserves marimba, vibraphone and plucked-string decay', () => {
    for (const waveform of [Waveform.MARIMBA, Waveform.VIBRAPHONE]) {
      expect(power(render(waveform, 480, 48_000, 4800, 2)))
        .toBeLessThan(power(render(waveform, 480)) * 0.1);
    }
    const strings = render(Waveform.STRINGS, 440, 48_000, 48_000);
    expect(power(strings.slice(43_200))).toBeLessThan(power(strings.slice(0, 4800)) * 0.1);
  });

  it('implements native smoothing and cyclic pluck feedback with deterministic injected excitation', () => {
    const noise = [0, 0.25, 0.5, 0.75];
    let index = 0;
    const voice = new SynthVoice(2, Waveform.STRINGS, 8, () => noise[index++]);
    // Native initial noise [-1,-.5,0,.5] is smoothed forward in place.
    const attack = [-1, -0.825, -0.53625, -0.1735625];
    for (let n = 0; n < 4; n++) expect(voice.nextSample(1, n / 8)).toBeCloseTo(attack[n] * 1.74, 12);
    expect(voice.nextSample(1, 0.5)).toBeCloseTo((-1 - 0.825) * 0.497 * 1.74, 12);
    expect(index).toBe(4);
    // Very high pitches retain native minimum delay length2.
    let calls = 0;
    new SynthVoice(8, Waveform.STRINGS, 8, () => { calls++; return 0.5; });
    expect(calls).toBe(2);
  });
});

describe('bounded input behavior', () => {
  it('rejects unsafe constructors and never allocates or invokes RNG for enormous delay lengths', () => {
    for (const frequency of [NaN, Infinity, -Infinity, 0, -1, 48_001]) {
      expect(() => new SynthVoice(frequency, Waveform.SINE, 48_000)).toThrow(RangeError);
    }
    for (const rate of [NaN, Infinity, 0, -1, 44_100.5, 384_001]) {
      expect(() => new SynthVoice(1, Waveform.STRINGS, rate)).toThrow(RangeError);
    }
    let calls = 0;
    for (const frequency of [Number.MIN_VALUE, 48_000 / (MAX_PLUCK_DELAY_SAMPLES + 1)]) {
      expect(() => new SynthVoice(frequency, Waveform.STRINGS, 48_000,
        () => { calls++; return 0.5; })).toThrow(RangeError);
    }
    expect(calls).toBe(0);
    expect(() => new SynthVoice(440, 'unknown' as Waveform, 48_000)).toThrow(RangeError);
  });

  it('accepts the allocation ceiling and rejects malformed random sources', () => {
    let calls = 0;
    new SynthVoice(1, Waveform.STRINGS, MAX_PLUCK_DELAY_SAMPLES,
      () => { calls++; return 0.5; });
    expect(calls).toBe(MAX_PLUCK_DELAY_SAMPLES);
    for (const value of [NaN, Infinity, -0.01, 1]) {
      expect(() => new SynthVoice(440, Waveform.STRINGS, 48_000, () => value)).toThrow(RangeError);
    }
    expect(() => new SynthVoice(Number.MIN_VALUE, Waveform.SINE, 48_000)).not.toThrow();
  });

  it('rejects invalid frame controls before mutating phase or pluck state', () => {
    for (const { waveform } of INSTRUMENTS) {
      const voice = new SynthVoice(440, waveform, 48_000, seededRandom());
      const reference = new SynthVoice(440, waveform, 48_000, seededRandom());
      expect(voice.nextSample(1, 0)).toBe(reference.nextSample(1, 0));
      for (const envelope of [NaN, Infinity, -0.1, 1.1]) {
        expect(() => voice.nextSample(envelope, 0)).toThrow(RangeError);
      }
      for (const time of [NaN, Infinity, -1, Number.MAX_VALUE]) {
        expect(() => voice.nextSample(1, time)).toThrow(RangeError);
      }
      for (let n = 1; n < 128; n++) {
        expect(voice.nextSample(1, n / 48_000)).toBe(reference.nextSample(1, n / 48_000));
      }
    }
  });
});
