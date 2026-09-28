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

    @Test fun shuffleKeepsCurrentSongAndCompletionAdvancesOnce() {
        val state=SongQueueViewModel()
        val generation=state.begin(true,"I–V")
        val songs=(0..9).map { QueuedSong("song-$it","Song $it","Artist","section","Section") }
        state.finishPreparation(generation,songs)
        val token=state.loadToken
        state.shuffleRemaining(Random(8))
        assertEquals("song-0",state.entries.first().slug)
        assertEquals(songs.map { it.slug }.toSet(),state.entries.map { it.slug }.toSet())
        assertTrue(state.completed(token))
        assertFalse(state.completed(token))
        assertEquals(1,state.index)
        state.dismiss()
        assertFalse(state.completed(state.loadToken))
    }
}
