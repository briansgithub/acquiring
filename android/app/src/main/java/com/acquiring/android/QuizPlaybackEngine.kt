package com.acquiring.android

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Process
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import java.util.ArrayDeque
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.roundToInt

internal enum class QuizAudioLayer { MELODY, CHORD }

internal enum class QuizChordMode { FULL, ROOT_ONLY }

internal data class QuizTimelineEvent(
    val id: Long,
    val startBeat: Double,
    val endBeat: Double,
    val layer: QuizAudioLayer,
    val fullMidiNotes: IntArray,
    val rootMidiNote: Int? = null
)

internal data class QuizTimeline(
    val startBeat: Double = 1.0,
    val endBeat: Double,
    val events: List<QuizTimelineEvent>
) {
    init {
        require(endBeat > startBeat)
    }
}

internal data class QuizPlaybackConfig(
    val bpm: Double,
    val transpose: Int,
    val waveform: AudioEngine.Waveform,
    val chordMode: QuizChordMode,
    val melodyGain: Float,
    val chordGain: Float,
    val arpeggiateCycles: Double = 0.0
)

internal fun arpeggioToneIndex(
    elapsedBeats: Double,
    noteCount: Int,
    cyclesPerBeat: Double
): Int {
    if (noteCount <= 1 || cyclesPerBeat <= 0.0) return 0
    val slot = floor(elapsedBeats.coerceAtLeast(0.0) * noteCount * cyclesPerBeat).toLong()
    return (slot % noteCount).toInt()
}

internal fun arpeggioSlotProgress(
    elapsedBeats: Double,
    noteCount: Int,
    cyclesPerBeat: Double
): Double {
    if (noteCount <= 1 || cyclesPerBeat <= 0.0) return 0.0
    val exactSlot = elapsedBeats.coerceAtLeast(0.0) * noteCount * cyclesPerBeat
    return exactSlot - floor(exactSlot)
}

internal enum class QuizPlaybackPhase { STOPPED, BUFFERING, PLAYING, PAUSED, ERROR }

internal data class QuizPlaybackState(
    val phase: QuizPlaybackPhase = QuizPlaybackPhase.STOPPED,
    val beat: Double = 1.0,
    val underrunCount: Int = 0,
    val error: String? = null
)

internal data class RenderedQuizBlock(
    val startBeat: Double,
    val beatsPerFrame: Double,
    val startedEvents: List<RenderedQuizEvent>
)

internal data class RenderedQuizEvent(val id: Long, val frameOffset: Int)

/** Pure, bounded-memory block renderer used by [QuizPlaybackEngine] and unit tests. */
internal class QuizPcmRenderer(
    private var timeline: QuizTimeline,
    initialConfig: QuizPlaybackConfig,
    private val sampleRate: Int = SAMPLE_RATE
) {
    private data class ActiveEvent(
        val event: QuizTimelineEvent,
        val oscillators: List<SynthVoice>,
        var ageFrames: Long = 0,
        var transitionGain: Double = 1.0,
        var transitionFramesRemaining: Int = 0,
        var transitionStep: Double = 0.0,
        val fadingOut: Boolean = false
    )

    private var config = initialConfig.sanitized()
    private var beat = timeline.startBeat
    private var nextEventIndex = 0
    private val activeEvents = mutableListOf<ActiveEvent>()
    private var currentMelodyGain = config.melodyGain.toDouble()
    private var currentChordGain = config.chordGain.toDouble()
    private val crossfadeFrames = (sampleRate * 24 / 1_000.0).roundToInt().coerceAtLeast(1)

    val currentBeat: Double get() = beat
    val currentBeatsPerFrame: Double get() = config.bpm / (60.0 * sampleRate)

    fun replaceTimeline(newTimeline: QuizTimeline, startBeat: Double = newTimeline.startBeat) {
        timeline = newTimeline
        seek(startBeat)
    }

    fun seek(requestedBeat: Double) {
        beat = requestedBeat.coerceIn(timeline.startBeat, timeline.endBeat)
        activeEvents.clear()
        activateEventsAtPosition(fadeIn = false)
        nextEventIndex = timeline.events.indexOfFirst { it.startBeat > beat }
            .let { if (it < 0) timeline.events.size else it }
    }

    fun updateConfig(newConfig: QuizPlaybackConfig) {
        val sanitized = newConfig.sanitized()
        val waveformOrPitchChanged = sanitized.waveform != config.waveform ||
            sanitized.transpose != config.transpose
        val chordModeChanged = sanitized.chordMode != config.chordMode
        val arpeggioChanged = sanitized.arpeggiateCycles != config.arpeggiateCycles
        config = sanitized

        if (waveformOrPitchChanged || chordModeChanged || arpeggioChanged) {
            val affectedLayers = if (waveformOrPitchChanged) {
                QuizAudioLayer.entries.toSet()
            } else {
                setOf(QuizAudioLayer.CHORD)
            }
            activeEvents.filter { !it.fadingOut && it.event.layer in affectedLayers }
                .forEach { current ->
                    val replacementIndex = activeEvents.indexOf(current)
                    activeEvents[replacementIndex] = current.copy(
                        transitionFramesRemaining = crossfadeFrames,
                        transitionStep = -current.transitionGain / crossfadeFrames,
                        fadingOut = true
                    )
                }
            timeline.events
                .filter { event ->
                    event.layer in affectedLayers && event.startBeat <= beat && beat < event.endBeat
                }
                .forEach { event ->
                    createActiveEvent(event, fadeIn = true)?.let(activeEvents::add)
                }
        }
    }

    fun renderInto(buffer: ShortArray, frameCount: Int = buffer.size): RenderedQuizBlock {
        val blockStartBeat = beat
        val startedEvents = mutableListOf<RenderedQuizEvent>()
        val beatsPerFrame = renderSamples(buffer, frameCount, startedEvents)
        return RenderedQuizBlock(blockStartBeat, beatsPerFrame, startedEvents)
    }

    /** Allocation-free render path used by the real-time audio worker. */
    fun renderAudioInto(buffer: ShortArray, frameCount: Int = buffer.size) {
        renderSamples(buffer, frameCount, startedEvents = null)
    }

    private fun renderSamples(
        buffer: ShortArray,
        frameCount: Int,
        startedEvents: MutableList<RenderedQuizEvent>?
    ): Double {
        require(frameCount in 0..buffer.size)
        val beatsPerFrame = currentBeatsPerFrame
        val targetMelodyGain = config.melodyGain.toDouble()
        val targetChordGain = config.chordGain.toDouble()
        val melodyStep = (targetMelodyGain - currentMelodyGain) / frameCount.coerceAtLeast(1)
        val chordStep = (targetChordGain - currentChordGain) / frameCount.coerceAtLeast(1)

        repeat(frameCount) { frame ->
            activateDueEvents(frame, startedEvents)

            var mixed = 0.0
            var activeIndex = 0
            while (activeIndex < activeEvents.size) {
                val active = activeEvents[activeIndex]
                if (beat >= active.event.endBeat) {
                    activeEvents.removeAt(activeIndex)
                    continue
                }
                val remainingBeats = (active.event.endBeat - beat).coerceAtLeast(0.0)
                val remainingFrames = if (config.bpm > 0.0) {
                    remainingBeats * 60.0 * sampleRate / config.bpm
                } else {
                    Double.MAX_VALUE
                }
                val attack = (active.ageFrames / ATTACK_FRAMES.toDouble()).coerceIn(0.0, 1.0)
                val release = (remainingFrames / RELEASE_FRAMES).coerceIn(0.0, 1.0)
                val envelope = minOf(attack, release)
                val elapsedSeconds = active.ageFrames / sampleRate.toDouble()
                val layerGain = if (active.event.layer == QuizAudioLayer.MELODY) {
                    currentMelodyGain
                } else {
                    currentChordGain
                }
                val isArpeggiatedChord = active.event.layer == QuizAudioLayer.CHORD &&
                    config.arpeggiateCycles > 0.0 && active.oscillators.size > 1
                val oscillatorSum = if (isArpeggiatedChord) {
                    val elapsedBeats = (beat - active.event.startBeat).coerceAtLeast(0.0)
                    val slotProgress = arpeggioSlotProgress(
                        elapsedBeats,
                        active.oscillators.size,
                        config.arpeggiateCycles
                    )
                    val slotEnvelope = minOf(
                        (slotProgress / 0.08).coerceIn(0.0, 1.0),
                        ((1.0 - slotProgress) / 0.12).coerceIn(0.0, 1.0)
                    )
                    val toneIndex = arpeggioToneIndex(
                        elapsedBeats,
                        active.oscillators.size,
                        config.arpeggiateCycles
                    )
                    active.oscillators[toneIndex]
                        .nextSample(envelope * slotEnvelope, elapsedSeconds, arpeggiated = true) *
                        NOTE_GAIN * slotEnvelope
                } else {
                    var sum = 0.0
                    var oscillatorIndex = 0
                    while (oscillatorIndex < active.oscillators.size) {
                        sum += active.oscillators[oscillatorIndex]
                            .nextSample(envelope, elapsedSeconds) * NOTE_GAIN
                        oscillatorIndex++
                    }
                    sum
                }
                mixed += oscillatorSum * envelope * active.transitionGain * layerGain
                active.ageFrames++

                if (active.transitionFramesRemaining > 0) {
                    active.transitionFramesRemaining--
                    active.transitionGain = (active.transitionGain + active.transitionStep).coerceIn(0.0, 1.0)
                    if (active.fadingOut && active.transitionFramesRemaining == 0) {
                        activeEvents.removeAt(activeIndex)
                        continue
                    }
                }
                activeIndex++
            }

            buffer[frame] = (mixed * Short.MAX_VALUE)
                .roundToInt()
                .coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
                .toShort()
            currentMelodyGain += melodyStep
            currentChordGain += chordStep
            advanceBeat(beatsPerFrame)
        }

        currentMelodyGain = targetMelodyGain
        currentChordGain = targetChordGain
        return beatsPerFrame
    }

    private fun advanceBeat(beatsPerFrame: Double) {
        if (beatsPerFrame <= 0.0) return
        beat += beatsPerFrame
        if (beat + BEAT_EPSILON >= timeline.endBeat) {
            val loopLength = timeline.endBeat - timeline.startBeat
            val overshoot = (beat - timeline.endBeat).coerceAtLeast(0.0)
            beat = timeline.startBeat + (overshoot % loopLength)
            activeEvents.clear()
            nextEventIndex = timeline.events.indexOfFirst { it.startBeat >= timeline.startBeat }
                .let { if (it < 0) timeline.events.size else it }
        }
    }

    private fun activateDueEvents(
        frameOffset: Int,
        startedEvents: MutableList<RenderedQuizEvent>?
    ) {
        while (nextEventIndex < timeline.events.size) {
            val event = timeline.events[nextEventIndex]
            if (event.startBeat > beat + BEAT_EPSILON) break
            nextEventIndex++
            if (beat < event.endBeat) {
                createActiveEvent(event, fadeIn = false)?.let { active ->
                    activeEvents.add(active)
                    startedEvents?.add(RenderedQuizEvent(event.id, frameOffset))
                }
            }
        }
    }

    private fun activateEventsAtPosition(fadeIn: Boolean) {
        timeline.events
            .filter { event -> event.startBeat <= beat && beat < event.endBeat }
            .forEach { event -> createActiveEvent(event, fadeIn)?.let(activeEvents::add) }
    }

    private fun createActiveEvent(event: QuizTimelineEvent, fadeIn: Boolean): ActiveEvent? {
        val midiNotes = if (
            event.layer == QuizAudioLayer.CHORD && config.chordMode == QuizChordMode.ROOT_ONLY
        ) {
            event.rootMidiNote?.let { intArrayOf(it) } ?: intArrayOf()
        } else {
            event.fullMidiNotes
        }
        if (midiNotes.isEmpty()) return null
        val oscillators = midiNotes
            .filter { it > 0 }
            .map { midi ->
                val transposed = midi + config.transpose
                val frequency = 440.0 * Math.pow(2.0, (transposed - 69) / 12.0)
                SynthVoice(frequency, config.waveform, sampleRate)
            }
        if (oscillators.isEmpty()) return null
        return ActiveEvent(
            event = event,
            oscillators = oscillators,
            transitionGain = if (fadeIn) 0.0 else 1.0,
            transitionFramesRemaining = if (fadeIn) crossfadeFrames else 0,
            transitionStep = if (fadeIn) 1.0 / crossfadeFrames else 0.0
        )
    }

    private fun QuizPlaybackConfig.sanitized(): QuizPlaybackConfig = copy(
        bpm = bpm.coerceAtLeast(0.0),
        melodyGain = melodyGain.coerceIn(0f, 1f),
        chordGain = chordGain.coerceIn(0f, 1f),
        arpeggiateCycles = arpeggiateCycles.coerceIn(0.0, 4.0)
    )

    companion object {
        const val SAMPLE_RATE = 44_100
        private const val NOTE_GAIN = 0.15
        private const val ATTACK_FRAMES = 200
        private const val RELEASE_FRAMES = 1_000.0
        private const val BEAT_EPSILON = 1e-9
    }
}

internal interface QuizAudioSink {
    val playbackHeadFrames: Long
    val underrunCount: Int
    fun setBufferSizeInFrames(frames: Int): Int
    fun write(samples: ShortArray, offset: Int, size: Int): Int
    fun play()
    fun pause()
    fun flush()
    fun release()
}

private class AndroidQuizAudioSink(private val track: AudioTrack) : QuizAudioSink {
    override val playbackHeadFrames: Long
        get() = track.playbackHeadPosition.toLong() and 0xffff_ffffL
    override val underrunCount: Int get() = track.underrunCount
    override fun setBufferSizeInFrames(frames: Int): Int = track.setBufferSizeInFrames(frames)
    override fun write(samples: ShortArray, offset: Int, size: Int): Int =
        track.write(samples, offset, size, AudioTrack.WRITE_BLOCKING)
    override fun play() = track.play()
    override fun pause() = track.pause()
    override fun flush() = track.flush()
    override fun release() = track.release()
}

internal class QuizPlaybackEngine(
    initialConfig: QuizPlaybackConfig,
    private val sampleRate: Int = QuizPcmRenderer.SAMPLE_RATE,
    private val sinkFactory: (capacityFrames: Int) -> QuizAudioSink = { capacityFrames ->
        createAndroidSink(capacityFrames)
    }
) {
    private sealed interface Command {
        data class Load(
            val timeline: QuizTimeline,
            val continuePlaying: Boolean,
            val revision: Long
        ) : Command
        data class Play(val revision: Long) : Command
        data class Pause(val revision: Long) : Command
        data class Seek(val beat: Double, val resume: Boolean, val revision: Long) : Command
        data class Reset(val revision: Long) : Command
        data object ConfigChanged : Command
        data object Release : Command
    }

    private data class ClockSegment(
        val startFrame: Long,
        val startBeat: Double,
        val beatsPerFrame: Double,
        val loopStart: Double,
        val loopEnd: Double
    )

    private class AudioWriteException(val code: Int) : Exception("AudioTrack write failed: $code")

    private val latestConfig = AtomicReference(initialConfig)
    private val latestTimeline = AtomicReference<QuizTimeline?>(null)
    private val configSignalQueued = AtomicBoolean(false)
    // Updated on the calling thread before transport commands are queued. UI gestures
    // must not infer intent from StateFlow, whose phase necessarily trails the command
    // queue while the audio worker finishes a blocking write.
    private val playbackRequested = AtomicBoolean(false)
    private val transportRevision = AtomicLong(0L)
    private val commands = LinkedBlockingQueue<Command>()
    private val released = AtomicBoolean(false)
    private val mutableState = MutableStateFlow(QuizPlaybackState())
    val state: StateFlow<QuizPlaybackState> = mutableState.asStateFlow()

    private val worker = thread(start = true, name = "QuizAudio") {
        Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
        runWorker()
    }

    /**
     * Whether the transport is meant to be sounding right now. Reads the intent recorded
     * by the last transport command instead of the published phase, which trails the
     * command queue, so a caller that must preserve the transport across a reload sees
     * the state the user last asked for rather than the one the worker has caught up to.
     */
    val isPlaybackRequested: Boolean get() = playbackRequested.get()

    fun load(timeline: QuizTimeline, continuePlaying: Boolean) {
        val revision = transportRevision.incrementAndGet()
        latestTimeline.set(timeline)
        playbackRequested.set(continuePlaying)
        mutableState.value = mutableState.value.copy(
            beat = timeline.startBeat,
            error = null
        )
        offer(Command.Load(timeline, continuePlaying, revision))
    }

    fun play() {
        val revision = transportRevision.incrementAndGet()
        playbackRequested.set(true)
        offer(Command.Play(revision))
    }

    fun pause() {
        val revision = transportRevision.incrementAndGet()
        playbackRequested.set(false)
        offer(Command.Pause(revision))
    }

    /** Pauses immediately and returns whether this scrub session should resume. */
    fun pauseForScrub(): Boolean {
        val revision = transportRevision.incrementAndGet()
        val resumeAfterScrub = playbackRequested.getAndSet(false)
        offer(Command.Pause(revision))
        return resumeAfterScrub
    }

    fun seek(beat: Double, resume: Boolean) {
        val revision = transportRevision.incrementAndGet()
        val timeline = latestTimeline.get()
        val boundedBeat = timeline?.let { beat.coerceIn(it.startBeat, it.endBeat) } ?: beat
        playbackRequested.set(resume)
        mutableState.value = mutableState.value.copy(
            beat = boundedBeat,
            error = null
        )
        offer(Command.Seek(boundedBeat, resume, revision))
    }

    fun reset() {
        val revision = transportRevision.incrementAndGet()
        playbackRequested.set(false)
        val startBeat = latestTimeline.get()?.startBeat ?: 1.0
        mutableState.value = mutableState.value.copy(
            beat = startBeat,
            error = null
        )
        offer(Command.Reset(revision))
    }

    fun updateConfig(config: QuizPlaybackConfig) {
        latestConfig.set(config)
        if (configSignalQueued.compareAndSet(false, true)) offer(Command.ConfigChanged)
    }

    fun release() {
        if (released.compareAndSet(false, true)) {
            playbackRequested.set(false)
            commands.offer(Command.Release)
            worker.interrupt()
            try {
                worker.join(RELEASE_JOIN_MS)
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
            }
        }
    }

    private fun offer(command: Command) {
        if (!released.get()) commands.offer(command)
    }

    @Suppress("LongMethod")
    private fun runWorker() {
        var timeline: QuizTimeline? = null
        var renderer: QuizPcmRenderer? = null
        var sink: QuizAudioSink? = null
        var playRequested = false
        var sinkStarted = false
        var running = true
        var targetBufferFrames = framesForMs(INITIAL_BUFFER_MS)
        val capacityFrames = framesForMs(MAX_BUFFER_MS)
        var lastUnderrunCount = 0
        var totalFramesWritten = 0L
        var headOriginRaw = 0L
        var lastRawHead = 0L
        var headWraps = 0L
        var lastStateUpdateNanos = 0L
        var deadObjectRecoveries = 0
        var activeTransportRevision = 0L
        val clockSegments = ArrayDeque<ClockSegment>()
        val block = ShortArray(BLOCK_FRAMES)

        fun resetClock() {
            totalFramesWritten = 0L
            headOriginRaw = sink?.playbackHeadFrames ?: 0L
            lastRawHead = headOriginRaw
            headWraps = 0L
            clockSegments.clear()
        }

        fun unwrappedPlaybackHead(): Long {
            val raw = sink?.playbackHeadFrames ?: 0L
            if (raw < lastRawHead && lastRawHead - raw > 0x7fff_ffffL) headWraps++
            lastRawHead = raw
            return (raw + (headWraps shl 32) - headOriginRaw).coerceAtLeast(0L)
        }

        fun audibleBeat(): Double {
            val activeTimeline = timeline ?: return 1.0
            if (!sinkStarted || clockSegments.isEmpty()) {
                clockSegments.firstOrNull()?.let { return it.startBeat }
                return renderer?.currentBeat?.coerceIn(activeTimeline.startBeat, activeTimeline.endBeat)
                    ?: activeTimeline.startBeat
            }
            val head = unwrappedPlaybackHead()
            while (clockSegments.size > 1) {
                val iterator = clockSegments.iterator()
                iterator.next()
                val second = iterator.next()
                if (second.startFrame <= head) clockSegments.removeFirst() else break
            }
            val segment = clockSegments.firstOrNull() ?: return activeTimeline.startBeat
            val loopLength = segment.loopEnd - segment.loopStart
            if (loopLength <= 0.0) return segment.loopStart
            val advanced = (head - segment.startFrame).coerceAtLeast(0L) * segment.beatsPerFrame
            return segment.loopStart + ((segment.startBeat - segment.loopStart + advanced) % loopLength)
        }

        fun publish(phase: QuizPlaybackPhase, error: String? = null, force: Boolean = false) {
            // A newer UI transport command may already have published its target beat.
            // Never let completion of an older pause/seek overwrite that position.
            if (activeTransportRevision < transportRevision.get()) return
            val now = System.nanoTime()
            if (!force && now - lastStateUpdateNanos < STATE_UPDATE_NANOS) return
            lastStateUpdateNanos = now
            mutableState.value = QuizPlaybackState(
                phase = phase,
                beat = audibleBeat(),
                underrunCount = sink?.underrunCount ?: lastUnderrunCount,
                error = error
            )
        }

        fun closeSink() {
            try {
                sink?.pause()
                sink?.flush()
                sink?.release()
            } catch (_: Exception) {
            }
            sink = null
            sinkStarted = false
            resetClock()
        }

        fun pauseAndReanchor(): Double {
            val anchoredBeat = audibleBeat()
            try {
                sink?.pause()
                sink?.flush()
            } catch (_: Exception) {
            }
            sinkStarted = false
            renderer?.seek(anchoredBeat)
            resetClock()
            return anchoredBeat
        }

        fun ensureSink() {
            if (sink == null) {
                sink = sinkFactory(capacityFrames).also { created ->
                    val actual = created.setBufferSizeInFrames(targetBufferFrames)
                    if (actual > 0) targetBufferFrames = actual.coerceAtMost(capacityFrames)
                    lastUnderrunCount = created.underrunCount
                }
            }
        }

        fun writeFully(samples: ShortArray, count: Int) {
            var offset = 0
            while (offset < count) {
                val written = sink?.write(samples, offset, count - offset)
                    ?: throw AudioWriteException(AudioTrack.ERROR_DEAD_OBJECT)
                if (written <= 0) throw AudioWriteException(written)
                offset += written
            }
        }

        fun renderAndWrite(activeRenderer: QuizPcmRenderer, count: Int) {
            val blockStartBeat = activeRenderer.currentBeat
            val beatsPerFrame = activeRenderer.currentBeatsPerFrame
            val previousSegment = clockSegments.peekLast()
            if (previousSegment == null || previousSegment.beatsPerFrame != beatsPerFrame) {
                clockSegments.addLast(
                    ClockSegment(
                        startFrame = totalFramesWritten,
                        startBeat = blockStartBeat,
                        beatsPerFrame = beatsPerFrame,
                        loopStart = timeline!!.startBeat,
                        loopEnd = timeline!!.endBeat
                    )
                )
            }
            activeRenderer.renderAudioInto(block, count)
            writeFully(block, count)
            totalFramesWritten += count
            while (clockSegments.size > MAX_CLOCK_SEGMENTS) clockSegments.removeFirst()
        }

        fun prime(activeRenderer: QuizPcmRenderer): Boolean {
            publish(QuizPlaybackPhase.BUFFERING, force = true)
            val primeStartBeat = activeRenderer.currentBeat
            var primed = 0
            while (primed < targetBufferFrames) {
                val count = minOf(BLOCK_FRAMES, targetBufferFrames - primed)
                renderAndWrite(activeRenderer, count)
                primed += count
            }
            if (commands.isNotEmpty()) {
                try {
                    sink?.flush()
                } catch (_: Exception) {
                }
                activeRenderer.seek(primeStartBeat)
                resetClock()
                return false
            }
            sink?.play()
            sinkStarted = true
            publish(QuizPlaybackPhase.PLAYING, force = true)
            return true
        }

        fun handle(command: Command) {
            when (command) {
                is Command.Load -> activeTransportRevision = command.revision
                is Command.Play -> activeTransportRevision = command.revision
                is Command.Pause -> activeTransportRevision = command.revision
                is Command.Seek -> activeTransportRevision = command.revision
                is Command.Reset -> activeTransportRevision = command.revision
                Command.ConfigChanged, Command.Release -> Unit
            }
            when (command) {
                is Command.Load -> {
                    pauseAndReanchor()
                    timeline = command.timeline
                    renderer = QuizPcmRenderer(command.timeline, latestConfig.get(), sampleRate)
                    playRequested = command.continuePlaying
                    deadObjectRecoveries = 0
                    publish(
                        if (playRequested && latestConfig.get().bpm > 0.0) {
                            QuizPlaybackPhase.BUFFERING
                        } else {
                            QuizPlaybackPhase.STOPPED
                        },
                        force = true
                    )
                }

                is Command.Play -> {
                    playRequested = true
                    publish(
                        if (latestConfig.get().bpm > 0.0) QuizPlaybackPhase.BUFFERING
                        else QuizPlaybackPhase.PAUSED,
                        force = true
                    )
                }

                is Command.Pause -> {
                    playRequested = false
                    pauseAndReanchor()
                    publish(QuizPlaybackPhase.PAUSED, force = true)
                }

                is Command.Seek -> {
                    pauseAndReanchor()
                    renderer?.seek(command.beat)
                    playRequested = command.resume
                    publish(
                        if (playRequested && latestConfig.get().bpm > 0.0) {
                            QuizPlaybackPhase.BUFFERING
                        } else {
                            QuizPlaybackPhase.PAUSED
                        },
                        force = true
                    )
                }

                is Command.Reset -> {
                    playRequested = false
                    pauseAndReanchor()
                    renderer?.seek(timeline?.startBeat ?: 1.0)
                    publish(QuizPlaybackPhase.STOPPED, force = true)
                }

                Command.ConfigChanged -> {
                    configSignalQueued.set(false)
                    val updated = latestConfig.get()
                    if (updated.bpm <= 0.0 && sinkStarted) pauseAndReanchor()
                    renderer?.updateConfig(updated)
                    if (playRequested && updated.bpm <= 0.0) {
                        publish(QuizPlaybackPhase.PAUSED, force = true)
                    }
                }

                Command.Release -> running = false
            }
        }

        try {
            while (running) {
                var command = commands.poll()
                if (command == null && (!playRequested || latestConfig.get().bpm <= 0.0 || renderer == null)) {
                    try {
                        command = commands.take()
                    } catch (_: InterruptedException) {
                        command = commands.poll()
                    }
                }
                while (command != null) {
                    handle(command)
                    if (!running) break
                    command = commands.poll()
                }
                if (!running) break

                val activeRenderer = renderer
                if (!playRequested || latestConfig.get().bpm <= 0.0 || activeRenderer == null) continue

                try {
                    ensureSink()
                    if (!sinkStarted && !prime(activeRenderer)) continue
                    renderAndWrite(activeRenderer, BLOCK_FRAMES)
                    deadObjectRecoveries = 0

                    val underruns = sink?.underrunCount ?: lastUnderrunCount
                    if (underruns > lastUnderrunCount && targetBufferFrames < capacityFrames) {
                        targetBufferFrames = minOf(
                            capacityFrames,
                            targetBufferFrames + framesForMs(BUFFER_GROWTH_MS)
                        )
                        sink?.setBufferSizeInFrames(targetBufferFrames)
                        Log.w(TAG, "Quiz audio underrun; growing buffer to $targetBufferFrames frames")
                    }
                    lastUnderrunCount = underruns
                    publish(QuizPlaybackPhase.PLAYING)
                } catch (writeError: AudioWriteException) {
                    val canRecover = writeError.code == AudioTrack.ERROR_DEAD_OBJECT && deadObjectRecoveries < 1
                    val restartBeat = audibleBeat()
                    closeSink()
                    activeRenderer.seek(restartBeat)
                    if (canRecover) {
                        deadObjectRecoveries++
                        Log.w(TAG, "Recreating dead quiz AudioTrack at beat $restartBeat")
                    } else {
                        playRequested = false
                        playbackRequested.set(false)
                        val message = "Quiz audio write failed (${writeError.code})"
                        Log.e(TAG, message)
                        publish(QuizPlaybackPhase.ERROR, message, force = true)
                    }
                } catch (error: Exception) {
                    playRequested = false
                    playbackRequested.set(false)
                    closeSink()
                    val message = error.message ?: "Quiz audio initialization failed"
                    Log.e(TAG, message, error)
                    publish(QuizPlaybackPhase.ERROR, message, force = true)
                }
            }
        } finally {
            closeSink()
        }
    }

    private fun framesForMs(milliseconds: Int): Int =
        (sampleRate.toLong() * milliseconds / 1_000L).toInt().coerceAtLeast(BLOCK_FRAMES)

    companion object {
        private const val TAG = "QuizPlaybackEngine"
        private const val BLOCK_FRAMES = 256
        private const val INITIAL_BUFFER_MS = 80
        private const val BUFFER_GROWTH_MS = 40
        private const val MAX_BUFFER_MS = 200
        private const val MAX_CLOCK_SEGMENTS = 512
        private const val STATE_UPDATE_NANOS = 16_666_667L
        private const val RELEASE_JOIN_MS = 1_000L

        private fun createAndroidSink(capacityFrames: Int): QuizAudioSink {
            val minBytes = AudioTrack.getMinBufferSize(
                QuizPcmRenderer.SAMPLE_RATE,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            )
            require(minBytes > 0) { "AudioTrack reported invalid minimum buffer: $minBytes" }
            val capacityBytes = max(minBytes, capacityFrames * Short.SIZE_BYTES)
            val track = AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(QuizPcmRenderer.SAMPLE_RATE)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build()
                )
                .setBufferSizeInBytes(capacityBytes)
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()
            check(track.state == AudioTrack.STATE_INITIALIZED) { "Quiz AudioTrack failed to initialize" }
            return AndroidQuizAudioSink(track)
        }
    }
}

internal fun buildQuizTimeline(
    section: ExtractedSection,
    melody: List<MelodyNote>,
    endBeat: Double
): QuizTimeline {
    var nextId = 1L
    val events = buildList {
        melody.forEach { note ->
            val noteEnd = note.beat + note.duration
            if (!note.isRest && note.duration > 0.0 && noteEnd > 1.0) {
                val key = section.getKeyAtBeat(note.beat)
                val midi = MusicTheory.getMidiNote(note.sd, note.octave, key)
                if (midi > 0) {
                    add(
                        QuizTimelineEvent(
                            id = nextId++,
                            startBeat = note.beat.coerceAtLeast(1.0),
                            endBeat = noteEnd.coerceAtMost(endBeat),
                            layer = QuizAudioLayer.MELODY,
                            fullMidiNotes = intArrayOf(midi)
                        )
                    )
                }
            }
        }
        section.chords.forEach { chord ->
            val beat = normalizePlaybackBeat(
                (chord["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
            )
            val duration = (chord["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
            val chordEnd = beat + duration
            val isRest = (chord["isRest"] as? JsonPrimitive)?.booleanOrNull == true ||
                (chord["rest"] as? JsonPrimitive)?.booleanOrNull == true
            if (!isRest && duration > 0.0 && chordEnd > 1.0) {
                val key = section.getKeyAtBeat(beat)
                val fullNotes = ChordInterpreter.getChordNotes(chord, key).filter { it > 0 }.toIntArray()
                val root = ChordInterpreter.resolveChordRoot(chord, key)
                    ?.simpleModePitch
                    ?.toAudioNoteNumber()
                if (fullNotes.isNotEmpty() || root != null) {
                    add(
                        QuizTimelineEvent(
                            id = nextId++,
                            startBeat = beat.coerceAtLeast(1.0),
                            endBeat = chordEnd.coerceAtMost(endBeat),
                            layer = QuizAudioLayer.CHORD,
                            fullMidiNotes = fullNotes,
                            rootMidiNote = root
                        )
                    )
                }
            }
        }
    }.filter { it.endBeat > it.startBeat }
        .sortedWith(compareBy<QuizTimelineEvent> { it.startBeat }.thenBy { it.id })

    return QuizTimeline(endBeat = endBeat, events = events)
}
