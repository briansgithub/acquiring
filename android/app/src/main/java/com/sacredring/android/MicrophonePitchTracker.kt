package com.sacredring.android

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.log2
import kotlin.math.pow

class MicrophonePitchTracker(
    private val sampleRate: Int = 16000,
    private val windowSize: Int = 2048,
    private val hopSize: Int = 512
) : PitchSource {
    private val _pitchFlow = MutableStateFlow<PitchResult>(PitchResult.NoSignal)
    override val pitchFlow: StateFlow<PitchResult> = _pitchFlow.asStateFlow()

    private var audioRecord: AudioRecord? = null
    private var job: Job? = null
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    sealed class PitchResult {
        object NoSignal : PitchResult()
        data class Estimate(val midi: Double, val centsError: Double, val confidence: Double) : PitchResult()
        data class Error(val message: String) : PitchResult()
    }

    @SuppressLint("MissingPermission")
    override fun start(targetMidi: Int) {
        stop()

        val minBufferSize = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )

        if (minBufferSize == AudioRecord.ERROR_BAD_VALUE) {
            _pitchFlow.value = PitchResult.Error("Unsupported audio configuration")
            return
        }

        try {
            // Attempt UNPROCESSED, fall back to VOICE_RECOGNITION then MIC
            audioRecord = createAudioRecord(MediaRecorder.AudioSource.UNPROCESSED, minBufferSize)
                ?: createAudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, minBufferSize)
                ?: createAudioRecord(MediaRecorder.AudioSource.MIC, minBufferSize)

            val recorder = audioRecord ?: throw Exception("Could not initialize AudioRecord")
            
            if (recorder.state != AudioRecord.STATE_INITIALIZED) {
                throw Exception("AudioRecord state not initialized")
            }

            recorder.startRecording()
            
            job = scope.launch {
                val buffer = ShortArray(windowSize + hopSize)
                val rollingBuffer = ShortArray(windowSize)
                var writeIdx = 0
                
                // Smoothing state
                val recentCents = mutableListOf<Double>()
                var smoothedCents = 0.0
                var consecutiveValidFrames = 0
                var lastValidTime = 0L

                while (isActive && recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                    val read = recorder.read(buffer, writeIdx, hopSize)
                    if (read > 0) {
                        writeIdx += read
                        
                        if (writeIdx >= windowSize) {
                            // Copy the latest windowSize samples
                            System.arraycopy(buffer, writeIdx - windowSize, rollingBuffer, 0, windowSize)
                            
                            val estimate = PitchDetector.estimatePitch(
                                rollingBuffer,
                                sampleRate,
                                threshold = 0.15,
                                minFreq = 65.0,
                                maxFreq = 1000.0
                            )

                            processEstimate(estimate, targetMidi) { result ->
                                val now = System.currentTimeMillis()
                                if (result is PitchResult.Estimate) {
                                    recentCents.add(result.centsError)
                                    if (recentCents.size > 3) recentCents.removeAt(0)

                                    if (recentCents.size >= 3) {
                                        // Median filter
                                        val median = recentCents.sorted()[1]
                                        
                                        if (consecutiveValidFrames == 0) {
                                            smoothedCents = median
                                        } else {
                                            // Light exponential smoothing
                                            smoothedCents = smoothedCents * 0.7 + median * 0.3
                                        }
                                        consecutiveValidFrames++
                                        lastValidTime = now
                                        
                                        if (consecutiveValidFrames >= 2) {
                                            _pitchFlow.value = result.copy(centsError = smoothedCents)
                                        }
                                    }
                                } else {
                                    if (now - lastValidTime > 200) {
                                        _pitchFlow.value = PitchResult.NoSignal
                                        consecutiveValidFrames = 0
                                        recentCents.clear()
                                    }
                                }
                            }

                            // Shift buffer to make room for next hop
                            System.arraycopy(buffer, hopSize, buffer, 0, writeIdx - hopSize)
                            writeIdx -= hopSize
                        }
                    } else if (read < 0) {
                        _pitchFlow.value = PitchResult.Error("Audio read error: $read")
                        break
                    }
                    yield()
                }
            }
        } catch (e: Exception) {
            _pitchFlow.value = PitchResult.Error(e.message ?: "Unknown initialization error")
        }
    }

    private fun createAudioRecord(source: Int, minBufferSize: Int): AudioRecord? {
        return try {
            val recorder = AudioRecord(
                source,
                sampleRate,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                minBufferSize.coerceAtLeast(windowSize * 2)
            )
            if (recorder.state == AudioRecord.STATE_INITIALIZED) recorder else {
                recorder.release()
                null
            }
        } catch (e: Exception) {
            null
        }
    }

    private fun processEstimate(
        estimate: PitchDetector.PitchEstimate,
        targetMidi: Int,
        onResult: (PitchResult) -> Unit
    ) {
        // RMS/noise-floor gating: Very sensitive thresholds
        if (estimate.rms < 0.0005 || estimate.frequencyHz <= 0.0 || estimate.confidence < 0.4) {
            onResult(PitchResult.NoSignal)
            return
        }

        val detectedMidi = 69.0 + 12.0 * log2(estimate.frequencyHz / 440.0)
        val centsError = 100.0 * (detectedMidi - targetMidi)

        // Always provide an estimate if signal is periodic, even if very far away.
        // This ensures the pinned bar appears instead of hiding entirely.
        onResult(PitchResult.Estimate(detectedMidi, centsError, estimate.confidence))
    }

    override fun stop() {
        job?.cancel()
        job = null
        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (_: Exception) {}
        audioRecord = null
        _pitchFlow.value = PitchResult.NoSignal
    }

    override fun release() {
        stop()
        scope.cancel()
    }
}
