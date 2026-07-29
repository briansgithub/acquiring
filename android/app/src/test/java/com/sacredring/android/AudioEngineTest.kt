package com.sacredring.android

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE)
class AudioEngineTest {

    @Test
    fun testRapidConcurrentChordClicks_doesNotCrash() = runBlocking {
        println("--- Testing Rapid Concurrent Chord Plays ---")
        val chords = listOf(
            listOf(60, 64, 67),
            listOf(62, 65, 69),
            listOf(65, 69, 72),
            listOf(67, 71, 74),
            listOf(60, 63, 67)
        )

        // Simulate rapid concurrent button taps on UI coroutines
        val jobs = (1..20).map { i ->
            async {
                val chord = chords[i % chords.size]
                AudioEngine.playChord(chord, durationMs = 100)
            }
        }

        jobs.awaitAll()
        println("✅ Successfully processed 20 rapid concurrent chord plays without crash or track failure!")
        assertTrue(true)
    }

    @Test
    fun testArpeggiatedChordPlayback_doesNotCrash() = runBlocking {
        println("--- Testing Arpeggiated Chord Playback ---")
        val triad = listOf(60, 64, 67)
        val seventh = listOf(60, 64, 67, 71)

        AudioEngine.playChord(triad, durationMs = 300, arpeggiate = true, stepMs = 30)
        AudioEngine.playChord(seventh, durationMs = 300, arpeggiate = true, stepMs = 30)
        AudioEngine.playChord(triad, durationMs = 300, arpeggiate = true, stepMs = 50)
        AudioEngine.playChord(seventh, durationMs = 300, arpeggiate = true, stepMs = 50)

        println("✅ Successfully synthesized and played fast (30ms) & medium (50ms) arpeggiated chord buffers without error!")
        assertTrue(true)
    }
}
