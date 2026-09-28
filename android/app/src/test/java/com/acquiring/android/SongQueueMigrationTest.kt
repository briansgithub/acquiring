package com.acquiring.android

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
@Config(manifest=Config.NONE)
class SongQueueMigrationTest {
    @Test fun versionThreePreservesFavoritesAndAcceptsOrderedQueue() = runBlocking {
        val context=ApplicationProvider.getApplicationContext<Context>()
        val databaseName="song-queue-migration-test.db"
        context.deleteDatabase(databaseName)
        SQLiteDatabase.openOrCreateDatabase(context.getDatabasePath(databaseName),null).use { old ->
            old.execSQL("CREATE TABLE IF NOT EXISTS `playlists` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `isBuiltIn` INTEGER NOT NULL, `createdAt` INTEGER NOT NULL, PRIMARY KEY(`id`))")
            old.execSQL("CREATE TABLE IF NOT EXISTS `playlist_entries` (`playlistId` TEXT NOT NULL, `slug` TEXT NOT NULL, `addedAt` INTEGER NOT NULL, PRIMARY KEY(`playlistId`, `slug`), FOREIGN KEY(`playlistId`) REFERENCES `playlists`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE )")
            old.execSQL("CREATE INDEX IF NOT EXISTS `index_playlist_entries_playlistId` ON `playlist_entries` (`playlistId`)")
            old.execSQL("CREATE TABLE IF NOT EXISTS `harvested_songs` (`slug` TEXT NOT NULL, `artist` TEXT, `title` TEXT, `url` TEXT NOT NULL, `status` TEXT NOT NULL, `dataBlob` BLOB NOT NULL, `alphaGroup` TEXT NOT NULL, `modes` TEXT NOT NULL, `harvestedAt` INTEGER NOT NULL, PRIMARY KEY(`slug`))")
            old.execSQL("CREATE TABLE IF NOT EXISTS `harvest_ledger_meta` (`key` TEXT NOT NULL, `value` TEXT NOT NULL, PRIMARY KEY(`key`))")
            old.execSQL("CREATE TABLE IF NOT EXISTS `song_octave_offsets` (`slug` TEXT NOT NULL, `offset` INTEGER NOT NULL, PRIMARY KEY(`slug`))")
            old.execSQL("INSERT INTO playlists VALUES ('favorites','Favorites',1,1)")
            old.execSQL("INSERT INTO playlist_entries VALUES ('favorites','old-song',10)")
            old.version=3
        }
        val db=Room.databaseBuilder(context,UserDataDatabase::class.java,databaseName)
            .addMigrations(UserDataDatabase.MIGRATION_1_2,UserDataDatabase.MIGRATION_2_3,UserDataDatabase.MIGRATION_3_4)
            .allowMainThreadQueries().build()
        try {
            val dao=db.playlistDao()
            assertEquals(listOf("old-song"),dao.getSlugsIn("favorites"))
            dao.saveGeneratedPlaylist(Playlist("generated","Generated",false,20),
                listOf(PlaylistEntry("generated","new-song",20,0,"verse","Verse")))
            assertEquals("verse",dao.getEntriesIn("generated").single().sectionId)
        } finally { db.close();context.deleteDatabase(databaseName) }
    }
}
