package com.inquiring.android

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE)
class AllSongsMigrationTest {
    @Test
    fun versionOneDatabaseBackfillsAndNormalizesLightweightAlphabeticalRows() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val databaseName = "all-songs-migration-test.db"
        context.deleteDatabase(databaseName)
        val databaseFile = context.getDatabasePath(databaseName)
        databaseFile.parentFile?.mkdirs()

        SQLiteDatabase.openOrCreateDatabase(databaseFile, null).use { oldDb ->
            oldDb.execSQL(
                """
                CREATE TABLE songs (
                    slug TEXT NOT NULL PRIMARY KEY,
                    artist TEXT,
                    title TEXT,
                    url TEXT NOT NULL,
                    status TEXT NOT NULL,
                    dataBlob BLOB
                )
                """.trimIndent()
            )
            oldDb.execSQL("CREATE TABLE room_master_table (id INTEGER PRIMARY KEY, identity_hash TEXT)")
            oldDb.execSQL(
                "INSERT INTO room_master_table (id, identity_hash) VALUES (42, 'v1-test-identity')"
            )
            oldDb.execSQL(
                """
                INSERT INTO songs (slug, artist, title, url, status, dataBlob)
                VALUES (?, ?, ?, ?, ?, ?)
                """.trimIndent(),
                arrayOf(
                    "migrated-song",
                    "Artist",
                    "Migrated Song",
                    "https://example.test/migrated-song",
                    "enriched",
                    ByteArray(2 * 1024 * 1024) { 7 }
                )
            )
            oldDb.execSQL(
                """
                INSERT INTO songs (slug, artist, title, url, status, dataBlob)
                VALUES (?, ?, ?, ?, ?, ?)
                """.trimIndent(),
                arrayOf(
                    "untitled-song",
                    "Artist",
                    null,
                    "https://example.test/untitled-song",
                    "enriched",
                    byteArrayOf(1, 2, 3)
                )
            )
            oldDb.execSQL(
                """
                INSERT INTO songs (slug, artist, title, url, status, dataBlob)
                VALUES (?, ?, ?, ?, ?, ?)
                """.trimIndent(),
                arrayOf(
                    "numeric-song",
                    "Artist",
                    "7 Nation Army",
                    "https://example.test/numeric-song",
                    "enriched",
                    byteArrayOf(4, 5, 6)
                )
            )
            oldDb.version = 1
        }

        val db = Room.databaseBuilder(context, AppDatabase::class.java, databaseName)
            .addMigrations(AppDatabase.MIGRATION_1_2, AppDatabase.MIGRATION_2_3)
            .allowMainThreadQueries()
            .build()
        try {
            assertEquals(
                listOf("migrated-song"),
                db.songDao().getSongsInAlphabeticalGroup("M").map(SongBrowseRow::slug)
            )
            assertEquals(
                listOf("numeric-song", "migrated-song", "untitled-song"),
                db.songDao().getUnratedSongs().map(SongBrowseRow::slug)
            )
            assertEquals(
                listOf("untitled-song"),
                db.songDao().getSongsInAlphabeticalGroup("#").map(SongBrowseRow::slug)
            )
            assertEquals(
                listOf("numeric-song"),
                db.songDao().getSongsInAlphabeticalGroup("7").map(SongBrowseRow::slug)
            )
            assertEquals(emptyList<SongBrowseRow>(), db.songDao().getSongsInMode("ionian"))
        } finally {
            db.close()
            context.deleteDatabase(databaseName)
        }
    }

    @Test
    fun versionTwoDatabaseMovesNumeralTitlesOutOfTheSymbolsGroup() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val databaseName = "all-songs-v2-v3-migration-test.db"
        context.deleteDatabase(databaseName)
        val databaseFile = context.getDatabasePath(databaseName)
        databaseFile.parentFile?.mkdirs()

        SQLiteDatabase.openOrCreateDatabase(databaseFile, null).use { oldDb ->
            oldDb.execSQL(
                """
                CREATE TABLE songs (
                    slug TEXT NOT NULL PRIMARY KEY,
                    artist TEXT,
                    title TEXT,
                    url TEXT NOT NULL,
                    status TEXT NOT NULL,
                    dataBlob BLOB
                )
                """.trimIndent()
            )
            SongBrowseSchema.createStatements.forEach(oldDb::execSQL)
            oldDb.execSQL(
                """
                INSERT INTO song_browse_entries
                    (slug, artist, title, alphaGroup, complexityRating, complexityBucket)
                VALUES ('numeric-song', 'Artist', '7 Nation Army', '#', 12.0, 1),
                       ('symbol-song', 'Artist', '! Anthem', '#', 22.0, 2)
                """.trimIndent()
            )
            oldDb.execSQL("CREATE TABLE room_master_table (id INTEGER PRIMARY KEY, identity_hash TEXT)")
            oldDb.execSQL(
                "INSERT INTO room_master_table (id, identity_hash) VALUES (42, 'v2-test-identity')"
            )
            oldDb.version = 2
        }

        val db = Room.databaseBuilder(context, AppDatabase::class.java, databaseName)
            .addMigrations(AppDatabase.MIGRATION_1_2, AppDatabase.MIGRATION_2_3)
            .allowMainThreadQueries()
            .build()
        try {
            assertEquals(
                listOf("numeric-song"),
                db.songDao().getSongsInAlphabeticalGroup("7").map(SongBrowseRow::slug)
            )
            assertEquals(
                listOf("symbol-song"),
                db.songDao().getSongsInAlphabeticalGroup("#").map(SongBrowseRow::slug)
            )
        } finally {
            db.close()
            context.deleteDatabase(databaseName)
        }
    }
}
