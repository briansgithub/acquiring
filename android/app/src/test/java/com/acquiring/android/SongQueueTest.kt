package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class SongQueueTest {
    private fun candidate(slug: String, section: String, score: Double?) =
        QueueCandidate(QueuedSong(slug,slug,"Artist",section,section),score)

    @Test fun popularityOrdersAllSongsAndDeduplicatesRepeatedSections() {
        val candidates=buildList {
            repeat(31) { i -> add(candidate("song-$i","section-a",i/100.0)) }
            add(candidate("song-30","section-a",.30))
            add(candidate("song-30","section-b",.30))
            add(candidate("below","section-a",.01))
        }
        val queue=orderedQueue(candidates,10,Random(4))
        assertEquals(21,queue.size)
        assertEquals("song-30",queue.first().slug)
        assertEquals("song-10",queue.last().slug)
        assertEquals(1,queue.count { it.slug=="song-30" })
        assertTrue(queue.first().sectionId in setOf("section-a","section-b"))
    }

    @Test fun queuePreviewsPopularityOrderAndShuffleCanBeTurnedOff() {
        val state=SongQueueViewModel()
        val generation=state.begin(true,"I–V")
        val songs=(0..9).map { QueuedSong("song-$it","Song $it","Artist","section","Section") }
        state.finishPreparation(generation,songs)
        assertFalse(state.started)
        assertFalse(state.shuffleEnabled)
        assertEquals(songs,state.entries)
        state.toggleShuffle(Random(8))
        assertTrue(state.shuffleEnabled)
        assertEquals(songs.toSet(),state.entries.toSet())
        assertFalse(songs==state.entries)
        state.toggleShuffle()
        assertFalse(state.shuffleEnabled)
        assertEquals(songs,state.entries)
        state.start()
        assertTrue(state.started)
        val token=state.loadToken
        val current=state.entries[state.index]
        state.toggleShuffle(Random(8))
        assertEquals(current,state.entries[state.index])
        assertEquals(token,state.loadToken)
        state.toggleShuffle()
        assertEquals(songs,state.entries)
        assertEquals(current,state.entries[state.index])
        assertFalse(state.completed(token))
        state.select(state.index + 1, resume = true)
        assertEquals(1,state.index)
        state.dismiss()
        assertFalse(state.completed(state.loadToken))
    }

    @Test fun savedShufflePlayRestoresSavedOrderWhenTurnedOff() {
        val state=SongQueueViewModel()
        val songs=(0..5).map { QueuedSong("song-$it","Song $it","Artist","section","Section") }
        state.finishPreparation(state.begin(false,"Playlist"),songs,shuffled=true)
        assertTrue(state.shuffleEnabled)
        state.toggleShuffle()
        assertFalse(state.shuffleEnabled)
        assertEquals(songs,state.entries)
        assertFalse(state.started)
    }

    @Test fun examplesLoopTheSelectedSectionInBothQueueOrders() {
        val state = SongQueueViewModel()
        state.finishPreparation(state.begin(true, "Examples"),
            (0..2).map { QueuedSong("song-$it", "Song $it", "Artist", "section", "Section") })
        state.start()
        repeat(2) {
            val selected = state.entries[state.index]
            val timeline = PlaybackTimeline(endBeat = 1.25, completionKey = state.playbackCompletionKey,
                events = listOf(PlaybackTimelineEvent(1L, 1.0, 1.1, PlaybackAudioLayer.CHORD, intArrayOf(60), 60)))
            val renderer = PlaybackPcmRenderer(timeline,
                PlaybackConfig(60.0, 0, AudioEngine.Waveform.SINE, PlaybackChordMode.FULL, 1f, 1f), sampleRate = 1_000)
            val rendered = renderer.renderInto(ShortArray(600))
            assertTrue("The section must sound more than once", rendered.startedEvents.size >= 2)
            assertFalse(renderer.finished)
            assertFalse(state.completed(state.loadToken))
            assertEquals(selected, state.entries[state.index])
            state.toggleShuffle(Random(8))
        }
    }

    @Test fun shuffledExampleQueueHonorsThePopularityCutoff() {
        val songs = listOf(
            candidate("keep", "a", 0.80),
            candidate("low", "a", 0.79),
            candidate("zero", "a", 0.0),
            candidate("perfect", "a", 1.0),
            candidate("unscored", "a", null),
            candidate("almost", "a", 0.999)
        )
        assertEquals(
            setOf("keep", "low", "zero", "perfect", "unscored", "almost"),
            shuffledExampleQueue(songs, null, Random(1)).map { it.slug }.toSet()
        )
        assertEquals(setOf("keep", "perfect", "almost"), shuffledExampleQueue(songs, 80, Random(1)).map { it.slug }.toSet())
        val atZero = shuffledExampleQueue(songs, 0, Random(1)).map { it.slug }.toSet()
        assertTrue(atZero.contains("zero"))
        assertFalse(atZero.contains("unscored"))
        assertEquals(setOf("perfect"), shuffledExampleQueue(songs, 100, Random(1)).map { it.slug }.toSet())
    }

    @Test fun shuffledExampleQueueRandomizesOneEntryPerSong() {
        val songs = (0..5).map { candidate("song-$it", "a", 1.0) } + candidate("song-0", "b", 1.0)
        val distinct = (0..5).map { candidate("song-$it", "a", 1.0).song }
        val queue = shuffledExampleQueue(songs, null, Random(4))
        assertEquals(distinct.shuffled(Random(4)), queue)
        assertEquals(6, queue.map { it.slug }.toSet().size)
        assertEquals("a", queue.first { it.slug == "song-0" }.sectionId)
        assertFalse((0..5).map { "song-$it" } == queue.map { it.slug })
    }

    @Test fun examplePlaylistHoldsTheSongUntilTheListenerAdvances() {
        val state = SongQueueViewModel()
        val songs = (0..2).map { QueuedSong("song-$it", "Song $it", "Artist", "", "Chorus") }
        state.finishPreparation(state.begin(false, "Example songs", manualAdvance = true, preferChorus = true), songs)
        state.start()
        val index = state.index
        assertEquals(null, state.playbackCompletionKey)
        assertTrue(state.preferChorus)
        assertFalse(state.completed(state.loadToken))
        assertEquals(index, state.index)
        state.select(index + 1, resume = true)
        assertEquals(index + 1, state.index)
    }

    @Test fun savedPlaylistStillAdvancesAndManualNavigationPreservesPauseIntent() {
        val state = SongQueueViewModel()
        state.finishPreparation(state.begin(false, "Playlist"),
            (0..2).map { QueuedSong("song-$it", "Song $it", "Artist", "section", "Section") })
        state.start()
        assertEquals(state.loadToken, state.playbackCompletionKey)
        assertTrue(state.completed(state.loadToken))
        assertEquals(1, state.index)
        assertTrue(state.autoStart)
        state.select(0, resume = false)
        assertFalse(state.autoStart)
        val token = state.loadToken
        state.select(-1, resume = true)
        assertEquals(token, state.loadToken)
        state.select(2, resume = true)
        assertTrue(state.autoStart)
        assertFalse(state.completed(state.loadToken))
        assertEquals(2, state.index)
    }
}
