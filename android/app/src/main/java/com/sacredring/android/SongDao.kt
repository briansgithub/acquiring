package com.sacredring.android

import androidx.room.*

@Dao
interface SongDao {
    @Query("SELECT * FROM songs LIMIT :limit OFFSET :offset")
    suspend fun getSongs(limit: Int = 100, offset: Int = 0): List<Song>

    @Query("SELECT COUNT(*) FROM songs")
    suspend fun getSongCount(): Int

    @Query("SELECT * FROM songs WHERE slug = :slug")
    suspend fun getSongBySlug(slug: String): Song?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSong(song: Song)

    @Query("SELECT EXISTS(SELECT 1 FROM songs WHERE slug = :slug)")
    suspend fun songExists(slug: String): Boolean

    @Query("SELECT * FROM songs WHERE title LIKE '%' || :query || '%'")
    suspend fun searchSongsByTitle(query: String): List<Song>

    @Query("SELECT * FROM songs WHERE title LIKE '%' || :query || '%' OR artist LIKE '%' || :query || '%' LIMIT 10")
    suspend fun getSearchSuggestions(query: String): List<Song>

    @Query("SELECT * FROM songs WHERE lastSelectedAt IS NOT NULL ORDER BY lastSelectedAt DESC LIMIT :limit")
    suspend fun getRecentSongs(limit: Int = 10): List<Song>

    @Query("UPDATE songs SET lastSelectedAt = :timestamp WHERE slug = :slug")
    suspend fun updateLastSelected(slug: String, timestamp: Long)
}

