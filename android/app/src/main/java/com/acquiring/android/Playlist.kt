package com.acquiring.android

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * A user-owned collection of songs.
 *
 * Playlists live in [UserDataDatabase], not in the catalog. See that class for
 * why the split is load-bearing rather than tidiness.
 */
@Entity(tableName = "playlists")
data class Playlist(
    @PrimaryKey val id: String,
    val name: String,
    val isBuiltIn: Boolean,
    val createdAt: Long
)

/**
 * Membership, keyed by the catalog's own song slug.
 *
 * The slug relates to songs.slug by convention only: the catalog is a separate
 * database file, so no foreign key can span it. The one below is purely within
 * this database, where Room owns both tables.
 */
@Entity(
    tableName = "playlist_entries",
    primaryKeys = ["playlistId", "slug"],
    foreignKeys = [
        ForeignKey(
            entity = Playlist::class,
            parentColumns = ["id"],
            childColumns = ["playlistId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index(value = ["playlistId"])]
)
data class PlaylistEntry(
    val playlistId: String,
    val slug: String,
    val addedAt: Long
)

/** A playlist plus its size, for the collapsible section's headings. */
data class PlaylistSummary(
    val id: String,
    val name: String,
    val songCount: Long
)

object PlaylistIds {
    const val FAVORITES = "favorites"
    const val FAVORITES_NAME = "Favorites"
}
