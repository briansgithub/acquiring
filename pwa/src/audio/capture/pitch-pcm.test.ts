import { describe, expect, it } from 'vitest';
import { estimatePitch, float32ToPcm16, LinearPcmResampler, PcmHopEmitter, PITCH_HOP_SIZE, PITCH_SAMPLE_RATE } from './index';

function sineF32(frequency: number, length: number, rate: number): Float32Array {
  return Float32Array.from({ length }, (_, i) => Math.sin(2 * Math.PI * frequency * i / rate));
}

describe('float32ToPcm16 and 16kHz resample (browser difference)', () => {
  it('maps unit floats onto native PCM16 divisor 32768', () => {
    const pcm = float32ToPcm16(Float32Array.from([1, -1, 0, 0.5, 2, Number.NaN]));
    expect([...pcm]).toEqual([32767, -32768, 0, 16383, 32767, 0]);
  });

  it('resamples 44100 and 48000 A4 sines so YIN still finds ~440 at 16kHz', () => {
    for (const rate of [44_100, 48_000]) {
      const f32 = sineF32(440, Math.round(rate * 0.2), rate);
      const pcm = new LinearPcmResampler().push(float32ToPcm16(f32), rate);
      expect(pcm.length).toBeGreaterThan(PITCH_SAMPLE_RATE * 0.15);
      const estimate = estimatePitch(pcm.slice(0, 2048), PITCH_SAMPLE_RATE);
      expect(estimate.frequencyHz).toBeGreaterThan(430);
      expect(estimate.frequencyHz).toBeLessThan(450);
      expect(estimate.confidence).toBeGreaterThanOrEqual(0.4);
    }
  });

  it('emits native-sized hops and keeps remainder', () => {
    const hops = new PcmHopEmitter();
    expect(hops.push(new Int16Array(PITCH_HOP_SIZE - 1))).toEqual([]);
    const first = hops.push(new Int16Array(2).fill(3));
    expect(first).toHaveLength(1);
    expect(first[0]).toHaveLength(PITCH_HOP_SIZE);
    expect(first[0][PITCH_HOP_SIZE - 1]).toBe(3);
  });
});
