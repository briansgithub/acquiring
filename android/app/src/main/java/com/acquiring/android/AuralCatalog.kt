package com.acquiring.android

import android.database.sqlite.SQLiteDatabase
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.util.PriorityQueue
import java.util.zip.GZIPInputStream
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import kotlin.math.log2

@Serializable data class AuralPatternTarget(val id: String, val view: String, val tokens: List<String>, val labels: List<String>, val start: Int, val end: Int, val snapshotId: String)
internal data class AuralCatalogRow(val target: AuralPatternTarget, val songs: Int, val occurrences: Int, val sections: Int, val effective: Int, val score: Double) {
    val length get() = target.tokens.size
}
@Serializable internal data class AuralCatalogPosition(val startIndex: Int, val endIndex: Int, val startBeat: Double, val endBeat: Double,
    val degree: String, val roman: String, val notes: List<Int>, val rootMidi: Int, val bassMidi: Int, val varyingBass: Boolean = false)
internal data class AuralCatalogRun(val id: Int, val stableId: String, val view: String, val song: String, val section: String, val revision: String,
    val tokens: List<String>, val positions: List<AuralCatalogPosition>, val key: KeyInfo)
internal data class AuralPlaybackSource(val song: Song, val section: ExtractedSection, val sectionId: String, val startBeat: Double, val endBeat: Double,
    val sections: Map<String,ExtractedSection> = emptyMap())
internal data class AuralPatternSong(val id:String,val title:String,val artist:String,val popularityScore:Double?=null)
internal val auralPatternSongOrder = compareByDescending<AuralPatternSong> { it.popularityScore ?: -1.0 }
    .thenBy { it.title.lowercase(java.util.Locale.ROOT) }.thenBy { it.artist.lowercase(java.util.Locale.ROOT) }.thenBy { it.id }
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
    private val suffix: IntArray
    private val songByRun: Array<String>
    private val sectionByRun: Array<String>
    private val runs = linkedMapOf<Int, AuralCatalogRun>()
    val popularity = mutableMapOf<String, AuralPopularity>()
    var popularityVersion: String? = null; private set
    var popularityDescription = "No popularity measurements installed"; private set
    init {
        val metadata = mutableMapOf<String, String>()
        db.rawQuery("SELECT key,value FROM metadata", null).use { while (it.moveToNext()) metadata[it.getString(0)] = it.getString(1) }
        require(metadata["schema_version"] == "aural-catalog-1")
        snapshotId = requireNotNull(metadata["snapshot_id"])
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
        db.rawQuery("SELECT id,song_id,section_id FROM catalog_run ORDER BY id", null).use { while (it.moveToNext()) { check(it.getInt(0) == names.size); names += it.getString(1).intern(); sectionNames += it.getString(2).intern() } }
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
    }
    private fun unpack(bytes: ByteArray) = GZIPInputStream(bytes.inputStream()).bufferedReader().use { it.readText() }
    @Synchronized fun run(id: Int): AuralCatalogRun = runs[id] ?: db.rawQuery("SELECT stable_id,view,song_id,section_id,revision,tokens,positions,key_json FROM catalog_run WHERE id=?", arrayOf(id.toString())).use { c ->
        check(c.moveToFirst())
        AuralCatalogRun(id, c.getString(0), c.getString(1), c.getString(2), c.getString(3), c.getString(4),
            json.decodeFromString<List<String>>(unpack(c.getBlob(5))), json.decodeFromString<List<AuralCatalogPosition>>(unpack(c.getBlob(6))), json.decodeFromString<KeyInfo>(c.getString(7)))
    }.also { if (runs.size >= 64) runs.remove(runs.keys.first()); runs[id] = it }
    fun target(start: Int, end: Int, length: Int): AuralPatternTarget {
        val run = run(suffix[start * 2]); val offset = suffix[start * 2 + 1]
        val tokens = run.tokens.subList(offset, offset + length)
        val labels = run.positions.subList(offset, offset + length).map { if (run.view == "harmony_bass") it.roman else it.degree }
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
    fun stats(target: AuralPatternTarget, settings: AuralExampleSettings, recent: List<String>, favorites: Set<String>): AuralCatalogRow {
        val grouped = mutableMapOf<String, MutableList<Pair<Int, Int>>>()
        for (rank in target.start..target.end) { val r = suffix[rank * 2]; grouped.getOrPut(songByRun[r]) { mutableListOf() } += r to suffix[rank * 2 + 1] }
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
        return AuralCatalogRow(target, grouped.size, target.end - target.start + 1, sections.size, effective, score)
    }
    inner class Ranking(settings: AuralExampleSettings, recent: List<String>, favorites: Set<String>, minLength: Int = 2, maxLength: Int = Int.MAX_VALUE, search: String = "") {
        private val settings = settings.copy(); private val recent = recent.toList(); private val favorites = favorites.toSet()
        private val search = search.trim().lowercase()
        private val multiplier = (if (settings.popularity) maxOf(1.0,popularity.values.maxOfOrNull { 1 + it.confidence.coerceIn(0.0,1.0) * ((it.score ?: .5)-.5) } ?: 1.0) else 1.0) * (if (settings.favorites && favorites.isNotEmpty()) 1.5 else 1.0)
        private val minimum=minLength; private val maximum=maxLength
        private val heap = PriorityQueue<Entry> { a, b ->
            val order = b.bound.compareTo(a.bound)
            if (order != 0) order else if (a.row == null || b.row == null) (if (a.row == null) 0 else 1) - (if (b.row == null) 0 else 1)
            else rowOrder.compare(a.row, b.row)
        }
        private val ranges=db.rawQuery("SELECT start,end,min_length,max_length,songs,upper_score FROM catalog_range WHERE view=? AND max_length>=? AND min_length<=? ORDER BY upper_score DESC,id",
            arrayOf(if (settings.distinguishInversions) "harmony_bass" else "harmony", minLength.toString(), maxLength.toString()))
        private var rangeAvailable=ranges.moveToFirst()
        private fun refineFrontier() {
            while(rangeAvailable && (heap.isEmpty() || ranges.getDouble(5)*multiplier >= heap.peek().bound)) {
                add(ranges.getInt(0),ranges.getInt(1),maxOf(ranges.getInt(2),minimum),minOf(ranges.getInt(3),maximum),ranges.getInt(4))
                rangeAvailable=ranges.moveToNext()
            }
            if(!rangeAvailable && !ranges.isClosed) ranges.close()
        }
        private fun add(start: Int, end: Int, low: Int, high: Int, songs: Int) {
            heap.add(Entry(start, end, low, high, songs, auralCatalogBase(high, songs, minOf(end - start + 1, songs * 4)) * multiplier))
        }
        fun page(limit: Int = 30): List<AuralCatalogRow> {
            val results = mutableListOf<AuralCatalogRow>()
            while (hasMore && results.size < limit) {
                if (Thread.currentThread().isInterrupted) break
                refineFrontier()
                val e = heap.remove()
                if (e.row != null) { results += e.row; continue }
                if (e.low != e.high) { val mid = (e.low + e.high) ushr 1; add(e.start,e.end,e.low,mid,e.songs); add(e.start,e.end,mid+1,e.high,e.songs) }
                else {
                    val target = target(e.start,e.end,e.low)
                    if (search.isNotEmpty() && !target.labels.joinToString(" ").lowercase().contains(search)) continue
                    val row = stats(target, this.settings, this.recent, this.favorites)
                    heap.add(e.copy(bound = row.score, row = row))
                }
            }
            return results
        }
        val hasMore get() = rangeAvailable || heap.isNotEmpty()
        fun close() { if(!ranges.isClosed) ranges.close(); heap.clear(); rangeAvailable=false }
    }
    private data class Entry(val start: Int, val end: Int, val low: Int, val high: Int, val songs: Int, val bound: Double, val row: AuralCatalogRow? = null)
    fun children(target: AuralPatternTarget, settings: AuralExampleSettings, recent: List<String>, favorites: Set<String>): List<AuralCatalogRow> =
        if (target.tokens.size <= 2) emptyList() else listOf(target.tokens.dropLast(1), target.tokens.drop(1)).mapNotNull { lookup(it,target.view) }
            .distinctBy { it.id }.map { stats(it,settings,recent,favorites) }.sortedWith(rowOrder)
    /** One entry per supporting song, regardless of repeated loops or sections. */
    fun songs(target:AuralPatternTarget):List<AuralPatternSong> {
        require(target.snapshotId==snapshotId && lookup(target.tokens,target.view)==target)
        val result=mutableListOf<AuralPatternSong>()
        db.rawQuery("""SELECT DISTINCT song.id,song.title,song.artist FROM catalog_suffix s
            JOIN catalog_run r ON r.id=s.run_id JOIN catalog_song song ON song.id=r.song_id
            WHERE s.rank BETWEEN ? AND ? ORDER BY song.title COLLATE NOCASE,song.artist COLLATE NOCASE,song.id""",
            arrayOf(target.start.toString(),target.end.toString())).use { c -> while(c.moveToNext()) result+=AuralPatternSong(c.getString(0),c.getString(1),c.getString(2),
                popularity[c.getString(0)]?.score?.takeIf { it.isFinite() && it in 0.0..1.0 }) }
        return result.sortedWith(auralPatternSongOrder)
    }
    fun passage(target: AuralPatternTarget, settings: AuralExampleSettings, context: AuralSelectionContext, seed: Long, familyId: String, songId:String?=null): AuralSourcePassage {
        val resolved = requireNotNull(lookup(target.tokens,target.view))
        require(target.snapshotId == snapshotId && resolved == target) { "Pattern reference does not match this catalog" }
        val refs = mutableListOf<AuralOccurrenceRef>(); val locations = mutableMapOf<String, Pair<Int,Int>>()
        db.rawQuery("""SELECT s.run_id,s.offset,s.start_index,e.end_index FROM catalog_suffix s
            JOIN catalog_suffix e ON e.run_id=s.run_id AND e.offset=s.offset+? WHERE s.rank BETWEEN ? AND ?""",
            arrayOf((target.tokens.size-1).toString(),target.start.toString(),target.end.toString())).use { c -> while(c.moveToNext()) {
            val r=c.getInt(0);val offset=c.getInt(1)
            if(songId!=null && songByRun[r]!=songId) continue
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
            positions.first().startBeat,positions.last().endBeat)
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
    companion object { val rowOrder = compareByDescending<AuralCatalogRow> { it.score }.thenByDescending { it.songs }.thenByDescending { it.length }.thenBy { it.target.id } }
}
internal fun auralDigest(value: String): String {
    val bytes=MessageDigest.getInstance("SHA-256").digest(value.toByteArray()); val hex="0123456789abcdef"
    return CharArray(bytes.size*2) { i -> val b=bytes[i/2].toInt() and 255; hex[if(i%2==0) b ushr 4 else b and 15] }.concatToString()
}
