package com.acquiring.android

import android.database.sqlite.SQLiteDatabase
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.util.BitSet
import java.util.PriorityQueue
import java.util.zip.GZIPInputStream
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import kotlin.math.log2

@Serializable data class AuralPatternTarget(val id: String, val view: String, val tokens: List<String>, val labels: List<String>, val start: Int, val end: Int, val snapshotId: String)
internal fun AuralPatternTarget.sourceMode(): String? = runCatching {
    Json.parseToJsonElement(tokens.first()).jsonObject["mode"]?.jsonPrimitive?.content
}.getOrNull()
internal data class AuralCatalogRow(val target: AuralPatternTarget, val songs: Int, val occurrences: Int, val sections: Int, val effective: Int, val score: Double,
    val globalSongs: Int = songs, val globalOccurrences: Int = occurrences) {
    val length get() = target.tokens.size
}
@Serializable internal data class AuralCatalogPosition(val startIndex: Int, val endIndex: Int, val startBeat: Double, val endBeat: Double,
    val degree: String, val roman: String, val notes: List<Int>, val rootMidi: Int, val bassMidi: Int, val varyingBass: Boolean = false)
internal data class AuralCatalogRun(val id: Int, val stableId: String, val view: String, val song: String, val section: String, val revision: String,
    val tokens: List<String>, val positions: List<AuralCatalogPosition>, val key: KeyInfo, val sourceKey: KeyInfo)
internal data class AuralPlaybackSource(val song: Song, val section: ExtractedSection, val sectionId: String, val startBeat: Double, val endBeat: Double,
    val sections: Map<String,ExtractedSection> = emptyMap())
internal data class AuralPatternSong(val id:String,val title:String,val artist:String,val popularityScore:Double?=null)
internal data class AuralChordVariant(val label: String, val root: String)
internal val auralPatternSongOrder = compareByDescending<AuralPatternSong> { it.popularityScore ?: -1.0 }
    .thenBy { it.title.lowercase(java.util.Locale.ROOT) }.thenBy { it.artist.lowercase(java.util.Locale.ROOT) }.thenBy { it.id }
internal fun auralMeetsMinimumPopularity(score: Double?, percent: Int?): Boolean {
    if (percent == null) return true
    require(percent in 0..100)
    return score != null && score.isFinite() && score in 0.0..1.0 && score >= percent / 100.0
}
internal fun auralPatternId(tokens: List<String>, view: String): String {
    val multipliers = intArrayOf(16777619, 2246822519L.toInt(), 3266489917L.toInt(), 668265263)
    val hashes = IntArray(4)
    tokens.forEach { token ->
        val bytes = ByteBuffer.wrap(MessageDigest.getInstance("SHA-256").digest(token.toByteArray())).order(ByteOrder.LITTLE_ENDIAN)
        for (i in 0..3) hashes[i] = hashes[i] * multipliers[i] + bytes.getInt(i * 4)
    }
    val namespace = MessageDigest.getInstance("SHA-256").digest("aural-normalizer-1\u0000$view".toByteArray()).joinToString("") { "%02x".format(it) }.take(12)
    return "p_${namespace}_${tokens.size}_" + hashes.joinToString("") { it.toUInt().toString(16).padStart(8, '0') }
}
internal fun auralCatalogBase(length: Int, songs: Int, effective: Int) = log2(length.toDouble()) * log2(1.0 + songs) * log2(1.0 + effective)

/** All calls run on an I/O dispatcher. No substring mining or full-song scans. */
internal class AuralCatalog(private val file: File) : AutoCloseable {
    private val json = Json { ignoreUnknownKeys = true }
    private val db = SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READONLY)
    val snapshotId: String
    val supportsModeAnalysis: Boolean
    val supportsStartGrouping: Boolean
    private val suffix: IntArray
    private val songByRun: Array<String>
    private val sectionByRun: Array<String>
    private val validSongIds: Set<String>
    private val runs = linkedMapOf<Int, AuralCatalogRun>()
    private val chordVariantCache = mutableMapOf<String, List<AuralChordVariant>>()
    private var rootLabelsByToken: Map<String, String>? = null
    private var eligibleRanksCache: Pair<Int, AuralRankEligibility>? = null
    private var reducedRanges = false
    private data class BucketQuery(val view: String, val mode: String?, val query: AuralProgressionQuery, val percent: Int?)
    private val matchingBucketCache = linkedMapOf<BucketQuery, Map<Int, List<AuralStartGroup>>>()
    private data class GroupRanges(val view: String, val data: IntArray, val groups: List<AuralStartGroup>, val modes: List<String>)
    private var groupRanges: GroupRanges? = null
    val popularity = mutableMapOf<String, AuralPopularity>()
    var popularityVersion: String? = null; private set
    var popularityDescription = "No popularity measurements installed"; private set
    init {
        try {
            val metadata = mutableMapOf<String, String>()
            db.rawQuery("SELECT key,value FROM metadata", null).use { while (it.moveToNext()) metadata[it.getString(0)] = it.getString(1) }
            require(metadata["schema_version"] in setOf("aural-catalog-1", "aural-catalog-2", "aural-catalog-3"))
            supportsModeAnalysis = metadata["schema_version"] != "aural-catalog-1"
            supportsStartGrouping = metadata["schema_version"] == "aural-catalog-3"
            snapshotId = requireNotNull(metadata["snapshot_id"])
            reducedRanges = metadata["sequence_reduction_version"] == AURAL_LOOP_REDUCTION_VERSION
            validSongIds = buildSet {
                db.rawQuery("SELECT id FROM catalog_song",null).use { c -> while(c.moveToNext()) add(c.getString(0)) }
            }
            val bytes = db.rawQuery("SELECT length(data) FROM catalog_array WHERE name='suffix_locations'", null).use { check(it.moveToFirst()); it.getInt(0) }
            suffix = IntArray(bytes / 4)
            var byteOffset = 0
            while (byteOffset < bytes) {
                db.rawQuery("SELECT substr(data,?,1048576) FROM catalog_array WHERE name='suffix_locations'", arrayOf((byteOffset+1).toString())).use {
                    check(it.moveToFirst()); val block = it.getBlob(0); ByteBuffer.wrap(block).order(ByteOrder.LITTLE_ENDIAN).asIntBuffer().get(suffix,byteOffset/4,block.size/4); byteOffset += block.size
                }
            }
            val names = mutableListOf<String>()
            val sectionNames = mutableListOf<String>()
            // Keep each result inside a CursorWindow. Large Android cursors otherwise repeatedly
            // restart their query and skip every preceding row when filling the next window.
            var moreRuns = true
            while (moreRuns) {
                var count = 0
                db.rawQuery("SELECT id,song_id,section_id FROM catalog_run WHERE id>=? ORDER BY id LIMIT 2048", arrayOf(names.size.toString())).use {
                    while (it.moveToNext()) { check(it.getInt(0) == names.size); names += it.getString(1).intern(); sectionNames += it.getString(2).intern(); count++ }
                }
                moreRuns = count == 2048
            }
            songByRun = names.toTypedArray()
            sectionByRun = sectionNames.toTypedArray()
            val overlay = File(file.parentFile, "aural-popularity.db")
            if (overlay.isFile) SQLiteDatabase.openDatabase(overlay.path, null, SQLiteDatabase.OPEN_READONLY).use { pop ->
                var newest = ""
                pop.rawQuery("SELECT song_id,score,confidence,measured_at FROM popularity", null).use { c -> while (c.moveToNext()) {
                    if (!c.isNull(1)) popularity[c.getString(0)] = AuralPopularity(c.getDouble(1), c.getDouble(2))
                    if (!c.isNull(3) && c.getString(3) > newest) newest = c.getString(3)
                } }
                val provider=pop.rawQuery("SELECT value FROM metadata WHERE key='attribution'",null).use { if(it.moveToFirst()) it.getString(0) else "Popularity data" }
                popularityVersion=pop.rawQuery("SELECT value FROM metadata WHERE key='snapshotId'",null).use { if(it.moveToFirst()) it.getString(0) else null }
                popularityDescription = "${popularity.size} songs · ${newest.take(10)} · $provider"
            }
        } catch (error: Throwable) { db.close(); throw error }
    }
    private fun unpack(bytes: ByteArray) = GZIPInputStream(bytes.inputStream()).bufferedReader().use { it.readText() }
    @Synchronized fun run(id: Int): AuralCatalogRun = runs[id] ?: db.rawQuery(
        if (supportsModeAnalysis) "SELECT stable_id,view,song_id,section_id,revision,tokens,positions,key_json,source_key_json FROM catalog_run WHERE id=?"
        else "SELECT stable_id,view,song_id,section_id,revision,tokens,positions,key_json,key_json FROM catalog_run WHERE id=?", arrayOf(id.toString())).use { c ->
        check(c.moveToFirst())
        AuralCatalogRun(id, c.getString(0), c.getString(1), c.getString(2), c.getString(3), c.getString(4),
            json.decodeFromString<List<String>>(unpack(c.getBlob(5))), json.decodeFromString<List<AuralCatalogPosition>>(unpack(c.getBlob(6))), json.decodeFromString<KeyInfo>(c.getString(7)), json.decodeFromString<KeyInfo>(c.getString(8)))
    }.also { if (runs.size >= 64) runs.remove(runs.keys.first()); runs[id] = it }
    fun target(start: Int, end: Int, length: Int): AuralPatternTarget {
        val run = run(suffix[start * 2]); val offset = suffix[start * 2 + 1]
        val tokens = run.tokens.subList(offset, offset + length)
        val labels = run.positions.subList(offset, offset + length).map { if (run.view.endsWith("harmony_bass")) it.roman else it.degree }
        return AuralPatternTarget(auralPatternId(tokens, run.view), run.view, tokens, labels, start, end, snapshotId)
    }
    fun lookup(tokens: List<String>, view: String): AuralPatternTarget? {
        fun compare(rank: Int): Int {
            val r = run(suffix[rank * 2]); val start = suffix[rank * 2 + 1]
            if (r.view != view) return r.view.compareTo(view)
            tokens.forEachIndexed { i, token -> if (start + i >= r.tokens.size) return -1 else if (r.tokens[start + i] != token) return r.tokens[start + i].compareTo(token) }
            return 0
        }
        var low = 0; var high = suffix.size / 2
        while (low < high) { val mid = (low + high) ushr 1; if (compare(mid) < 0) low = mid + 1 else high = mid }
        val start = low; high = suffix.size / 2
        while (low < high) { val mid = (low + high) ushr 1; if (compare(mid) <= 0) low = mid + 1 else high = mid }
        return if (low > start) target(start, low - 1, tokens.size) else null
    }
    private fun factor(song: String, settings: AuralExampleSettings, recent: List<String>, favorites: Set<String>): Double {
        val p = popularity[song]
        val pop = if (settings.popularity && p?.score != null) 1 + p.confidence.coerceIn(0.0,1.0) * (p.score.coerceIn(0.0,1.0) - .5) else 1.0
        val i = recent.indexOf(song)
        return pop * (if (settings.variety && i in 0..9) if (i < 3) .25 else .6 else 1.0) * (if (settings.favorites && song in favorites) 1.5 else 1.0)
    }
    fun stats(target: AuralPatternTarget, settings: AuralExampleSettings, recent: List<String>, favorites: Set<String>): AuralCatalogRow =
        requireNotNull(statsMatching(target,settings,recent,favorites,null))
    fun statsMatching(target: AuralPatternTarget, settings: AuralExampleSettings, recent: List<String>, favorites: Set<String>,
        minimumPopularityPercent: Int?): AuralCatalogRow? {
        val grouped = mutableMapOf<String, MutableList<Pair<Int, Int>>>()
        val allSongs = if (minimumPopularityPercent == null) null else mutableSetOf<String>()
        var occurrences = 0
        var globalOccurrences = 0
        for (rank in target.start..target.end) {
            val r = suffix[rank * 2]; val song = songByRun[r]
            if(song !in validSongIds) continue
            globalOccurrences++
            allSongs?.add(song)
            if (!auralMeetsMinimumPopularity(popularity[song]?.score,minimumPopularityPercent)) continue
            grouped.getOrPut(song) { mutableListOf() } += r to suffix[rank * 2 + 1]
            occurrences++
        }
        if (grouped.isEmpty()) return null
        var effective = 0
        val sections = mutableSetOf<String>()
        grouped.values.forEach { matches ->
            var priorRun = -1; var end = -1; var count = 0
            matches.sortWith(compareBy<Pair<Int,Int>> { it.first }.thenBy { it.second })
            matches.forEach { (r, start) ->
                sections += sectionByRun[r]
                if (count < 4 && (r != priorRun || start > end)) { count++; priorRun = r; end = start + target.tokens.size - 1 }
            }
            effective += count
        }
        val score = auralCatalogBase(target.tokens.size, grouped.size, effective) * grouped.keys.sumOf { factor(it, settings, recent, favorites) } / grouped.size
        return AuralCatalogRow(target, grouped.size, occurrences, sections.size, effective, score,
            allSongs?.size ?: grouped.size, globalOccurrences)
    }
    @Synchronized private fun eligibleRankBits(percent: Int): AuralRankEligibility {
        require(percent in 0..100)
        eligibleRanksCache?.takeIf { it.first == percent }?.let { return it.second }
        val eligible = BitSet(suffix.size / 2)
        for (rank in 0 until suffix.size / 2) {
            val song = songByRun[suffix[rank * 2]]
            if (song in validSongIds && auralMeetsMinimumPopularity(popularity[song]?.score,percent)) eligible.set(rank)
        }
        return AuralRankEligibility(eligible).also { eligibleRanksCache = percent to it }
    }
    fun groupedBuckets(settings: AuralExampleSettings): Map<Int, List<AuralStartGroup>> {
        val view = if (supportsModeAnalysis) settings.catalogView() else if (settings.distinguishInversions) "harmony_bass" else "harmony"
        val mode = settings.modeFilter.takeIf { supportsModeAnalysis && settings.analysis == "filterMode" && it in AURAL_MODES }
        val found = mutableMapOf<Int, MutableMap<String, AuralStartGroup>>()
        val columns = if (supportsStartGrouping) "min_length,max_length,start_group,start_group_label" else "min_length,max_length"
        db.rawQuery("SELECT DISTINCT $columns FROM catalog_range WHERE view=? " +
            (if (mode == null) "" else "AND mode=? "), (listOf(view) + listOfNotNull(mode)).toTypedArray()).use { c ->
            while (c.moveToNext()) {
                if(c.isNull(0)) continue
                val group = if (supportsStartGrouping) {
                    val parsed = auralStartGroup(c.getString(3)) ?: continue
                    parsed.copy(id = c.getString(2), label = c.getString(3))
                } else AuralStartGroup("", "All starting chords", 0, "", true, false)
                for (length in c.getInt(0)..c.getInt(1)) found.getOrPut(length) { mutableMapOf() }[group.id] = group
            }
        }
        return found.toSortedMap().mapValues { it.value.values.sortedWith(auralStartGroupOrder) }
    }

    /** Cache the compact metadata for one analysis view (about 17 MB on the full catalog). */
    private fun rangesForGroups(view: String): GroupRanges {
        groupRanges?.takeIf { it.view == view }?.let { return it }
        val size = db.rawQuery("SELECT count(*) FROM catalog_range WHERE view=?",arrayOf(view)).use { check(it.moveToFirst()); it.getInt(0) }
        val packed = IntArray(Math.multiplyExact(size,6))
        val groups = linkedMapOf<String, Pair<Int,AuralStartGroup>>()
        val modes = linkedMapOf<String,Int>()
        var at = 0; var last = -1L; var more = true
        val grouping = if (supportsStartGrouping) "start_group,start_group_label" else "'','All starting chords'"
        val mode = if (supportsModeAnalysis) "mode" else "''"
        while(more) {
            var count = 0
            db.rawQuery("SELECT id,start,end,min_length,max_length,$grouping,$mode FROM catalog_range NOT INDEXED WHERE id>? AND view=? ORDER BY id LIMIT 2048",
                arrayOf(last.toString(),view)).use { c -> while(c.moveToNext()) {
                if (Thread.currentThread().isInterrupted) throw java.util.concurrent.CancellationException()
                last=c.getLong(0);count++
                val id=c.getString(5)
                val group=groups.getOrPut(id) {
                    val label=c.getString(6)
                    groups.size to (if(supportsStartGrouping) requireNotNull(auralStartGroup(label)).copy(id=id,label=label)
                        else AuralStartGroup("",label,0,"",true,false))
                }.first
                val modeIndex=modes.getOrPut(c.getString(7).orEmpty()) { modes.size }
                for(column in 1..4) packed[at++]=c.getInt(column)
                packed[at++]=group;packed[at++]=modeIndex
            } }
            more=count==2048
        }
        check(at==packed.size)
        return GroupRanges(view,packed,groups.values.map { it.second },modes.keys.toList()).also { groupRanges=it }
    }

    /** Existence checks over compact ranges, without ranking or materializing every sequence. */
    @Synchronized fun matchingBuckets(settings: AuralExampleSettings, query: AuralProgressionQuery = AuralProgressionQuery(),
        minimumPopularityPercent: Int? = null): Map<Int, List<AuralStartGroup>> {
        val view = if (supportsModeAnalysis) settings.catalogView() else if (settings.distinguishInversions) "harmony_bass" else "harmony"
        val mode = settings.modeFilter.takeIf { supportsModeAnalysis && settings.analysis == "filterMode" && it in AURAL_MODES }
        val key = BucketQuery(view, mode, query, minimumPopularityPercent)
        matchingBucketCache[key]?.let { return it }
        val eligible = minimumPopularityPercent?.let { eligibleRankBits(it) }
        if (eligible?.isEmpty == true) return emptyMap()
        val groups = mutableMapOf<String, AuralStartGroup>()
        val lengths = mutableMapOf<String, BitSet>()
        // For a run offset, store the earliest exclusive end of a matching query.
        // One small array per inspected run avoids decoding a run for each suffix range.
        val matchEnds = mutableMapOf<Int, IntArray>()
        val ranges = rangesForGroups(view)
        val data = ranges.data
        val modeIndex = mode?.let { ranges.modes.indexOf(it) }
        for (at in data.indices step 6) {
            if (Thread.currentThread().isInterrupted) throw java.util.concurrent.CancellationException()
            if (modeIndex != null && data[at+5] != modeIndex) continue
            val start = data[at]; val end = data[at+1]
            if (eligible != null && !eligible.hasAny(start,end)) continue
            var low = maxOf(2, data[at+2]); val high = data[at+3]
            val group = ranges.groups[data[at+4]]
            val id = group.id
            val found = lengths.getOrPut(id) { BitSet() }
            if (found.nextClearBit(low) > high) continue
            groups[id] = group
            val runId = suffix[start * 2]; val offset = suffix[start * 2 + 1]
            if (query.chords.isNotEmpty()) {
                val ends = matchEnds.getOrPut(runId) {
                    val source = run(runId)
                    val labels = source.positions.map { if (view.endsWith("harmony_bass")) it.roman else it.degree }
                    val roots = if (view.endsWith("harmony_bass") && query.chords.any { it.exact != null }) rootLabels(source.tokens) else labels
                    val result = IntArray(labels.size) { Int.MAX_VALUE }
                    var next = Int.MAX_VALUE
                    for (i in labels.indices.reversed()) {
                        if (i + query.chords.size <= labels.size && query.chords.indices.all { j ->
                            query.chords[j].matches(labels[i+j], roots[i+j])
                        }) next = i + query.chords.size
                        result[i] = next
                    }
                    result
                }
                if (ends[offset] == Int.MAX_VALUE) continue
                low = maxOf(low, ends[offset] - offset)
            }
            if (low > high) continue
            if (reducedRanges) found.set(low, high + 1)
            else {
                val tokens = run(runId).tokens
                var length = found.nextClearBit(low)
                while (length <= high) {
                    if (!auralReduceLoop(tokens.subList(offset, offset + length)).redundant) found.set(length)
                    length = found.nextClearBit(length + 1)
                }
            }
        }
        val result = sortedMapOf<Int, MutableList<AuralStartGroup>>()
        lengths.forEach { (id, bits) ->
            var length = bits.nextSetBit(2)
            while (length >= 0) { result.getOrPut(length) { mutableListOf() }.add(groups.getValue(id)); length = bits.nextSetBit(length + 1) }
        }
        return result.mapValues { it.value.sortedWith(auralStartGroupOrder) }.also {
            if (matchingBucketCache.size >= 4) matchingBucketCache.remove(matchingBucketCache.keys.first())
            matchingBucketCache[key] = it
        }
    }

    @Synchronized fun chordVariants(settings: AuralExampleSettings, chord: AuralChordConstraint): List<AuralChordVariant> {
        val relative = supportsModeAnalysis && settings.analysis == "relativeMajor"
        val mode = settings.modeFilter.takeIf { settings.analysis == "filterMode" }
        val field = if (settings.distinguishInversions) "inversion_label" else "label"
        val cacheKey = "$relative|$mode|$field|${chord.degree}|${chord.accidental}"
        chordVariantCache[cacheKey]?.let { return it }
        val found = linkedSetOf<AuralChordVariant>()
        db.rawQuery("SELECT label,inversion_label,token FROM catalog_token", null).use { cursor -> while (cursor.moveToNext()) {
            val token = runCatching { json.parseToJsonElement(cursor.getString(2)).jsonObject }.getOrNull() ?: continue
            if ((token["version"]?.jsonPrimitive?.content == "aural-relative-1") != relative) continue
            if (mode != null && token["mode"]?.jsonPrimitive?.content != mode) continue
            val label = if (settings.distinguishInversions) cursor.getString(1) else cursor.getString(0)
            val group = auralStartGroup(label) ?: continue
            if (group.degree == chord.degree && group.accidental == chord.accidental)
                found += AuralChordVariant(auralCanonicalChord(label), auralCanonicalChord(cursor.getString(0)))
        } }
        return found.sortedWith(compareBy<AuralChordVariant> { it.label.length }.thenBy { it.label }).also { chordVariantCache[cacheKey] = it }
    }

    @Synchronized private fun rootLabels(tokens: List<String>): List<String> {
        if (rootLabelsByToken == null) {
            val found = mutableMapOf<String, String>()
            db.rawQuery("SELECT token,label FROM catalog_token", null).use { cursor -> while (cursor.moveToNext()) found[cursor.getString(0)] = cursor.getString(1) }
            rootLabelsByToken = found
        }
        return tokens.map { rootLabelsByToken?.get(it).orEmpty() }
    }

    inner class Ranking(settings: AuralExampleSettings, recent: List<String>, favorites: Set<String>, minLength: Int = 2, maxLength: Int = Int.MAX_VALUE, query: AuralProgressionQuery = AuralProgressionQuery(), startGroup: String? = null,
        minimumPopularityPercent: Int? = null) {
        private val settings = settings.copy(); private val recent = recent.toList(); private val favorites = favorites.toSet()
        private val sortOrder = settings.sortOrder.takeIf { it in setOf("mostSongs", "recommended", "longest", "shortest") } ?: "mostSongs"
        private val minimumPopularityPercent = minimumPopularityPercent
        private val query = query
        private val multiplier = (if (settings.popularity) maxOf(1.0,popularity.values.maxOfOrNull { 1 + it.confidence.coerceIn(0.0,1.0) * ((it.score ?: .5)-.5) } ?: 1.0) else 1.0) * (if (settings.favorites && favorites.isNotEmpty()) 1.5 else 1.0)
        private val minimum=minLength; private val maximum=maxLength
        private val startGroup = startGroup
        private val eligibleRanks = minimumPopularityPercent?.let { eligibleRankBits(it) }
        private fun key(e: Entry): List<Int> {
            val songs = e.row?.globalSongs ?: e.songs
            val occurrences = e.row?.globalOccurrences ?: e.end - e.start + 1
            val length = e.row?.length ?: if (sortOrder == "shortest") e.low else e.high
            return when (sortOrder) {
                "longest" -> listOf(length,songs,occurrences)
                "shortest" -> listOf(-length,songs,occurrences)
                else -> listOf(songs,occurrences,length)
            }
        }
        private fun order(a: Entry, b: Entry): Int {
            val priority = if (sortOrder == "recommended") b.bound.compareTo(a.bound)
                else key(a).zip(key(b)).firstNotNullOfOrNull { (left,right) ->
                    right.compareTo(left).takeIf { it != 0 }
                } ?: 0
            if (priority != 0) return priority
            if (a.row == null || b.row == null) return (if (a.row == null) 0 else 1) - (if (b.row == null) 0 else 1)
            return rowOrder(sortOrder).compare(a.row,b.row)
        }
        private val heap = PriorityQueue<Entry>(::order)
        private val view = if (supportsModeAnalysis) settings.catalogView() else if (settings.distinguishInversions) "harmony_bass" else "harmony"
        private val mode = settings.modeFilter.takeIf { supportsModeAnalysis && settings.analysis == "filterMode" && it in AURAL_MODES }
        private val highOrder = if(maxLength==Int.MAX_VALUE) "max_length" else "MIN(max_length,$maxLength)"
        private val lowOrder = if(minLength<=2) "min_length" else "MAX(min_length,$minLength)"
        private val ranges=db.rawQuery("SELECT start,end,min_length,max_length,songs,upper_score FROM catalog_range WHERE view=? " +
            (if (mode == null) "" else "AND mode=? ") + (if (supportsStartGrouping && startGroup != null) "AND start_group=? " else "") +
            "AND max_length>=? AND min_length<=? ORDER BY " + when(sortOrder) {
                "recommended" -> "upper_score DESC,id"
                "longest" -> "$highOrder DESC,songs DESC,(end-start+1) DESC,id"
                "shortest" -> "$lowOrder ASC,songs DESC,(end-start+1) DESC,id"
                else -> "songs DESC,(end-start+1) DESC,$highOrder DESC,id"
            }, (listOf(view) + listOfNotNull(mode) + listOfNotNull(startGroup.takeIf { supportsStartGrouping }) + listOf(minLength.toString(), maxLength.toString())).toTypedArray())
        private var rangeAvailable=if (eligibleRanks?.isEmpty == true) false else ranges.moveToFirst()
        init { if (!rangeAvailable) ranges.close() }
        private fun refineFrontier() {
            while(rangeAvailable && (heap.isEmpty() || order(Entry(ranges.getInt(0),ranges.getInt(1),maxOf(ranges.getInt(2),minimum),minOf(ranges.getInt(3),maximum),
                ranges.getInt(4),ranges.getDouble(5)*multiplier),heap.peek()) <= 0)) {
                add(ranges.getInt(0),ranges.getInt(1),maxOf(ranges.getInt(2),minimum),minOf(ranges.getInt(3),maximum),ranges.getInt(4))
                rangeAvailable=ranges.moveToNext()
            }
            if(!rangeAvailable && !ranges.isClosed) ranges.close()
        }
        private fun add(start: Int, end: Int, low: Int, high: Int, songs: Int) {
            if (eligibleRanks != null && !eligibleRanks.hasAny(start,end)) return
            heap.add(Entry(start, end, low, high, songs, auralCatalogBase(high, songs, minOf(end - start + 1, songs * 4)) * multiplier))
        }
        fun page(limit: Int = 30): List<AuralCatalogRow> {
            val results = mutableListOf<AuralCatalogRow>()
            while (hasMore && results.size < limit) {
                if (Thread.currentThread().isInterrupted) break
                refineFrontier()
                if (heap.isEmpty()) break
                val e = heap.remove()
                if (e.row != null) { results += e.row; continue }
                if (e.low != e.high) { val mid = (e.low + e.high) ushr 1; add(e.start,e.end,e.low,mid,e.songs); add(e.start,e.end,mid+1,e.high,e.songs) }
                else {
                    val target = target(e.start,e.end,e.low)
                    if (auralReduceLoop(target.tokens).redundant) continue
                    if (!supportsStartGrouping && startGroup != null && auralStartGroup(target.labels.firstOrNull().orEmpty())?.id != startGroup) continue
                    val roots = if (query.chords.any { it.exact != null } && view.endsWith("harmony_bass")) rootLabels(target.tokens) else target.labels
                    if (!query.matches(target.labels, roots)) continue
                    val row = statsMatching(target, this.settings, this.recent, this.favorites, minimumPopularityPercent) ?: continue
                    heap.add(e.copy(bound = row.score, row = row))
                }
            }
            return results
        }
        val hasMore get() = rangeAvailable || heap.isNotEmpty()
        fun close() { if(!ranges.isClosed) ranges.close(); heap.clear(); rangeAvailable=false }
    }
    private data class Entry(val start: Int, val end: Int, val low: Int, val high: Int, val songs: Int, val bound: Double, val row: AuralCatalogRow? = null)
    fun children(target: AuralPatternTarget, settings: AuralExampleSettings, recent: List<String>, favorites: Set<String>,
        minimumPopularityPercent: Int? = null): List<AuralCatalogRow> =
        auralRetainedChildren(target.tokens).mapNotNull { lookup(it,target.view) }
            .distinctBy { it.id }.mapNotNull { statsMatching(it,settings,recent,favorites,minimumPopularityPercent) }
            .sortedWith(rowOrder(settings.sortOrder))
    /** One entry per supporting song, regardless of repeated loops or sections. */
    fun songs(target:AuralPatternTarget, minimumPopularityPercent: Int? = null):List<AuralPatternSong> {
        require(target.snapshotId==snapshotId && lookup(target.tokens,target.view)==target)
        val result=mutableListOf<AuralPatternSong>()
        db.rawQuery("""SELECT DISTINCT song.id,song.title,song.artist FROM catalog_suffix s
            JOIN catalog_run r ON r.id=s.run_id JOIN catalog_song song ON song.id=r.song_id
            WHERE s.rank BETWEEN ? AND ? ORDER BY song.title COLLATE NOCASE,song.artist COLLATE NOCASE,song.id""",
            arrayOf(target.start.toString(),target.end.toString())).use { c -> while(c.moveToNext()) result+=AuralPatternSong(c.getString(0),c.getString(1),c.getString(2),
                popularity[c.getString(0)]?.score?.takeIf { it.isFinite() && it in 0.0..1.0 }) }
        return result.filter { auralMeetsMinimumPopularity(it.popularityScore,minimumPopularityPercent) }.sortedWith(auralPatternSongOrder)
    }
    /** One candidate per distinct song/section, regardless of repeated occurrences. */
    fun queueCandidates(target: AuralPatternTarget): List<QueueCandidate> {
        require(target.snapshotId == snapshotId && lookup(target.tokens, target.view) == target)
        val result = mutableListOf<QueueCandidate>()
        db.rawQuery("""SELECT DISTINCT song.id,song.title,song.artist,section.id,section.name
            FROM catalog_suffix s JOIN catalog_suffix e ON e.run_id=s.run_id AND e.offset=s.offset+?
            JOIN catalog_run r ON r.id=s.run_id
            JOIN catalog_song song ON song.id=r.song_id
            JOIN catalog_section section ON section.id=r.section_id
            WHERE s.rank BETWEEN ? AND ? ORDER BY song.id,section.id""",
            arrayOf((target.tokens.size-1).toString(),target.start.toString(),target.end.toString())).use { cursor ->
            while (cursor.moveToNext()) {
                val slug = cursor.getString(0)
                result += QueueCandidate(QueuedSong(slug,cursor.getString(1) ?: slug,cursor.getString(2) ?: "",
                    cursor.getString(3),cursor.getString(4) ?: "Section"),popularity[slug]?.score?.takeIf { it.isFinite() && it in 0.0..1.0 })
            }
        }
        return result
    }
    fun passage(target: AuralPatternTarget, settings: AuralExampleSettings, context: AuralSelectionContext, seed: Long, familyId: String, songId:String?=null,
        minimumPopularityPercent: Int? = null): AuralSourcePassage {
        val resolved = requireNotNull(lookup(target.tokens,target.view))
        require(target.snapshotId == snapshotId && resolved == target) { "Pattern reference does not match this catalog" }
        val refs = mutableListOf<AuralOccurrenceRef>(); val locations = mutableMapOf<String, Pair<Int,Int>>()
        db.rawQuery("""SELECT s.run_id,s.offset,s.start_index,e.end_index FROM catalog_suffix s
            JOIN catalog_suffix e ON e.run_id=s.run_id AND e.offset=s.offset+? WHERE s.rank BETWEEN ? AND ?""",
            arrayOf((target.tokens.size-1).toString(),target.start.toString(),target.end.toString())).use { c -> while(c.moveToNext()) {
            val r=c.getInt(0);val offset=c.getInt(1)
            if(songByRun[r] !in validSongIds) continue
            if(songId!=null && songByRun[r]!=songId) continue
            if(!auralMeetsMinimumPopularity(popularity[songByRun[r]]?.score,minimumPopularityPercent)) continue
            val source = "${songByRun[r]}|${sectionByRun[r]}|${c.getInt(2)}|${c.getInt(3)}"
            val id = auralDigest("${target.id}|$source")
            refs += AuralOccurrenceRef(id,songByRun[r],sectionByRun[r],source); locations[id] = r to offset
        } }
        val chosen = requireNotNull(AuralCorpusSelector.select(refs,popularity,emptyMap(),settings,context,seed))
        val (runId, offset) = locations.getValue(chosen.id); val run=run(runId); val positions = run.positions.subList(offset,offset+target.tokens.size)
        val title = db.rawQuery("SELECT title,artist FROM catalog_song WHERE id=?", arrayOf(run.song)).use { check(it.moveToFirst()); it.getString(0) to it.getString(1) }
        val name = db.rawQuery("SELECT name FROM catalog_section WHERE id=?", arrayOf(run.section)).use { check(it.moveToFirst()); it.getString(0) }
        val events = positions.mapIndexed { i,p -> AuralEvent(p.notes.sorted(),p.rootMidi,p.bassMidi,target.labels[i],"harmony",p.endBeat-p.startBeat) }
        val tonic = ChordInterpreter.interpret(buildJsonObject { put("root",1); put("type",5) },run.key)
        val reference = AuralEvent(tonic.midi.sorted(),requireNotNull(tonic.rootMidi),tonic.midi.min(),"tonic","home",2.0)
        return AuralSourcePassage(chosen.id,target.id,run.song,title.first,title.second,run.section,name,run.revision,
            positions.first().startIndex,positions.last().endIndex,run.view,familyId,target.id,run.key.tonic,run.key.scale,80,events,listOf(reference),target.labels,
            positions.first().startBeat,positions.last().endBeat,run.sourceKey.tonic,run.sourceKey.scale)
    }
    fun playback(passage: AuralSourcePassage, wholeSong:Boolean=false): AuralPlaybackSource {
        val section = db.rawQuery("SELECT source,revision FROM catalog_section WHERE id=? AND song_id=?", arrayOf(passage.sectionId,passage.songId)).use {
            check(it.moveToFirst()); require(it.getString(1) == passage.sourceRevision); json.decodeFromString<ExtractedSection>(unpack(it.getBlob(0)))
        }
        val first=requireNotNull(section.chords.getOrNull(passage.startIndex));val last=requireNotNull(section.chords.getOrNull(passage.endIndex))
        val start=first.getValue("beat").jsonPrimitive.double;val end=last.getValue("beat").jsonPrimitive.double+last.getValue("duration").jsonPrimitive.double
        require(start.isFinite() && end.isFinite() && end>start)
        val sections=linkedMapOf(passage.sectionId to section)
        if(wholeSong) db.rawQuery("SELECT id,source FROM catalog_section WHERE song_id=? ORDER BY name COLLATE NOCASE,id",arrayOf(passage.songId)).use {
            while(it.moveToNext()) if(it.getString(0)!=passage.sectionId) sections[it.getString(0)]=json.decodeFromString<ExtractedSection>(unpack(it.getBlob(1)))
        }
        return AuralPlaybackSource(Song(slug=passage.songId,title=passage.title,artist=passage.artist,url=""),section,passage.sectionId,start,end,sections)
    }
    fun evidence(target: AuralPatternTarget): String {
        val file=File(file.parentFile,"aural-evidence.db")
        if(file.isFile) SQLiteDatabase.openDatabase(file.path,null,SQLiteDatabase.OPEN_READONLY).use { evidence ->
            val version=evidence.rawQuery("SELECT value FROM metadata WHERE key='catalog_snapshot'",null).use { if(it.moveToFirst()) it.getString(0) else null }
            if(version==snapshotId) evidence.rawQuery("SELECT stats FROM evidence WHERE pattern_id=?",arrayOf(target.id)).use { c -> if(c.moveToFirst()) {
                val stats=Json.parseToJsonElement(unpack(c.getBlob(0))).jsonObject
                val windows=stats["sequenceCoverage"]?.jsonObject.orEmpty().entries.sortedBy { it.key.toInt() }
                return buildString {
                    append("Curriculum selection order\nTransitions: ${stats["totalTransitions"]}\nAdditional: ${stats["additionalTransitions"]}\nOverlapping: ${stats["overlappingTransitions"]}\n")
                    val coverage=stats["cumulativeObservedCoverage"]?.jsonPrimitive?.doubleOrNull ?: stats["cumulativeCoverage"]?.jsonPrimitive?.doubleOrNull
                    if(coverage!=null) append("Cumulative corpus coverage: ${"%.2f".format(coverage*100)}%\n")
                    append("Sequence windows (total / additional / corpus windows):\n")
                    windows.forEach { (length,value) -> val v=value.jsonObject; append("$length chords: ${v["total"]} / ${v["additional"]} / ${v["denominator"]}\n") }
                }
            } }
        }
        // Unselected patterns still have exact physical coverage; no invented cumulative curriculum position.
        val spans=mutableMapOf<Int,MutableList<Int>>()
        for(rank in target.start..target.end) spans.getOrPut(suffix[rank*2]) { mutableListOf() }.add(suffix[rank*2+1])
        var transitions=0L
        val windows=LongArray(target.tokens.size+1)
        for(starts in spans.values) {
            starts.sort()
            for(k in 2..target.tokens.size) {
                var end=-1
                for(start in starts) { val last=start+target.tokens.size-k; windows[k]+=last-maxOf(start,end+1)+1; end=maxOf(end,last) }
            }
        }
        transitions=windows[2]
        return "Not in the selected curriculum ordering.\nTransitions covered: $transitions\nRepeated transition visits: ${(target.end-target.start+1L)*(target.tokens.size-1)-transitions}\n"+
            (2..target.tokens.size).joinToString("\n") { "$it-chord windows: ${windows[it]}" }
    }
    fun analysisGaps(offset:Int=0,limit:Int=50): List<String> {
        val rows=mutableListOf<String>()
        db.rawQuery("""SELECT s.title,s.artist,c.name,c.diagnostics FROM catalog_section c JOIN catalog_song s ON s.id=c.song_id
            WHERE c.diagnostics!='[]' ORDER BY s.title,c.id LIMIT ? OFFSET ?""",arrayOf(limit.toString(),offset.toString())).use { c -> while(c.moveToNext()) {
            val reasons=Json.parseToJsonElement(c.getString(3)).jsonArray.map { d -> val value=d.jsonObject
                val position=value["index"]?.jsonPrimitive?.intOrNull?.let { "Chord ${it+1}: " }.orEmpty()
                position+(value["reason"]?.jsonPrimitive?.content ?: "Uncertain analysis")
            }.distinct().joinToString("; ")
            rows += "${c.getString(0)} · ${c.getString(1)} · ${c.getString(2)}\n$reasons"
        } }
        return rows
    }
    override fun close() { db.close(); runs.clear() }
    companion object {
        val rowOrder: Comparator<AuralCatalogRow> get() = rowOrder("recommended")
        fun rowOrder(sortOrder: String = "recommended"): Comparator<AuralCatalogRow> = when(sortOrder) {
            "mostSongs" -> compareByDescending<AuralCatalogRow> { it.globalSongs }.thenByDescending { it.globalOccurrences }
                .thenByDescending { it.length }.thenBy { it.target.id }
            "longest" -> compareByDescending<AuralCatalogRow> { it.length }.thenByDescending { it.globalSongs }
                .thenByDescending { it.globalOccurrences }.thenBy { it.target.id }
            "shortest" -> compareBy<AuralCatalogRow> { it.length }.thenByDescending { it.globalSongs }
                .thenByDescending { it.globalOccurrences }.thenBy { it.target.id }
            else -> compareByDescending<AuralCatalogRow> { it.score }.thenByDescending { it.songs }
                .thenByDescending { it.length }.thenBy { it.target.id }
        }
    }
}
internal fun auralDigest(value: String): String {
    val bytes=MessageDigest.getInstance("SHA-256").digest(value.toByteArray()); val hex="0123456789abcdef"
    return CharArray(bytes.size*2) { i -> val b=bytes[i/2].toInt() and 255; hex[if(i%2==0) b ushr 4 else b and 15] }.concatToString()
}
