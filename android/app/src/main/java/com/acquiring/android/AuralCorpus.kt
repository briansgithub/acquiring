package com.acquiring.android

import android.database.sqlite.SQLiteDatabase
import java.io.File
import java.security.MessageDigest
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable data class AuralExampleSettings(
    val popularity: Boolean = true, val variety: Boolean = true,
    val favorites: Boolean = false, val distinguishInversions: Boolean = false,
)
@Serializable data class AuralSourcePassage(
    val occurrenceId: String, val patternId: String, val songId: String,
    val title: String = "", val artist: String = "", val sectionId: String,
    val sectionName: String = "", val sourceRevision: String,
    val startIndex: Int, val endIndex: Int, val view: String,
    val familyId: String, val variantId: String, val keyTonic: String,
    val keyScale: String, val tempo: Int, val events: List<AuralEvent>,
    val context: List<AuralEvent>, val degreeLabels: List<String>,
) {
    // Location, not voicing/instrument/view/pattern ID, determines source familiarity.
    val sourceId: String get() = "$songId|$sectionId|$startIndex|$endIndex"
}
@Serializable data class AuralCorpusProvenance(
    val snapshotId: String, val popularityVersion: String?, val familyMappingVersion: String,
    val passage: AuralSourcePassage, val settings: AuralExampleSettings,
    val selectorVersion: String = "aural-selector-1", val seed: Long,
    val semitoneShift: Int, val recentSongIds: List<String> = emptyList(),
    val favoriteSongIds: List<String> = emptyList(), val heardSourceIds: List<String> = emptyList(),
    val familiar: Boolean = false,
    val assessment: Boolean = false, val supportedOccurrenceId: String? = null,
)
@Serializable data class AuralSourceExposure(val sourceId: String, val songId: String, val at: Long)
internal data class AuralOccurrenceRef(val id: String, val songId: String, val sectionId: String, val sourceId: String)
internal data class AuralPopularity(val score: Double?, val confidence: Double = 0.0)
internal data class AuralSelectionContext(
    val recentSongIds: List<String> = emptyList(), val heardSourceIds: Set<String> = emptySet(),
    val favoriteSongIds: Set<String> = emptySet(), val assessment: Boolean = false,
    val supportedOccurrenceId: String? = null,
)

/** This exact random stream and weighting contract is shared with the offline JS selector. */
internal class AuralSelectionRandom(seed: Long) {
    private var state = seed.toInt().let { if (it == 0) 0x6d2b79f5 else it }
    fun nextDouble(): Double {
        state = state xor (state shl 13); state = state xor (state ushr 17); state = state xor (state shl 5)
        return (state.toLong() and 0xffffffffL).toDouble() / 4294967296.0
    }
}
internal object AuralCorpusSelector {
    private fun popularity(p: AuralPopularity?, enabled: Boolean): Double {
        if (!enabled || p?.score == null || !p.score.isFinite()) return 1.0
        val confidence = if (p.confidence.isFinite()) p.confidence.coerceIn(0.0, 1.0) else 0.0
        return 1.0 + confidence * (p.score.coerceIn(0.0, 1.0) - 0.5)
    }
    fun select(refs: List<AuralOccurrenceRef>, songs: Map<String, AuralPopularity>, sections: Map<String, AuralPopularity>,
               settings: AuralExampleSettings, context: AuralSelectionContext, seed: Long): AuralOccurrenceRef? {
        if (refs.isEmpty()) return null
        if (!context.assessment) context.supportedOccurrenceId?.let { id -> refs.firstOrNull { it.id == id }?.let { return it } }
        val eligible = if (context.assessment) refs.filter { it.sourceId !in context.heardSourceIds }.ifEmpty { refs } else refs
        val rng = AuralSelectionRandom(seed)
        fun choose(ids: List<String>, weight: (String) -> Double): String {
            val ordered = ids.sorted()
            val weights = ordered.map(weight)
            val draw = rng.nextDouble() * weights.sum()
            var cumulative = 0.0
            ordered.forEachIndexed { i, id -> cumulative += weights[i]; if (draw < cumulative) return id }
            return ordered.last()
        }
        val song = choose(eligible.map { it.songId }.distinct()) { id ->
            val index = context.recentSongIds.indexOf(id)
            val recency = if (!settings.variety || index < 0 || index >= 10) 1.0 else if (index < 3) 0.25 else 0.6
            popularity(songs[id], settings.popularity) * recency * if (settings.favorites && id in context.favoriteSongIds) 1.5 else 1.0
        }
        val inSong = eligible.filter { it.songId == song }
        val section = choose(inSong.map { it.sectionId }.distinct()) { popularity(sections[it], settings.popularity) }
        val occurrences = inSong.filter { it.sectionId == section }
        val id = choose(occurrences.map { it.id }) { 1.0 }
        return occurrences.first { it.id == id }
    }
}

internal interface AuralExampleProvider {
    val popularityAvailable: Boolean get() = false
    fun example(base: AuralExercise, settings: AuralExampleSettings, context: AuralSelectionContext): AuralCorpusProvenance?
}

/** Separate read-only sidecar; catalog replacement and Room migrations cannot erase it. */
internal class SqliteAuralExampleProvider(private val file: File) : AuralExampleProvider {
    private val json = Json { ignoreUnknownKeys = true }
    private data class CandidatePool(val refs: List<AuralOccurrenceRef>, val songs: Map<String, AuralPopularity>, val sections: Map<String, AuralPopularity>)
    private val pools = linkedMapOf<String, CandidatePool>()
    private var fileStamp: Pair<Long, Long>? = null
    private var cachedPopularityAvailable: Boolean? = null
    private fun refreshCache() {
        val current = file.lastModified() to file.length()
        if (fileStamp != current) { pools.clear(); cachedPopularityAvailable = null; fileStamp = current }
    }
    private fun open(): SQLiteDatabase? = if (!file.isFile) null else
        SQLiteDatabase.openDatabase(file.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
    override val popularityAvailable: Boolean get() = try {
        refreshCache()
        cachedPopularityAvailable ?: (open()?.use { db -> db.rawQuery("SELECT 1 FROM quiz_song WHERE popularity IS NOT NULL AND confidence > 0 LIMIT 1", null).use { it.moveToFirst() } } ?: false)
            .also { cachedPopularityAvailable = it }
    } catch (_: Exception) { false }
    override fun example(base: AuralExercise, settings: AuralExampleSettings, context: AuralSelectionContext): AuralCorpusProvenance? = try {
        open()?.use { db ->
            refreshCache()
            val metadata = mutableMapOf<String, String>()
            db.rawQuery("SELECT key,value FROM metadata", null).use { while (it.moveToNext()) metadata[it.getString(0)] = it.getString(1) }
            require(metadata["schema_version"] == "1" && !metadata["snapshot_id"].isNullOrBlank())
            val cacheKey = listOf(metadata.getValue("snapshot_id"), metadata["popularity_version"], base.familyId, base.variantId, settings.distinguishInversions).joinToString("|")
            val pool = pools[cacheKey] ?: run {
                val refs = mutableListOf<AuralOccurrenceRef>()
                val songs = mutableMapOf<String, AuralPopularity>()
                val sections = mutableMapOf<String, AuralPopularity>()
                // Only requested target/view descriptors are cached. Payloads are selected by ID.
                db.rawQuery("""SELECT o.occurrence_id,o.song_id,o.section_id,o.source_id,
                    s.popularity,s.confidence,t.popularity,t.confidence FROM quiz_occurrence o
                    JOIN quiz_song s ON s.song_id=o.song_id JOIN quiz_section t ON t.section_id=o.section_id
                    WHERE o.family_id=? AND o.variant_id=? AND o.view=?""",
                    arrayOf(base.familyId, base.variantId, if (settings.distinguishInversions) "harmony_bass" else "harmony")).use { c ->
                    while (c.moveToNext()) {
                        refs += AuralOccurrenceRef(c.getString(0), c.getString(1), c.getString(2), c.getString(3))
                        songs[c.getString(1)] = AuralPopularity(if (c.isNull(4)) null else c.getDouble(4), c.getDouble(5))
                        sections[c.getString(2)] = AuralPopularity(if (c.isNull(6)) null else c.getDouble(6), c.getDouble(7))
                    }
                }
                CandidatePool(refs, songs, sections).also { pool ->
                    if (pools.size >= 4) pools.remove(pools.keys.first())
                    pools[cacheKey] = pool
                }
            }
            val chosen = AuralCorpusSelector.select(pool.refs, pool.songs, pool.sections, settings, context, base.seed) ?: return@use null
            val passage = db.rawQuery("SELECT payload FROM quiz_occurrence WHERE occurrence_id=?", arrayOf(chosen.id)).use { c ->
                require(c.moveToFirst()); json.decodeFromString<AuralSourcePassage>(c.getString(0))
            }
            require(passage.occurrenceId == chosen.id && passage.songId == chosen.songId && passage.sectionId == chosen.sectionId && passage.sourceId == chosen.sourceId)
            AuralCorpusProvenance(metadata.getValue("snapshot_id"), metadata["popularity_version"], metadata["family_mapping_version"] ?: "current-triads-1",
                passage, settings, seed = base.seed and 0xffffffffL, semitoneShift = base.provenance.target.octaveShift * 12,
                recentSongIds = context.recentSongIds, favoriteSongIds = context.favoriteSongIds.intersect(pool.songs.keys).sorted(),
                heardSourceIds = context.heardSourceIds.intersect(pool.refs.map { it.sourceId }.toSet()).sorted(), familiar = passage.sourceId in context.heardSourceIds,
                assessment = context.assessment, supportedOccurrenceId = context.supportedOccurrenceId)
        }
    } catch (_: Exception) { null }
}

/** Rebuild answers from validated musical material; never trust saved answer fields. */
internal fun auralWithCorpus(base: AuralExercise, source: AuralCorpusProvenance): AuralExercise {
    val p = source.passage
    require(source.selectorVersion == "aural-selector-1" && source.seed == (base.seed and 0xffffffffL) && source.snapshotId.isNotBlank())
    require(p.familyId == base.familyId && p.variantId == base.variantId && p.degreeLabels == base.fullDegrees)
    require(p.view == if (source.settings.distinguishInversions) "harmony_bass" else "harmony")
    require(p.keyScale == "major" && p.keyTonic in MusicTheory.NOTE_TO_PC && p.tempo in 20..200)
    require(p.events.size == base.events.size && p.startIndex >= 0 && p.endIndex >= p.startIndex && p.sourceRevision.isNotBlank())
    require(source.semitoneShift == base.provenance.target.octaveShift * 12)
    fun transform(event: AuralEvent): AuralEvent {
        require(event.notes.size in 2..16 && event.notes == event.notes.sorted() && event.bassMidi == event.notes.first())
        require(event.rootMidi in 1..127 && event.notes.all { it in 1..127 } && event.beats.isFinite() && event.beats > 0 && event.beats <= 32)
        val offsets = mapOf("I" to 0, "ii" to 2, "iii" to 4, "IV" to 5, "V" to 7, "vi" to 9, "vii°" to 11, "V/V" to 2)
        val expectedRoot = (MusicTheory.NOTE_TO_PC.getValue(p.keyTonic) + requireNotNull(offsets[event.degree])) % 12
        val intervals = when (event.degree) { "ii", "iii", "vi" -> listOf(0, 3, 7); "vii°" -> listOf(0, 3, 6); else -> listOf(0, 4, 7) }
        require(event.rootMidi % 12 == expectedRoot && event.notes.map { it % 12 }.toSet() == intervals.map { (expectedRoot + it) % 12 }.toSet())
        val shift = source.semitoneShift
        require((event.notes + event.rootMidi).all { it + shift in 1..127 })
        return event.copy(notes = event.notes.map { it + shift }, rootMidi = event.rootMidi + shift, bassMidi = event.bassMidi + shift)
    }
    val events = p.events.map(::transform)
    require(events.map { it.degree } == base.fullDegrees)
    // Same-key tonic context is required; future harmonic contexts can expand this contract.
    require(p.context.isNotEmpty() && p.context.size <= 8 && p.context.last().degree == "I")
    val context = p.context.map(::transform)
    // Existing mastery keys use one spelling per pitch class; preserve source spelling in passage.
    val keyTonic = listOf("C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B")[MusicTheory.NOTE_TO_PC.getValue(p.keyTonic)]
    val task = base.microphoneTask?.let { task ->
        val midis = if (task.kind == "scaleDegree") listOf(48 + source.semitoneShift + MusicTheory.NOTE_TO_PC.getValue(p.keyTonic) + MusicTheory.SCALE_INTERVALS.getValue("major")[requireNotNull(task.scaleDegree) - 1])
            else task.eventIndices.map { if (task.kind == "bass") events[it].bassMidi else events[it].rootMidi }
        task.copy(targetMidis = midis)
    }
    fun digest(value: String) = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
    val ex = base.copy(id = base.id + "-" + digest(p.occurrenceId), keyTonic = keyTonic, tempo = p.tempo,
        events = events, context = context, microphoneTask = task, answer = base.answer.copy(targetMidis = task?.targetMidis.orEmpty()),
        fingerprint = "source-" + digest(p.sourceId), previouslyExposed = source.familiar,
        provenance = base.provenance.copy(keyTonic = keyTonic, tempo = p.tempo, inversions = emptyList(), spreads = emptyList(), contextDegrees = context.map { it.degree }, corpus = source))
    // Enforce the same audio duration and pitch constraints before accepting the example.
    auralPlaybackPlan(auralPromptEvents(ex), ex.tempo.toDouble(), 8000)
    return ex
}
