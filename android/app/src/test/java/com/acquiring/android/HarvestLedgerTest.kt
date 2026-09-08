package com.acquiring.android

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/**
 * A catalog install replaces the catalog database as a whole file, so a
 * manually harvested song written only into the catalog is destroyed by the
 * next "Download Full Library". These tests pin the ledger that survives it.
 */
@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE)
class HarvestLedgerTest {
    private lateinit var context: Context
    private lateinit var catalogDb: AppDatabase
    private lateinit var userDb: UserDataDatabase

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        catalogDb = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries().build()
        userDb = Room.inMemoryDatabaseBuilder(context, UserDataDatabase::class.java)
            .allowMainThreadQueries().build()
    }

    @After
    fun tearDown() {
        catalogDb.close()
        userDb.close()
    }

    // MARK: manual harvests survive an install

    @Test
    fun harvestSurvivesAnInstallWhoseCatalogOmitsIt() = runBlocking {
        harvest(slug = "artist__mine", title = "My Harvest", modes = setOf("ionian"))

        val staged = stageCatalog("catalog-a", "catalog-b")
        installCatalog(staged)

        assertEquals(1, HarvestLedger.replay(catalogDb, userDb))
        val restored = catalogDb.songDao().getSongBySlug("artist__mine")
        assertNotNull("a harvest the new catalog lacks must survive the swap", restored)
        assertEquals("My Harvest", restored!!.title)
        assertEquals(PAYLOAD.toList(), restored.dataBlob!!.toList())
        assertEquals(3, catalogDb.songDao().getSongCount())
        assertEquals(
            listOf("artist__mine"),
            catalogDb.songDao().getSongsInAlphabeticalGroup("M").map(SongBrowseRow::slug)
        )
        assertEquals(
            listOf("artist__mine"),
            catalogDb.songDao().getSongsInMode("ionian").map(SongBrowseRow::slug)
        )
    }

    @Test
    fun newCatalogWinsWhenItCarriesTheSameSlug() = runBlocking {
        harvest(slug = "shared-song", title = "Stale Harvest Title", modes = setOf("aeolian"))

        val staged = stageCatalog("shared-song", complexityRating = 42.0)
        installCatalog(staged)

        assertEquals(0, HarvestLedger.replay(catalogDb, userDb))
        val song = catalogDb.songDao().getSongBySlug("shared-song")
        assertEquals("the fresher catalog row wins", "Song shared-song", song?.title)
        assertEquals(
            "including the rating a harvest can never produce",
            42.0,
            catalogDb.songDao().getComplexityRating("shared-song")!!,
            0.0001
        )
        assertEquals(
            "the ledger must not duplicate a song the catalog already carries",
            1,
            catalogDb.songDao().getSongCount()
        )
    }

    // MARK: legacy amnesty

    @Test
    fun songsHarvestedBeforeTheLedgerExistedAreAdoptedOnceAndOnlyOnce() = runBlocking {
        // No ledger entry: exactly the state left by a build that predates it.
        writeCatalogOnlySong(slug = "legacy-harvest", title = "Legacy Harvest")

        val first = stageCatalog("catalog-a", "catalog-b")
        HarvestLedger.adopt(catalogDb, first, userDb)
        installCatalog(first)
        HarvestLedger.replay(catalogDb, userDb)

        assertNotNull(
            "the pre-ledger harvest is rescued by the one-time sweep",
            catalogDb.songDao().getSongBySlug("legacy-harvest")
        )

        // Second install: "catalog-b" is a catalog row the new catalog drops on
        // purpose. The amnesty is spent, so it must not be resurrected.
        val second = stageCatalog("catalog-a")
        HarvestLedger.adopt(catalogDb, second, userDb)
        installCatalog(second)
        HarvestLedger.replay(catalogDb, userDb)

        assertNull(
            "a deliberate catalog prune must stick once the amnesty is spent",
            catalogDb.songDao().getSongBySlug("catalog-b")
        )
        assertNotNull(
            "but a song already in the ledger keeps coming back",
            catalogDb.songDao().getSongBySlug("legacy-harvest")
        )
    }

    @Test
    fun theSweepDeclinesACatalogThatMerelyLostItsRatings() = runBlocking {
        // A rebuilt or re-keyed catalog, not a pile of manual harvests.
        for (index in 0..HarvestLedger.LEGACY_ADOPTION_LIMIT) {
            writeCatalogOnlySong(slug = "bulk-$index", title = "Bulk $index")
        }

        val staged = stageCatalog("catalog-a")
        HarvestLedger.adopt(catalogDb, staged, userDb)

        assertEquals(
            "adopting a whole catalog would pin it into every future one",
            0,
            userDb.harvestLedgerDao().count()
        )
    }

    // MARK: replay durability

    @Test
    fun replayIsIdempotent() = runBlocking {
        harvest(slug = "artist__mine", title = "My Harvest", modes = setOf("ionian"))
        installCatalog(stageCatalog("catalog-a"))

        assertEquals(1, HarvestLedger.replay(catalogDb, userDb))
        assertEquals("a second pass writes nothing", 0, HarvestLedger.replay(catalogDb, userDb))
        assertEquals(2, catalogDb.songDao().getSongCount())
    }

    // MARK: migration

    @Test
    fun theLedgerMigrationKeepsExistingPlaylists() = runBlocking {
        val databaseName = "user-data-migration-test.db"
        context.deleteDatabase(databaseName)
        val databaseFile = context.getDatabasePath(databaseName)
        databaseFile.parentFile?.mkdirs()

        SQLiteDatabase.openOrCreateDatabase(databaseFile, null).use { old ->
            old.execSQL(
                """
                CREATE TABLE `playlists` (
                    `id` TEXT NOT NULL, `name` TEXT NOT NULL,
                    `isBuiltIn` INTEGER NOT NULL, `createdAt` INTEGER NOT NULL,
                    PRIMARY KEY(`id`)
                )
                """.trimIndent()
            )
            old.execSQL(
                """
                CREATE TABLE `playlist_entries` (
                    `playlistId` TEXT NOT NULL, `slug` TEXT NOT NULL, `addedAt` INTEGER NOT NULL,
                    PRIMARY KEY(`playlistId`, `slug`),
                    FOREIGN KEY(`playlistId`) REFERENCES `playlists`(`id`)
                        ON UPDATE NO ACTION ON DELETE CASCADE
                )
                """.trimIndent()
            )
            old.execSQL("CREATE INDEX `index_playlist_entries_playlistId` ON `playlist_entries` (`playlistId`)")
            old.execSQL(
                "INSERT INTO playlists (id, name, isBuiltIn, createdAt) VALUES (?, ?, 1, 1000)",
                arrayOf(PlaylistIds.FAVORITES, PlaylistIds.FAVORITES_NAME)
            )
            old.execSQL(
                "INSERT INTO playlist_entries (playlistId, slug, addedAt) VALUES (?, ?, 2000)",
                arrayOf(PlaylistIds.FAVORITES, "kept-song")
            )
            old.version = 1
        }

        val migrated = Room.databaseBuilder(context, UserDataDatabase::class.java, databaseName)
            .addMigrations(UserDataDatabase.MIGRATION_1_2)
            .allowMainThreadQueries()
            .build()
        try {
            assertTrue(
                "playlists predate the ledger and must survive its migration",
                migrated.playlistDao().isInPlaylist(PlaylistIds.FAVORITES, "kept-song")
            )
            assertEquals(0, migrated.harvestLedgerDao().count())
        } finally {
            migrated.close()
            context.deleteDatabase(databaseName)
        }
    }

    // MARK: - Fixture

    /** Writes a song the way a real manual harvest does: catalog and ledger. */
    private suspend fun harvest(slug: String, title: String, modes: Set<String>) {
        val song = catalogSong(slug, title)
        val browseEntry = AllSongsGrouping.browseEntry(song)
        catalogDb.songDao().insertSong(song)
        catalogDb.songDao().upsertBrowseEntry(browseEntry)
        catalogDb.songDao().insertBrowseModes(modes.map { SongBrowseMode(slug, it) })
        HarvestLedger.record(userDb, song, browseEntry.alphaGroup, modes)
    }

    /** A catalog song with no ledger entry, as left by a pre-ledger build. */
    private suspend fun writeCatalogOnlySong(slug: String, title: String) {
        val song = catalogSong(slug, title)
        catalogDb.songDao().insertSong(song)
        catalogDb.songDao().upsertBrowseEntry(AllSongsGrouping.browseEntry(song))
    }

    private fun catalogSong(slug: String, title: String) = Song(
        slug = slug,
        artist = "Harvest Artist",
        title = title,
        url = "https://www.hooktheory.com/theorytab/view/$slug",
        status = "enriched",
        dataBlob = PAYLOAD
    )

    /** A catalog file shaped like a validated download, ready to be installed. */
    private fun stageCatalog(vararg slugs: String, complexityRating: Double? = null): File {
        val file = File(context.cacheDir, "staged-${System.nanoTime()}.db")
        file.delete()
        SQLiteDatabase.openOrCreateDatabase(file, null).use { staged ->
            SongBrowseSchema.createStatements.forEach(staged::execSQL)
            staged.execSQL(
                """
                CREATE TABLE IF NOT EXISTS `songs` (
                    `slug` TEXT NOT NULL, `artist` TEXT, `title` TEXT, `url` TEXT NOT NULL,
                    `status` TEXT NOT NULL, `dataBlob` BLOB, PRIMARY KEY(`slug`)
                )
                """.trimIndent()
            )
            for (slug in slugs) {
                staged.execSQL(
                    "INSERT INTO songs (slug, artist, title, url, status, dataBlob) VALUES (?, ?, ?, ?, ?, ?)",
                    arrayOf(slug, "Catalog Artist", "Song $slug", "https://example.test/$slug", "ready", PAYLOAD)
                )
                staged.execSQL(
                    """
                    INSERT INTO song_browse_entries
                        (slug, artist, title, alphaGroup, complexityRating, complexityBucket)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """.trimIndent(),
                    arrayOf<Any?>(slug, "Catalog Artist", "Song $slug", "S", complexityRating, null)
                )
            }
        }
        return file
    }

    /**
     * Stands in for the atomic swap. The in-memory catalog cannot be replaced on
     * disk, so its contents are replaced instead — what matters to the ledger is
     * that everything the old catalog held is gone.
     */
    private suspend fun installCatalog(stagedFile: File) {
        catalogDb.clearAllTables()
        SQLiteDatabase.openDatabase(stagedFile.path, null, SQLiteDatabase.OPEN_READONLY).use { staged ->
            staged.rawQuery(
                "SELECT slug, artist, title, url, status, dataBlob FROM songs",
                null
            ).use { cursor ->
                while (cursor.moveToNext()) {
                    val song = Song(
                        slug = cursor.getString(0),
                        artist = cursor.getString(1),
                        title = cursor.getString(2),
                        url = cursor.getString(3),
                        status = cursor.getString(4),
                        dataBlob = cursor.getBlob(5)
                    )
                    catalogDb.songDao().insertSong(song)
                }
            }
            staged.rawQuery(
                "SELECT slug, artist, title, alphaGroup, complexityRating FROM song_browse_entries",
                null
            ).use { cursor ->
                while (cursor.moveToNext()) {
                    val rating = if (cursor.isNull(4)) null else cursor.getDouble(4)
                    catalogDb.songDao().upsertBrowseEntry(
                        SongBrowseEntry(
                            slug = cursor.getString(0),
                            artist = cursor.getString(1),
                            title = cursor.getString(2),
                            alphaGroup = cursor.getString(3),
                            complexityRating = rating,
                            complexityBucket = AllSongsGrouping.complexityBucket(rating)
                        )
                    )
                }
            }
        }
    }

    private companion object {
        val PAYLOAD: ByteArray =
            """{"verse":{"sectionName":"Verse","sectionIndex":0,"chords":[]}}""".toByteArray()
    }
}
