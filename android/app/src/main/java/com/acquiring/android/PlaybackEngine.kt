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

internal enum class PlaybackAudioLayer { MELODY, CHORD }

internal enum class PlaybackChordMode { FULL, ROOT_ONLY }

internal const val DEFAULT_PLAYBACK_VOICE_VOLUME = 0.5f

enum class PlaybackRootDegreeCue {
    OFF, ROOT_PULSES, HARMONIC_DISTANCE, SPOKEN_NUMBER, SUNG_NUMBER_WITH_DETAILS, MELODY_FUNCTION, MELODY_CHORD_TONE;

    internal val pulsesRoots: Boolean
        get() = this == ROOT_PULSES || this == HARMONIC_DISTANCE

    internal val speaksRootDegree: Boolean
        get() = this == SPOKEN_NUMBER || this == SUNG_NUMBER_WITH_DETAILS

    internal val speaksMelodyFunction: Boolean
        get() = this == MELODY_FUNCTION || this == MELODY_CHORD_TONE

    /** Mode names belong to the root-degree readings, not the melody-function option. */
    internal val announcesMode: Boolean
        get() = speaksRootDegree

    internal val usesVoice: Boolean
        get() = speaksRootDegree || speaksMelodyFunction
}

internal fun spokenModeName(scale: String): String =
    scale.replace(Regex("([a-z])([A-Z])"), "$1 $2").lowercase()

internal fun modeAnnouncement(
    previousScale: String?,
    currentScale: String?,
    cue: PlaybackRootDegreeCue,
    majorLocked: Boolean
): String? {
    if (majorLocked || currentScale.isNullOrEmpty() || !cue.announcesMode) return null
    if (previousScale == null || previousScale == currentScale) return null
    return spokenModeName(currentScale)
}

internal fun PlaybackTimelineEvent.harmonicPulseCount(majorLocked: Boolean): Int =
    if (majorLocked) fifthsFromMajorTonic else fifthsFromKeyTonic

internal data class PlaybackTimelineEvent(
    val id: Long,
    val startBeat: Double,
    val endBeat: Double,
    val layer: PlaybackAudioLayer,
    val fullMidiNotes: IntArray,
    val rootMidiNote: Int? = null,
    val rootDegree: Int? = null,
    val rootDegreeAlteration: Int = 0,
    val fullChordRootMidiNote: Int? = null,
    val spokenChordSuffix: SpokenChordSuffix? = null,
    val relativeMajorRootDegree: RelativeIonianDegree? = null,
    val fifthsFromKeyTonic: Int = 0,
    val fifthsFromMajorTonic: Int = 0,
    val keyScale: String? = null,
    val spokenMelodyCue: String? = null,
    val melodyCueMidi: Int? = null
)

internal data class PlaybackTimeline(
    val startBeat: Double = 1.0,
    val endBeat: Double,
    val events: List<PlaybackTimelineEvent>,
    val completionKey: String? = null
) {
    init {
        require(endBeat > startBeat)
    }
}

/** Same notes and bounds. A Loop/Song toggle copies the timeline and changes only [PlaybackTimeline.completionKey]. */
internal fun PlaybackTimeline.samePerformanceAs(other: PlaybackTimeline): Boolean =
    startBeat == other.startBeat && endBeat == other.endBeat && events === other.events

internal data class PlaybackConfig(
    val bpm: Double,
    val transpose: Int,
    val waveform: AudioEngine.Waveform,
    val chordMode: PlaybackChordMode,
    val melodyGain: Float,
    val chordGain: Float,
    val arpeggiateCycles: Double = 0.0,
    val rootDegreeCue: PlaybackRootDegreeCue = PlaybackRootDegreeCue.OFF,
    val useRelativeIonianContext: Boolean = false,
    val voiceVolume: Float = DEFAULT_PLAYBACK_VOICE_VOLUME
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

internal enum class PlaybackPhase { STOPPED, BUFFERING, PLAYING, PAUSED, COMPLETED, ERROR }

internal data class PlaybackState(
    val phase: PlaybackPhase = PlaybackPhase.STOPPED,
    val beat: Double = 1.0,
    val underrunCount: Int = 0,
    val error: String? = null,
    val completionKey: String? = null,
    val transportRevision: Long = 0,
    val performanceId: String? = null
)

/** Next song section, already rendered into the same PCM stream at the boundary. */
internal data class QueuedSection(
    val timeline: PlaybackTimeline,
    val bpm: Double,
    val performanceId: String
)

internal data class PlaybackSplice(
    val frame: Int,
    val beat: Double,
    val beatsPerFrame: Double,
    val loopStart: Double,
    val loopEnd: Double,
    val performanceId: String,
    val timeline: PlaybackTimeline
)

internal data class RenderedPlaybackBlock(
    val startBeat: Double,
    val beatsPerFrame: Double,
    val startedEvents: List<RenderedPlaybackEvent>
)

internal data class RenderedPlaybackEvent(val id: Long, val frameOffset: Int)

/** Pure, bounded-memory block renderer used by [PlaybackEngine] and unit tests. */
internal class PlaybackPcmRenderer(
    private var timeline: PlaybackTimeline,
    initialConfig: PlaybackConfig,
    private val sampleRate: Int = AppAudioOutput.sampleRate,
    private val spokenRootDegrees: SpokenRootDegreeClips = SpokenRootDegreeClips()
) {
    private data class ActiveEvent(
        val event: PlaybackTimelineEvent,
        val oscillators: List<SynthVoice>,
        val rootPulses: List<List<SynthVoice>>,
        val arpeggiateCycles: Double,
        var ageFrames: Long = 0,
        var transitionGain: Double = 1.0,
        var transitionFramesRemaining: Int = 0,
        var transitionStep: Double = 0.0,
        val fadingOut: Boolean = false
    )

    private data class SpokenNumber(
        val event: PlaybackTimelineEvent,
        val samples: ShortArray,
        val anchorBeat: Double,
        val anchorPosition: Double,
        val samplesPerBeat: Double,
        var renderedFrames: Int = 0
    ) {
        fun positionAt(beat: Double): Double =
            (anchorPosition + (beat - anchorBeat) * samplesPerBeat).coerceAtLeast(0.0)
    }

    private val phraseCache = SpokenPhraseCache(spokenRootDegrees)
    private var lastVoiceScale: String? = null
    private val preparedVoices = mutableMapOf<Long, ShortArray>()
    private var config = initialConfig.sanitized()
    private var beat = timeline.startBeat
    private var nextEventIndex = 0
    private val activeEvents = mutableListOf<ActiveEvent>()
    private var spokenNumber: SpokenNumber? = null
    private var currentMelodyGain = config.melodyGain.toDouble()
    private var currentChordGain = config.chordGain.toDouble()
    private var currentVoiceGain = config.voiceVolume * 0.8
    private val crossfadeFrames = (sampleRate * 24 / 1_000.0).roundToInt().coerceAtLeast(1)
    internal var continuation: ArrayDeque<QueuedSection>? = null
    private val splices = ArrayList<PlaybackSplice>(2)

    val currentBeat: Double get() = beat
    val finished: Boolean get() = timeline.completionKey != null && beat >= timeline.endBeat
    val currentBeatsPerFrame: Double get() = config.bpm / (60.0 * sampleRate)

    fun replaceTimeline(newTimeline: PlaybackTimeline, startBeat: Double = newTimeline.startBeat) {
        val samePerformance = timeline.samePerformanceAs(newTimeline)
        timeline = newTimeline
        if (!samePerformance) {
            lastVoiceScale = null
            seek(startBeat)
        }
    }

    fun seek(requestedBeat: Double, preserveVoiceProgress: Boolean = false) {
        val previousVoice = spokenNumber.takeIf { preserveVoiceProgress }
        beat = requestedBeat.coerceIn(timeline.startBeat, timeline.endBeat)
        activeEvents.clear()
        spokenNumber = null
        activateEventsAtPosition(fadeIn = false)
        if (previousVoice != null && spokenNumber?.event?.id == previousVoice.event.id) {
            spokenNumber = previousVoice.copy(renderedFrames = 0)
        }
        nextEventIndex = timeline.events.indexOfFirst { it.startBeat > beat }
            .let { if (it < 0) timeline.events.size else it }
    }

    fun updateConfig(newConfig: PlaybackConfig) {
        val sanitized = newConfig.sanitized()
        val pitchChanged = sanitized.transpose != config.transpose
        val waveformOrPitchChanged = sanitized.waveform != config.waveform || pitchChanged
        val chordModeChanged = sanitized.chordMode != config.chordMode
        val arpeggioChanged = sanitized.arpeggiateCycles != config.arpeggiateCycles
        val cueChanged = sanitized.rootDegreeCue != config.rootDegreeCue
        val lockChanged = sanitized.useRelativeIonianContext != config.useRelativeIonianContext
        val rootPulsesChanged = sanitized.rootDegreeCue.pulsesRoots != config.rootDegreeCue.pulsesRoots ||
            (sanitized.rootDegreeCue.pulsesRoots && cueChanged) ||
            (sanitized.rootDegreeCue == PlaybackRootDegreeCue.HARMONIC_DISTANCE && lockChanged)
        val voiceChanged = cueChanged || pitchChanged || chordModeChanged ||
            sanitized.useRelativeIonianContext != config.useRelativeIonianContext
        val tempoChanged = sanitized.bpm != config.bpm
        val previousVoice = spokenNumber
        config = sanitized

        if (voiceChanged || tempoChanged) {
            preparedVoices.clear()
            if (!config.rootDegreeCue.usesVoice) {
                spokenNumber = null
            } else if (config.bpm > 0.0) {
                val speaking = timeline.events.lastOrNull { event ->
                    beat >= event.startBeat && beat < event.endBeat && event.speaksFor(config.rootDegreeCue)
                }
                spokenNumber = null
                if (speaking != null) {
                    val samples = prepareVoice(speaking)
                    val previous = previousVoice?.takeIf { it.event.id == speaking.id }
                    val phase = previous?.let { it.positionAt(beat) / it.samples.size }
                    startSpokenNumber(speaking, samples, phase)
                }
            }
        }
        if (waveformOrPitchChanged || chordModeChanged || arpeggioChanged || rootPulsesChanged) {
            val affectedLayers = if (waveformOrPitchChanged) {
                PlaybackAudioLayer.entries.toSet()
            } else {
                setOf(PlaybackAudioLayer.CHORD)
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

    fun renderInto(buffer: ShortArray, frameCount: Int = buffer.size): RenderedPlaybackBlock {
        val blockStartBeat = beat
        val startedEvents = mutableListOf<RenderedPlaybackEvent>()
        val beatsPerFrame = renderSamples(buffer, frameCount, startedEvents)
        return RenderedPlaybackBlock(blockStartBeat, beatsPerFrame, startedEvents)
    }

    /** Render path without event reporting, used by the audio worker. */
    fun renderAudioInto(buffer: ShortArray, frameCount: Int = buffer.size) {
        renderSamples(buffer, frameCount, startedEvents = null)
    }

    private fun renderSamples(
        buffer: ShortArray,
        frameCount: Int,
        startedEvents: MutableList<RenderedPlaybackEvent>?
    ): Double {
        require(frameCount in 0..buffer.size)
        val beatsPerFrame = currentBeatsPerFrame
        prepareVoicesForBlock(frameCount * beatsPerFrame)
        val targetMelodyGain = config.melodyGain.toDouble()
        val targetChordGain = config.chordGain.toDouble()
        val targetVoiceGain = config.voiceVolume * 0.8
        val melodyStep = (targetMelodyGain - currentMelodyGain) / frameCount.coerceAtLeast(1)
        val chordStep = (targetChordGain - currentChordGain) / frameCount.coerceAtLeast(1)
        val voiceStep = (targetVoiceGain - currentVoiceGain) / frameCount.coerceAtLeast(1)

        repeat(frameCount) { frame ->
            val frameBeats = currentBeatsPerFrame
            activateDueEvents(frame, startedEvents)

            var mixed = renderSpokenNumber(frameBeats) * currentVoiceGain
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
                val layerGain = if (active.event.layer == PlaybackAudioLayer.MELODY) {
                    currentMelodyGain
                } else {
                    currentChordGain
                }
                val oscillatorSum = if (active.arpeggiateCycles > 0.0) {
                    val elapsedBeats = (beat - active.event.startBeat).coerceAtLeast(0.0)
                    val slotProgress = arpeggioSlotProgress(
                        elapsedBeats,
                        active.oscillators.size,
                        active.arpeggiateCycles
                    )
                    val slotEnvelope = minOf(
                        (slotProgress / 0.08).coerceIn(0.0, 1.0),
                        ((1.0 - slotProgress) / 0.12).coerceIn(0.0, 1.0)
                    )
                    val toneIndex = arpeggioToneIndex(
                        elapsedBeats,
                        active.oscillators.size,
                        active.arpeggiateCycles
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
                    if (active.rootPulses.isEmpty()) sum else sum + renderRootPulse(active, envelope)
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
            currentVoiceGain += voiceStep
            advanceBeat(frameBeats, frame)
        }

        currentMelodyGain = targetMelodyGain
        currentChordGain = targetChordGain
        currentVoiceGain = targetVoiceGain
        return beatsPerFrame
    }

    private fun renderRootPulse(active: ActiveEvent, envelope: Double): Double {
        val event = active.event
        val duration = event.endBeat - event.startBeat
        val pulseCount = active.rootPulses.size
        // Roundoff near the exclusive end must never wrap back to pulse one.
        val slot = ((beat - event.startBeat) / duration * pulseCount)
            .coerceIn(0.0, Math.nextDown(pulseCount.toDouble()))
        val index = slot.toInt()
        val progress = slot - index
        if (progress >= 0.8) return 0.0

        val pulseEnvelope = minOf(progress / 0.08, (0.8 - progress) / 0.12, 1.0)
        val elapsedSeconds = if (config.bpm > 0.0) {
            progress * duration * 60.0 / (pulseCount * config.bpm)
        } else {
            0.0
        }
        return active.rootPulses[index].sumOf { voice ->
            voice.nextSample(envelope * pulseEnvelope, elapsedSeconds) * NOTE_GAIN * pulseEnvelope
        }
    }

    private fun prepareVoice(event: PlaybackTimelineEvent): ShortArray? {
        if (config.rootDegreeCue.speaksMelodyFunction) {
            val cue = event.spokenMelodyCue ?: return null
            val midi = event.melodyCueMidi ?: event.fullMidiNotes.firstOrNull() ?: return null
            return phraseCache.prepareFunction(cue, midi + config.transpose, event.endBeat - event.startBeat, config.bpm)
        }
        if (event.layer != PlaybackAudioLayer.CHORD || !config.rootDegreeCue.speaksRootDegree) return null
        val degree = if (config.useRelativeIonianContext) {
            event.relativeMajorRootDegree
        } else {
            event.rootDegree?.let { RelativeIonianDegree(it, event.rootDegreeAlteration) }
        } ?: return null
        val root = when (config.chordMode) {
            PlaybackChordMode.FULL -> event.fullChordRootMidiNote ?: event.rootMidiNote
            PlaybackChordMode.ROOT_ONLY -> event.rootMidiNote
        } ?: return null
        val suffix = event.spokenChordSuffix.takeIf {
            config.rootDegreeCue == PlaybackRootDegreeCue.SUNG_NUMBER_WITH_DETAILS
        }
        val phrase = SpokenPhrase(degree, root + config.transpose - 12, suffix)
        return phraseCache.prepare(phrase, event.endBeat - event.startBeat, config.bpm)
    }

    // Prepare PCM before entering the sample loop, including events after a
    // wrap when a block crosses the loop boundary.
    private fun prepareVoicesForBlock(span: Double) {
        preparedVoices.clear()
        if (!config.rootDegreeCue.usesVoice || span <= 0.0) return
        fun prepareFrom(startIndex: Int, throughBeat: Double) {
            for (index in startIndex until timeline.events.size) {
                val event = timeline.events[index]
                if (event.startBeat > throughBeat + BEAT_EPSILON) break
                if (event.id !in preparedVoices) {
                    prepareVoice(event)?.let { preparedVoices[event.id] = it }
                }
            }
        }
        val end = beat + span
        prepareFrom(nextEventIndex, end)
        if (end >= timeline.endBeat && timeline.completionKey == null) {
            val wrappedEnd = timeline.startBeat + end - timeline.endBeat
            prepareFrom(0, wrappedEnd)
        }
    }

    private fun startSpokenNumber(event: PlaybackTimelineEvent, samples: ShortArray?, phase: Double? = null) {
        if (!event.speaksFor(config.rootDegreeCue)) return
        spokenNumber = null
        val mode = if (config.rootDegreeCue.speaksRootDegree) takeModeAnnouncement(event.keyScale) else null
        val phrase = withModePrefix(samples, mode)
        if (phrase == null || config.bpm <= 0.0) return
        val samplesPerBeat = SPOKEN_ROOT_DEGREE_SAMPLE_RATE * 60.0 / config.bpm
        val position = phase?.let { it * phrase.size }
            ?: (beat - event.startBeat).coerceAtLeast(0.0) * samplesPerBeat
        spokenNumber = SpokenNumber(event, phrase, beat, position, samplesPerBeat)
    }

    private fun takeModeAnnouncement(scale: String?): String? {
        val announced = modeAnnouncement(
            previousScale = lastVoiceScale,
            currentScale = scale,
            cue = config.rootDegreeCue,
            majorLocked = config.useRelativeIonianContext
        )
        if (scale != null) lastVoiceScale = scale
        return announced
    }

    private fun withModePrefix(samples: ShortArray?, mode: String?): ShortArray? {
        val modeSamples = mode?.let { spokenRootDegrees.modeClip(it) } ?: return samples
        if (samples == null || samples.isEmpty()) return modeSamples
        return ShortArray(modeSamples.size + samples.size).also { combined ->
            modeSamples.copyInto(combined)
            samples.copyInto(combined, modeSamples.size)
        }
    }

    private fun PlaybackTimelineEvent.speaksFor(cue: PlaybackRootDegreeCue): Boolean = when {
        cue.speaksMelodyFunction -> {
            val words = spokenMelodyCue
            words != null && (cue != PlaybackRootDegreeCue.MELODY_CHORD_TONE || isSpokenMelodyChordTone(words))
        }
        cue.speaksRootDegree -> layer == PlaybackAudioLayer.CHORD
        else -> false
    }

    private fun renderSpokenNumber(beatsPerFrame: Double): Double {
        val voice = spokenNumber ?: return 0.0
        if (beatsPerFrame <= 0.0) return 0.0
        val framesLeft = (voice.event.endBeat - beat) / beatsPerFrame
        val position = voice.positionAt(beat)
        val index = position.toInt()
        if (framesLeft <= 0.0 || index >= voice.samples.size) return 0.0
        val first = voice.samples[index].toInt()
        val sample = first + ((voice.samples.getOrNull(index + 1)?.toInt() ?: 0) - first) * (position - index)
        val fadeFrames = sampleRate * 0.005
        val phraseFramesLeft = (voice.samples.size - position) * sampleRate / SPOKEN_ROOT_DEGREE_SAMPLE_RATE
        val envelope = minOf(voice.renderedFrames / fadeFrames, framesLeft / fadeFrames, phraseFramesLeft / fadeFrames, 1.0)
        voice.renderedFrames++
        return sample / Short.MAX_VALUE * envelope
    }

    internal fun consumeSplices(): List<PlaybackSplice> {
        if (splices.isEmpty()) return emptyList()
        val copy = splices.toList()
        splices.clear()
        return copy
    }

    private fun advanceBeat(beatsPerFrame: Double, frame: Int) {
        if (beatsPerFrame <= 0.0) return
        beat += beatsPerFrame
        if (beat + BEAT_EPSILON < timeline.endBeat) return
        spokenNumber = null
        if (timeline.completionKey == null) {
            val loopLength = timeline.endBeat - timeline.startBeat
            val overshoot = (beat - timeline.endBeat).coerceAtLeast(0.0)
            beat = timeline.startBeat + if (loopLength > 0.0) overshoot % loopLength else 0.0
            activeEvents.clear()
            nextEventIndex = timeline.events.indexOfFirst { it.startBeat >= timeline.startBeat }
                .let { if (it < 0) timeline.events.size else it }
            return
        }
        val queue = continuation
        val next = if (queue.isNullOrEmpty()) null else queue.removeFirst().also(queue::addLast)
        if (next != null) {
            spliceTo(next, (beat - timeline.endBeat).coerceAtLeast(0.0), frame)
            return
        }
        beat = timeline.endBeat
        activeEvents.clear()
        nextEventIndex = timeline.events.size
    }

    private fun spliceTo(next: QueuedSection, overshoot: Double, frame: Int) {
        timeline = next.timeline
        val loopLength = timeline.endBeat - timeline.startBeat
        val landed = timeline.startBeat + if (loopLength > 0.0) overshoot % loopLength else 0.0
        beat = landed.coerceIn(timeline.startBeat, timeline.endBeat)
        if (next.bpm > 0.0 && next.bpm != config.bpm) {
            config = config.copy(bpm = next.bpm).sanitized()
        }
        activeEvents.clear()
        spokenNumber = null
        lastVoiceScale = null
        nextEventIndex = timeline.events.indexOfFirst { it.startBeat >= timeline.startBeat }
            .let { if (it < 0) timeline.events.size else it }
        prepareVoicesForBlock(currentBeatsPerFrame * 64.0)
        splices.add(
            PlaybackSplice(
                frame = frame + 1,
                beat = beat,
                beatsPerFrame = currentBeatsPerFrame,
                loopStart = timeline.startBeat,
                loopEnd = timeline.endBeat,
                performanceId = next.performanceId,
                timeline = timeline
            )
        )
    }

    private fun activateDueEvents(
        frameOffset: Int,
        startedEvents: MutableList<RenderedPlaybackEvent>?
    ) {
        while (nextEventIndex < timeline.events.size) {
            val event = timeline.events[nextEventIndex]
            if (event.startBeat > beat + BEAT_EPSILON) break
            nextEventIndex++
            if (beat < event.endBeat) {
                startSpokenNumber(event, preparedVoices[event.id])
                createActiveEvent(event, fadeIn = false)?.let { active ->
                    activeEvents.add(active)
                    startedEvents?.add(RenderedPlaybackEvent(event.id, frameOffset))
                }
            }
        }
    }

    private fun activateEventsAtPosition(fadeIn: Boolean) {
        timeline.events
            .filter { event -> event.startBeat <= beat && beat < event.endBeat }
            .forEach { event ->
                startSpokenNumber(event, prepareVoice(event))
                createActiveEvent(event, fadeIn)?.let(activeEvents::add)
            }
    }

    private fun createActiveEvent(event: PlaybackTimelineEvent, fadeIn: Boolean): ActiveEvent? {
        val isChord = event.layer == PlaybackAudioLayer.CHORD
        val root = event.rootMidiNote?.takeIf { it > 0 }
        val pulseRoot = isChord && config.rootDegreeCue.pulsesRoots
        val midiNotes = if (isChord && (pulseRoot || config.chordMode == PlaybackChordMode.ROOT_ONLY)) {
            listOfNotNull(root)
        } else {
            event.fullMidiNotes.filter { it > 0 }
        }
        if (midiNotes.isEmpty()) return null

        fun voices(notes: List<Int>): List<SynthVoice> = notes.map { midi ->
            val transposed = midi + config.transpose
            val frequency = 440.0 * Math.pow(2.0, (transposed - 69) / 12.0)
            SynthVoice(frequency, config.waveform, sampleRate)
        }

        val pulseCount = when (config.rootDegreeCue) {
            PlaybackRootDegreeCue.ROOT_PULSES -> event.rootDegree?.takeIf { it in 1..7 } ?: 0
            PlaybackRootDegreeCue.HARMONIC_DISTANCE -> {
                val distance = event.harmonicPulseCount(config.useRelativeIonianContext)
                if (distance <= 0) 0 else distance + 1
            }
            else -> 0
        }
        val pulsing = when (config.rootDegreeCue) {
            PlaybackRootDegreeCue.ROOT_PULSES -> pulseCount > 1
            PlaybackRootDegreeCue.HARMONIC_DISTANCE -> pulseCount >= 1
            else -> false
        }
        val (oscillators, rootPulses) = if (pulseRoot && pulsing) {
            // Separate voices retrigger decaying instruments on every pulse.
            emptyList<SynthVoice>() to List(pulseCount) { voices(midiNotes) }
        } else {
            voices(midiNotes) to emptyList()
        }
        return ActiveEvent(
            event = event,
            oscillators = oscillators,
            rootPulses = rootPulses,
            arpeggiateCycles = if (isChord && oscillators.size > 1) config.arpeggiateCycles else 0.0,
            transitionGain = if (fadeIn) 0.0 else 1.0,
            transitionFramesRemaining = if (fadeIn) crossfadeFrames else 0,
            transitionStep = if (fadeIn) 1.0 / crossfadeFrames else 0.0
        )
    }

    private fun PlaybackConfig.sanitized(): PlaybackConfig = copy(
        bpm = bpm.coerceAtLeast(0.0),
        melodyGain = melodyGain.coerceIn(0f, 1f),
        chordGain = chordGain.coerceIn(0f, 1f),
        voiceVolume = voiceVolume.coerceIn(0f, 1f),
        arpeggiateCycles = if (rootDegreeCue.pulsesRoots) {
            0.0
        } else {
            arpeggiateCycles.coerceIn(0.0, 4.0)
        }
    )

    companion object {
        const val SAMPLE_RATE = 44_100
        private const val NOTE_GAIN = 0.15
        private const val ATTACK_FRAMES = 200
        private const val RELEASE_FRAMES = 1_000.0
        private const val BEAT_EPSILON = 1e-9
    }
}

internal interface PlaybackAudioSink {
    val playbackHeadFrames: Long
    val underrunCount: Int
    fun setBufferSizeInFrames(frames: Int): Int
    fun write(samples: ShortArray, offset: Int, size: Int): Int
    fun play()
    fun pause()
    fun flush()
    fun release()
}

private class AndroidPlaybackAudioSink(private val track: AudioTrack) : PlaybackAudioSink {
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

internal class PlaybackEngine(
    initialConfig: PlaybackConfig,
    private val sampleRate: Int = AppAudioOutput.sampleRate,
    private val spokenRootDegrees: SpokenRootDegreeClips = SpokenRootDegreeClips(),
    private val sinkFactory: (capacityFrames: Int) -> PlaybackAudioSink = { capacityFrames ->
        createAndroidSink(capacityFrames, sampleRate)
    }
) {
    private sealed interface Command {
        data class Load(
            val timeline: PlaybackTimeline,
            val continuePlaying: Boolean,
            val revision: Long,
            val performanceId: String?
        ) : Command
        data class Play(val revision: Long) : Command
        data class Pause(val revision: Long) : Command
        data class Seek(val beat: Double, val resume: Boolean, val revision: Long) : Command
        data class Reset(val revision: Long) : Command
        data class UpdateCompletion(val timeline: PlaybackTimeline) : Command
        data class SetContinuation(
            val afterPerformanceId: String,
            val sections: List<QueuedSection>
        ) : Command
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
    private val latestTimeline = AtomicReference<PlaybackTimeline?>(null)
    private val configSignalQueued = AtomicBoolean(false)
    // Updated on the calling thread before transport commands are queued. UI gestures
    // must not infer intent from StateFlow, whose phase necessarily trails the command
    // queue while the audio worker finishes a blocking write.
    private val playbackRequested = AtomicBoolean(false)
    private val playingPerformanceId = AtomicReference<String?>(null)
    private val transportRevision = AtomicLong(0L)
    private val commands = LinkedBlockingQueue<Command>()
    private val released = AtomicBoolean(false)
    private val mutableState = MutableStateFlow(PlaybackState())
    val state: StateFlow<PlaybackState> = mutableState.asStateFlow()

    private val worker = thread(start = true, name = "PlaybackAudio") {
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

    fun isCurrentCompletion(state: PlaybackState): Boolean =
        state.phase == PlaybackPhase.COMPLETED && state.transportRevision == transportRevision.get() &&
            state.completionKey == latestTimeline.get()?.completionKey

    /**
     * Switches Loop/Song behavior on the performance already loaded.
     * Returns false when [newTimeline] is different music and the caller must [load] it.
     * Does not move the playhead or change whether playback was requested.
     */
    fun updateCompletion(newTimeline: PlaybackTimeline): Boolean {
        val current = latestTimeline.get() ?: return false
        if (!current.samePerformanceAs(newTimeline)) return false
        if (current.completionKey == newTimeline.completionKey) return true
        latestTimeline.set(newTimeline)
        offer(Command.UpdateCompletion(newTimeline))
        return true
    }

    /** The audio thread already crossed into this timeline. Do not flush the track. */
    fun adoptIfPlaying(timeline: PlaybackTimeline): Boolean {
        if (!playbackRequested.get()) return false
        val current = latestTimeline.get() ?: return false
        if (!current.samePerformanceAs(timeline)) return false
        if (current.completionKey != timeline.completionKey) return updateCompletion(timeline)
        return true
    }

    fun setSectionContinuation(afterPerformanceId: String, sections: List<QueuedSection>) {
        offer(Command.SetContinuation(afterPerformanceId, sections))
    }

    fun load(timeline: PlaybackTimeline, continuePlaying: Boolean, performanceId: String? = null) {
        val revision = transportRevision.incrementAndGet()
        latestTimeline.set(timeline)
        playingPerformanceId.set(performanceId)
        playbackRequested.set(continuePlaying)
        mutableState.value = mutableState.value.copy(
            beat = timeline.startBeat,
            error = null,
            performanceId = performanceId
        )
        offer(Command.Load(timeline, continuePlaying, revision, performanceId))
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

    /** Invalidates queued resume/load work while preserving the audible beat. */
    fun pauseForLifecycle() {
        pause()
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

    fun updateConfig(config: PlaybackConfig) {
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
        var timeline: PlaybackTimeline? = null
        var renderer: PlaybackPcmRenderer? = null
        var sink: PlaybackAudioSink? = null
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
        var deadObjectRecoveries = 0
        var activeTransportRevision = 0L
        var performanceId: String? = null
        val continuation = ArrayDeque<QueuedSection>()
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
            return if (activeTimeline.completionKey != null) (segment.startBeat + advanced).coerceAtMost(segment.loopEnd)
            else segment.loopStart + ((segment.startBeat - segment.loopStart + advanced) % loopLength)
        }

        fun publish(phase: PlaybackPhase, error: String? = null) {
            // A newer UI transport command may already have published its target beat.
            // Never let completion of an older pause/seek overwrite that position.
            if (activeTransportRevision < transportRevision.get()) return
            val beat = audibleBeat()
            // Audio blocks are shorter than a 120 Hz frame, so each one is a new
            // playhead sample. The display refresh rate is the frame clock.
            mutableState.value = PlaybackState(
                phase = phase,
                beat = beat,
                underrunCount = sink?.underrunCount ?: lastUnderrunCount,
                error = error,
                completionKey = if (phase == PlaybackPhase.COMPLETED) timeline?.completionKey else null,
                transportRevision = activeTransportRevision,
                performanceId = performanceId
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
            renderer?.seek(anchoredBeat, preserveVoiceProgress = true)
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

        fun renderAndWrite(activeRenderer: PlaybackPcmRenderer, count: Int) {
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
            for (splice in activeRenderer.consumeSplices()) {
                timeline = splice.timeline
                performanceId = splice.performanceId
                latestTimeline.set(splice.timeline)
                playingPerformanceId.set(splice.performanceId)
                clockSegments.addLast(
                    ClockSegment(
                        startFrame = totalFramesWritten + splice.frame,
                        startBeat = splice.beat,
                        beatsPerFrame = splice.beatsPerFrame,
                        loopStart = splice.loopStart,
                        loopEnd = splice.loopEnd
                    )
                )
            }
            writeFully(block, count)
            totalFramesWritten += count
            while (clockSegments.size > MAX_CLOCK_SEGMENTS) clockSegments.removeFirst()
        }

        fun prime(activeRenderer: PlaybackPcmRenderer): Boolean {
            publish(PlaybackPhase.BUFFERING)
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
                activeRenderer.seek(primeStartBeat, preserveVoiceProgress = true)
                resetClock()
                return false
            }
            sink?.play()
            sinkStarted = true
            publish(PlaybackPhase.PLAYING)
            return true
        }

        fun handle(command: Command) {
            when (command) {
                is Command.Load -> activeTransportRevision = command.revision
                is Command.Play -> activeTransportRevision = command.revision
                is Command.Pause -> activeTransportRevision = command.revision
                is Command.Seek -> activeTransportRevision = command.revision
                is Command.Reset -> activeTransportRevision = command.revision
                is Command.UpdateCompletion, is Command.SetContinuation, Command.ConfigChanged, Command.Release -> Unit
            }
            when (command) {
                is Command.Load -> {
                    performanceId = command.performanceId
                    latestTimeline.set(command.timeline)
                    playingPerformanceId.set(command.performanceId)
                    continuation.clear()
                    pauseAndReanchor()
                    timeline = command.timeline
                    renderer = PlaybackPcmRenderer(
                        command.timeline,
                        latestConfig.get(),
                        sampleRate,
                        spokenRootDegrees
                    ).also { created -> created.continuation = continuation }
                    playRequested = command.continuePlaying
                    deadObjectRecoveries = 0
                    publish(
                        if (playRequested && latestConfig.get().bpm > 0.0) {
                            PlaybackPhase.BUFFERING
                        } else {
                            PlaybackPhase.STOPPED
                        }
                    )
                }

                is Command.Play -> {
                    if (renderer?.finished == true) {
                        pauseAndReanchor()
                        renderer?.seek(timeline!!.startBeat)
                    }
                    playRequested = true
                    publish(
                        if (latestConfig.get().bpm > 0.0) PlaybackPhase.BUFFERING
                        else PlaybackPhase.PAUSED
                    )
                }

                is Command.Pause -> {
                    playRequested = false
                    pauseAndReanchor()
                    publish(PlaybackPhase.PAUSED)
                }

                is Command.Seek -> {
                    pauseAndReanchor()
                    renderer?.seek(command.beat)
                    playRequested = command.resume
                    publish(
                        if (playRequested && latestConfig.get().bpm > 0.0) {
                            PlaybackPhase.BUFFERING
                        } else {
                            PlaybackPhase.PAUSED
                        }
                    )
                }

                is Command.Reset -> {
                    playRequested = false
                    pauseAndReanchor()
                    renderer?.seek(timeline?.startBeat ?: 1.0)
                    publish(PlaybackPhase.STOPPED)
                }

                is Command.UpdateCompletion -> {
                    // Capture the heard beat before the completion key changes, or a loop
                    // that has already wrapped would clamp to the end on the next read.
                    val preservedBeat = audibleBeat()
                    timeline = command.timeline
                    val activeRenderer = renderer
                    activeRenderer?.replaceTimeline(command.timeline)
                    if (sinkStarted && activeRenderer != null) {
                        clockSegments.clear()
                        clockSegments.addLast(
                            ClockSegment(
                                startFrame = unwrappedPlaybackHead(),
                                startBeat = preservedBeat,
                                beatsPerFrame = activeRenderer.currentBeatsPerFrame,
                                loopStart = command.timeline.startBeat,
                                loopEnd = command.timeline.endBeat
                            )
                        )
                    }
                }

                is Command.SetContinuation -> {
                    if (command.afterPerformanceId == performanceId) {
                        continuation.clear()
                        continuation.addAll(command.sections)
                        renderer?.continuation = continuation
                    }
                }

                Command.ConfigChanged -> {
                    configSignalQueued.set(false)
                    val updated = latestConfig.get()
                    if (updated.bpm <= 0.0 && sinkStarted) pauseAndReanchor()
                    renderer?.updateConfig(updated)
                    if (playRequested && updated.bpm <= 0.0) {
                        publish(PlaybackPhase.PAUSED)
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
                    if (activeRenderer.finished) {
                        // Drain the already-written final block before signalling completion.
                        // Poll commands while draining so pause/seek/load can invalidate it.
                        if (unwrappedPlaybackHead() >= totalFramesWritten &&
                            activeTransportRevision == transportRevision.get()) {
                            playRequested = false
                            playbackRequested.set(false)
                            sink?.pause()
                            publish(PlaybackPhase.COMPLETED)
                        } else {
                            commands.poll(5, java.util.concurrent.TimeUnit.MILLISECONDS)?.let(::handle)
                        }
                        continue
                    }
                    renderAndWrite(activeRenderer, BLOCK_FRAMES)
                    deadObjectRecoveries = 0

                    val underruns = sink?.underrunCount ?: lastUnderrunCount
                    if (underruns > lastUnderrunCount && targetBufferFrames < capacityFrames) {
                        targetBufferFrames = minOf(
                            capacityFrames,
                            targetBufferFrames + framesForMs(BUFFER_GROWTH_MS)
                        )
                        sink?.setBufferSizeInFrames(targetBufferFrames)
                        Log.w(TAG, "Playback audio underrun; growing buffer to $targetBufferFrames frames")
                    }
                    lastUnderrunCount = underruns
                    publish(PlaybackPhase.PLAYING)
                } catch (writeError: AudioWriteException) {
                    val canRecover = writeError.code == AudioTrack.ERROR_DEAD_OBJECT && deadObjectRecoveries < 1
                    val restartBeat = audibleBeat()
                    closeSink()
                    activeRenderer.seek(restartBeat)
                    if (canRecover) {
                        deadObjectRecoveries++
                        Log.w(TAG, "Recreating dead playback AudioTrack at beat $restartBeat")
                    } else {
                        playRequested = false
                        playbackRequested.set(false)
                        val message = "Playback audio write failed (${writeError.code})"
                        Log.e(TAG, message)
                        publish(PlaybackPhase.ERROR, message)
                    }
                } catch (error: Exception) {
                    playRequested = false
                    playbackRequested.set(false)
                    closeSink()
                    val message = error.message ?: "Playback audio initialization failed"
                    Log.e(TAG, message, error)
                    publish(PlaybackPhase.ERROR, message)
                }
            }
        } finally {
            closeSink()
        }
    }

    private fun framesForMs(milliseconds: Int): Int =
        (sampleRate.toLong() * milliseconds / 1_000L).toInt().coerceAtLeast(BLOCK_FRAMES)

    companion object {
        private const val TAG = "PlaybackEngine"
        private const val BLOCK_FRAMES = 256
        private const val INITIAL_BUFFER_MS = 80
        private const val BUFFER_GROWTH_MS = 40
        private const val MAX_BUFFER_MS = 200
        private const val MAX_CLOCK_SEGMENTS = 512
        private const val RELEASE_JOIN_MS = 1_000L

        private fun createAndroidSink(capacityFrames: Int, sampleRate: Int): PlaybackAudioSink {
            val minBytes = AudioTrack.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            )
            require(minBytes > 0) { "AudioTrack reported invalid minimum buffer: $minBytes" }
            val capacityBytes = max(minBytes, capacityFrames * Short.SIZE_BYTES)
            val track = AudioTrack.Builder()
                // Same session as the card previews: one effect chain for the whole app.
                .setSessionId(AppAudioOutput.sessionId)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(sampleRate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build()
                )
                .setBufferSizeInBytes(capacityBytes)
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()
            check(track.state == AudioTrack.STATE_INITIALIZED) { "Playback AudioTrack failed to initialize" }
            return AndroidPlaybackAudioSink(track)
        }
    }
}

internal fun buildPlaybackTimeline(
    section: ExtractedSection,
    melody: List<MelodyNote>,
    endBeat: Double
): PlaybackTimeline {
    var nextId = 1L
    val relativeMajorKey = relativeIonianKey(section.getKeys().keyAtBeat(1.0))
    val sungMelodyMidis = foldMelodyIntoSingingRange(melody.map { note ->
        if (note.isRest || note.duration <= 0.0) null
        else MusicTheory.getMidiNote(note.sd, note.octave, section.getKeyAtBeat(note.beat)).takeIf { it > 0 }
    })
    val events = buildList {
        melody.forEachIndexed { index, note ->
            val noteEnd = note.beat + note.duration
            val midi = sungMelodyMidis[index]
            if (!note.isRest && note.duration > 0.0 && noteEnd > 1.0 && midi != null) {
                    add(
                        PlaybackTimelineEvent(
                            id = nextId++,
                            startBeat = note.beat.coerceAtLeast(1.0),
                            endBeat = noteEnd.coerceAtMost(endBeat),
                            layer = PlaybackAudioLayer.MELODY,
                            fullMidiNotes = intArrayOf(midi)
                        )
                    )
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
                val voicing = ChordVoicing.build(chord, key)
                val fullNotes = voicing?.tones.orEmpty().map { it.midi }.filter { it > 0 }.toIntArray()
                val resolvedRoot = ChordInterpreter.resolveChordRoot(chord, key)
                val root = resolvedRoot?.simpleModePitch?.toAudioNoteNumber()
                val rootDegree = resolvedRoot?.let { degreeInKey(it.pitch, key) }
                if (fullNotes.isNotEmpty() || root != null) {
                    add(
                        PlaybackTimelineEvent(
                            id = nextId++,
                            startBeat = beat.coerceAtLeast(1.0),
                            endBeat = chordEnd.coerceAtMost(endBeat),
                            layer = PlaybackAudioLayer.CHORD,
                            fullMidiNotes = fullNotes,
                            rootMidiNote = root,
                            rootDegree = rootDegree?.degree,
                            rootDegreeAlteration = rootDegree?.alteration ?: 0,
                            fullChordRootMidiNote = voicing?.tones?.firstOrNull { it.degree == 1 }?.midi,
                            spokenChordSuffix = spokenSuffixForChord(chord, ChordInterpreter.getRomanSymbol(chord, key), voicing),
                            relativeMajorRootDegree = resolvedRoot?.let { degreeInKey(it.pitch, relativeMajorKey) },
                            fifthsFromKeyTonic = root?.let {
                                circleOfFifthsDistance(tonicPitchClass(key), Math.floorMod(it, 12))
                            } ?: 0,
                            fifthsFromMajorTonic = root?.let {
                                circleOfFifthsDistance(tonicPitchClass(relativeMajorKey), Math.floorMod(it, 12))
                            } ?: 0,
                            keyScale = key.scale
                        )
                    )
                }
            }
        }
    }.filter { it.endBeat > it.startBeat }
        .sortedWith(compareBy<PlaybackTimelineEvent> { it.startBeat }.thenBy { it.id })

    return PlaybackTimeline(
        endBeat = endBeat,
        events = annotateMelodyVoiceCues(section, melody, events)
    )
}
