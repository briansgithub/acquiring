package com.acquiring.android

import android.content.res.Resources
import java.nio.ByteBuffer
import java.nio.ByteOrder

internal const val SPOKEN_ROOT_DEGREE_SAMPLE_RATE = 24_000
internal val SPOKEN_ROOT_DEGREE_PITCHES = 36..59

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

private val romanBase = Regex("^[♭♯]*([IViv]+)")
private val romanAnnotations = Regex("\\([^)]*\\)")
private val seventhFigures = setOf("7", "9", "11", "13", "65", "43", "42")

internal fun spokenSuffixForRoman(symbol: String): SpokenChordSuffix? {
    val numerator = RomanNumeralTokenizer.normalizeDigits(symbol.substringBefore('/'))
    val base = romanBase.find(numerator) ?: return null
    // Strip borrowed-key tags and alterations, including those between inversion digits.
    val suffix = numerator.substring(base.value.length).replace(romanAnnotations, "")
    val minor = base.groupValues[1].first().isLowerCase()
    val hasSeventh = suffix.trimStart('+', '°', 'ø', '△') in seventhFigures
    return when {
        "sus" in suffix -> SpokenChordSuffix.SUS
        'ø' in suffix -> SpokenChordSuffix.HALF_DIM
        '°' in suffix -> if (hasSeventh) SpokenChordSuffix.DIM_SEV else SpokenChordSuffix.DIM
        '+' in suffix -> SpokenChordSuffix.AUG
        hasSeventh && '△' in suffix && !minor -> SpokenChordSuffix.SEV_MAJ
        hasSeventh && minor && '△' !in suffix -> SpokenChordSuffix.SEV_MIN
        minor -> SpokenChordSuffix.MIN
        hasSeventh -> SpokenChordSuffix.SEVEN
        else -> null
    }
}

internal class SpokenRootDegreeClips(
    private val numbers: List<List<ShortArray>> = emptyList(),
    private val suffixes: Map<SpokenChordSuffix, List<ShortArray>> = emptyMap()
) {
    fun number(degree: Int, midi: Int): ShortArray? =
        numbers.getOrNull(degree - 1)?.getOrNull(pitchIndex(midi))

    fun suffix(suffix: SpokenChordSuffix?, midi: Int): ShortArray? =
        suffix?.let(suffixes::get)?.getOrNull(pitchIndex(midi))

    private fun pitchIndex(midi: Int): Int {
        val pitches = SPOKEN_ROOT_DEGREE_PITCHES
        val pitch = when {
            midi < pitches.first -> pitches.first + Math.floorMod(midi - pitches.first, 12)
            midi > pitches.last -> pitches.last - Math.floorMod(pitches.last - midi, 12)
            else -> midi
        }
        return pitch - pitches.first
    }
}

// Each resource contains equal-length, consecutive PCM clips in ascending MIDI order.
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
    ).map(resources::openPitchedVoiceClips)
    val suffixes = SpokenChordSuffix.entries.associateWith { resources.openPitchedVoiceClips(it.resourceId) }
    return SpokenRootDegreeClips(numbers, suffixes)
}

private fun Resources.openPitchedVoiceClips(id: Int): List<ShortArray> {
    val bytes = openRawResource(id).use { it.readBytes() }
    val pcm = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
    val count = SPOKEN_ROOT_DEGREE_PITCHES.count()
    require(pcm.remaining() > 0 && pcm.remaining() % count == 0)
    val frames = pcm.remaining() / count
    return List(count) { ShortArray(frames).also { pcm.get(it) } }
}
