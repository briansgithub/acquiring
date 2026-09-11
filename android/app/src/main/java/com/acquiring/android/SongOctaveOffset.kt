package com.acquiring.android

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query

@Entity(tableName = "song_octave_offsets")
data class SongOctaveOffset(
    @PrimaryKey val slug: String,
    val offset: Int
)

@Dao
interface SongOctaveOffsetDao {
    @Query("SELECT offset FROM song_octave_offsets WHERE slug = :slug LIMIT 1")
    suspend fun getOffset(slug: String): Int?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: SongOctaveOffset)
}
