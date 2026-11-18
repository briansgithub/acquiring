/* Sonic library — TypeScript port of the Java Sonic used by Android at 3c887223
   (android/app/src/main/java/sonic/Sonic.java, upstream revision b93885dc).
   Copyright 2010, 2011 Bill Cox. Licensed under the Apache License 2.0; see pwa/public/licenses/sonic.txt.

   Port notes: 16-bit sample I/O only (the native caller uses writeShortToStream/readShortFromStream).
   Java int arithmetic is emulated with Math.imul / |0 (wrapping), (short) casts with toShort, and
   every float expression with Math.fround, so output is bit-identical to the JVM.
*/

const SONIC_MIN_PITCH = 65;
const SONIC_MAX_PITCH = 400;
const SONIC_AMDF_FREQ = 4000;
const SINC_FILTER_POINTS = 12;
const SINC_TABLE_SIZE = 601;
const f = Math.fround;
const toShort = (value: number): number => (value << 16) >> 16;
const idiv = (a: number, b: number): number => (a / b) | 0;

// Windowed sinc lookup table, identical to Sonic.java.
const SINC_TABLE = Int16Array.from([
  0, 0, 0, 0, 0, 0, 0, -1, -1, -2, -2, -3, -4, -6, -7, -9, -10, -12, -14,
  -17, -19, -21, -24, -26, -29, -32, -34, -37, -40, -42, -44, -47, -48, -50,
  -51, -52, -53, -53, -53, -52, -50, -48, -46, -43, -39, -34, -29, -22, -16,
  -8, 0, 9, 19, 29, 41, 53, 65, 79, 92, 107, 121, 137, 152, 168, 184, 200,
  215, 231, 247, 262, 276, 291, 304, 317, 328, 339, 348, 357, 363, 369, 372,
  374, 375, 373, 369, 363, 355, 345, 332, 318, 300, 281, 259, 234, 208, 178,
  147, 113, 77, 39, 0, -41, -85, -130, -177, -225, -274, -324, -375, -426,
  -478, -530, -581, -632, -682, -731, -779, -825, -870, -912, -951, -989,
  -1023, -1053, -1080, -1104, -1123, -1138, -1149, -1154, -1155, -1151,
  -1141, -1125, -1105, -1078, -1046, -1007, -963, -913, -857, -796, -728,
  -655, -576, -492, -403, -309, -210, -107, 0, 111, 225, 342, 462, 584, 708,
  833, 958, 1084, 1209, 1333, 1455, 1575, 1693, 1807, 1916, 2022, 2122, 2216,
  2304, 2384, 2457, 2522, 2579, 2625, 2663, 2689, 2706, 2711, 2705, 2687,
  2657, 2614, 2559, 2491, 2411, 2317, 2211, 2092, 1960, 1815, 1658, 1489,
  1308, 1115, 912, 698, 474, 241, 0, -249, -506, -769, -1037, -1310, -1586,
  -1864, -2144, -2424, -2703, -2980, -3254, -3523, -3787, -4043, -4291,
  -4529, -4757, -4972, -5174, -5360, -5531, -5685, -5819, -5935, -6029,
  -6101, -6150, -6175, -6175, -6149, -6096, -6015, -5905, -5767, -5599,
  -5401, -5172, -4912, -4621, -4298, -3944, -3558, -3141, -2693, -2214,
  -1705, -1166, -597, 0, 625, 1277, 1955, 2658, 3386, 4135, 4906, 5697, 6506,
  7332, 8173, 9027, 9893, 10769, 11654, 12544, 13439, 14335, 15232, 16128,
  17019, 17904, 18782, 19649, 20504, 21345, 22170, 22977, 23763, 24527,
  25268, 25982, 26669, 27327, 27953, 28547, 29107, 29632, 30119, 30569,
  30979, 31349, 31678, 31964, 32208, 32408, 32565, 32677, 32744, 32767,
  32744, 32677, 32565, 32408, 32208, 31964, 31678, 31349, 30979, 30569,
  30119, 29632, 29107, 28547, 27953, 27327, 26669, 25982, 25268, 24527,
  23763, 22977, 22170, 21345, 20504, 19649, 18782, 17904, 17019, 16128,
  15232, 14335, 13439, 12544, 11654, 10769, 9893, 9027, 8173, 7332, 6506,
  5697, 4906, 4135, 3386, 2658, 1955, 1277, 625, 0, -597, -1166, -1705,
  -2214, -2693, -3141, -3558, -3944, -4298, -4621, -4912, -5172, -5401,
  -5599, -5767, -5905, -6015, -6096, -6149, -6175, -6175, -6150, -6101,
  -6029, -5935, -5819, -5685, -5531, -5360, -5174, -4972, -4757, -4529,
  -4291, -4043, -3787, -3523, -3254, -2980, -2703, -2424, -2144, -1864,
  -1586, -1310, -1037, -769, -506, -249, 0, 241, 474, 698, 912, 1115, 1308,
  1489, 1658, 1815, 1960, 2092, 2211, 2317, 2411, 2491, 2559, 2614, 2657,
  2687, 2705, 2711, 2706, 2689, 2663, 2625, 2579, 2522, 2457, 2384, 2304,
  2216, 2122, 2022, 1916, 1807, 1693, 1575, 1455, 1333, 1209, 1084, 958, 833,
  708, 584, 462, 342, 225, 111, 0, -107, -210, -309, -403, -492, -576, -655,
  -728, -796, -857, -913, -963, -1007, -1046, -1078, -1105, -1125, -1141,
  -1151, -1155, -1154, -1149, -1138, -1123, -1104, -1080, -1053, -1023, -989,
  -951, -912, -870, -825, -779, -731, -682, -632, -581, -530, -478, -426,
  -375, -324, -274, -225, -177, -130, -85, -41, 0, 39, 77, 113, 147, 178,
  208, 234, 259, 281, 300, 318, 332, 345, 355, 363, 369, 373, 375, 374, 372,
  369, 363, 357, 348, 339, 328, 317, 304, 291, 276, 262, 247, 231, 215, 200,
  184, 168, 152, 137, 121, 107, 92, 79, 65, 53, 41, 29, 19, 9, 0, -8, -16,
  -22, -29, -34, -39, -43, -46, -48, -50, -52, -53, -53, -53, -52, -51, -50,
  -48, -47, -44, -42, -40, -37, -34, -32, -29, -26, -24, -21, -19, -17, -14,
  -12, -10, -9, -7, -6, -4, -3, -2, -2, -1, -1, 0, 0, 0, 0, 0, 0, 0,
]);

export class Sonic {
  private inputBuffer!: Int16Array;
  private outputBuffer!: Int16Array;
  private pitchBuffer!: Int16Array;
  private downSampleBuffer!: Int16Array;
  private speedValue = f(1);
  private volumeValue = f(1);
  private pitchValue = f(1);
  private rateValue = f(1);
  private oldRatePosition = 0;
  private newRatePosition = 0;
  private useChordPitch = false;
  private quality = 0;
  private numChannels = 1;
  private inputBufferSize = 0;
  private pitchBufferSize = 0;
  private outputBufferSize = 0;
  private numInputSamples = 0;
  private numOutputSamples = 0;
  private numPitchSamples = 0;
  private minPeriod = 0;
  private maxPeriod = 0;
  private maxRequired = 0;
  private remainingInputToCopy = 0;
  private sampleRate = 0;
  private prevPeriod = 0;
  private prevMinDiff = 0;
  private minDiff = 0;
  private maxDiff = 0;

  constructor(sampleRate: number, numChannels: number) {
    this.allocateStreamBuffers(sampleRate, numChannels);
  }

  get speed(): number { return this.speedValue; }
  set speed(value: number) { this.speedValue = f(value); }
  get pitch(): number { return this.pitchValue; }
  set pitch(value: number) { this.pitchValue = f(value); }
  get rate(): number { return this.rateValue; }
  set rate(value: number) { this.rateValue = f(value); this.oldRatePosition = 0; this.newRatePosition = 0; }
  get volume(): number { return this.volumeValue; }
  set volume(value: number) { this.volumeValue = f(value); }
  get chordPitch(): boolean { return this.useChordPitch; }
  set chordPitch(value: boolean) { this.useChordPitch = value; }
  setQuality(value: number): void { this.quality = value | 0; }

  private resize(oldArray: Int16Array, newLength: number): Int16Array {
    const next = new Int16Array(newLength * this.numChannels);
    next.set(oldArray.subarray(0, Math.min(oldArray.length, next.length)));
    return next;
  }

  private move(dest: Int16Array, destPos: number, source: Int16Array, sourcePos: number, numSamples: number): void {
    const n = this.numChannels;
    // System.arraycopy semantics, including overlapping moves within one array.
    dest.set(source.subarray(sourcePos * n, (sourcePos + numSamples) * n), destPos * n);
  }

  private scaleSamples(samples: Int16Array, position: number, numSamples: number, volume: number): void {
    const fixedPointVolume = Math.trunc(f(volume * f(4096)));
    const start = position * this.numChannels, stop = start + numSamples * this.numChannels;
    for (let x = start; x < stop; x++) {
      let value = Math.imul(samples[x]!, fixedPointVolume) >> 12;
      if (value > 32767) value = 32767; else if (value < -32767) value = -32767;
      samples[x] = value;
    }
  }

  private allocateStreamBuffers(sampleRate: number, numChannels: number): void {
    this.minPeriod = idiv(sampleRate, SONIC_MAX_PITCH);
    this.maxPeriod = idiv(sampleRate, SONIC_MIN_PITCH);
    this.maxRequired = 2 * this.maxPeriod;
    this.inputBufferSize = this.maxRequired;
    this.inputBuffer = new Int16Array(this.maxRequired * numChannels);
    this.outputBufferSize = this.maxRequired;
    this.outputBuffer = new Int16Array(this.maxRequired * numChannels);
    this.pitchBufferSize = this.maxRequired;
    this.pitchBuffer = new Int16Array(this.maxRequired * numChannels);
    this.downSampleBuffer = new Int16Array(this.maxRequired);
    this.sampleRate = sampleRate;
    this.numChannels = numChannels;
    this.oldRatePosition = 0;
    this.newRatePosition = 0;
    this.prevPeriod = 0;
  }

  private enlargeOutputBufferIfNeeded(numSamples: number): void {
    if (this.numOutputSamples + numSamples > this.outputBufferSize) {
      this.outputBufferSize += (this.outputBufferSize >> 1) + numSamples;
      this.outputBuffer = this.resize(this.outputBuffer, this.outputBufferSize);
    }
  }

  private enlargeInputBufferIfNeeded(numSamples: number): void {
    if (this.numInputSamples + numSamples > this.inputBufferSize) {
      this.inputBufferSize += (this.inputBufferSize >> 1) + numSamples;
      this.inputBuffer = this.resize(this.inputBuffer, this.inputBufferSize);
    }
  }

  private addShortSamplesToInputBuffer(samples: Int16Array | null, numSamples: number): void {
    if (numSamples === 0 || !samples) return;
    this.enlargeInputBufferIfNeeded(numSamples);
    this.move(this.inputBuffer, this.numInputSamples, samples, 0, numSamples);
    this.numInputSamples += numSamples;
  }

  private removeInputSamples(position: number): void {
    const remaining = this.numInputSamples - position;
    this.move(this.inputBuffer, 0, this.inputBuffer, position, remaining);
    this.numInputSamples = remaining;
  }

  private copyToOutput(samples: Int16Array, position: number, numSamples: number): void {
    this.enlargeOutputBufferIfNeeded(numSamples);
    this.move(this.outputBuffer, this.numOutputSamples, samples, position, numSamples);
    this.numOutputSamples += numSamples;
  }

  private copyInputToOutput(position: number): number {
    let numSamples = this.remainingInputToCopy;
    if (numSamples > this.maxRequired) numSamples = this.maxRequired;
    this.copyToOutput(this.inputBuffer, position, numSamples);
    this.remainingInputToCopy -= numSamples;
    return numSamples;
  }

  readShortFromStream(samples: Int16Array, maxSamples: number): number {
    let numSamples = this.numOutputSamples, remaining = 0;
    if (numSamples === 0) return 0;
    if (numSamples > maxSamples) { remaining = numSamples - maxSamples; numSamples = maxSamples; }
    this.move(samples, 0, this.outputBuffer, 0, numSamples);
    this.move(this.outputBuffer, 0, this.outputBuffer, numSamples, remaining);
    this.numOutputSamples = remaining;
    return numSamples;
  }

  flushStream(): void {
    const remainingSamples = this.numInputSamples;
    const s = f(this.speedValue / this.pitchValue);
    const r = f(this.rateValue * this.pitchValue);
    const expectedOutputSamples = this.numOutputSamples
      + Math.trunc(f(f(f(f(remainingSamples / s) + this.numPitchSamples) / r) + f(0.5)));
    this.enlargeInputBufferIfNeeded(remainingSamples + 2 * this.maxRequired);
    this.inputBuffer.fill(0, remainingSamples * this.numChannels, (remainingSamples + 2 * this.maxRequired) * this.numChannels);
    this.numInputSamples += 2 * this.maxRequired;
    this.writeShortToStream(null, 0);
    if (this.numOutputSamples > expectedOutputSamples) this.numOutputSamples = expectedOutputSamples;
    this.numInputSamples = 0;
    this.remainingInputToCopy = 0;
    this.numPitchSamples = 0;
  }

  samplesAvailable(): number { return this.numOutputSamples; }

  private downSampleInput(samples: Int16Array, position: number, skip: number): void {
    const numSamples = idiv(this.maxRequired, skip);
    const samplesPerValue = this.numChannels * skip;
    position *= this.numChannels;
    for (let i = 0; i < numSamples; i++) {
      let value = 0;
      for (let j = 0; j < samplesPerValue; j++) value = (value + samples[position + i * samplesPerValue + j]!) | 0;
      value = idiv(value, samplesPerValue);
      this.downSampleBuffer[i] = value;
    }
  }

  private findPitchPeriodInRange(samples: Int16Array, position: number, minPeriod: number, maxPeriod: number): number {
    let bestPeriod = 0, worstPeriod = 255, minDiff = 1, maxDiff = 0;
    position *= this.numChannels;
    for (let period = minPeriod; period <= maxPeriod; period++) {
      let diff = 0;
      for (let i = 0; i < period; i++) {
        const sVal = samples[position + i]!, pVal = samples[position + period + i]!;
        diff = (diff + (sVal >= pVal ? sVal - pVal : pVal - sVal)) | 0;
      }
      if (Math.imul(diff, bestPeriod) < Math.imul(minDiff, period)) { minDiff = diff; bestPeriod = period; }
      if (Math.imul(diff, worstPeriod) > Math.imul(maxDiff, period)) { maxDiff = diff; worstPeriod = period; }
    }
    this.minDiff = idiv(minDiff, bestPeriod);
    this.maxDiff = idiv(maxDiff, worstPeriod);
    return bestPeriod;
  }

  private prevPeriodBetter(minDiff: number, maxDiff: number, preferNewPeriod: boolean): boolean {
    if (minDiff === 0 || this.prevPeriod === 0) return false;
    if (preferNewPeriod) {
      if (maxDiff > Math.imul(minDiff, 3)) return false;
      if (Math.imul(minDiff, 2) <= Math.imul(this.prevMinDiff, 3)) return false;
    } else if (minDiff <= this.prevMinDiff) {
      return false;
    }
    return true;
  }

  private findPitchPeriod(samples: Int16Array, position: number, preferNewPeriod: boolean): number {
    let period: number;
    let skip = 1;
    if (this.sampleRate > SONIC_AMDF_FREQ && this.quality === 0) skip = idiv(this.sampleRate, SONIC_AMDF_FREQ);
    if (this.numChannels === 1 && skip === 1) {
      period = this.findPitchPeriodInRange(samples, position, this.minPeriod, this.maxPeriod);
    } else {
      this.downSampleInput(samples, position, skip);
      period = this.findPitchPeriodInRange(this.downSampleBuffer, 0, idiv(this.minPeriod, skip), idiv(this.maxPeriod, skip));
      if (skip !== 1) {
        period = Math.imul(period, skip);
        let minP = period - (skip << 2), maxP = period + (skip << 2);
        if (minP < this.minPeriod) minP = this.minPeriod;
        if (maxP > this.maxPeriod) maxP = this.maxPeriod;
        if (this.numChannels === 1) {
          period = this.findPitchPeriodInRange(samples, position, minP, maxP);
        } else {
          this.downSampleInput(samples, position, 1);
          period = this.findPitchPeriodInRange(this.downSampleBuffer, 0, minP, maxP);
        }
      }
    }
    const retPeriod = this.prevPeriodBetter(this.minDiff, this.maxDiff, preferNewPeriod) ? this.prevPeriod : period;
    this.prevMinDiff = this.minDiff;
    this.prevPeriod = period;
    return retPeriod;
  }

  private overlapAdd(numSamples: number, numChannels: number, out: Int16Array, outPos: number,
    rampDown: Int16Array, rampDownPos: number, rampUp: Int16Array, rampUpPos: number): void {
    for (let i = 0; i < numChannels; i++) {
      let o = outPos * numChannels + i, u = rampUpPos * numChannels + i, d = rampDownPos * numChannels + i;
      for (let t = 0; t < numSamples; t++) {
        out[o] = toShort(idiv((Math.imul(rampDown[d]!, numSamples - t) + Math.imul(rampUp[u]!, t)) | 0, numSamples));
        o += numChannels; d += numChannels; u += numChannels;
      }
    }
  }

  private overlapAddWithSeparation(numSamples: number, numChannels: number, separation: number, out: Int16Array,
    outPos: number, rampDown: Int16Array, rampDownPos: number, rampUp: Int16Array, rampUpPos: number): void {
    for (let i = 0; i < numChannels; i++) {
      let o = outPos * numChannels + i, u = rampUpPos * numChannels + i, d = rampDownPos * numChannels + i;
      for (let t = 0; t < numSamples + separation; t++) {
        if (t < separation) {
          out[o] = toShort(idiv(Math.imul(rampDown[d]!, numSamples - t), numSamples));
          d += numChannels;
        } else if (t < numSamples) {
          out[o] = toShort(idiv((Math.imul(rampDown[d]!, numSamples - t) + Math.imul(rampUp[u]!, t - separation)) | 0, numSamples));
          d += numChannels; u += numChannels;
        } else {
          out[o] = toShort(idiv(Math.imul(rampUp[u]!, t - separation), numSamples));
          u += numChannels;
        }
        o += numChannels;
      }
    }
  }

  private moveNewSamplesToPitchBuffer(originalNumOutputSamples: number): void {
    const numSamples = this.numOutputSamples - originalNumOutputSamples;
    if (this.numPitchSamples + numSamples > this.pitchBufferSize) {
      this.pitchBufferSize += (this.pitchBufferSize >> 1) + numSamples;
      this.pitchBuffer = this.resize(this.pitchBuffer, this.pitchBufferSize);
    }
    this.move(this.pitchBuffer, this.numPitchSamples, this.outputBuffer, originalNumOutputSamples, numSamples);
    this.numOutputSamples = originalNumOutputSamples;
    this.numPitchSamples += numSamples;
  }

  private removePitchSamples(numSamples: number): void {
    if (numSamples === 0) return;
    this.move(this.pitchBuffer, 0, this.pitchBuffer, numSamples, this.numPitchSamples - numSamples);
    this.numPitchSamples -= numSamples;
  }

  private adjustPitch(originalNumOutputSamples: number): void {
    let position = 0;
    if (this.numOutputSamples === originalNumOutputSamples) return;
    this.moveNewSamplesToPitchBuffer(originalNumOutputSamples);
    while (this.numPitchSamples - position >= this.maxRequired) {
      const period = this.findPitchPeriod(this.pitchBuffer, position, false);
      const newPeriod = Math.trunc(f(period / this.pitchValue));
      this.enlargeOutputBufferIfNeeded(newPeriod);
      if (this.pitchValue >= 1) {
        this.overlapAdd(newPeriod, this.numChannels, this.outputBuffer, this.numOutputSamples, this.pitchBuffer,
          position, this.pitchBuffer, position + period - newPeriod);
      } else {
        const separation = newPeriod - period;
        this.overlapAddWithSeparation(period, this.numChannels, separation, this.outputBuffer, this.numOutputSamples,
          this.pitchBuffer, position, this.pitchBuffer, position);
      }
      this.numOutputSamples += newPeriod;
      position += period;
    }
    this.removePitchSamples(position);
  }

  private findSincCoefficient(i: number, ratio: number, width: number): number {
    const lobePoints = idiv(SINC_TABLE_SIZE - 1, SINC_FILTER_POINTS);
    const left = Math.imul(i, lobePoints) + idiv(Math.imul(ratio, lobePoints), width);
    const right = left + 1;
    const position = (Math.imul(Math.imul(i, lobePoints), width) + Math.imul(ratio, lobePoints) - Math.imul(left, width)) | 0;
    const leftVal = SINC_TABLE[left]!, rightVal = SINC_TABLE[right]!;
    return idiv(((Math.imul(leftVal, width - position) + Math.imul(rightVal, position)) | 0) << 1, width);
  }

  private interpolate(input: Int16Array, inPos: number, oldSampleRate: number, newSampleRate: number): number {
    let total = 0, overflowCount = 0;
    const position = Math.imul(this.newRatePosition, oldSampleRate);
    const leftPosition = Math.imul(this.oldRatePosition, newSampleRate);
    const rightPosition = Math.imul(this.oldRatePosition + 1, newSampleRate);
    const ratio = rightPosition - position - 1;
    const width = rightPosition - leftPosition;
    const sign = (value: number) => value >= 0 ? 1 : -1;
    for (let i = 0; i < SINC_FILTER_POINTS; i++) {
      const weight = this.findSincCoefficient(i, ratio, width);
      const value = Math.imul(input[inPos + i * this.numChannels]!, weight);
      const oldSign = sign(total);
      total = (total + value) | 0;
      if (oldSign !== sign(total) && sign(value) === oldSign) overflowCount += oldSign;
    }
    if (overflowCount > 0) return 32767;
    if (overflowCount < 0) return -32768;
    return toShort(total >> 16);
  }

  private adjustRate(rate: number, originalNumOutputSamples: number): void {
    let newSampleRate = Math.trunc(f(this.sampleRate / rate));
    let oldSampleRate = this.sampleRate;
    const N = SINC_FILTER_POINTS;
    while (newSampleRate > (1 << 14) || oldSampleRate > (1 << 14)) { newSampleRate >>= 1; oldSampleRate >>= 1; }
    if (this.numOutputSamples === originalNumOutputSamples) return;
    this.moveNewSamplesToPitchBuffer(originalNumOutputSamples);
    let position = 0;
    for (position = 0; position < this.numPitchSamples - N; position++) {
      while (Math.imul(this.oldRatePosition + 1, newSampleRate) > Math.imul(this.newRatePosition, oldSampleRate)) {
        this.enlargeOutputBufferIfNeeded(1);
        for (let i = 0; i < this.numChannels; i++) {
          this.outputBuffer[this.numOutputSamples * this.numChannels + i] =
            this.interpolate(this.pitchBuffer, position * this.numChannels + i, oldSampleRate, newSampleRate);
        }
        this.newRatePosition++;
        this.numOutputSamples++;
      }
      this.oldRatePosition++;
      if (this.oldRatePosition === oldSampleRate) {
        this.oldRatePosition = 0;
        this.newRatePosition = 0;
      }
    }
    this.removePitchSamples(position);
  }

  private skipPitchPeriod(samples: Int16Array, position: number, speed: number, period: number): number {
    let newSamples: number;
    if (speed >= 2) {
      newSamples = Math.trunc(f(period / f(speed - 1)));
    } else {
      newSamples = period;
      this.remainingInputToCopy = Math.trunc(f(f(period * f(2 - speed)) / f(speed - 1)));
    }
    this.enlargeOutputBufferIfNeeded(newSamples);
    this.overlapAdd(newSamples, this.numChannels, this.outputBuffer, this.numOutputSamples, samples, position,
      samples, position + period);
    this.numOutputSamples += newSamples;
    return newSamples;
  }

  private insertPitchPeriod(samples: Int16Array, position: number, speed: number, period: number): number {
    let newSamples: number;
    if (speed < 0.5) {
      newSamples = Math.trunc(f(f(period * speed) / f(1 - speed)));
    } else {
      newSamples = period;
      this.remainingInputToCopy = Math.trunc(f(f(period * f(f(2 * speed) - 1)) / f(1 - speed)));
    }
    this.enlargeOutputBufferIfNeeded(period + newSamples);
    this.move(this.outputBuffer, this.numOutputSamples, samples, position, period);
    this.overlapAdd(newSamples, this.numChannels, this.outputBuffer, this.numOutputSamples + period, samples,
      position + period, samples, position);
    this.numOutputSamples += period + newSamples;
    return newSamples;
  }

  private changeSpeed(speed: number): void {
    const numSamples = this.numInputSamples;
    let position = 0;
    if (this.numInputSamples < this.maxRequired) return;
    do {
      if (this.remainingInputToCopy > 0) {
        position += this.copyInputToOutput(position);
      } else {
        const period = this.findPitchPeriod(this.inputBuffer, position, true);
        if (speed > 1) {
          const newSamples = this.skipPitchPeriod(this.inputBuffer, position, speed, period);
          position += period + newSamples;
        } else {
          position += this.insertPitchPeriod(this.inputBuffer, position, speed, period);
        }
      }
    } while (position + this.maxRequired <= numSamples);
    this.removeInputSamples(position);
  }

  private processStreamInput(): void {
    const originalNumOutputSamples = this.numOutputSamples;
    const s = f(this.speedValue / this.pitchValue);
    let r = this.rateValue;
    if (!this.useChordPitch) r = f(r * this.pitchValue);
    if (s > 1.00001 || s < 0.99999) {
      this.changeSpeed(s);
    } else {
      this.copyToOutput(this.inputBuffer, 0, this.numInputSamples);
      this.numInputSamples = 0;
    }
    if (this.useChordPitch) {
      if (this.pitchValue !== 1) this.adjustPitch(originalNumOutputSamples);
    } else if (r !== 1) {
      this.adjustRate(r, originalNumOutputSamples);
    }
    if (this.volumeValue !== 1) {
      this.scaleSamples(this.outputBuffer, originalNumOutputSamples, this.numOutputSamples - originalNumOutputSamples, this.volumeValue);
    }
  }

  writeShortToStream(samples: Int16Array | null, numSamples: number): void {
    this.addShortSamplesToInputBuffer(samples, numSamples);
    this.processStreamInput();
  }
}

/** The native SpokenPhraseCache transform: stretch a mono 16-bit clip to `targetFrames` and shift it by `pitch`. */
export function sonicStretch(source: Int16Array, sampleRate: number, speed: number, pitch: number, targetFrames: number): Int16Array {
  const sonic = new Sonic(sampleRate, 1);
  sonic.speed = speed;
  sonic.pitch = pitch;
  sonic.writeShortToStream(source, source.length);
  sonic.flushStream();
  const output = new Int16Array(targetFrames);
  sonic.readShortFromStream(output, targetFrames);
  return output;
}
