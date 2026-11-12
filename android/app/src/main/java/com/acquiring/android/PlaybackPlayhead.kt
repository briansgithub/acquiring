package com.acquiring.android

import kotlin.jvm.Volatile

/**
 * Last audio playhead sample, projected forward on the display frame clock.
 * The audio thread publishes faster than 120 Hz, but reading that beat in
 * composition rebuilds the whole playback screen and the timeline only moves
 * as often as that rebuild finishes.
 */
internal class PlaybackPlayhead {
    @Volatile private var sampleBeat = 1.0
    @Volatile private var sampleNanos = 0L
    @Volatile private var playing = false
    @Volatile var beatsPerSecond = 0.0

    fun sample(beat: Double, playing: Boolean) {
        sampleBeat = beat
        sampleNanos = System.nanoTime()
        this.playing = playing
        if (!playing) beatsPerSecond = 0.0
    }

    fun project(nowNanos: Long = System.nanoTime()): Double {
        val rate = beatsPerSecond
        val start = sampleNanos
        val beat = sampleBeat
        if (!playing || rate <= 0.0 || start == 0L) return beat
        val dtNanos = (nowNanos - start).coerceIn(0L, 50_000_000L)
        return beat + dtNanos / 1_000_000_000.0 * rate
    }
}

internal data class PlaybackVisualIdentity(
    val keyBeat: Double,
    val keyHash: Int,
    val chordId: Int,
    val noteId: Int,
    val runId: Int
)

/** Inputs the playhead collector reads without subscribing the playback screen. */
internal class PlaybackVisualInputs {
    var keys: List<KeyInfoWithBeat> = emptyList()
    var index: PlaybackActiveEventIndex? = null
    var runs: List<MelodyTimelinePitchRun> = emptyList()
    var endBeat: Double = 1.0

    fun identityAt(beat: Double): PlaybackVisualIdentity? {
        val index = index ?: return null
        val key = keys.lastOrNull { it.beat <= beat }
        val note = index.melodyNoteAtBeat(beat)
        val chord = index.chordAtBeat(beat)
        val run = melodyTimelinePitchRunAtBeat(runs, beat)
        return PlaybackVisualIdentity(
            keyBeat = key?.beat ?: 0.0,
            keyHash = key?.key?.hashCode() ?: 0,
            chordId = System.identityHashCode(chord),
            noteId = System.identityHashCode(note),
            runId = run?.id ?: Int.MIN_VALUE
        )
    }
}
