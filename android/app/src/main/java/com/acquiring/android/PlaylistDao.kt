package com.acquiring.android

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface PlaylistDao {
    /**
     * Idempotent seeding for a built-in playlist, called before every write
     * rather than from a RoomDatabase.Callback. One code path can create it,
     * and a row deleted by hand cannot leave the star writing into nothing.
     */
    @Query(
        """
        INSERT OR IGNORE INTO playlists (id, name, isBuiltIn, createdAt)
        VALUES (:id, :name, 1, :createdAt)
        """
    )
    suspend fun ensureBuiltInPlaylist(id: String, name: String, createdAt: Long)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertPlaylist(playlist: Playlist)

    @Query(
        """
        SELECT playlists.id AS id,
               playlists.name AS name,
               (
                   SELECT COUNT(*)
                   FROM playlist_entries
                   WHERE playlist_entries.playlistId = playlists.id
               ) AS songCount
        FROM playlists
        ORDER BY
            playlists.isBuiltIn DESC,
            playlists.createdAt ASC,
            playlists.name COLLATE NOCASE
        """
    )
    suspend fun getPlaylistSummaries(): List<PlaylistSummary>

    @Query(
        """
        SELECT EXISTS(
            SELECT 1 FROM playlist_entries
            WHERE playlistId = :playlistId AND slug = :slug
        )
        """
    )
    suspend fun isInPlaylist(playlistId: String, slug: String): Boolean

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun addEntry(entry: PlaylistEntry)

    @Query("DELETE FROM playlist_entries WHERE playlistId = :playlistId AND slug = :slug")
    suspend fun removeEntry(playlistId: String, slug: String)

    /** Newest first, the order HistoryManager already uses for recent songs. */
    @Query(
        """
        SELECT slug FROM playlist_entries
        WHERE playlistId = :playlistId
        ORDER BY addedAt DESC, slug COLLATE NOCASE
        """
    )
    suspend fun getSlugsIn(playlistId: String): List<String>

    /** Built-in playlists are not deletable; their entries still are. */
    @Query("DELETE FROM playlists WHERE id = :playlistId AND isBuiltIn = 0")
    suspend fun deletePlaylist(playlistId: String)
}
