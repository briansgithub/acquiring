package com.acquiring.android

import android.database.sqlite.SQLiteDatabase
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.zip.GZIPOutputStream
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(manifest=Config.NONE)
class AuralCatalogMatchingTest {
    @get:Rule val temporary = TemporaryFolder()
    private data class Run(val labels: List<String>, val score: Double?, val mode: String = "major")
    private val sources = listOf(
        Run(listOf("I", "V", "I", "V", "I"), .9),
        Run(listOf("IV", "V", "vi", "ii"), .8),
        Run(listOf("♭II", "V", "I", "iii", "IV", "V"), .2),
        Run(listOf("i", "IV", "VII"), null, "dorian"),
        Run(listOf("ii", "V7", "I"), .95, "dorian"),
    )
    private fun compressed(value: String): ByteArray = ByteArrayOutputStream().also { out ->
        GZIPOutputStream(out).use { it.write(value.toByteArray()) }
    }.toByteArray()

    private fun fixture(reduced: Boolean, copies: Int = 1): AuralCatalog {
        val allSources=List(copies) { sources }.flatten()
        val folder = temporary.newFolder()
        val file = File(folder,"aural-catalog.db")
        SQLiteDatabase.openOrCreateDatabase(file,null).use { db ->
            db.execSQL("CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT)")
            db.execSQL("INSERT INTO metadata VALUES ('schema_version','aural-catalog-3'),('snapshot_id','fixture')")
            if(reduced) db.execSQL("INSERT INTO metadata VALUES ('sequence_reduction_version',?)",arrayOf(AURAL_LOOP_REDUCTION_VERSION))
            db.execSQL("CREATE TABLE catalog_array(name TEXT,data BLOB)")
            db.execSQL("CREATE TABLE catalog_run(id INTEGER PRIMARY KEY,stable_id TEXT,view TEXT,song_id TEXT,section_id TEXT,revision TEXT,tokens BLOB,positions BLOB,key_json TEXT,source_key_json TEXT)")
            db.execSQL("CREATE TABLE catalog_song(id TEXT PRIMARY KEY,title TEXT,artist TEXT,url TEXT)")
            db.execSQL("CREATE TABLE catalog_range(id INTEGER PRIMARY KEY,view TEXT,mode TEXT,start_group TEXT,start_group_label TEXT,start INTEGER,end INTEGER,min_length INTEGER,max_length INTEGER,songs INTEGER,upper_score REAL)")
            db.execSQL("CREATE TABLE catalog_token(token TEXT,label TEXT,inversion_label TEXT)")
            val packed=ByteBuffer.allocate(allSources.sumOf { it.labels.size }*8).order(ByteOrder.LITTLE_ENDIAN)
            var rank=0
            allSources.forEachIndexed { id, source ->
                db.execSQL("INSERT INTO catalog_song VALUES (?,?,?,?)", arrayOf("song$id", "Song $id", "Artist", ""))
                val key=Json.encodeToString(KeyInfo("C",source.mode))
                val positions=source.labels.mapIndexed { i,label -> AuralCatalogPosition(i,i,i.toDouble(),i+1.0,label,label,listOf(60),60,60) }
                db.execSQL("INSERT INTO catalog_run VALUES (?,?,?,?,?,?,?,?,?,?)", arrayOf(id,"run$id","harmony","song$id","section$id","r1",compressed(Json.encodeToString(source.labels)),compressed(Json.encodeToString(positions)),key,key))
                source.labels.indices.forEach { offset ->
                    packed.putInt(id);packed.putInt(offset)
                    val group=requireNotNull(auralStartGroup(source.labels[offset]))
                    // Unreduced ranges include all lengths. Reduced fixtures split out suppressed lengths.
                    val lengths=2..(source.labels.size-offset)
                    if(reduced) lengths.filter { !auralReduceLoop(source.labels.subList(offset,offset+it)).redundant }.forEach { length ->
                        db.execSQL("INSERT INTO catalog_range(view,mode,start_group,start_group_label,start,end,min_length,max_length,songs,upper_score) VALUES (?,?,?,?,?,?,?,?,1,10)",arrayOf("harmony",source.mode,group.id,group.label,rank,rank,length,length))
                    } else if(!lengths.isEmpty()) db.execSQL("INSERT INTO catalog_range(view,mode,start_group,start_group_label,start,end,min_length,max_length,songs,upper_score) VALUES (?,?,?,?,?,?,?,?,1,10)",arrayOf("harmony",source.mode,group.id,group.label,rank,rank,lengths.first,lengths.last))
                    rank++
                }
            }
            db.execSQL("INSERT INTO catalog_array VALUES ('suffix_locations',?)",arrayOf(packed.array()))
        }
        SQLiteDatabase.openOrCreateDatabase(File(folder,"aural-popularity.db"),null).use { db ->
            db.execSQL("CREATE TABLE metadata(key TEXT,value TEXT)")
            db.execSQL("CREATE TABLE popularity(song_id TEXT,score REAL,confidence REAL,measured_at TEXT)")
            allSources.forEachIndexed { id, run -> db.execSQL("INSERT INTO popularity VALUES (?,?,1,'2026-09-25')",arrayOf("song$id",run.score)) }
        }
        return AuralCatalog(file)
    }

    @Test fun metadataBatchesPreserveGroupsAcrossRunAndRangeBoundaries() {
        val query=AuralProgressionQuery(chords=listOf(AuralChordConstraint(5),AuralChordConstraint(1)))
        val settings=AuralExampleSettings(analysis="allModes")
        fixture(true).use { small -> fixture(true,copies=420).use { large ->
            assertEquals(small.matchingBuckets(settings,query,80),large.matchingBuckets(settings,query,80))
            assertEquals(small.matchingBuckets(settings,minimumPopularityPercent=90),large.matchingBuckets(settings,minimumPopularityPercent=90))
        } }
    }

    @Test fun filteredBucketsMatchBruteForceIncludingLegacyReductionAndEmptyQueries() {
        for(reduced in listOf(false,true)) fixture(reduced).use { catalog ->
            for(mode in listOf<String?>(null,"major","dorian")) for(percent in listOf<Int?>(null,0,80,90,100)) {
                for(query in listOf(AuralProgressionQuery(), AuralProgressionQuery(chords=listOf(AuralChordConstraint(5),AuralChordConstraint(1))),
                    AuralProgressionQuery(chords=listOf(AuralChordConstraint(2,"♯"))))) {
                    val settings=AuralExampleSettings(analysis=if(mode==null) "allModes" else "filterMode",modeFilter=mode ?: "major")
                    val actual=catalog.matchingBuckets(settings,query,percent).flatMap { (length,groups) -> groups.map { length to it.id } }.toSet()
                    val expected=buildSet {
                        sources.filter { (mode==null || it.mode==mode) && auralMeetsMinimumPopularity(it.score,percent) }.forEach { source ->
                            for(start in source.labels.indices) for(end in start+2..source.labels.size) {
                                val sequence=source.labels.subList(start,end)
                                if(query.matches(sequence) && !auralReduceLoop(sequence).redundant) add(sequence.size to requireNotNull(auralStartGroup(sequence.first())).id)
                            }
                        }
                    }
                    assertEquals("reduced=$reduced mode=$mode percent=$percent query=$query",expected,actual)
                    assertEquals(actual,catalog.matchingBuckets(settings.copy(groupingPriority="start",popularity=false),query,percent).flatMap { (length,groups) -> groups.map { length to it.id } }.toSet())
                }
            }
        }
    }
}
