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
        assertTrue(state.completed(token))
        assertFalse(state.completed(token))
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
}
