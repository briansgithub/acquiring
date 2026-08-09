package com.sacredring.android

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.concurrent.Executor

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE)
class AllSongsDaoTest {
    private lateinit var db: AppDatabase
    private lateinit var dao: SongDao
    private val observedQueries = mutableListOf<String>()

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .setQueryCallback(
                { sql, _ -> observedQueries += sql },
                Executor { command -> command.run() }
            )
            .build()
        dao = db.songDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun browseQueriesNeverSelectTheHeavyDataBlob() = runBlocking {
        val heavyBlob = ByteArray(2 * 1024 * 1024) { index -> (index % 251).toByte() }
        addSong("alpha", "alpha", "Artist Z", 12.0, heavyBlob, "ionian")

        observedQueries.clear()
        val browseRows = dao.getSongsInAlphabeticalGroup("A")
        val titleSearchRows = dao.searchBrowseSongsByTitle("alp")
        val artistRows = dao.getBrowseSongsByArtist("Artist Z")
        val suggestionRows = dao.getSearchSuggestions("alp")
        val recentRows = dao.getBrowseSongsBySlugs(listOf("alpha"))

        assertEquals(listOf("alpha"), browseRows.map(SongBrowseRow::slug))
        assertEquals(listOf("alpha"), titleSearchRows.map(SongBrowseRow::slug))
        assertEquals(listOf("alpha"), artistRows.map(SongBrowseRow::slug))
        assertEquals(listOf("alpha"), suggestionRows.map(SongBrowseRow::slug))
        assertEquals(listOf("alpha"), recentRows.map(SongBrowseRow::slug))
        val lightweightSelects = observedQueries.filter { sql ->
            sql.trimStart().startsWith("SELECT", ignoreCase = true) &&
                (
                    sql.contains("FROM songs", ignoreCase = true) ||
                        sql.contains("song_browse_entries", ignoreCase = true)
                    )
        }
        assertTrue("Expected to observe lightweight list queries", lightweightSelects.isNotEmpty())
        assertFalse(
            "List SELECT must not mention dataBlob: $lightweightSelects",
            lightweightSelects.any { it.contains("dataBlob", ignoreCase = true) }
        )

        val selectedSong = dao.getSongBySlug(browseRows.single().slug)
        assertArrayEquals(heavyBlob, selectedSong?.dataBlob)
    }

    @Test
    fun groupsAllowCrossModeMembershipAndSortEveryGroupByTitle() = runBlocking {
        addSong("zulu", "zulu", "Artist", 12.0, byteArrayOf(1), "ionian", "dorian")
        addSong("alpha-upper", "Alpha", "Artist B", 12.0, byteArrayOf(2), "dorian", "dorian")
        addSong("alpha-lower", "alpha", "Artist A", 25.0, byteArrayOf(3), "ionian")
        addSong("number", "7 Nation Army", "Artist", null, byteArrayOf(4))

        assertEquals(
            listOf("alpha", "Alpha"),
            dao.getSongsInAlphabeticalGroup("A").map(SongBrowseRow::title)
        )
        assertEquals(
            listOf("Alpha", "zulu"),
            dao.getSongsInComplexityGroup(1).map(SongBrowseRow::title)
        )
        assertEquals(
            listOf("alpha", "zulu"),
            dao.getSongsInMode("ionian").map(SongBrowseRow::title)
        )
        assertEquals(
            listOf("Alpha", "zulu"),
            dao.getSongsInMode("dorian").map(SongBrowseRow::title)
        )
        assertEquals(listOf("7 Nation Army"), dao.getUnratedSongs().map(SongBrowseRow::title))

        assertEquals(
            mapOf("1" to 2L, "2" to 1L, AllSongsGrouping.UNRATED_KEY to 1L),
            dao.getComplexityGroupCounts().associate { it.groupKey to it.songCount }
        )
        assertEquals(
            mapOf("dorian" to 2L, "ionian" to 2L),
            dao.getModeGroupCounts().associate { it.groupKey to it.songCount }
        )
        assertEquals(
            SongBrowseMetadataStatus(
                browseCount = 4L,
                ratedSongCount = 3L,
                modeMembershipCount = 4L
            ),
            dao.getBrowseMetadataStatus()
        )
    }

    @Test
    fun numeralAndSymbolGroupsSupportNormalizedSubstringFiltering() = runBlocking {
        addSong(
            "seven",
            "7 Nation Army",
            "The White-Stripes",
            12.0,
            byteArrayOf(1),
            "ionian"
        )
        addSong("zero", "007 Theme", "Film Artist", 22.0, byteArrayOf(2), "dorian")
        addSong("symbol", "! Anthem", "Symbolic", 32.0, byteArrayOf(3))
        addSong("beta-filter", "Beta Song", "Other", 12.0, byteArrayOf(4))
        addSong("unrated-filter", "Quiet Tune", "Sparse_Artist", null, byteArrayOf(5))

        assertEquals(
            listOf("007 Theme"),
            dao.getSongsInAlphabeticalGroup("0").map(SongBrowseRow::title)
        )
        assertEquals(
            listOf("7 Nation Army"),
            dao.getSongsInAlphabeticalGroup("7").map(SongBrowseRow::title)
        )
        assertEquals(
            listOf("! Anthem"),
            dao.getSongsInAlphabeticalGroup("#").map(SongBrowseRow::title)
        )

        assertEquals(
            listOf("seven"),
            dao.getSongsInAlphabeticalGroup("7", "NATION_army")
                .map(SongBrowseRow::slug)
        )
        assertEquals(
            listOf("seven"),
            dao.getSongsInAlphabeticalGroup("7", "white stripes")
                .map(SongBrowseRow::slug)
        )
        assertEquals(
            listOf("seven"),
            dao.getSongsInComplexityGroup(1, "WHITE_stripes")
                .map(SongBrowseRow::slug)
        )
        assertEquals(
            listOf("seven"),
            dao.getSongsInMode("ionian", "nation-army")
                .map(SongBrowseRow::slug)
        )
        assertEquals(
            listOf("unrated-filter"),
            dao.getUnratedSongs("SPARSE artist")
                .map(SongBrowseRow::slug)
        )
        assertEquals(
            mapOf("7" to 1L),
            dao.getAlphabeticalGroupCounts("white_stripes")
                .associate { it.groupKey to it.songCount }
        )
        assertEquals(
            mapOf("1" to 1L),
            dao.getComplexityGroupCounts("white-stripes")
                .associate { it.groupKey to it.songCount }
        )
        assertEquals(
            mapOf("ionian" to 1L),
            dao.getModeGroupCounts("white stripes")
                .associate { it.groupKey to it.songCount }
        )
    }

    private suspend fun addSong(
        slug: String,
        title: String,
        artist: String,
        complexity: Double?,
        dataBlob: ByteArray,
        vararg modes: String
    ) {
        val song = Song(
            slug = slug,
            artist = artist,
            title = title,
            url = "https://example.test/$slug",
            status = "enriched",
            dataBlob = dataBlob
        )
        dao.insertSong(song)
        dao.upsertBrowseEntry(AllSongsGrouping.browseEntry(song, complexity))
        if (modes.isNotEmpty()) {
            dao.insertBrowseModes(modes.map { mode -> SongBrowseMode(slug, mode) })
        }
    }
}
