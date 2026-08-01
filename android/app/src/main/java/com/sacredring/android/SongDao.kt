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

    @Query("SELECT * FROM songs WHERE REPLACE(title, '-', ' ') LIKE '%' || REPLACE(:query, '-', ' ') || '%'")
    suspend fun searchSongsByTitle(query: String): List<Song>

    @Query("SELECT * FROM songs WHERE REPLACE(artist, '-', ' ') = REPLACE(:artistName, '-', ' ')")
    suspend fun getSongsByArtist(artistName: String): List<Song>

    @Query("SELECT * FROM songs WHERE REPLACE(title, '-', ' ') LIKE '%' || REPLACE(:query, '-', ' ') || '%' OR REPLACE(artist, '-', ' ') LIKE '%' || REPLACE(:query, '-', ' ') || '%'")
    suspend fun getSearchSuggestions(query: String): List<Song>

    @Query("SELECT DISTINCT artist FROM songs WHERE artist IS NOT NULL AND REPLACE(artist, '-', ' ') LIKE '%' || REPLACE(:query, '-', ' ') || '%'")
    suspend fun getArtistSuggestions(query: String): List<String>

    @Query("SELECT * FROM songs WHERE slug IN (:slugs)")
    suspend fun getSongsBySlugs(slugs: List<String>): List<Song>
}

