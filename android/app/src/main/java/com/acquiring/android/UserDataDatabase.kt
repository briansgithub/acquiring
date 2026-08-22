package com.acquiring.android

import androidx.room.Database
import androidx.room.RoomDatabase

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
    entities = [Playlist::class, PlaylistEntry::class],
    version = UserDataDatabase.SCHEMA_VERSION
)
abstract class UserDataDatabase : RoomDatabase() {
    abstract fun playlistDao(): PlaylistDao

    companion object {
        const val SCHEMA_VERSION = 1

        /** Deliberately distinct from [AppDatabase.DB_NAME]. */
        const val DB_NAME = "acquiring-user-db"
    }
}
