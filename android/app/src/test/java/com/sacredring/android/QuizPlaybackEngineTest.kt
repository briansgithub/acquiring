package com.sacredring.android

import android.media.AudioTrack
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE)
class QuizPlaybackEngineTest {

    private fun config(
        bpm: Double = 60.0,
        chordMode: QuizChordMode = QuizChordMode.FULL,
        transpose: Int = 0
    ) = QuizPlaybackConfig(
        bpm = bpm,
        transpose = transpose,
        waveform = AudioEngine.Waveform.SAWTOOTH,
        chordMode = chordMode,
        melodyGain = 1f,
        chordGain = 1f
    )

    @Test
    fun renderer_emitsDenseAndSimultaneousOnsetsAtTheirOutputFrame() {
        val timeline = QuizTimeline(
            endBeat = 2.0,
            events = listOf(
                event(1, 1.10, 1.20, QuizAudioLayer.MELODY, 60),
                event(2, 1.10, 1.50, QuizAudioLayer.CHORD, 48, 52, 55),
                event(3, 1.25, 1.30, QuizAudioLayer.MELODY, 62)
            )
        )
        val renderer = QuizPcmRenderer(timeline, config(), sampleRate = 1_000)

        val rendered = renderer.renderInto(ShortArray(400))

        assertEquals(listOf(1L, 2L, 3L), rendered.startedEvents.map { it.id })
        assertTrue(rendered.startedEvents[0].frameOffset in 99..101)
        assertEquals(rendered.startedEvents[0].frameOffset, rendered.startedEvents[1].frameOffset)
        assertTrue(rendered.startedEvents[2].frameOffset in 249..251)
    }

    @Test
    fun renderer_wrapsWithoutDroppingOrDuplicatingLoopHead() {
        val timeline = QuizTimeline(
            endBeat = 1.5,
            events = listOf(event(7, 1.0, 1.1, QuizAudioLayer.MELODY, 60))
        )
        val renderer = QuizPcmRenderer(timeline, config(), sampleRate = 1_000)

        val rendered = renderer.renderInto(ShortArray(1_100))

        assertEquals(listOf(0, 500, 1_000), rendered.startedEvents.map { it.frameOffset })
        assertEquals(1.1, renderer.currentBeat, 1e-9)
    }

    @Test
    fun renderer_seekToEndRemainsAtEndUntilRenderingResumes() {
        val timeline = QuizTimeline(
            endBeat = 4.0,
            events = listOf(event(1, 1.0, 3.0, QuizAudioLayer.MELODY, 60))
        )
        val renderer = QuizPcmRenderer(timeline, config(), sampleRate = 1_000)

        renderer.seek(timeline.endBeat)

        assertEquals(timeline.endBeat, renderer.currentBeat, 0.0)
    }

    @Test
    fun renderer_appliesTempoChangeWithoutMovingTheCurrentBeat() {
        val timeline = QuizTimeline(
            endBeat = 5.0,
            events = listOf(event(1, 1.0, 4.0, QuizAudioLayer.MELODY, 60))
        )
        val renderer = QuizPcmRenderer(timeline, config(bpm = 60.0), sampleRate = 1_000)

        renderer.renderInto(ShortArray(500))
        assertEquals(1.5, renderer.currentBeat, 1e-9)
        renderer.updateConfig(config(bpm = 120.0))
        renderer.renderInto(ShortArray(250))

        assertEquals(2.0, renderer.currentBeat, 1e-9)
    }

    @Test
    fun renderer_crossfadesPitchAndChordModeWithoutAZeroLengthGap() {
        val chord = QuizTimelineEvent(
            id = 1,
            startBeat = 1.0,
            endBeat = 4.0,
            layer = QuizAudioLayer.CHORD,
            fullMidiNotes = intArrayOf(60, 64, 67),
            rootMidiNote = 48
        )
        val renderer = QuizPcmRenderer(
            QuizTimeline(endBeat = 5.0, events = listOf(chord)),
            config(),
            sampleRate = 1_000
        )
        renderer.renderInto(ShortArray(100))
        val beatBeforeChange = renderer.currentBeat
        renderer.updateConfig(config(chordMode = QuizChordMode.ROOT_ONLY, transpose = 12))
        val transition = ShortArray(100)

        renderer.renderInto(transition)

        assertEquals(beatBeforeChange + 0.1, renderer.currentBeat, 1e-9)
        assertTrue(transition.any { it.toInt() != 0 })
    }

    @Test
    fun renderer_handlesMultiMinuteEventsWithBoundedBlocks() {
        val timeline = QuizTimeline(
            endBeat = 302.0,
            events = listOf(event(1, 1.0, 301.0, QuizAudioLayer.CHORD, 48, 52, 55))
        )
        val renderer = QuizPcmRenderer(timeline, config(), sampleRate = 1_000)
        val block = ShortArray(256)

        repeat(40) { renderer.renderInto(block) }

        assertEquals(11.24, renderer.currentBeat, 1e-8)
        assertTrue(block.any { it.toInt() != 0 })
    }

    @Test
    fun engine_reportsPlayedFramesInsteadOfThePrimedRenderPosition() {
        val sink = FakeSink(blockAfterPlay = true)
        val engine = QuizPlaybackEngine(config(), sampleRate = 1_000) { sink }
        try {
            engine.load(simpleTimeline(), continuePlaying = false)
            engine.play()
            awaitPhase(engine, QuizPlaybackPhase.PLAYING)

            assertEquals(1.0, engine.state.value.beat, 1e-9)
            assertTrue(sink.writtenFrames.get() >= 256L)
        } finally {
            sink.unblockWrites()
            engine.release()
        }
    }

    @Test
    fun engine_completesPartialWritesAndStopsWritingAfterPause() {
        val sink = FakeSink(maxWriteFrames = 37, writeDelayMs = 1)
        val engine = QuizPlaybackEngine(config(), sampleRate = 1_000) { sink }
        try {
            engine.load(simpleTimeline(), continuePlaying = true)
            awaitPhase(engine, QuizPlaybackPhase.PLAYING)
            assertTrue(sink.writeCalls.get() > 1)

            engine.pause()
            awaitPhase(engine, QuizPlaybackPhase.PAUSED)
            val stoppedAt = sink.writtenFrames.get()
            Thread.sleep(30)

            assertEquals(stoppedAt, sink.writtenFrames.get())
        } finally {
            engine.release()
        }
    }

    @Test
    fun engine_pauseDuringPrimingNeverStartsTheSink() {
        val sink = FakeSink(blockFirstWrite = true)
        val engine = QuizPlaybackEngine(config(), sampleRate = 1_000) { sink }
        try {
            engine.load(simpleTimeline(), continuePlaying = true)
            assertTrue(sink.firstWriteEntered.await(3, TimeUnit.SECONDS))
            engine.pause()
            sink.unblockWrites()
            awaitPhase(engine, QuizPlaybackPhase.PAUSED)

            assertEquals(0, sink.playCalls.get())
        } finally {
            sink.unblockWrites()
            engine.release()
        }
    }

    @Test
    fun engine_scrubResumeIntentReflectsCommandsImmediately() {
        val sink = FakeSink(blockAfterPlay = true)
        val engine = QuizPlaybackEngine(config(), sampleRate = 1_000) { sink }
        try {
            engine.load(simpleTimeline(), continuePlaying = false)

            assertFalse(engine.pauseForScrub())
            engine.seek(2.0, resume = false)
            engine.play()
            assertTrue(engine.pauseForScrub())
            assertFalse(engine.pauseForScrub())
        } finally {
            sink.unblockWrites()
            engine.release()
        }
    }

    @Test
    fun engine_pausedScrubToEndPublishesAndKeepsTheEndBeat() {
        val sink = FakeSink()
        val engine = QuizPlaybackEngine(config(), sampleRate = 1_000) { sink }
        try {
            engine.load(simpleTimeline(), continuePlaying = false)
            awaitPhase(engine, QuizPlaybackPhase.STOPPED)
            engine.seek(4.0, resume = false)

            assertEquals(4.0, engine.state.value.beat, 0.0)
            awaitCondition {
                engine.state.value.phase == QuizPlaybackPhase.PAUSED &&
                    engine.state.value.beat == 4.0
            }
        } finally {
            engine.release()
        }
    }

    @Test
    fun engine_recreatesOneDeadSinkWithoutEnteringError() {
        val created = AtomicInteger(0)
        val first = FakeSink(failWithDeadObject = true)
        val second = FakeSink(writeDelayMs = 1)
        val engine = QuizPlaybackEngine(config(), sampleRate = 1_000) {
            if (created.getAndIncrement() == 0) first else second
        }
        try {
            engine.load(simpleTimeline(), continuePlaying = true)
            awaitCondition { created.get() >= 2 }
            awaitPhase(engine, QuizPlaybackPhase.PLAYING)

            assertFalse(engine.state.value.phase == QuizPlaybackPhase.ERROR)
        } finally {
            engine.release()
        }
    }

    private fun simpleTimeline() = QuizTimeline(
        endBeat = 4.0,
        events = listOf(event(1, 1.0, 3.0, QuizAudioLayer.MELODY, 60))
    )

    private fun event(
        id: Long,
        start: Double,
        end: Double,
        layer: QuizAudioLayer,
        vararg notes: Int
    ) = QuizTimelineEvent(
        id = id,
        startBeat = start,
        endBeat = end,
        layer = layer,
        fullMidiNotes = notes
    )

    private fun awaitPhase(engine: QuizPlaybackEngine, phase: QuizPlaybackPhase) {
        awaitCondition { engine.state.value.phase == phase }
    }

    private fun awaitCondition(condition: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3)
        while (!condition() && System.nanoTime() < deadline) Thread.sleep(5)
        assertTrue("Timed out waiting for asynchronous audio state", condition())
    }

    private class FakeSink(
        private val maxWriteFrames: Int = Int.MAX_VALUE,
        private val writeDelayMs: Long = 0,
        private val blockAfterPlay: Boolean = false,
        private val blockFirstWrite: Boolean = false,
        failWithDeadObject: Boolean = false
    ) : QuizAudioSink {
        val writtenFrames = AtomicLong(0)
        val writeCalls = AtomicInteger(0)
        val playCalls = AtomicInteger(0)
        val firstWriteEntered = CountDownLatch(1)
        private val deadObjectPending = AtomicBoolean(failWithDeadObject)
        private val writeGate = CountDownLatch(if (blockAfterPlay || blockFirstWrite) 1 else 0)
        @Volatile private var playing = false
        @Volatile private var released = false
        private val playedFrames = AtomicLong(0)

        override val playbackHeadFrames: Long get() = playedFrames.get()
        override val underrunCount: Int get() = 0
        override fun setBufferSizeInFrames(frames: Int): Int = frames

        override fun write(samples: ShortArray, offset: Int, size: Int): Int {
            writeCalls.incrementAndGet()
            firstWriteEntered.countDown()
            if (deadObjectPending.compareAndSet(true, false)) return AudioTrack.ERROR_DEAD_OBJECT
            if ((blockAfterPlay && playing) || (blockFirstWrite && writeCalls.get() == 1)) {
                writeGate.await()
            }
            if (released) return AudioTrack.ERROR_DEAD_OBJECT
            if (writeDelayMs > 0) Thread.sleep(writeDelayMs)
            val written = minOf(size, maxWriteFrames)
            writtenFrames.addAndGet(written.toLong())
            if (playing) playedFrames.addAndGet(written.toLong())
            return written
        }

        override fun play() {
            playCalls.incrementAndGet()
            playing = true
        }

        override fun pause() {
            playing = false
        }

        override fun flush() {
            playedFrames.set(0)
        }

        override fun release() {
            released = true
            unblockWrites()
        }

        fun unblockWrites() = writeGate.countDown()
    }
}
