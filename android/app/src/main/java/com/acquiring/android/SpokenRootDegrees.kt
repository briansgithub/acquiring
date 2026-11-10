package com.acquiring.android

import android.content.res.Resources
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import sonic.Sonic
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.pow
import kotlin.math.roundToInt

internal const val SPOKEN_ROOT_DEGREE_SAMPLE_RATE = 24_000
internal val SPOKEN_ROOT_DEGREE_PITCHES = 36..59

internal enum class SpokenChordSuffix(val resourceId: Int) {
    MIN(R.raw.root_suffix_min),
    SEVEN(R.raw.root_suffix_seven),
    SEV_MAJ(R.raw.root_suffix_sev_maj),
    SEV_MIN(R.raw.root_suffix_sev_min),
    MIN_SEV_MAJ(R.raw.root_suffix_min_sev_maj),
    DIM(R.raw.root_suffix_dim),
    DIM_SEV(R.raw.root_suffix_dim_sev),
    HALF_DIM(R.raw.root_suffix_half_dim),
    AUG(R.raw.root_suffix_aug),
    SUS(R.raw.root_suffix_sus)
}

private val romanBase = Regex("^[♭♯]*([IViv]+)")
private val romanAnnotations = Regex("\\([^)]*\\)")

internal fun spokenSuffixForChord(chord: JsonObject, symbol: String, voicing: VoicedChord?): SpokenChordSuffix? {
    val numerator = symbol.substringBefore('/')
    val base = romanBase.find(numerator)
    val suffix = base?.let { numerator.substring(it.value.length).replace(romanAnnotations, "") }.orEmpty()
    val letterQuality = (chord["_letterQuality"] as? JsonPrimitive)?.contentOrNull.takeIf { base == null }
    val minor = base?.groupValues?.get(1)?.first()?.isLowerCase() ?: (letterQuality == "minor")
    val omittedSeventh = (chord["omits"] as? JsonArray).orEmpty().any { (it as? JsonPrimitive)?.intOrNull == 7 }
    val hasSeventh = (chord["type"] as? JsonPrimitive)?.intOrNull == 7 && !omittedSeventh
    val seventhInterval = voicing?.let { voiced ->
        voiced.tones.firstOrNull { it.degree == 7 }?.let { Math.floorMod(it.midi - voiced.rootMidi, 12) }
    }
    val majorSeventh = seventhInterval?.let { it == 11 } ?: ('△' in suffix)
    return when {
        "sus" in suffix || !(chord["suspensions"] as? JsonArray).isNullOrEmpty() -> SpokenChordSuffix.SUS
        'ø' in suffix -> if (hasSeventh) SpokenChordSuffix.HALF_DIM else SpokenChordSuffix.DIM
        '°' in suffix || letterQuality == "diminished" -> when {
            !hasSeventh -> SpokenChordSuffix.DIM
            seventhInterval == 10 -> SpokenChordSuffix.HALF_DIM
            else -> SpokenChordSuffix.DIM_SEV
        }
        '+' in suffix || letterQuality == "augmented" -> SpokenChordSuffix.AUG
        hasSeventh && majorSeventh && minor -> SpokenChordSuffix.MIN_SEV_MAJ
        hasSeventh && majorSeventh -> SpokenChordSuffix.SEV_MAJ
        hasSeventh && minor -> SpokenChordSuffix.SEV_MIN
        hasSeventh -> SpokenChordSuffix.SEVEN
        minor -> SpokenChordSuffix.MIN
        else -> null
    }
}

internal data class SpokenPhrase(
    val degree: RelativeIonianDegree,
    val midi: Int,
    val suffix: SpokenChordSuffix?
)

internal class SpokenRootDegreeClips(
    private val numbers: List<List<ShortArray>> = emptyList(),
    private val suffixes: Map<SpokenChordSuffix, List<ShortArray>> = emptyMap(),
    private val accidentals: List<List<ShortArray>> = emptyList()
) {
    fun parts(phrase: SpokenPhrase): List<ShortArray>? {
        val pitch = samplePitch(phrase.midi) - SPOKEN_ROOT_DEGREE_PITCHES.first
        val number = numbers.getOrNull(phrase.degree.degree - 1)?.getOrNull(pitch) ?: return null
        val alteration = phrase.degree.alteration
        val accidental = accidentals.getOrNull(if (alteration < 0) 0 else 1)?.getOrNull(pitch)
        val suffix = suffixes[phrase.suffix]?.getOrNull(pitch)
        return buildList {
            if (accidental != null) repeat(abs(alteration)) { add(accidental) }
            add(number)
            if (suffix != null) add(suffix)
        }
    }

    fun samplePitch(midi: Int): Int {
        val pitches = SPOKEN_ROOT_DEGREE_PITCHES
        return when {
            midi < pitches.first -> pitches.first + Math.floorMod(midi - pitches.first, 12)
            midi > pitches.last -> pitches.last - Math.floorMod(pitches.last - midi, 12)
            else -> midi
        }
    }
}

// Sonic Java by Bill Cox, Apache-2.0, upstream revision b93885dcb70aae50c6f76b0fe4e0868f029a077e.
internal class SpokenPhraseCache(private val clips: SpokenRootDegreeClips) {
    private data class Key(val phrase: SpokenPhrase, val frames: Int)

    private val samples = LinkedHashMap<Key, ShortArray>(16, 0.75f, true)
    private var cachedFrames = 0

    fun prepare(phrase: SpokenPhrase, durationBeats: Double, bpm: Double): ShortArray? {
        if (bpm <= 0) return null
        val parts = clips.parts(phrase) ?: return null
        val naturalFrames = parts.sumOf { it.size }
        val chordFrames = (durationBeats * 60 * SPOKEN_ROOT_DEGREE_SAMPLE_RATE / bpm).roundToInt()
        if (chordFrames <= 0 || naturalFrames == 0) return null
        // The dial reaches 1% tempo. Keep speech recognizable and PCM
        // bounded when a chord lasts much longer than a spoken phrase.
        val target = (chordFrames / 3).coerceIn(naturalFrames, naturalFrames * 4).coerceAtMost(chordFrames)
        val key = Key(phrase, target)
        samples[key]?.let { return it }
        val source = ShortArray(naturalFrames)
        var offset = 0
        for (part in parts) {
            part.copyInto(source, offset)
            offset += part.size
        }
        val semitoneShift = phrase.midi - clips.samplePitch(phrase.midi)
        val output = if (target == naturalFrames && semitoneShift == 0) source else {
            val sonic = Sonic(SPOKEN_ROOT_DEGREE_SAMPLE_RATE, 1)
            sonic.speed = naturalFrames.toFloat() / target
            sonic.pitch = 2.0.pow(semitoneShift / 12.0).toFloat()
            sonic.writeShortToStream(source, source.size)
            sonic.flushStream()
            ShortArray(target).also { sonic.readShortFromStream(it, target) }
        }
        // Bound the cache during continuous changes to the tempo dial.
        val budget = 48 * SPOKEN_ROOT_DEGREE_SAMPLE_RATE
        if (output.size <= budget) {
            while (cachedFrames + output.size > budget) {
                val oldest = samples.entries.iterator()
                cachedFrames -= oldest.next().value.size
                oldest.remove()
            }
            samples[key] = output
            cachedFrames += output.size
        }
        return output
    }
}

// Each resource contains equal-length PCM clips in ascending MIDI order.
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
    val accidentals = listOf(R.raw.root_accidental_flat, R.raw.root_accidental_sharp)
        .map(resources::openPitchedVoiceClips)
    return SpokenRootDegreeClips(numbers, suffixes, accidentals)
}

private fun Resources.openPitchedVoiceClips(id: Int): List<ShortArray> {
    val bytes = openRawResource(id).use { it.readBytes() }
    val count = SPOKEN_ROOT_DEGREE_PITCHES.count()
    require(bytes.isNotEmpty() && bytes.size % (count * Short.SIZE_BYTES) == 0)
    val frames = bytes.size / (count * Short.SIZE_BYTES)
    val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    return List(count) { ShortArray(frames) { buffer.short } }
}
