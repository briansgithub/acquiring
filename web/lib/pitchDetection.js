function autoCorrelate(buffer, sampleRate) {
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.01) return null;

  let r1 = 0;
  let r2 = buffer.length - 1;
  const threshold = 0.2;
  for (let i = 0; i < buffer.length / 2; i++) {
    if (Math.abs(buffer[i]) < threshold) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < buffer.length / 2; i++) {
    if (Math.abs(buffer[buffer.length - i]) < threshold) {
      r2 = buffer.length - i;
      break;
    }
  }
  const trimmed = buffer.slice(r1, r2);
  if (!trimmed.length) return null;

  const c = new Array(trimmed.length).fill(0);
  for (let i = 0; i < trimmed.length; i++) {
    for (let j = 0; j < trimmed.length - i; j++) c[i] += trimmed[j] * trimmed[j + i];
  }

  let d = 0;
  while (d + 1 < c.length && c[d] > c[d + 1]) d++;
  let maxPos = -1;
  let maxVal = -1;
  for (let i = d; i < c.length; i++) {
    if (c[i] > maxVal) {
      maxVal = c[i];
      maxPos = i;
    }
  }
  if (maxPos <= 0) return null;
  const x1 = c[maxPos - 1] || c[maxPos];
  const x2 = c[maxPos];
  const x3 = c[maxPos + 1] || c[maxPos];
  const shift = (x3 - x1) / (2 * (2 * x2 - x1 - x3));
  const period = maxPos + (Number.isFinite(shift) ? shift : 0);
  if (!period || period <= 0) return null;
  return sampleRate / period;
}

export function signedOctaveCents(observedHz, targetHz) {
  if (!observedHz || !targetHz) return Number.NaN;
  let bestSigned = 0;
  let bestAbs = Number.POSITIVE_INFINITY;
  for (let shift = -2; shift <= 2; shift++) {
    const shifted = targetHz * 2 ** shift;
    const signed = centsError(observedHz, shifted);
    const abs = Math.abs(signed);
    if (abs < bestAbs) {
      bestAbs = abs;
      bestSigned = signed;
    }
  }
  return bestSigned;
}

export function bestOctaveError(observedHz, targetHz) {
  const signed = signedOctaveCents(observedHz, targetHz);
  return Number.isFinite(signed) ? Math.abs(signed) : Number.NaN;
}

export async function capturePitchFrames(durationMs = 2200, onFrame = null) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const sampleRate = ctx.sampleRate;
  const data = new Float32Array(analyser.fftSize);
  const start = performance.now();
  const frames = [];

  while (performance.now() - start < durationMs) {
    analyser.getFloatTimeDomainData(data);
    const hz = autoCorrelate(data, sampleRate);
    if (hz && hz > 50 && hz < 1300) {
      frames.push(hz);
      onFrame?.(hz);
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  source.disconnect();
  analyser.disconnect();
  stream.getTracks().forEach((track) => track.stop());
  await ctx.close();
  return frames;
}

export function centsError(observedHz, targetHz) {
  if (!observedHz || !targetHz) return Number.NaN;
  return 1200 * Math.log2(observedHz / targetHz);
}

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}
