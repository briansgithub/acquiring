package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class AudioDiagnosticsTest {
    @Before
    fun resetLog() {
        AudioDiagnostics.clearForTests()
    }

    @Test
    fun recordsOnlyAllowListedOperationsAndStateKeys() {
        AudioDiagnostics.record(
            "quiz.playRequest",
            state = mapOf(
                "phase" to "PLAYING",
                "songId" to "all-star",
                "slug" to "smash-mouth/all-star"
            )
        )
        AudioDiagnostics.record("not.an.allowed.operation", state = mapOf("phase" to "PLAYING"))
        val events = AudioDiagnostics.snapshot()
        assertEquals(1, events.size)
        assertEquals("quiz.playRequest", events.single().operation)
        assertEquals(mapOf("phase" to "PLAYING"), events.single().state)
        assertFalse(AudioDiagnostics.exportText().contains("all-star"))
        assertFalse(AudioDiagnostics.exportText().contains("smash-mouth"))
    }

    @Test
    fun trimsToEventLimit() {
        repeat(AudioDiagnostics.EVENT_LIMIT + 5) { index ->
            AudioDiagnostics.record("quiz.reset", state = mapOf("phase" to index.toString()))
        }
        val events = AudioDiagnostics.snapshot()
        assertEquals(AudioDiagnostics.EVENT_LIMIT, events.size)
        assertEquals("5", events.first().state["phase"])
    }

    @Test
    fun exportIsPlainTextWithoutAudioSamples() {
        AudioDiagnostics.record("quiz.reset", state = mapOf("phase" to "STOPPED"))
        val text = AudioDiagnostics.exportText()
        assertTrue(text.contains("schemaVersion"))
        assertTrue(text.contains("quiz.reset"))
        assertFalse(text.contains("pcm"))
        assertFalse(text.contains("sample"))
    }
}
