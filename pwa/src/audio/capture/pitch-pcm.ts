import { PITCH_HOP_SIZE, PITCH_SAMPLE_RATE } from './pitch-publisher';

/** WebAudio float [-1,1] to PCM16 using native detector divisor 32768. */
export function float32ToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    if (!Number.isFinite(x)) continue;
    const s = x < -1 ? -1 : x > 1 ? 1 : x;
    out[i] = s < 0 ? Math.trunc(s * 32768) : Math.trunc(s * 32767);
  }
  return out;
}

/**
 * Linear resample to native 16kHz analysis rate.
 * Necessary browser difference: AudioRecord opens at 16000; Chrome capture is usually 44100/48000.
 */
export class LinearPcmResampler {
  private leftover = new Int16Array(0);
  private offset = 0;
  constructor(readonly outputRate = PITCH_SAMPLE_RATE) {}
  reset(): void { this.leftover = new Int16Array(0); this.offset = 0; }
  push(input: Int16Array, inputRate: number): Int16Array {
    if (!Number.isFinite(inputRate) || inputRate <= 0) throw new RangeError('inputRate');
    if (inputRate === this.outputRate) { this.reset(); return input; }
    const buf = new Int16Array(this.leftover.length + input.length);
    buf.set(this.leftover);
    buf.set(input, this.leftover.length);
    if (buf.length < 2) { this.leftover = buf; return new Int16Array(0); }
    const step = inputRate / this.outputRate;
    const out: number[] = [];
    let pos = this.offset;
    while (pos + 1 < buf.length) {
      const i0 = Math.trunc(pos);
      const frac = pos - i0;
      out.push(Math.round(buf[i0] * (1 - frac) + buf[i0 + 1] * frac));
      pos += step;
    }
    const keep = Math.trunc(pos);
    this.leftover = buf.slice(keep);
    this.offset = pos - keep;
    return Int16Array.from(out);
  }
}

/** Remainder-aware hop emitter matching native hopSize PCM reads. */
export class PcmHopEmitter {
  private pending = new Int16Array(0);
  constructor(readonly hopSize = PITCH_HOP_SIZE) {
    if (!Number.isInteger(hopSize) || hopSize < 1) throw new RangeError('hopSize');
  }
  reset(): void { this.pending = new Int16Array(0); }
  push(pcm: Int16Array): Int16Array[] {
    const hops: Int16Array[] = [];
    const merged = new Int16Array(this.pending.length + pcm.length);
    merged.set(this.pending);
    merged.set(pcm, this.pending.length);
    let offset = 0;
    while (offset + this.hopSize <= merged.length) {
      hops.push(merged.slice(offset, offset + this.hopSize));
      offset += this.hopSize;
    }
    this.pending = merged.slice(offset);
    return hops;
  }
}
