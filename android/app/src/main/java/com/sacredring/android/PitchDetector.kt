package com.sacredring.android

import kotlin.math.sqrt

/**
 * Pure Kotlin implementation of the YIN fundamental-frequency estimation algorithm.
 * Based on: De Cheveigné, A., & Kawahara, H. (2002). YIN, a fundamental frequency
 * estimator for speech and music. The Journal of the Acoustical Society of America.
 */
object PitchDetector {

    data class PitchEstimate(
        val frequencyHz: Double,
        val confidence: Double,
        val rms: Double
    )

    /**
     * Estimates the fundamental frequency from a window of PCM 16-bit samples.
     *
     * @param audioBuffer The PCM samples to analyze.
     * @param sampleRate The sample rate of the input audio (e.g., 16000).
     * @param threshold The YIN absolute threshold (typically 0.1 to 0.15).
     * @param minFreq The minimum frequency to search for (e.g., 65 Hz).
     * @param maxFreq The maximum frequency to search for (e.g., 1000 Hz).
     */
    fun estimatePitch(
        audioBuffer: ShortArray,
        sampleRate: Int,
        threshold: Double = 0.15,
        minFreq: Double = 65.0,
        maxFreq: Double = 1000.0
    ): PitchEstimate {
        val windowSize = audioBuffer.size / 2
        val yinBuffer = DoubleArray(windowSize)
        
        // Pre-normalize to floats and calculate RMS
        val floatBuffer = DoubleArray(audioBuffer.size)
        var sumSquares = 0.0
        for (i in audioBuffer.indices) {
            val s = audioBuffer[i] / 32768.0
            floatBuffer[i] = s
            sumSquares += s * s
        }
        val rms = sqrt(sumSquares / audioBuffer.size)

        // Step 1: Difference function (Optimized loop)
        for (tau in 0 until windowSize) {
            var diff = 0.0
            for (i in 0 until windowSize) {
                val delta = floatBuffer[i] - floatBuffer[i + tau]
                diff += delta * delta
            }
            yinBuffer[tau] = diff
        }

        // Step 2: Cumulative mean normalized difference function
        yinBuffer[0] = 1.0
        var runningSum = 0.0
        for (tau in 1 until windowSize) {
            runningSum += yinBuffer[tau]
            yinBuffer[tau] *= (tau.toDouble() / runningSum)
        }

        // Step 3: Absolute threshold
        val maxTau = (sampleRate / minFreq).toInt().coerceAtMost(windowSize - 1)
        val minTau = (sampleRate / maxFreq).toInt().coerceAtLeast(1)
        
        var bestTau = -1
        for (tau in minTau..maxTau) {
            if (yinBuffer[tau] < threshold) {
                bestTau = tau
                break
            }
        }

        // If no value below threshold, pick the global minimum
        if (bestTau == -1) {
            var minVal = Double.MAX_VALUE
            for (tau in minTau..maxTau) {
                if (yinBuffer[tau] < minVal) {
                    minVal = yinBuffer[tau]
                    bestTau = tau
                }
            }
        }

        // Step 4: Parabolic interpolation
        var finalTau = bestTau.toDouble()
        if (bestTau > 0 && bestTau < windowSize - 1) {
            val s0 = yinBuffer[bestTau - 1]
            val s1 = yinBuffer[bestTau]
            val s2 = yinBuffer[bestTau + 1]
            val denom = s2 - 2 * s1 + s0
            if (Math.abs(denom) > 1e-6) {
                finalTau = bestTau + (s0 - s2) / (2 * denom)
            }
        }

        val frequency = if (bestTau != -1) sampleRate / finalTau else 0.0
        val confidence = if (bestTau != -1) 1.0 - (yinBuffer[bestTau].coerceIn(0.0, 1.0)) else 0.0

        return PitchEstimate(
            frequencyHz = if (frequency in minFreq..maxFreq) frequency else 0.0,
            confidence = confidence,
            rms = rms
        )
    }
}
