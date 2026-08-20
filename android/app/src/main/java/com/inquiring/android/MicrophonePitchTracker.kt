package com.inquiring.android

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.log2

class MicrophonePitchTracker(
    private val context: Context? = null,
    private val sampleRate: Int = 16000,
    private val windowSize: Int = 2048,
    private val hopSize: Int = 512
) : PitchSource {
    private val _pitchFlow = MutableStateFlow<PitchResult>(PitchResult.NoSignal)
    override val pitchFlow: StateFlow<PitchResult> = _pitchFlow.asStateFlow()

    private var job: Job? = null

    /** Signals the capture loop to wind down. The loop, not the caller, releases the recorder. */
    @Volatile
    private var running = false

    @Volatile
    private var currentTargetMidi = 60

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    sealed class PitchResult {
        object NoSignal : PitchResult()
        data class Estimate(val midi: Double, val centsError: Double, val confidence: Double) : PitchResult()
        data class Error(val message: String) : PitchResult()
    }

    override fun start(targetMidi: Int) {
        start(targetMidi, PitchTrackingMode.STANDARD)
    }

    internal fun start(targetMidi: Int, trackingMode: PitchTrackingMode) {
        // Wind the previous session down and hand the new one a job that waits for it.
        // Joining here rather than in stop() keeps the caller (the Compose main thread)
        // off the blocking teardown path, while still guaranteeing the old AudioRecord is
        // fully released before a new one is built.
        val previous = job
        running = false
        previous?.cancel()
        _pitchFlow.value = PitchResult.NoSignal
        currentTargetMidi = targetMidi

        val analysisWindowSize = trackingMode.windowSizeOverride ?: windowSize
        val analysisHopSize = trackingMode.hopSizeOverride ?: hopSize

        job = scope.launch {
            previous?.join()
            running = true
            captureLoop(
                trackingMode = trackingMode,
                analysisWindowSize = analysisWindowSize,
                analysisHopSize = analysisHopSize
            )
        }
    }

    override fun retarget(targetMidi: Int) {
        if (job == null) {
            start(targetMidi)
            return
        }
        currentTargetMidi = targetMidi
    }

    @SuppressLint("MissingPermission")
    private suspend fun CoroutineScope.captureLoop(
        trackingMode: PitchTrackingMode,
        analysisWindowSize: Int,
        analysisHopSize: Int
    ) {
        val minBufferSize = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )

        if (minBufferSize == AudioRecord.ERROR_BAD_VALUE || minBufferSize == AudioRecord.ERROR) {
            _pitchFlow.value = PitchResult.Error("Unsupported audio configuration")
            return
        }

        val recorder: AudioRecord
        try {
            // UNPROCESSED gives the rawest signal, but the constructor succeeds on devices
            // that do not actually support it and quietly hands back processed audio, so the
            // platform capability flag is what decides whether it is worth asking for.
            val unprocessedSupported = context?.let {
                (it.getSystemService(Context.AUDIO_SERVICE) as? AudioManager)
                    ?.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED) == "true"
            } ?: true

            val opened = (if (unprocessedSupported) {
                createAudioRecord(
                    MediaRecorder.AudioSource.UNPROCESSED,
                    minBufferSize,
                    analysisHopSize
                )
                    ?.let { it to "UNPROCESSED" }
            } else null)
                ?: createAudioRecord(
                    MediaRecorder.AudioSource.VOICE_RECOGNITION,
                    minBufferSize,
                    analysisHopSize
                )
                    ?.let { it to "VOICE_RECOGNITION" }
                ?: createAudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    minBufferSize,
                    analysisHopSize
                )
                    ?.let { it to "MIC" }
                ?: throw IllegalStateException("Could not initialize AudioRecord")

            recorder = opened.first
            Log.i(
                TAG,
                "Capture started: source=${opened.second} rate=${sampleRate}Hz " +
                    "window=$analysisWindowSize hop=$analysisHopSize " +
                    "mode=$trackingMode unprocessedSupported=$unprocessedSupported"
            )
        } catch (e: Exception) {
            _pitchFlow.value = PitchResult.Error(e.message ?: "Unknown initialization error")
            return
        }

        try {
            recorder.startRecording()

            val buffer = ShortArray(analysisWindowSize + analysisHopSize)
            val rollingBuffer = ShortArray(analysisWindowSize)
            var writeIdx = 0

            var smootherTargetMidi = currentTargetMidi
            val smoother = PitchSmoother(smootherTargetMidi, trackingMode)
            var lastValidTime = 0L

            while (isActive && running && recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                val targetMidi = currentTargetMidi
                if (targetMidi != smootherTargetMidi) {
                    smoother.retarget(targetMidi)
                    smootherTargetMidi = targetMidi
                    lastValidTime = 0L
                    _pitchFlow.value = PitchResult.NoSignal
                }
                val read = recorder.read(buffer, writeIdx, analysisHopSize)
                if (read > 0) {
                    writeIdx += read

                    if (writeIdx >= analysisWindowSize) {
                        System.arraycopy(
                            buffer,
                            writeIdx - analysisWindowSize,
                            rollingBuffer,
                            0,
                            analysisWindowSize
                        )

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
                                lastValidTime = now
                                smoother.accept(result.midi, result.confidence)?.let {
                                    _pitchFlow.value = it
                                }
                            } else {
                                if (now - lastValidTime > 200) {
                                    _pitchFlow.value = PitchResult.NoSignal
                                    smoother.reset()
                                }
                            }
                        }

                        // Shift buffer to make room for next hop
                        System.arraycopy(
                            buffer,
                            analysisHopSize,
                            buffer,
                            0,
                            writeIdx - analysisHopSize
                        )
                        writeIdx -= analysisHopSize
                    }
                } else if (read < 0) {
                    _pitchFlow.value = PitchResult.Error("Audio read error: $read")
                    break
                }
                yield()
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            _pitchFlow.value = PitchResult.Error(e.message ?: "Unknown capture error")
        } finally {
            // Teardown belongs to the capture coroutine: stop() only signals, so the blocking
            // read() above has always returned by the time the recorder is released. Releasing
            // from the caller's thread while this one sat inside read() was a use-after-free.
            try {
                if (recorder.state == AudioRecord.STATE_INITIALIZED) recorder.stop()
            } catch (_: Exception) {
            }
            recorder.release()
        }
    }

    @SuppressLint("MissingPermission")
    private fun createAudioRecord(
        source: Int,
        minBufferSize: Int,
        analysisHopSize: Int
    ): AudioRecord? {
        return try {
            // AudioRecord sizes its buffer in BYTES; a 16-bit mono frame is 2 bytes. Hold
            // several hops so a scheduling hiccup during analysis cannot overrun the capture.
            val desiredBytes = analysisHopSize * BYTES_PER_SAMPLE * HOP_BUFFER_MULTIPLE
            val recorder = AudioRecord(
                source,
                sampleRate,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                minBufferSize.coerceAtLeast(desiredBytes)
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
        running = false
        job?.cancel()
        job = null
        _pitchFlow.value = PitchResult.NoSignal
    }

    override fun release() {
        stop()
        scope.cancel()
    }

    private companion object {
        const val TAG = "PitchTracker"
        const val BYTES_PER_SAMPLE = 2
        const val HOP_BUFFER_MULTIPLE = 8
    }
}
