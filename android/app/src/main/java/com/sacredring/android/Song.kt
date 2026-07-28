package com.sacredring.android

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Entity(tableName = "songs")
@Serializable
data class Song(
    @PrimaryKey val slug: String,
    val artist: String?,
    val title: String?,
    val url: String,
    val status: String = "pending",
    val dataBlob: ByteArray? = null, // Compressed JSON of all sections
    val lastSelectedAt: Long? = null
)
