package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BrowseSubgroupingTest {
    @Test
    fun shortGroupsAreLeftFlat() {
        val songs = makeSongs((0 until BrowseSubgrouping.MINIMUM_SONG_COUNT - 1).map { "Song $it" })
        assertEquals(emptyList<BrowseSubgroup>(), BrowseSubgrouping.subgroups(songs))
        assertEquals(emptyList<BrowseSubgroup>(), BrowseSubgrouping.subgroups(emptyList()))
    }

    @Test
    fun anAlphabeticalGroupSplitsOnTheSecondCharacter() {
        val titles = padded(listOf("Sad Song", "Sailing", "Scarborough", "Shine", "shiver", "Summer"), "Sz Filler")
        val subgroups = BrowseSubgrouping.subgroups(makeSongs(titles))
        assertEquals(listOf("SA", "SC", "SH", "SU", "SZ"), subgroups.map { it.key })
        assertEquals(listOf("Sa", "Sc", "Sh", "Su", "Sz"), subgroups.map { it.label })
        assertEquals(listOf(2, 1, 2, 1, titles.size - 6), subgroups.map { it.songs.size })
        assertEquals(
            listOf("Shine", "shiver"),
            subgroups.first { it.key == "SH" }.songs.map { it.title }
        )
    }

    @Test
    fun aMixedGroupSplitsOnTheFirstCharacter() {
        val titles = padded(listOf("Alpha", "Beta", "beehive", "Zulu"), "Zz Filler")
        val subgroups = BrowseSubgrouping.subgroups(makeSongs(titles))
        assertEquals(listOf("A", "B", "Z"), subgroups.map { it.key })
        assertEquals(listOf(1, 2, titles.size - 3), subgroups.map { it.songs.size })
    }

    @Test
    fun everySongLandsInExactlyOneRunInTheOrderItArrived() {
        val titles = padded(listOf("Alpha", "Beta", "Gamma"), "Zz Filler")
        val songs = makeSongs(titles)
        val subgroups = BrowseSubgrouping.subgroups(songs)
        assertEquals(songs.map { it.slug }, subgroups.flatMap { it.songs }.map { it.slug })
    }

    @Test
    fun aLongSharedPrefixIsCappedRatherThanSpellingOutTheTitle() {
        val titles = padded(listOf("Thanks", "The Long And Winding Road", "The Longest Day"), "Thz Filler")
        val subgroups = BrowseSubgrouping.subgroups(makeSongs(titles))
        assertEquals(listOf("THA", "THE", "THZ"), subgroups.map { it.key })
        assertEquals(listOf("Tha", "The", "Thz"), subgroups.map { it.label })
        assertTrue(subgroups.all { it.key.length <= BrowseSubgrouping.MAXIMUM_PREFIX_LENGTH })
    }

    @Test
    fun aGroupThatSharesTheCappedPrefixStaysFlat() {
        val songs = makeSongs(padded(listOf("The Long Road"), "The Long Filler"))
        assertEquals(emptyList<BrowseSubgroup>(), BrowseSubgrouping.subgroups(songs))
    }

    @Test
    fun aSingleRunIsReportedAsNoRunsAtAll() {
        val songs = makeSongs(List(60) { "Same Title" })
        assertEquals(emptyList<BrowseSubgroup>(), BrowseSubgrouping.subgroups(songs))
    }

    @Test
    fun untitledSongsShareTheSymbolRunWithoutFlatteningTheOthers() {
        val titles = padded(listOf("Sad Song", "Shine"), "Sz Filler")
        val songs = makeSongs(titles) + listOf(
            SongBrowseRow("blank", "Artist", "   "),
            SongBrowseRow("missing", "Artist", null)
        )
        val subgroups = BrowseSubgrouping.subgroups(songs)
        assertEquals(listOf("SA", "SH", "SZ", "#"), subgroups.map { it.key })
        assertEquals("#", subgroups.last().label)
        assertEquals(listOf("blank", "missing"), subgroups.last().songs.map { it.slug })
    }

    @Test
    fun jumpTargetsKeepTheFirstRunOfEachKey() {
        val first = BrowseSubgroup("SA", "Sa", makeSongs(listOf("Sad")))
        val repeated = BrowseSubgroup("SA", "Sa", makeSongs(listOf("Sadder")))
        val other = BrowseSubgroup("SH", "Sh", makeSongs(listOf("Shine")))
        val targets = BrowseSubgrouping.jumpTargets(listOf(first, repeated, other))
        assertEquals(listOf(first.id, other.id), targets.map { it.id })
    }

    @Test
    fun indexOfSubgroupCountsHeadersAndSongs() {
        val runs = listOf(
            BrowseSubgroup("A", "A", listOf(
                SongBrowseRow("a1", "Artist", "Alpha"),
                SongBrowseRow("a2", "Artist", "Ant")
            )),
            BrowseSubgroup("B", "B", listOf(SongBrowseRow("b1", "Artist", "Beta")))
        )
        assertEquals(1, BrowseSubgrouping.indexOfSubgroup(0, runs, runs[0].id))
        assertEquals(4, BrowseSubgrouping.indexOfSubgroup(0, runs, runs[1].id))
    }

    @Test
    fun condensingSamplesEvenlyKeepingTheFirstAndLastRun() {
        val runs = makeSubgroups(40)
        val sampled = BrowseSubgrouping.condensed(runs, 5)
        assertEquals(listOf("K00", "K10", "K20", "K29", "K39"), sampled.map { it.key })
        assertEquals(runs.first(), sampled.first())
        assertEquals(runs.last(), sampled.last())
    }

    private fun makeSubgroups(count: Int): List<BrowseSubgroup> =
        (0 until count).map { index ->
            val key = "K%02d".format(index)
            BrowseSubgroup(key, key, listOf(SongBrowseRow("run-$index", "Artist", key)))
        }

    private fun makeSongs(titles: List<String?>): List<SongBrowseRow> =
        titles.mapIndexed { index, title -> SongBrowseRow("song-$index", "Artist", title) }

    private fun padded(titles: List<String>, filler: String): List<String?> {
        val fillerCount = maxOf(0, BrowseSubgrouping.MINIMUM_SONG_COUNT - titles.size)
        return titles + (0 until fillerCount).map { "$filler %02d".format(it) }
    }
}
