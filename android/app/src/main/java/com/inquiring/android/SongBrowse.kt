package com.inquiring.android

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Lightweight metadata used by the All Songs screen.
 *
 * This deliberately lives outside [Song] so list queries never have to read
 * or materialize the compressed chord payload in Song.dataBlob.
 */
@Entity(
    tableName = "song_browse_entries",
    indices = [
        Index(value = ["alphaGroup"]),
        Index(value = ["complexityBucket"])
    ]
)
data class SongBrowseEntry(
    @PrimaryKey val slug: String,
    val artist: String?,
    val title: String?,
    val alphaGroup: String,
    val complexityRating: Double?,
    val complexityBucket: Int?
)

@Entity(
    tableName = "song_browse_modes",
    primaryKeys = ["slug", "mode"],
    indices = [Index(value = ["mode"])]
)
data class SongBrowseMode(
    val slug: String,
    val mode: String
)

/** A list-row projection. It can never carry Song.dataBlob. */
data class SongBrowseRow(
    val slug: String,
    val artist: String?,
    val title: String?
)

data class SongBrowseGroupCount(
    val groupKey: String,
    val songCount: Long
)

data class SongBrowseMetadataStatus(
    val browseCount: Long,
    val ratedSongCount: Long,
    val modeMembershipCount: Long
)

enum class AllSongsSortMode(val displayName: String) {
    ALPHABETICAL("Alphabetical"),
    COMPLEXITY("Complexity"),
    MODE("Mode")
}

data class AllSongsGroup(
    val key: String,
    val label: String
)

enum class DiatonicMode(val key: String, val displayName: String) {
    IONIAN("ionian", "Ionian (Major)"),
    DORIAN("dorian", "Dorian"),
    PHRYGIAN("phrygian", "Phrygian"),
    LYDIAN("lydian", "Lydian"),
    MIXOLYDIAN("mixolydian", "Mixolydian"),
    AEOLIAN("aeolian", "Aeolian (minor)"),
    LOCRIAN("locrian", "Locrian")
}

object AllSongsGrouping {
    const val UNRATED_KEY = "unrated"

    val alphabeticalGroups: List<AllSongsGroup> =
        ('A'..'Z').map { AllSongsGroup(it.toString(), it.toString()) } +
            ('0'..'9').map { AllSongsGroup(it.toString(), it.toString()) } +
            AllSongsGroup("#", "#")

    val complexityGroups: List<AllSongsGroup> =
        (0..9).map { bucket ->
            val lower = bucket * 10
            AllSongsGroup(bucket.toString(), "$lower-${lower + 10}")
        } + AllSongsGroup(UNRATED_KEY, "Unrated")

    val modeGroups: List<AllSongsGroup> =
        DiatonicMode.entries.map { AllSongsGroup(it.key, it.displayName) }

    fun groupsFor(sortMode: AllSongsSortMode): List<AllSongsGroup> = when (sortMode) {
        AllSongsSortMode.ALPHABETICAL -> alphabeticalGroups
        AllSongsSortMode.COMPLEXITY -> complexityGroups
        AllSongsSortMode.MODE -> modeGroups
    }

    /** One nullable key makes it impossible for two headings to be expanded. */
    fun toggledExpandedGroup(currentGroup: String?, selectedGroup: String): String? =
        if (currentGroup == selectedGroup) null else selectedGroup

    fun alphabeticalGroup(title: String?): String {
        val first = title?.trim()?.firstOrNull()?.uppercaseChar()
        return when {
            first != null && first in 'A'..'Z' -> first.toString()
            first != null && first in '0'..'9' -> first.toString()
            else -> "#"
        }
    }

    /** Case-insensitive substring matching that ignores common word separators. */
    fun fuzzySongMatches(song: SongBrowseRow, filterText: String): Boolean {
        val query = fuzzySearchText(filterText)
        if (query.isEmpty()) return true
        return fuzzySearchText(song.title).contains(query) ||
            fuzzySearchText(song.artist).contains(query)
    }

    private fun fuzzySearchText(value: String?): String =
        value.orEmpty().lowercase().filter { it != ' ' && it != '-' && it != '_' }

    /** Returns 0..9 for ratings in 0..100, with an exact 100 in the final bucket. */
    fun complexityBucket(rating: Double?): Int? {
        if (rating == null || !rating.isFinite() || rating < 0.0 || rating > 100.0) return null
        return if (rating == 100.0) 9 else (rating / 10.0).toInt()
    }

    fun canonicalMode(rawScale: String?): DiatonicMode? {
        val normalized = rawScale
            ?.trim()
            ?.lowercase()
            ?.replace("-", "")
            ?.replace("_", "")
            ?.replace(" ", "")
            ?: return null

        return when (normalized) {
            "major", "ionian" -> DiatonicMode.IONIAN
            "dorian" -> DiatonicMode.DORIAN
            "phrygian" -> DiatonicMode.PHRYGIAN
            "lydian" -> DiatonicMode.LYDIAN
            "mixolydian" -> DiatonicMode.MIXOLYDIAN
            "minor", "aeolian", "naturalminor" -> DiatonicMode.AEOLIAN
            "locrian" -> DiatonicMode.LOCRIAN
            else -> null
        }
    }

    fun canonicalModes(rawScales: Iterable<String?>): Set<DiatonicMode> =
        rawScales.mapNotNull(::canonicalMode).toSet()

    /** Reads every key event from every section, not just each section's first key. */
    fun modesInSections(sections: Iterable<ExtractedSection>): Set<DiatonicMode> =
        canonicalModes(
            sections.flatMap { section ->
                val keys = section.metadata?.get("keys") as? JsonArray ?: return@flatMap emptyList()
                keys.mapNotNull { keyElement ->
                    val key = keyElement as? JsonObject
                    (key?.get("scale") as? JsonPrimitive)?.content
                }
            }
        )

    fun browseEntry(song: Song, complexityRating: Double? = null): SongBrowseEntry =
        SongBrowseEntry(
            slug = song.slug,
            artist = song.artist,
            title = song.title,
            alphaGroup = alphabeticalGroup(song.title),
            complexityRating = complexityRating,
            complexityBucket = complexityBucket(complexityRating)
        )
}

/** SQL shared by the Room migration and downloaded-catalog compatibility step. */
object SongBrowseSchema {
    const val CREATE_ENTRIES = """
        CREATE TABLE IF NOT EXISTS `song_browse_entries` (
            `slug` TEXT NOT NULL,
            `artist` TEXT,
            `title` TEXT,
            `alphaGroup` TEXT NOT NULL,
            `complexityRating` REAL,
            `complexityBucket` INTEGER,
            PRIMARY KEY(`slug`)
        )
    """

    const val CREATE_MODES = """
        CREATE TABLE IF NOT EXISTS `song_browse_modes` (
            `slug` TEXT NOT NULL,
            `mode` TEXT NOT NULL,
            PRIMARY KEY(`slug`, `mode`)
        )
    """

    const val CREATE_ALPHA_INDEX = """
        CREATE INDEX IF NOT EXISTS `index_song_browse_entries_alphaGroup`
        ON `song_browse_entries` (`alphaGroup`)
    """

    const val CREATE_COMPLEXITY_INDEX = """
        CREATE INDEX IF NOT EXISTS `index_song_browse_entries_complexityBucket`
        ON `song_browse_entries` (`complexityBucket`)
    """

    const val CREATE_MODE_INDEX = """
        CREATE INDEX IF NOT EXISTS `index_song_browse_modes_mode`
        ON `song_browse_modes` (`mode`)
    """

    const val BACKFILL_ENTRIES = """
        INSERT OR IGNORE INTO `song_browse_entries`
            (`slug`, `artist`, `title`, `alphaGroup`, `complexityRating`, `complexityBucket`)
        SELECT
            `slug`,
            `artist`,
            `title`,
            CASE
                WHEN UPPER(SUBSTR(TRIM(COALESCE(`title`, '')), 1, 1)) GLOB '[A-Z]'
                    THEN UPPER(SUBSTR(TRIM(`title`), 1, 1))
                WHEN SUBSTR(TRIM(COALESCE(`title`, '')), 1, 1) GLOB '[0-9]'
                    THEN SUBSTR(TRIM(`title`), 1, 1)
                ELSE '#'
            END,
            NULL,
            NULL
        FROM `songs`
        WHERE `dataBlob` IS NOT NULL
    """

    const val NORMALIZE_ALPHA_GROUPS = """
        UPDATE `song_browse_entries`
        SET `alphaGroup` = CASE
            WHEN UPPER(SUBSTR(TRIM(COALESCE(`title`, '')), 1, 1)) GLOB '[A-Z]'
                THEN UPPER(SUBSTR(TRIM(`title`), 1, 1))
            WHEN SUBSTR(TRIM(COALESCE(`title`, '')), 1, 1) GLOB '[0-9]'
                THEN SUBSTR(TRIM(`title`), 1, 1)
            ELSE '#'
        END
    """

    val createStatements = listOf(
        CREATE_ENTRIES,
        CREATE_MODES,
        CREATE_ALPHA_INDEX,
        CREATE_COMPLEXITY_INDEX,
        CREATE_MODE_INDEX
    )
}
