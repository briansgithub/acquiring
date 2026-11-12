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

internal enum class SpokenChordSuffix(val resourceId: Int, val spokenName: String) {
    MIN(R.raw.root_suffix_min, "minor"),
    SEVEN(R.raw.root_suffix_seven, "dominant seventh"),
    SEV_MAJ(R.raw.root_suffix_sev_maj, "major seventh"),
    SEV_MIN(R.raw.root_suffix_sev_min, "minor seventh"),
    MIN_SEV_MAJ(R.raw.root_suffix_min_sev_maj, "minor major seventh"),
    DIM(R.raw.root_suffix_dim, "diminished"),
    DIM_SEV(R.raw.root_suffix_dim_sev, "diminished seventh"),
    HALF_DIM(R.raw.root_suffix_half_dim, "half diminished seventh"),
    AUG(R.raw.root_suffix_aug, "augmented"),
    SUS_TWO(R.raw.root_suffix_sus_two, "suspended second"),
    SUS_FOUR(R.raw.root_suffix_sus_four, "suspended fourth"),
    SUS_TWO_FOUR(R.raw.root_suffix_sus_two_four, "suspended second and fourth"),
    SEVENTH_SUS_TWO(R.raw.root_suffix_seventh_sus_two, "dominant seventh suspended second"),
    SEVENTH_SUS_FOUR(R.raw.root_suffix_seventh_sus_four, "dominant seventh suspended fourth"),
    SEVENTH_SUS_TWO_FOUR(R.raw.root_suffix_seventh_sus_two_four, "dominant seventh suspended second and fourth")
}

private val romanBase = Regex("^[♭♯]*([IViv]+)")
private val romanAnnotations = Regex("\\([^)]*\\)")
private val romanSuspension = Regex("sus([24])")

internal fun spokenSuffixForChord(chord: JsonObject, symbol: String, voicing: VoicedChord?): SpokenChordSuffix? {
    val numerator = symbol.substringBefore('/')
    val base = romanBase.find(numerator)
    val suffix = base?.let { numerator.substring(it.value.length).replace(romanAnnotations, "") }.orEmpty()
    val letterQuality = (chord["_letterQuality"] as? JsonPrimitive)?.contentOrNull.takeIf { base == null }
    val minor = base?.groupValues?.get(1)?.first()?.isLowerCase() ?: (letterQuality == "minor")
    val omittedSeventh = (chord["omits"] as? JsonArray).orEmpty().any { (it as? JsonPrimitive)?.intOrNull == 7 }
    val hasSeventh = (chord["type"] as? JsonPrimitive)?.intOrNull == 7 && !omittedSeventh
    val suspensions = (chord["suspensions"] as? JsonArray).orEmpty()
        .mapNotNull { (it as? JsonPrimitive)?.intOrNull?.takeIf { degree -> degree == 2 || degree == 4 } }
        .ifEmpty { romanSuspension.findAll(suffix).map { it.groupValues[1].toInt() }.toList() }
    if (suspensions.isNotEmpty()) {
        return when {
            2 in suspensions && 4 in suspensions ->
                if (hasSeventh) SpokenChordSuffix.SEVENTH_SUS_TWO_FOUR else SpokenChordSuffix.SUS_TWO_FOUR
            2 in suspensions -> if (hasSeventh) SpokenChordSuffix.SEVENTH_SUS_TWO else SpokenChordSuffix.SUS_TWO
            else -> if (hasSeventh) SpokenChordSuffix.SEVENTH_SUS_FOUR else SpokenChordSuffix.SUS_FOUR
        }
    }
    val seventhInterval = voicing?.let { voiced ->
        voiced.tones.firstOrNull { it.degree == 7 }?.let { Math.floorMod(it.midi - voiced.rootMidi, 12) }
    }
    val majorSeventh = seventhInterval?.let { it == 11 } ?: ('△' in suffix)
    return when {
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
    private val accidentals: List<List<ShortArray>> = emptyList(),
    private val functions: Map<String, List<ShortArray>> = emptyMap(),
    private val modes: Map<String, ShortArray> = emptyMap()
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

    fun functionClip(cue: String, midi: Int): ShortArray? {
        val pitch = samplePitch(midi) - SPOKEN_ROOT_DEGREE_PITCHES.first
        return functions[cue]?.getOrNull(pitch)
    }

    fun modeClip(name: String): ShortArray? = modes[name]

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
    private data class FunctionKey(val cue: String, val midi: Int, val frames: Int)

    private val samples = LinkedHashMap<Key, ShortArray>(16, 0.75f, true)
    private val functionSamples = LinkedHashMap<FunctionKey, ShortArray>(16, 0.75f, true)
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

    fun prepareFunction(cue: String, midi: Int, durationBeats: Double, bpm: Double): ShortArray? {
        val clip = clips.functionClip(cue, midi) ?: return null
        return stretchFunction(cue, midi, clip, durationBeats, bpm)
    }

    private fun stretchFunction(
        cue: String,
        midi: Int,
        clip: ShortArray,
        durationBeats: Double,
        bpm: Double
    ): ShortArray? {
        if (bpm <= 0 || clip.isEmpty()) return null
        val chordFrames = (durationBeats * 60 * SPOKEN_ROOT_DEGREE_SAMPLE_RATE / bpm).roundToInt()
        if (chordFrames <= 0) return null
        val target = (chordFrames / 3).coerceIn(clip.size, clip.size * 4).coerceAtMost(chordFrames)
        val key = FunctionKey(cue, midi, target)
        functionSamples[key]?.let { return it }
        val semitoneShift = midi - clips.samplePitch(midi)
        val output = if (target == clip.size && semitoneShift == 0) clip else {
            val sonic = Sonic(SPOKEN_ROOT_DEGREE_SAMPLE_RATE, 1)
            sonic.speed = clip.size.toFloat() / target
            sonic.pitch = 2.0.pow(semitoneShift / 12.0).toFloat()
            sonic.writeShortToStream(clip, clip.size)
            sonic.flushStream()
            ShortArray(target).also { sonic.readShortFromStream(it, target) }
        }
        val budget = 48 * SPOKEN_ROOT_DEGREE_SAMPLE_RATE
        if (output.size <= budget) {
            while (functionSamples.values.sumOf { it.size } + output.size > budget && functionSamples.isNotEmpty()) {
                val oldest = functionSamples.entries.iterator()
                oldest.next()
                oldest.remove()
            }
            functionSamples[key] = output
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
    val functions = SPOKEN_MELODY_FUNCTIONS.associate { (cue, id) ->
        cue to resources.openPitchedVoiceClips(id)
    }
    val modes = SPOKEN_MODE_NAMES.associate { (name, id) ->
        name to resources.openVoiceClip(id)
    }
    return SpokenRootDegreeClips(numbers, suffixes, accidentals, functions, modes)
}

internal val SPOKEN_MELODY_FUNCTIONS: List<Pair<String, Int>> = listOf(
    "root" to R.raw.melody_fn_root,
    "second" to R.raw.melody_fn_second,
    "third" to R.raw.melody_fn_third,
    "fourth" to R.raw.melody_fn_fourth,
    "fifth" to R.raw.melody_fn_fifth,
    "sixth" to R.raw.melody_fn_sixth,
    "seventh" to R.raw.melody_fn_seventh,
    "ninth" to R.raw.melody_fn_ninth,
    "eleventh" to R.raw.melody_fn_eleventh,
    "thirteenth" to R.raw.melody_fn_thirteenth,
    "passing" to R.raw.melody_fn_passing,
    "chromatic passing" to R.raw.melody_fn_chromatic_passing,
    "upper neighbor" to R.raw.melody_fn_upper_neighbor,
    "lower neighbor" to R.raw.melody_fn_lower_neighbor,
    "anticipation" to R.raw.melody_fn_anticipation,
    "suspension" to R.raw.melody_fn_suspension,
    "retardation" to R.raw.melody_fn_retardation,
    "held over" to R.raw.melody_fn_held_over,
    "appoggiatura" to R.raw.melody_fn_appoggiatura,
    "escape" to R.raw.melody_fn_escape,
    "leading" to R.raw.melody_fn_leading,
    "pedal" to R.raw.melody_fn_pedal,
    "color" to R.raw.melody_fn_color,
    "chromatic color" to R.raw.melody_fn_chromatic_color,
    "one" to R.raw.melody_fn_one,
    "two" to R.raw.melody_fn_two,
    "three" to R.raw.melody_fn_three,
    "four" to R.raw.melody_fn_four,
    "five" to R.raw.melody_fn_five,
    "six" to R.raw.melody_fn_six,
    "seven" to R.raw.melody_fn_seven
)

internal val SPOKEN_MODE_NAMES: List<Pair<String, Int>> = listOf(
    "major" to R.raw.mode_major,
    "minor" to R.raw.mode_minor,
    "dorian" to R.raw.mode_dorian,
    "phrygian" to R.raw.mode_phrygian,
    "lydian" to R.raw.mode_lydian,
    "mixolydian" to R.raw.mode_mixolydian,
    "locrian" to R.raw.mode_locrian,
    "ionian" to R.raw.mode_ionian,
    "aeolian" to R.raw.mode_aeolian,
    "harmonic minor" to R.raw.mode_harmonic_minor,
    "phrygian dominant" to R.raw.mode_phrygian_dominant
)

private fun Resources.openPitchedVoiceClips(id: Int): List<ShortArray> =
    openVoiceClip(id).let { clip ->
        val count = SPOKEN_ROOT_DEGREE_PITCHES.count()
        require(clip.size % count == 0)
        val frames = clip.size / count
        List(count) { index -> clip.copyOfRange(index * frames, (index + 1) * frames) }
    }

private fun Resources.openVoiceClip(id: Int): ShortArray {
    val bytes = openRawResource(id).use { it.readBytes() }
    require(bytes.isNotEmpty() && bytes.size % Short.SIZE_BYTES == 0)
    val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    return ShortArray(bytes.size / Short.SIZE_BYTES) { buffer.short }
}
