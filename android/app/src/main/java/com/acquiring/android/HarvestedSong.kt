package com.acquiring.android

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query

/**
 * One manually harvested song, held in full so it can be rebuilt into a fresh
 * catalog without contacting Hooktheory again.
 *
 * This lives in [UserDataDatabase] for the same reason playlists do: a catalog
 * install replaces `acquiring-db` as a whole file, so a harvested row written
 * only into the catalog is destroyed by the next "Download Full Library".
 *
 * `modes` is a newline-joined [SongBrowseMode.mode] set rather than a child
 * table: it is written and read whole, never queried across.
 */
@Entity(tableName = "harvested_songs")
data class HarvestedSong(
    @PrimaryKey val slug: String,
    val artist: String?,
    val title: String?,
    val url: String,
    val status: String,
    val dataBlob: ByteArray,
    val alphaGroup: String,
    val modes: String,
    val harvestedAt: Long
) {
    fun toSong(): Song = Song(
        slug = slug,
        artist = artist,
        title = title,
        url = url,
        status = status,
        dataBlob = dataBlob
    )

    fun modeSet(): Set<String> = decodeModes(modes)

    // Room warns about array-typed properties in generated equals/hashCode.
    // dataBlob is opaque payload, so identity is the primary key.
    override fun equals(other: Any?): Boolean = this === other ||
        (other is HarvestedSong && slug == other.slug)

    override fun hashCode(): Int = slug.hashCode()

    companion object {
        fun encodeModes(modes: Iterable<String>): String = modes.toSortedSet().joinToString("\n")

        fun decodeModes(encoded: String): Set<String> =
            encoded.split('\n').filter { it.isNotEmpty() }.toSet()
    }
}

/** A one-row-per-key scratchpad for ledger bookkeeping flags. */
@Entity(tableName = "harvest_ledger_meta")
data class HarvestLedgerMeta(
    @PrimaryKey val key: String,
    val value: String
)

@Dao
interface HarvestLedgerDao {
    @Query("SELECT * FROM harvested_songs ORDER BY harvestedAt")
    suspend fun getAll(): List<HarvestedSong>

    @Query("SELECT COUNT(*) FROM harvested_songs")
    suspend fun count(): Int

    /** A fresh harvest of a slug supersedes the entry it already had. */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun record(song: HarvestedSong)

    /** The legacy sweep must never displace what the user harvested itself. */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun adopt(songs: List<HarvestedSong>)

    @Query("SELECT EXISTS(SELECT 1 FROM harvest_ledger_meta WHERE key = :key)")
    suspend fun hasFlag(key: String): Boolean

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun setFlag(flag: HarvestLedgerMeta)
}
