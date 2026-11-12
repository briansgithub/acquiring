package com.acquiring.android

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query

internal const val DEFAULT_PLAYBACK_TEMPO_PERCENT = 100f
internal const val DEFAULT_MELODY_CHORD_BALANCE = 0.5f

@Entity(tableName = "song_playback_settings")
data class SongPlaybackSettings(
    @PrimaryKey val slug: String,
    val lockInMajor: Boolean,
    val tempoPercent: Float,
    val arpeggioOptionIndex: Int,
    val melodyChordBalance: Float,
    val instrument: String?,
    val transpose: Int,
    val rootDegreeCue: String,
    val voiceVolume: Float,
    val loopSection: Boolean
)

@Dao
interface SongPlaybackSettingsDao {
    @Query("SELECT * FROM song_playback_settings WHERE slug = :slug LIMIT 1")
    suspend fun get(slug: String): SongPlaybackSettings?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: SongPlaybackSettings)
}

/** Stored rows can outlive an enum or dial range. Bad fields become defaults; a null instrument stays null. */
internal fun sanitizeSongPlaybackSettings(row: SongPlaybackSettings): SongPlaybackSettings {
    val cue = PlaybackRootDegreeCue.entries.firstOrNull { it.name == row.rootDegreeCue }
        ?: PlaybackRootDegreeCue.OFF
    val instrument = row.instrument?.takeIf { name ->
        AudioEngine.Waveform.entries.any { it.name == name }
    }
    return row.copy(
        tempoPercent = row.tempoPercent.takeIf { it.isFinite() && it in 0f..200f }
            ?: DEFAULT_PLAYBACK_TEMPO_PERCENT,
        arpeggioOptionIndex = row.arpeggioOptionIndex.takeIf { it in PLAYBACK_ARPEGGIO_OPTIONS.indices }
            ?: DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX,
        melodyChordBalance = row.melodyChordBalance.takeIf { it.isFinite() && it in 0f..1f }
            ?: DEFAULT_MELODY_CHORD_BALANCE,
        instrument = instrument,
        transpose = row.transpose.takeIf { it in PLAYBACK_TRANSPOSE_RANGE } ?: 0,
        rootDegreeCue = cue.name,
        voiceVolume = row.voiceVolume.takeIf { it.isFinite() && it in 0f..1f }
            ?: DEFAULT_PLAYBACK_VOICE_VOLUME
    )
}
