package com.acquiring.android

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.abs

@OptIn(ExperimentalCoroutinesApi::class)
class AuralAudioTest {
    private fun event(notes: List<Int>, beats: Double = 1.0) = AuralEvent(notes, 60, 60, "I", "home", beats)

    private class FakeSink(private val clock: () -> Long, private val stall: Boolean = false) : AuralAudioSink {
        var samples = shortArrayOf()
        var startedAt: Long? = null
        var rate = 0
        var closed = 0
        override fun prepare(samples: ShortArray, sampleRate: Int) { this.samples = samples; rate = sampleRate }
        override fun play() { startedAt = clock() }
        override val playedFrames: Int get() = if (stall) 0 else startedAt?.let { ((clock() - it) * rate / 1000L).toInt() } ?: 0
        override fun close() { closed++ }
    }

    @Test fun planPreservesSilenceAndWrittenPitchWithoutGlobalTranspose() {
        val plan = auralPlaybackPlan(listOf(event(listOf(60, 64, 67)), event(emptyList(), 2.0), event(listOf(67))), 120.0, 8000)
        assertEquals(16000, plan.frameCount)
        assertEquals(2000.0, plan.durationMs, 0.001)
        assertEquals(4.0, plan.timeline.endBeat, 0.001)
        assertEquals(listOf(0.0, 3.0), plan.timeline.events.map { it.startBeat })
        assertArrayEquals(intArrayOf(60, 64, 67), plan.timeline.events.first().fullMidiNotes)
    }

    @Test fun invalidMusicalInputCannotStartPlayback() {
        assertThrows(IllegalArgumentException::class.java) { auralPlaybackPlan(emptyList(), 80.0, 8000) }
        assertThrows(IllegalArgumentException::class.java) { auralPlaybackPlan(listOf(event(listOf(60))), 0.0, 8000) }
        assertThrows(IllegalArgumentException::class.java) { auralPlaybackPlan(listOf(event(listOf(128))), 80.0, 8000) }
        assertThrows(IllegalArgumentException::class.java) { auralPlaybackPlan(listOf(event(listOf(60), -1.0)), 80.0, 8000) }
        assertThrows(IllegalArgumentException::class.java) { auralPlaybackPlan(listOf(event(listOf(60), 1000.0)), 80.0, 8000) }
        assertThrows(IllegalArgumentException::class.java) { auralWaveform("unknown") }
        assertEquals(3, listOf("sine", "triangle", "soft").map(::auralWaveform).toSet().size)
    }

    @Test fun completedPlaybackIncludesTrailingRestAndReleasesOutput() = runTest {
        val sink = FakeSink({ testScheduler.currentTime })
        val audio = AuralAudio(sampleRate = 8000, sinkFactory = { sink }, dispatcher = StandardTestDispatcher(testScheduler), clockMs = { testScheduler.currentTime })
        val job = async { audio.play(listOf(event(listOf(69)), event(emptyList())), 120, "sine") }
        runCurrent()
        assertEquals(8000, sink.samples.size)
        assertTrue(sink.samples.take(3600).any { it != 0.toShort() })
        assertTrue(sink.samples.drop(4000).all { it == 0.toShort() })
        assertEquals(0, sink.samples.first().toInt())
        assertTrue(abs(sink.samples[3599].toInt()) < 100)
        advanceTimeBy(990)
        runCurrent()
        assertFalse(job.isCompleted)
        advanceUntilIdle()
        job.await()
        assertEquals(1, sink.closed)
        audio.dispose()
    }

    @Test fun cancellationReleasesOnlyItsOutputAndReplacementCanFinish() = runTest {
        val sinks = mutableListOf<FakeSink>()
        val audio = AuralAudio(sampleRate = 8000, sinkFactory = { FakeSink({ testScheduler.currentTime }).also(sinks::add) },
            dispatcher = StandardTestDispatcher(testScheduler), clockMs = { testScheduler.currentTime })
        val first = async { audio.play(listOf(event(listOf(60), 4.0)), 120, "triangle") }
        runCurrent()
        val second = async { audio.play(listOf(event(listOf(67))), 120, "soft") }
        runCurrent()
        assertTrue(first.isCancelled)
        assertEquals(1, sinks.first().closed)
        assertEquals(0, sinks.last().closed)
        advanceUntilIdle()
        second.await()
        assertEquals(1, sinks.last().closed)
    }

    @Test fun disposeCancelsAndCannotPlayLater() = runTest {
        val sink = FakeSink({ testScheduler.currentTime })
        val audio = AuralAudio(sampleRate = 8000, sinkFactory = { sink }, dispatcher = StandardTestDispatcher(testScheduler), clockMs = { testScheduler.currentTime })
        val job = async { audio.play(listOf(event(listOf(60), 4.0)), 120, "sine") }
        runCurrent()
        audio.dispose()
        runCurrent()
        assertTrue(job.isCancelled)
        assertEquals(1, sink.closed)
        var failure: Throwable? = null
        try { audio.play(listOf(event(listOf(60))), 120, "sine") } catch (error: IllegalStateException) { failure = error }
        assertNotNull(failure)
    }

    @Test fun stalledOutputIsTechnicalFailureAndStillReleases() = runTest {
        val sink = FakeSink({ testScheduler.currentTime }, stall = true)
        val audio = AuralAudio(sampleRate = 8000, sinkFactory = { sink }, dispatcher = StandardTestDispatcher(testScheduler), clockMs = { testScheduler.currentTime })
        var failure: Throwable? = null
        val job = async {
            try { audio.play(listOf(event(listOf(60))), 120, "sine") } catch (error: IllegalStateException) { failure = error }
        }
        advanceUntilIdle()
        job.await()
        assertTrue(failure?.message?.contains("stalled") == true)
        assertEquals(1, sink.closed)
    }
}
