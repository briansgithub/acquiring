package com.sacredring.android

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.sin

object AudioEngine {
    private const val SAMPLE_RATE = 44100
    private var audioTrack: AudioTrack? = null

    init {
        val minBufferSize = AudioTrack.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )

        audioTrack = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setBufferSizeInBytes(minBufferSize)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
        
        audioTrack?.play()
    }

    suspend fun playChord(midiNotes: List<Int>, durationMs: Int = 500) = withContext(Dispatchers.Default) {
        val numSamples = (SAMPLE_RATE * durationMs / 1000.0).toInt()
        val samples = ShortArray(numSamples)

        for (i in 0 until numSamples) {
            var sum = 0.0
            for (midiNote in midiNotes) {
                val freq = 440.0 * Math.pow(2.0, (midiNote - 69) / 12.0)
                // Simple sawtooth wave
                val period = SAMPLE_RATE / freq
                val phase = (i % period) / period
                sum += (phase * 2.0 - 1.0) * 0.2 // Volume scaling
            }
            samples[i] = (sum * Short.MAX_VALUE).toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
        }

        audioTrack?.write(samples, 0, numSamples)
    }
}
