package com.sacredring.android

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

object AudioEngine {
    private const val SAMPLE_RATE = 44100
    private val mutex = Mutex()
    private var audioTrack: AudioTrack? = null

    private fun getOrCreateAudioTrack(minBufferSize: Int): AudioTrack {
        val track = audioTrack
        if (track != null && track.state == AudioTrack.STATE_INITIALIZED) {
            return track
        }

        try {
            track?.release()
        } catch (_: Exception) {}

        val newTrack = AudioTrack.Builder()
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

        newTrack.play()
        audioTrack = newTrack
        return newTrack
    }

    suspend fun playChord(
        midiNotes: List<Int>,
        durationMs: Int = 450,
        arpeggiate: Boolean = false,
        stepMs: Int = 80
    ) = withContext(Dispatchers.Default) {
        val validNotes = midiNotes.filter { it > 0 }
        if (validNotes.isEmpty()) return@withContext

        val numNotes = validNotes.size
        val stepSamples = (SAMPLE_RATE * stepMs / 1000.0).toInt().coerceAtLeast(200)

        val numSamples = if (arpeggiate && numNotes > 1) {
            numNotes * stepSamples
        } else {
            (SAMPLE_RATE * durationMs / 1000.0).toInt()
        }

        val minBufferSize = AudioTrack.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        ).coerceAtLeast(numSamples * 2)

        val samples = ShortArray(numSamples)

        for (i in 0 until numSamples) {
            var sum = 0.0

            if (!arpeggiate || numNotes <= 1) {
                // Simultaneous block chord
                val env = when {
                    i < 200 -> i / 200.0
                    i > numSamples - 1000 -> (numSamples - i) / 1000.0
                    else -> 1.0
                }
                for (midiNote in validNotes) {
                    val freq = 440.0 * Math.pow(2.0, (midiNote - 69) / 12.0)
                    val period = SAMPLE_RATE / freq
                    val phase = (i % period) / period
                    sum += (phase * 2.0 - 1.0) * (0.25 / numNotes) * env
                }
            } else {
                // Non-overlapping monophonic arpeggiated chord
                val noteIdx = (i / stepSamples).coerceIn(0, numNotes - 1)
                val noteSampleIdx = i % stepSamples

                // Short attack (~1.5ms) & release (~2.5ms) to maximize audible note duration at fast speeds
                val attackSamples = (stepSamples * 0.08).toInt().coerceIn(10, 80)
                val releaseSamples = (stepSamples * 0.12).toInt().coerceIn(15, 120)

                val env = when {
                    noteSampleIdx < attackSamples -> noteSampleIdx.toDouble() / attackSamples
                    noteSampleIdx > stepSamples - releaseSamples -> (stepSamples - noteSampleIdx).toDouble() / releaseSamples
                    else -> 1.0
                }

                val midiNote = validNotes[noteIdx]
                val freq = 440.0 * Math.pow(2.0, (midiNote - 69) / 12.0)
                val period = SAMPLE_RATE / freq
                val phase = (i % period) / period
                sum = (phase * 2.0 - 1.0) * 0.45 * env
            }

            samples[i] = (sum * Short.MAX_VALUE).toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
        }

        mutex.withLock {
            try {
                val track = getOrCreateAudioTrack(minBufferSize)
                if (track.playState != AudioTrack.PLAYSTATE_PLAYING) {
                    track.play()
                }
                track.pause()
                track.flush()
                track.play()
                track.write(samples, 0, numSamples)
            } catch (e: Exception) {
                // If write or track fails, safely release and reset for next click
                try {
                    audioTrack?.release()
                } catch (_: Exception) {}
                audioTrack = null
            }
        }
    }
}

