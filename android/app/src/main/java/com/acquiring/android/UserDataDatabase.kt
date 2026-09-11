package com.acquiring.android

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * User-owned data, kept in its own database file on purpose.
 *
 * [AppDatabase] holds the song catalog, and DatabaseDownloader installs a new
 * catalog by atomically replacing that entire file and deleting its -wal/-shm
 * sidecars. Anything stored there is destroyed by every "Download Full
 * Library"; worse, a downloaded catalog would then fail Room's exact schema
 * validation unless the external exporter script learned to create the extra
 * tables too. Playlists live here, where the swap cannot reach them.
 *
 * Do not fold these entities back into AppDatabase, and do not rebuild or
 * close this database when the catalog is replaced.
 */
@Database(
    entities = [
        Playlist::class,
        PlaylistEntry::class,
        HarvestedSong::class,
        HarvestLedgerMeta::class,
        SongOctaveOffset::class
    ],
    version = UserDataDatabase.SCHEMA_VERSION
)
abstract class UserDataDatabase : RoomDatabase() {
    abstract fun playlistDao(): PlaylistDao

    abstract fun harvestLedgerDao(): HarvestLedgerDao

    abstract fun songOctaveOffsetDao(): SongOctaveOffsetDao

    companion object {
        const val SCHEMA_VERSION = 3

        /** Deliberately distinct from [AppDatabase.DB_NAME]. */
        const val DB_NAME = "acquiring-user-db"

        /**
         * Adds the manual-harvest ledger. A real migration rather than a
         * destructive one: playlists in this file predate it and must survive.
         */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `harvested_songs` (
                        `slug` TEXT NOT NULL,
                        `artist` TEXT,
                        `title` TEXT,
                        `url` TEXT NOT NULL,
                        `status` TEXT NOT NULL,
                        `dataBlob` BLOB NOT NULL,
                        `alphaGroup` TEXT NOT NULL,
                        `modes` TEXT NOT NULL,
                        `harvestedAt` INTEGER NOT NULL,
                        PRIMARY KEY(`slug`)
                    )
                    """
                )
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `harvest_ledger_meta` (
                        `key` TEXT NOT NULL,
                        `value` TEXT NOT NULL,
                        PRIMARY KEY(`key`)
                    )
                    """
                )
            }
        }

        val MIGRATION_2_3 = object : Migration(2, SCHEMA_VERSION) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `song_octave_offsets` (
                        `slug` TEXT NOT NULL,
                        `offset` INTEGER NOT NULL,
                        PRIMARY KEY(`slug`)
                    )
                    """
                )
            }
        }
    }
}
