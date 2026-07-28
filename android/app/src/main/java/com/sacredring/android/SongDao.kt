package com.sacredring.android

import androidx.room.*

@Dao
interface SongDao {
    @Query("SELECT * FROM songs")
    suspend fun getAllSongs(): List<Song>

    @Query("SELECT * FROM songs WHERE slug = :slug")
    suspend fun getSongBySlug(slug: String): Song?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSong(song: Song)

    @Query("SELECT EXISTS(SELECT 1 FROM songs WHERE slug = :slug)")
    suspend fun songExists(slug: String): Boolean
}
