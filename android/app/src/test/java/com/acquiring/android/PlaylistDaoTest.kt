package com.acquiring.android

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE)
class PlaylistDaoTest {
    private lateinit var db: UserDataDatabase
    private lateinit var dao: PlaylistDao

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, UserDataDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        dao = db.playlistDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    private suspend fun seedFavorites() {
        dao.ensureBuiltInPlaylist(
            id = PlaylistIds.FAVORITES,
            name = PlaylistIds.FAVORITES_NAME,
            createdAt = 1_000L
        )
    }

    @Test
    fun seedingTheBuiltInPlaylistIsIdempotent() = runBlocking {
        seedFavorites()
        seedFavorites()
        // A later call must not overwrite the original row either.
        dao.ensureBuiltInPlaylist(PlaylistIds.FAVORITES, "Renamed", 9_999L)

        val summaries = dao.getPlaylistSummaries()
        assertEquals(1, summaries.size)
        assertEquals(PlaylistIds.FAVORITES, summaries.single().id)
        assertEquals(PlaylistIds.FAVORITES_NAME, summaries.single().name)
        assertEquals(0L, summaries.single().songCount)
    }

    @Test
    fun addingAndRemovingDrivesMembership() = runBlocking {
        seedFavorites()
        val slug = "scott-joplin__maple-leaf-rag"

        assertFalse(dao.isInPlaylist(PlaylistIds.FAVORITES, slug))

        dao.addEntry(PlaylistEntry(PlaylistIds.FAVORITES, slug, addedAt = 10L))
        assertTrue(dao.isInPlaylist(PlaylistIds.FAVORITES, slug))

        // Starring an already-favorited song must not duplicate the row.
        dao.addEntry(PlaylistEntry(PlaylistIds.FAVORITES, slug, addedAt = 20L))
        assertEquals(listOf(slug), dao.getSlugsIn(PlaylistIds.FAVORITES))
        assertEquals(1L, dao.getPlaylistSummaries().single().songCount)

        dao.removeEntry(PlaylistIds.FAVORITES, slug)
        assertFalse(dao.isInPlaylist(PlaylistIds.FAVORITES, slug))
        assertEquals(emptyList<String>(), dao.getSlugsIn(PlaylistIds.FAVORITES))
    }

    @Test
    fun playlistSongsComeBackNewestFirst() = runBlocking {
        seedFavorites()
        dao.addEntry(PlaylistEntry(PlaylistIds.FAVORITES, "oldest", addedAt = 100L))
        dao.addEntry(PlaylistEntry(PlaylistIds.FAVORITES, "newest", addedAt = 300L))
        dao.addEntry(PlaylistEntry(PlaylistIds.FAVORITES, "middle", addedAt = 200L))

        assertEquals(
            listOf("newest", "middle", "oldest"),
            dao.getSlugsIn(PlaylistIds.FAVORITES)
        )
    }

    @Test
    fun membershipIsScopedToItsOwnPlaylist() = runBlocking {
        seedFavorites()
        dao.insertPlaylist(Playlist("practice", "Practice", isBuiltIn = false, createdAt = 2_000L))
        dao.addEntry(PlaylistEntry("practice", "shared-song", addedAt = 10L))

        assertTrue(dao.isInPlaylist("practice", "shared-song"))
        assertFalse(dao.isInPlaylist(PlaylistIds.FAVORITES, "shared-song"))
        assertEquals(emptyList<String>(), dao.getSlugsIn(PlaylistIds.FAVORITES))
    }

    @Test
    fun deletingAPlaylistTakesItsEntriesWithIt() = runBlocking {
        dao.insertPlaylist(Playlist("practice", "Practice", isBuiltIn = false, createdAt = 2_000L))
        dao.addEntry(PlaylistEntry("practice", "a-song", addedAt = 10L))
        assertEquals(listOf("a-song"), dao.getSlugsIn("practice"))

        dao.deletePlaylist("practice")

        assertEquals(emptyList<String>(), dao.getPlaylistSummaries())
        // Cascade, not an orphan row left behind.
        assertEquals(emptyList<String>(), dao.getSlugsIn("practice"))
    }

    @Test
    fun builtInPlaylistsAreNotDeletable() = runBlocking {
        seedFavorites()
        dao.addEntry(PlaylistEntry(PlaylistIds.FAVORITES, "a-song", addedAt = 10L))

        dao.deletePlaylist(PlaylistIds.FAVORITES)

        assertEquals(1, dao.getPlaylistSummaries().size)
        assertEquals(listOf("a-song"), dao.getSlugsIn(PlaylistIds.FAVORITES))
    }

    /**
     * The reason playlists have their own database file at all.
     *
     * DatabaseDownloader installs a catalog by replacing AppDatabase.DB_NAME on
     * disk and deleting its sidecars. Losing that file must not cost the user
     * their playlists, so this stands in for the swap and asserts the user
     * database is untouched by it.
     */
    @Test
    fun playlistsSurviveTheCatalogDatabaseBeingReplaced() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        assertNotEquals(AppDatabase.DB_NAME, UserDataDatabase.DB_NAME)

        val catalogDb = Room.databaseBuilder(
            context, AppDatabase::class.java, AppDatabase.DB_NAME
        ).addMigrations(AppDatabase.MIGRATION_1_2, AppDatabase.MIGRATION_2_3)
            .allowMainThreadQueries()
            .build()
        var userDb = Room.databaseBuilder(
            context, UserDataDatabase::class.java, UserDataDatabase.DB_NAME
        ).allowMainThreadQueries().build()

        try {
            catalogDb.songDao().insertSong(
                Song(slug = "a-song", artist = "Artist", title = "Title", url = "https://example/x")
            )
            userDb.playlistDao().ensureBuiltInPlaylist(
                PlaylistIds.FAVORITES, PlaylistIds.FAVORITES_NAME, 1_000L
            )
            userDb.playlistDao()
                .addEntry(PlaylistEntry(PlaylistIds.FAVORITES, "a-song", addedAt = 10L))

            // The catalog file goes away, exactly as an install would take it.
            catalogDb.close()
            userDb.close()
            assertTrue(context.deleteDatabase(AppDatabase.DB_NAME))

            userDb = Room.databaseBuilder(
                context, UserDataDatabase::class.java, UserDataDatabase.DB_NAME
            ).allowMainThreadQueries().build()
            assertEquals(listOf("a-song"), userDb.playlistDao().getSlugsIn(PlaylistIds.FAVORITES))
            assertEquals(1L, userDb.playlistDao().getPlaylistSummaries().single().songCount)
        } finally {
            catalogDb.close()
            userDb.close()
            context.deleteDatabase(AppDatabase.DB_NAME)
            context.deleteDatabase(UserDataDatabase.DB_NAME)
        }
    }
}
