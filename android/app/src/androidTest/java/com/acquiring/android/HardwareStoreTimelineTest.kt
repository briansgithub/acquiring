package com.acquiring.android

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.contentOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Regression coverage for the locally stored Weird Al Yankovic song.  This
 * deliberately uses the target application's Room database, so it verifies
 * the same record the Quiz screen plays on a physical device.
 */
@RunWith(AndroidJUnit4::class)
class HardwareStoreTimelineTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun everyPlayableSectionAndMelodyEventResolvesAtItsOwnBeat() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val db = Room.databaseBuilder(context, AppDatabase::class.java, AppDatabase.DB_NAME)
            .addMigrations(AppDatabase.MIGRATION_1_2, AppDatabase.MIGRATION_2_3)
            .build()
        try {
            val song = db.songDao().getSongBySlug("weird-al-yankovic__hardware-store")
            assertNotNull("Hardware Store must remain available in the on-device song database", song)

            val sections = json.decodeFromString<Map<String, ExtractedSection>>(
                DataUtils.decompress(requireNotNull(song).dataBlob ?: error("Hardware Store has no section data"))
            )
            val playableSections = sections.values.filter { it.chords.isNotEmpty() }
            assertTrue("Hardware Store should provide multiple playable sections", playableSections.size >= 4)

            var melodyEventCount = 0
            var modulationCount = 0
            playableSections.forEach { section ->
                val endBeat = (section.metadata?.get("endBeat") as? JsonPrimitive)?.doubleOrNull
                    ?: error("${section.safeSectionName} has no end beat")
                val keys = section.getKeys()
                assertFalse("${section.safeSectionName} has no key metadata", keys.isEmpty())

                // A key change takes effect on its stated beat, exactly as in
                // web/player.js's activeSectionKeyAtBeat().
                keys.forEach { keyAtBeat ->
                    val active = section.getKeyAtBeat(keyAtBeat.beat)
                    assertEquals(keyAtBeat.key.tonic, active.tonic)
                    assertEquals(keyAtBeat.key.scale, active.scale)
                }
                modulationCount += (keys.size - 1).coerceAtLeast(0)

                val notes = section.notes as? JsonArray ?: JsonArray(emptyList())
                notes.forEach { element ->
                    val note = element as? JsonObject ?: return@forEach
                    val isRest = (note["isRest"] as? JsonPrimitive)?.booleanOrNull == true ||
                        (note["rest"] as? JsonPrimitive)?.booleanOrNull == true
                    if (isRest) return@forEach

                    val rawBeat = (note["beat"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
                    val beat = if (rawBeat == 0.0) 1.0 else rawBeat
                    val duration = (note["duration"] as? JsonPrimitive)?.doubleOrNull ?: 1.0
                    val scaleDegree = (note["sd"] as? JsonPrimitive)?.contentOrNull ?: "1"
                    val octave = (note["octave"] as? JsonPrimitive)?.intOrNull ?: 0
                    val midi = MusicTheory.getMidiNote(scaleDegree, octave, section.getKeyAtBeat(beat))

                    assertTrue("${section.safeSectionName}: note begins before the timeline", beat >= 1.0)
                    assertTrue("${section.safeSectionName}: note begins after the timeline", beat <= endBeat)
                    assertTrue("${section.safeSectionName}: note duration must be positive", duration > 0.0)
                    assertTrue("${section.safeSectionName}: invalid MIDI note for $scaleDegree at beat $beat", midi in 1..127)
                    melodyEventCount++
                }
            }

            assertTrue("Hardware Store should contain melody events", melodyEventCount > 0)
            assertTrue("Hardware Store should exercise at least one mid-section key change", modulationCount > 0)
        } finally {
            db.close()
        }
    }
}
