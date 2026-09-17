package com.acquiring.android

import android.database.sqlite.SQLiteDatabase
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

internal fun corpusFixture(base: AuralExercise, settings: AuralExampleSettings = AuralExampleSettings(), sourceId: String = "song"): AuralCorpusProvenance {
    fun event(degree: String): AuralEvent {
        val root = 48 + mapOf("I" to 0, "ii" to 2, "iii" to 4, "IV" to 5, "V" to 7, "vi" to 9, "vii°" to 11, "V/V" to 2).getValue(degree)
        val third = if (degree in listOf("ii", "iii", "vi", "vii°")) 3 else 4
        val fifth = if (degree == "vii°") 6 else 7
        // Genuine first inversion, even when inversions are grouped for matching.
        val notes = listOf(root + third, root + fifth, root + 12)
        return AuralEvent(notes, root, notes.first(), degree, "function", 1.5)
    }
    val p = AuralSourcePassage("occurrence", "pattern", sourceId, "Hidden song", "Artist", "section", "Chorus", "rev1", 2, 2 + base.fullDegrees.size - 1,
        if (settings.distinguishInversions) "harmony_bass" else "harmony", base.familyId, base.variantId, "C", "major", 90,
        base.fullDegrees.map(::event), listOf(event("I")), base.fullDegrees)
    return AuralCorpusProvenance("snapshot", null, "current-triads-1", p, settings, seed = base.seed and 0xffffffffL, semitoneShift = base.provenance.target.octaveShift * 12)
}

class AuralCorpusTest {
    @Test fun physicalMultiplicityCannotInflateSongProbability() {
        val a = AuralOccurrenceRef("a", "song-a", "section-a", "a")
        val b = AuralOccurrenceRef("b", "song-b", "section-b", "b")
        val expanded = listOf(a, b) + (1..90).map { a.copy(id = "extra-$it", sectionId = "extra-section-$it", sourceId = "extra-$it") }
        for (seed in 1L..1000L) {
            val expected = AuralCorpusSelector.select(listOf(a,b), emptyMap(), emptyMap(), AuralExampleSettings(), AuralSelectionContext(), seed)
            val actual = AuralCorpusSelector.select(expanded, emptyMap(), emptyMap(), AuralExampleSettings(), AuralSelectionContext(), seed)
            assertEquals(expected!!.songId, actual!!.songId)
        }
    }
    @Test fun assessmentFiltersFreshGloballyAndSupportedReuseRequiresEligibility() {
        val heard = AuralOccurrenceRef("a", "a", "a", "heard")
        val fresh = AuralOccurrenceRef("z", "z", "z", "fresh")
        val context = AuralSelectionContext(heardSourceIds = setOf("heard"), assessment = true, supportedOccurrenceId = "a")
        repeat(100) { assertEquals(fresh, AuralCorpusSelector.select(listOf(heard,fresh), emptyMap(), emptyMap(), AuralExampleSettings(), context, it.toLong())) }
        assertEquals(heard, AuralCorpusSelector.select(listOf(heard,fresh), emptyMap(), emptyMap(), AuralExampleSettings(), context.copy(assessment = false), 12))
        assertEquals(fresh, AuralCorpusSelector.select(listOf(fresh), emptyMap(), emptyMap(), AuralExampleSettings(), context.copy(assessment = false), 12))
        assertEquals(heard, AuralCorpusSelector.select(listOf(heard), emptyMap(), emptyMap(), AuralExampleSettings(), context, 12))
    }
    @Test fun corpusRealizationPreservesInvertedBassAndTimingForAllSingingTargets() {
        AuralCurriculum.microphoneKinds.forEach { kind ->
            val base = AuralCurriculum.generate(AuralTarget("dominant-return", "reproduce", microphoneKind = kind, octaveShift = 1), 7)
            val source = corpusFixture(base)
            val actual = auralWithCorpus(base, source)
            assertEquals(source.passage.events.map { it.notes.map { midi -> midi + 12 } }, actual.events.map { it.notes })
            assertEquals(source.passage.events.map { it.beats }, actual.events.map { it.beats })
            val task = actual.microphoneTask!!
            val expected = if (kind == "scaleDegree") listOf(60 + MusicTheory.SCALE_INTERVALS.getValue("major")[task.scaleDegree!! - 1])
                else task.eventIndices.map { if (kind == "bass") actual.events[it].bassMidi else actual.events[it].rootMidi }
            assertEquals(expected, task.targetMidis)
            assertEquals(expected, actual.answer.targetMidis)
            assertNotEquals(actual.events.first().rootMidi, actual.events.first().bassMidi)
        }
    }
    @Test fun missingHarmonyKeepsItsActualBeatDurationAndRejectsMislabeledHarmony() {
        val base = AuralCurriculum.generate(AuralTarget("dominant-return", "audiate", octaveShift = 1), 21)
        val source = corpusFixture(base)
        val actual = auralWithCorpus(base, source)
        val silence = auralPromptEvents(actual).filter { it.notes.isEmpty() }
        assertTrue(silence.any { it.beats == 1.5 })
        val bad = source.copy(passage = source.passage.copy(events = source.passage.events.map { it.copy(notes = it.notes.map { n -> n + 1 }, bassMidi = it.bassMidi + 1) }))
        assertThrows(IllegalArgumentException::class.java) { auralWithCorpus(base, bad) }
    }
    @Test fun popularityVarietyAndFavoritesChangeWeightsWithoutHardExclusion() {
        val refs = listOf(AuralOccurrenceRef("a", "a", "a", "a"), AuralOccurrenceRef("b", "b", "b", "b"))
        fun share(settings: AuralExampleSettings, context: AuralSelectionContext = AuralSelectionContext()): Double {
            val random = AuralSelectionRandom(999)
            return (1..12000).count { AuralCorpusSelector.select(refs, mapOf("a" to AuralPopularity(1.0,1.0), "b" to AuralPopularity(0.0,1.0)), emptyMap(), settings, context, (random.nextDouble()*4294967296.0).toLong())!!.songId == "a" } / 12000.0
        }
        assertEquals(.75, share(AuralExampleSettings()), .02)
        assertEquals(.5, share(AuralExampleSettings(popularity = false)), .02)
        assertEquals(.2, share(AuralExampleSettings(popularity = false), AuralSelectionContext(recentSongIds = listOf("a"))), .02)
        assertEquals(.6, share(AuralExampleSettings(popularity = false, favorites = true), AuralSelectionContext(favoriteSongIds = setOf("a"))), .02)
    }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AuralCorpusDatabaseTest {
    @Test fun sidecarReadsOnlyMatchingTargetAndMissingOrInvalidDatabaseFallsBack() {
        val file = File.createTempFile("aural-corpus", ".db").also { it.delete() }
        val base = AuralCurriculum.generate(AuralTarget("dominant-return", "recall", variantId = "departure", octaveShift = 1), 17)
        val source = corpusFixture(base)
        try {
            assertNull(SqliteAuralExampleProvider(file).example(base, source.settings, AuralSelectionContext()))
            SQLiteDatabase.openOrCreateDatabase(file, null).use { db ->
                db.execSQL("CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT)")
                db.execSQL("INSERT INTO metadata VALUES('schema_version','1'),('snapshot_id','snapshot')")
                db.execSQL("CREATE TABLE quiz_song(song_id TEXT PRIMARY KEY,popularity REAL,confidence REAL)")
                db.execSQL("CREATE TABLE quiz_section(section_id TEXT PRIMARY KEY,song_id TEXT,popularity REAL,confidence REAL)")
                db.execSQL("CREATE TABLE quiz_occurrence(occurrence_id TEXT PRIMARY KEY,pattern_id TEXT,song_id TEXT,section_id TEXT,source_id TEXT,view TEXT,family_id TEXT,variant_id TEXT,payload TEXT)")
                db.execSQL("INSERT INTO quiz_song VALUES('song',NULL,0)")
                db.execSQL("INSERT INTO quiz_section VALUES('section','song',NULL,0)")
                db.execSQL("INSERT INTO quiz_occurrence VALUES(?,?,?,?,?,?,?,?,?)", arrayOf(source.passage.occurrenceId, "pattern", "song", "section", source.passage.sourceId, "harmony", base.familyId, base.variantId, Json.encodeToString(source.passage)))
            }
            val provider = SqliteAuralExampleProvider(file)
            assertFalse(provider.popularityAvailable)
            val result = provider.example(base, source.settings, AuralSelectionContext())!!
            assertEquals(source.passage, result.passage)
            assertEquals(base.fullDegrees, auralWithCorpus(base, result).fullDegrees)
            assertNull(provider.example(base, source.settings.copy(distinguishInversions = true), AuralSelectionContext()))
            assertNull(provider.example(AuralCurriculum.generate(AuralTarget("plagal-return", "recall"), 17), source.settings, AuralSelectionContext()))
        } finally { file.delete() }
    }
}
