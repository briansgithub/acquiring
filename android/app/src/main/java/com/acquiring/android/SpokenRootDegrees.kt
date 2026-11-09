package com.acquiring.android

import android.content.res.Resources
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.ShortBuffer

internal const val SPOKEN_ROOT_DEGREE_SAMPLE_RATE = 24_000
internal val SPOKEN_ROOT_DEGREE_PITCHES = 48..71

internal enum class SpokenChordSuffix(val resourceId: Int) {
    MIN(R.raw.root_suffix_min),
    SEVEN(R.raw.root_suffix_seven),
    SEV_MAJ(R.raw.root_suffix_sev_maj),
    SEV_MIN(R.raw.root_suffix_sev_min),
    DIM(R.raw.root_suffix_dim),
    DIM_SEV(R.raw.root_suffix_dim_sev),
    HALF_DIM(R.raw.root_suffix_half_dim),
    AUG(R.raw.root_suffix_aug),
    SUS(R.raw.root_suffix_sus)
}

internal fun VoicedChord.spokenSuffix(): SpokenChordSuffix? {
    if (tones.any { it.slot == 7 && it.degree == 2 || it.slot == 8 && it.degree == 4 }) {
        return SpokenChordSuffix.SUS
    }
    fun interval(degree: Int) = tones.firstOrNull { it.degree == degree }
        ?.let { Math.floorMod(it.midi - rootMidi, 12) }

    val third = interval(3)
    val fifth = interval(5)
    val seventh = interval(7)
    return when {
        third == 3 && fifth == 6 -> when (seventh) {
            9 -> SpokenChordSuffix.DIM_SEV
            10 -> SpokenChordSuffix.HALF_DIM
            else -> SpokenChordSuffix.DIM
        }
        third == 4 && fifth == 8 -> SpokenChordSuffix.AUG
        seventh == 11 && third != 3 -> SpokenChordSuffix.SEV_MAJ
        seventh == 10 && third == 3 -> SpokenChordSuffix.SEV_MIN
        seventh == 10 -> SpokenChordSuffix.SEVEN
        third == 3 -> SpokenChordSuffix.MIN
        else -> null
    }
}

internal class SpokenRootDegreeClips(
    private val numbers: List<List<ShortArray>> = emptyList(),
    private val suffixes: Map<SpokenChordSuffix, ShortArray> = emptyMap()
) {
    fun number(degree: Int, midi: Int): ShortArray? {
        val pitches = SPOKEN_ROOT_DEGREE_PITCHES
        val pitch = when {
            midi < pitches.first -> pitches.first + Math.floorMod(midi - pitches.first, 12)
            midi > pitches.last -> pitches.last - Math.floorMod(pitches.last - midi, 12)
            else -> midi
        }
        return numbers.getOrNull(degree - 1)?.getOrNull(pitch - pitches.first)
    }

    fun suffix(suffix: SpokenChordSuffix?): ShortArray? = suffix?.let(suffixes::get)
}

// Each degree contains equal-length, consecutive PCM clips in ascending MIDI order.
// Generate these resources with android/scripts/generate_spoken_degree_cues.py.
internal fun loadSpokenRootDegrees(resources: Resources): SpokenRootDegreeClips {
    val numbers = listOf(
        R.raw.root_degree_one,
        R.raw.root_degree_two,
        R.raw.root_degree_three,
        R.raw.root_degree_four,
        R.raw.root_degree_five,
        R.raw.root_degree_six,
        R.raw.root_degree_seven
    ).map { id ->
        val pcm = resources.openVoicePcm(id)
        val count = SPOKEN_ROOT_DEGREE_PITCHES.count()
        require(pcm.remaining() > 0 && pcm.remaining() % count == 0)
        val frames = pcm.remaining() / count
        List(count) { ShortArray(frames).also { pcm.get(it) } }
    }
    val suffixes = SpokenChordSuffix.entries.associateWith {
        val pcm = resources.openVoicePcm(it.resourceId)
        ShortArray(pcm.remaining()).also { samples -> pcm.get(samples) }
    }
    return SpokenRootDegreeClips(numbers, suffixes)
}

private fun Resources.openVoicePcm(id: Int): ShortBuffer {
    val bytes = openRawResource(id).use { it.readBytes() }
    return ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
}
