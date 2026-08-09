package com.sacredring.android

import androidx.room.*

private const val BROWSE_FILTER_SQL = """
    (
        TRIM(:filterText) = '' OR
        INSTR(
            REPLACE(REPLACE(REPLACE(LOWER(COALESCE(title, '')), ' ', ''), '-', ''), '_', ''),
            REPLACE(REPLACE(REPLACE(LOWER(TRIM(:filterText)), ' ', ''), '-', ''), '_', '')
        ) > 0 OR
        INSTR(
            REPLACE(REPLACE(REPLACE(LOWER(COALESCE(artist, '')), ' ', ''), '-', ''), '_', ''),
            REPLACE(REPLACE(REPLACE(LOWER(TRIM(:filterText)), ' ', ''), '-', ''), '_', '')
        ) > 0
    )
"""

@Dao
interface SongDao {
    @Query("SELECT COUNT(*) FROM songs")
    suspend fun getSongCount(): Int

    @Query("SELECT * FROM songs WHERE slug = :slug")
    suspend fun getSongBySlug(slug: String): Song?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSong(song: Song)

    @Query("SELECT EXISTS(SELECT 1 FROM songs WHERE slug = :slug)")
    suspend fun songExists(slug: String): Boolean

    @Query(
        """
        SELECT slug, artist, title
        FROM songs
        WHERE REPLACE(title, '-', ' ') LIKE '%' || REPLACE(:query, '-', ' ') || '%'
        ORDER BY
            CASE WHEN title IS NULL OR TRIM(title) = '' THEN 1 ELSE 0 END,
            title COLLATE NOCASE,
            artist COLLATE NOCASE,
            slug COLLATE NOCASE
        """
    )
    suspend fun searchBrowseSongsByTitle(query: String): List<SongBrowseRow>

    @Query(
        """
        SELECT slug, artist, title
        FROM songs
        WHERE REPLACE(artist, '-', ' ') = REPLACE(:artistName, '-', ' ')
        ORDER BY
            CASE WHEN title IS NULL OR TRIM(title) = '' THEN 1 ELSE 0 END,
            title COLLATE NOCASE,
            slug COLLATE NOCASE
        """
    )
    suspend fun getBrowseSongsByArtist(artistName: String): List<SongBrowseRow>

    @Query(
        """
        SELECT slug, artist, title
        FROM songs
        WHERE REPLACE(title, '-', ' ') LIKE '%' || REPLACE(:query, '-', ' ') || '%'
           OR REPLACE(artist, '-', ' ') LIKE '%' || REPLACE(:query, '-', ' ') || '%'
        ORDER BY
            CASE WHEN title IS NULL OR TRIM(title) = '' THEN 1 ELSE 0 END,
            title COLLATE NOCASE,
            artist COLLATE NOCASE,
            slug COLLATE NOCASE
        LIMIT :limit OFFSET :offset
        """
    )
    suspend fun getSearchSuggestions(
        query: String,
        limit: Int = 20,
        offset: Int = 0
    ): List<SongBrowseRow>

    @Query("SELECT DISTINCT REPLACE(artist, '-', ' ') FROM songs WHERE artist IS NOT NULL AND REPLACE(artist, '-', ' ') LIKE '%' || REPLACE(:query, '-', ' ') || '%' LIMIT :limit OFFSET :offset")
    suspend fun getArtistSuggestions(query: String, limit: Int = 20, offset: Int = 0): List<String>

    @Query("SELECT slug, artist, title FROM songs WHERE slug IN (:slugs)")
    suspend fun getBrowseSongsBySlugs(slugs: List<String>): List<SongBrowseRow>

    @Query(
        """
        SELECT
            (SELECT COUNT(*) FROM song_browse_entries) AS browseCount,
            (SELECT COUNT(*)
             FROM song_browse_entries
             WHERE complexityRating IS NOT NULL) AS ratedSongCount,
            (SELECT COUNT(*) FROM song_browse_modes) AS modeMembershipCount
        """
    )
    suspend fun getBrowseMetadataStatus(): SongBrowseMetadataStatus

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertBrowseEntry(entry: SongBrowseEntry)

    @Query("SELECT * FROM song_browse_entries WHERE slug = :slug")
    suspend fun getBrowseEntryBySlug(slug: String): SongBrowseEntry?

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertBrowseModes(modes: List<SongBrowseMode>)

    @Query("DELETE FROM song_browse_modes WHERE slug = :slug")
    suspend fun deleteBrowseModes(slug: String)

    @Query(
        """
        SELECT alphaGroup AS groupKey, COUNT(*) AS songCount
        FROM song_browse_entries
        WHERE """ + BROWSE_FILTER_SQL + """
        GROUP BY alphaGroup
        """
    )
    suspend fun getAlphabeticalGroupCounts(filterText: String = ""): List<SongBrowseGroupCount>

    @Query(
        """
        SELECT COALESCE(CAST(complexityBucket AS TEXT), 'unrated') AS groupKey,
               COUNT(*) AS songCount
        FROM song_browse_entries
        WHERE """ + BROWSE_FILTER_SQL + """
        GROUP BY complexityBucket
        """
    )
    suspend fun getComplexityGroupCounts(filterText: String = ""): List<SongBrowseGroupCount>

    @Query(
        """
        SELECT modes.mode AS groupKey, COUNT(*) AS songCount
        FROM song_browse_modes AS modes
        INNER JOIN song_browse_entries AS entries ON entries.slug = modes.slug
        WHERE """ + BROWSE_FILTER_SQL + """
        GROUP BY modes.mode
        """
    )
    suspend fun getModeGroupCounts(filterText: String = ""): List<SongBrowseGroupCount>

    @Query(
        """
        SELECT slug, artist, title
        FROM song_browse_entries
        WHERE alphaGroup = :groupKey AND """ + BROWSE_FILTER_SQL + """
        ORDER BY
            CASE WHEN title IS NULL OR TRIM(title) = '' THEN 1 ELSE 0 END,
            title COLLATE NOCASE,
            artist COLLATE NOCASE,
            slug COLLATE NOCASE
        """
    )
    suspend fun getSongsInAlphabeticalGroup(
        groupKey: String,
        filterText: String = ""
    ): List<SongBrowseRow>

    @Query(
        """
        SELECT slug, artist, title
        FROM song_browse_entries
        WHERE complexityBucket = :bucket AND """ + BROWSE_FILTER_SQL + """
        ORDER BY
            CASE WHEN title IS NULL OR TRIM(title) = '' THEN 1 ELSE 0 END,
            title COLLATE NOCASE,
            artist COLLATE NOCASE,
            slug COLLATE NOCASE
        """
    )
    suspend fun getSongsInComplexityGroup(
        bucket: Int,
        filterText: String = ""
    ): List<SongBrowseRow>

    @Query(
        """
        SELECT slug, artist, title
        FROM song_browse_entries
        WHERE complexityBucket IS NULL AND """ + BROWSE_FILTER_SQL + """
        ORDER BY
            CASE WHEN title IS NULL OR TRIM(title) = '' THEN 1 ELSE 0 END,
            title COLLATE NOCASE,
            artist COLLATE NOCASE,
            slug COLLATE NOCASE
        """
    )
    suspend fun getUnratedSongs(filterText: String = ""): List<SongBrowseRow>

    @Query(
        """
        SELECT entries.slug, entries.artist, entries.title
        FROM song_browse_entries AS entries
        INNER JOIN song_browse_modes AS modes ON modes.slug = entries.slug
        WHERE modes.mode = :mode AND """ + BROWSE_FILTER_SQL + """
        ORDER BY
            CASE WHEN entries.title IS NULL OR TRIM(entries.title) = '' THEN 1 ELSE 0 END,
            entries.title COLLATE NOCASE,
            entries.artist COLLATE NOCASE,
            entries.slug COLLATE NOCASE
        """
    )
    suspend fun getSongsInMode(mode: String, filterText: String = ""): List<SongBrowseRow>
}

