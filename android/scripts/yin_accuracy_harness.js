#!/usr/bin/env node
/*
 * Offline accuracy harness for PitchDetector.kt.
 *
 * `estimatePitch` below is a faithful line-by-line port of
 * app/src/main/java/com/acquiring/android/PitchDetector.kt, with two behaviours
 * put behind flags so each can be isolated in the error budget:
 *
 *   opts.descend   - add the canonical YIN local-minimum descent after the
 *                    threshold crossing (de Cheveigne & Kawahara 2002, step 4).
 *                    The shipped Kotlin does NOT do this.
 *   opts.guardSign - require a positive parabola denominator before applying
 *                    parabolic interpolation. The shipped Kotlin only guards
 *                    abs(denom) > 1e-6, which admits concave-down vertices.
 *
 * Run:  node android/scripts/yin_accuracy_harness.js
 */

'use strict'

// ---------------------------------------------------------------- port -----

function estimatePitch(audioBuffer, sampleRate, opts) {
  const threshold = opts.threshold !== undefined ? opts.threshold : 0.15
  const minFreq = opts.minFreq !== undefined ? opts.minFreq : 65.0
  const maxFreq = opts.maxFreq !== undefined ? opts.maxFreq : 1000.0

  const windowSize = Math.floor(audioBuffer.length / 2)
  const yinBuffer = new Float64Array(windowSize)

  const floatBuffer = new Float64Array(audioBuffer.length)
  let sumSquares = 0
  for (let i = 0; i < audioBuffer.length; i++) {
    const s = audioBuffer[i] / 32768.0
    floatBuffer[i] = s
    sumSquares += s * s
  }
  const rms = Math.sqrt(sumSquares / audioBuffer.length)

  // Step 1: difference function
  for (let tau = 0; tau < windowSize; tau++) {
    let diff = 0
    for (let i = 0; i < windowSize; i++) {
      const delta = floatBuffer[i] - floatBuffer[i + tau]
      diff += delta * delta
    }
    yinBuffer[tau] = diff
  }

  // Step 2: cumulative mean normalized difference function
  yinBuffer[0] = 1.0
  let runningSum = 0
  for (let tau = 1; tau < windowSize; tau++) {
    runningSum += yinBuffer[tau]
    yinBuffer[tau] *= tau / runningSum
  }

  // Step 3: absolute threshold
  const maxTau = Math.min(Math.trunc(sampleRate / minFreq), windowSize - 1)
  const minTau = Math.max(Math.trunc(sampleRate / maxFreq), 1)

  let bestTau = -1
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (yinBuffer[tau] < threshold) {
      bestTau = tau
      if (opts.descend) {
        while (bestTau + 1 <= maxTau && yinBuffer[bestTau + 1] < yinBuffer[bestTau]) bestTau++
      }
      break
    }
  }

  let usedGlobalMin = false
  if (bestTau === -1) {
    usedGlobalMin = true
    let minVal = Number.MAX_VALUE
    for (let tau = minTau; tau <= maxTau; tau++) {
      if (yinBuffer[tau] < minVal) {
        minVal = yinBuffer[tau]
        bestTau = tau
      }
    }
  }

  // Step 4: parabolic interpolation
  let finalTau = bestTau
  let negDenom = false
  if (bestTau > 0 && bestTau < windowSize - 1) {
    const s0 = yinBuffer[bestTau - 1]
    const s1 = yinBuffer[bestTau]
    const s2 = yinBuffer[bestTau + 1]
    const denom = s2 - 2 * s1 + s0
    if (denom < 0) negDenom = true
    const ok = opts.guardSign ? denom > 1e-6 : Math.abs(denom) > 1e-6
    if (ok) finalTau = bestTau + (s0 - s2) / (2 * denom)
  }

  const frequency = bestTau !== -1 ? sampleRate / finalTau : 0.0
  const confidence = bestTau !== -1 ? 1.0 - Math.min(Math.max(yinBuffer[bestTau], 0), 1) : 0.0

  return {
    frequencyHz: frequency >= minFreq && frequency <= maxFreq ? frequency : 0.0,
    confidence,
    rms,
    bestTau,
    finalTau,
    negDenom,
    usedGlobalMin,
  }
}

// ------------------------------------------------------------- signals -----

function sine(f0, sr, n, phase) {
  const b = new Int16Array(n)
  for (let i = 0; i < n; i++) {
    const s = Math.sin(2 * Math.PI * f0 * i / sr + phase)
    b[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)))
  }
  return b
}

/** Harmonic-rich tone: H1..nh with 1/k amplitude. Approximates a sung/hummed vowel. */
function harmonic(f0, sr, n, nh, phase) {
  const tmp = new Float64Array(n)
  let peak = 0
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let k = 1; k <= nh; k++) {
      if (k * f0 >= sr / 2) break
      s += (1 / k) * Math.sin(2 * Math.PI * k * f0 * i / sr + phase * k * 0.7)
    }
    tmp[i] = s
    if (Math.abs(s) > peak) peak = Math.abs(s)
  }
  const b = new Int16Array(n)
  for (let i = 0; i < n; i++) b[i] = Math.round((tmp[i] / peak) * 26000)
  return b
}

const cents = (measured, reference) => 1200 * Math.log2(measured / reference)

// --------------------------------------------------------------- sweep -----

function sweep(genFor, sr, bufLen, opts, lo, hi, step) {
  const errs = []
  let octave = 0
  let noDetect = 0
  let negDenom = 0
  let globalMin = 0

  for (let f0 = lo; f0 <= hi; f0 += step) {
    for (const phase of [0, 1.1, 2.4]) {
      const r = estimatePitch(genFor(f0, sr, bufLen, phase), sr, opts)
      if (r.negDenom) negDenom++
      if (r.usedGlobalMin) globalMin++
      if (r.frequencyHz <= 0) {
        noDetect++
        continue
      }
      const c = cents(r.frequencyHz, f0)
      if (Math.abs(c) > 600) {
        octave++
        continue
      }
      errs.push(c)
    }
  }

  errs.sort((a, b) => a - b)
  const abs = errs.map(Math.abs).sort((a, b) => a - b)
  const mean = errs.reduce((a, b) => a + b, 0) / errs.length
  return {
    n: errs.length,
    mean,
    median: errs[Math.floor(errs.length / 2)],
    min: errs[0],
    max: errs[errs.length - 1],
    p95abs: abs[Math.floor(abs.length * 0.95)],
    maxabs: abs[abs.length - 1],
    octave,
    noDetect,
    negDenom,
    globalMin,
  }
}

const f = (x, w) => (x === undefined ? '   n/a' : x.toFixed(1).padStart(w))

function row(label, s) {
  console.log(
    `  ${label.padEnd(30)} ${f(s.mean, 8)} ${f(s.median, 8)} ${f(s.p95abs, 8)} ${f(s.maxabs, 8)}` +
      `   ${String(s.octave).padStart(5)} ${String(s.noDetect).padStart(5)}`
  )
}

function header(title) {
  console.log(`\n${title}`)
  console.log(
    `  ${'variant'.padEnd(30)} ${'mean¢'.padStart(8)} ${'median¢'.padStart(8)} ${'p95|¢|'.padStart(8)} ${'max|¢|'.padStart(8)}` +
      `   ${'oct'.padStart(5)} ${'none'.padStart(5)}`
  )
  console.log('  ' + '-'.repeat(78))
}

// ---------------------------------------------------------------- main -----

module.exports = { estimatePitch, sine, harmonic, cents, sweep }
if (require.main !== module) return

const SIGNALS = [
  ['pure sine', (f0, sr, n, p) => sine(f0, sr, n, p)],
  ['hum H1-H4', (f0, sr, n, p) => harmonic(f0, sr, n, 4, p)],
  ['hum H1-H8', (f0, sr, n, p) => harmonic(f0, sr, n, 8, p)],
]

const VARIANTS = [
  ['as shipped', { descend: false, guardSign: false }],
  ['+ local-min descent', { descend: true, guardSign: false }],
  ['+ denom>0 guard', { descend: false, guardSign: true }],
  ['+ both fixes', { descend: true, guardSign: true }],
]

console.log('YIN accuracy harness for PitchDetector.kt')
console.log('Sweep 80-600 Hz, 2 Hz steps, 3 phase offsets per frequency.')
console.log('Positive cents = reads SHARP. "oct" = octave errors (>600¢ off). "none" = no detection.')

for (const [rate, bufLen] of [[16000, 2048], [48000, 6144]]) {
  console.log(`\n${'='.repeat(82)}`)
  console.log(`sampleRate = ${rate} Hz, buffer = ${bufLen} samples (${(bufLen / rate * 1000).toFixed(0)} ms window)`)
  console.log('='.repeat(82))
  for (const [sigName, gen] of SIGNALS) {
    header(`signal: ${sigName}`)
    for (const [vName, opts] of VARIANTS) {
      row(vName, sweep(gen, rate, bufLen, opts, 80, 600, 2))
    }
  }
}

// tau-resolution table: how many cents is one integer sample of tau worth?
console.log(`\n${'='.repeat(82)}`)
console.log('Integer-tau resolution (cents per one sample of tau), before parabolic interpolation')
console.log('='.repeat(82))
console.log(`  ${'note'.padEnd(8)} ${'Hz'.padStart(8)} ${'tau@16k'.padStart(9)} ${'¢/sample'.padStart(9)}   ${'tau@48k'.padStart(9)} ${'¢/sample'.padStart(9)}`)
console.log('  ' + '-'.repeat(66))
for (const [note, hz] of [['A2', 110], ['D3', 146.83], ['A3', 220], ['C4', 261.63], ['E4', 329.63], ['A4', 440], ['E5', 659.26], ['A5', 880]]) {
  const t16 = 16000 / hz
  const t48 = 48000 / hz
  const c16 = Math.abs(1200 * Math.log2((t16 + 1) / t16))
  const c48 = Math.abs(1200 * Math.log2((t48 + 1) / t48))
  console.log(`  ${note.padEnd(8)} ${hz.toFixed(2).padStart(8)} ${t16.toFixed(1).padStart(9)} ${c16.toFixed(1).padStart(9)}   ${t48.toFixed(1).padStart(9)} ${c48.toFixed(1).padStart(9)}`)
}
