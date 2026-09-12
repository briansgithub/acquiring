package com.acquiring.android

import java.text.Normalizer
import java.util.Locale

internal enum class LibrarySearchScope {
    SONGS,
    ARTISTS
}

internal fun libraryChromeVisible(searchFocused: Boolean): Boolean = !searchFocused

/** iOS `catalog_search_key`: case/diacritic fold, then alphanumerics only. */
internal fun catalogSearchKey(value: String?): String {
    if (value.isNullOrEmpty()) return ""
    val stripped = COMBINING_MARKS.replace(Normalizer.normalize(value, Normalizer.Form.NFD), "")
    return buildString(stripped.length) {
        for (character in stripped) {
            if (character.isLetterOrDigit()) append(character)
        }
    }.lowercase(Locale.US)
}

internal class CatalogSearchIndex {
    @Volatile
    var isLoaded: Boolean = false
        private set

    @Volatile
    private var entries: List<Entry> = emptyList()

    fun replaceAll(rows: List<SongBrowseRow>) {
        entries = rows.map(::Entry)
        isLoaded = true
    }

    fun upsert(row: SongBrowseRow) {
        val next = Entry(row)
        entries = entries.filterNot { it.row.slug == row.slug } + next
        isLoaded = true
    }

    fun songSuggestions(query: String, limit: Int = 20, offset: Int = 0): List<SongBrowseRow> {
        val key = catalogSearchKey(query)
        if (key.isEmpty()) return emptyList()
        return entries.asSequence()
            .filter { it.matchesAny(key) }
            .map { it.row }
            .sortedWith(SONG_ORDER)
            .drop(offset)
            .take(limit)
            .toList()
    }

    fun artistSuggestions(query: String, limit: Int = 20, offset: Int = 0): List<String> {
        val key = catalogSearchKey(query)
        if (key.isEmpty()) return emptyList()
        return entries.asSequence()
            .filter { !it.row.artist.isNullOrBlank() && it.matchesArtist(key) }
            .map { hyphenSpace(it.row.artist!!) }
            .distinctBy { it.lowercase(Locale.US) }
            .sortedBy { it.lowercase(Locale.US) }
            .drop(offset)
            .take(limit)
            .toList()
    }

    fun songsByTitle(query: String): List<SongBrowseRow> {
        val key = catalogSearchKey(query)
        if (key.isEmpty()) return emptyList()
        return entries.asSequence()
            .filter { it.matchesTitle(key) }
            .map { it.row }
            .sortedWith(SONG_ORDER)
            .toList()
    }

    fun songsByArtist(query: String): List<SongBrowseRow> {
        val key = catalogSearchKey(query)
        if (key.isEmpty()) return emptyList()
        return entries.asSequence()
            .filter { it.matchesArtist(key) }
            .map { it.row }
            .sortedWith(SONG_ORDER)
            .toList()
    }

    private class Entry(val row: SongBrowseRow) {
        private val titleKeys = keysOf(
            row.title,
            CatalogDisplayName.format(row.title),
            slugTitle(row.slug)
        )
        private val artistKeys = keysOf(
            row.artist,
            CatalogDisplayName.format(row.artist),
            slugArtist(row.slug)
        )
        private val anyKeys = (titleKeys + artistKeys + keysOf(row.slug)).distinct()

        fun matchesAny(key: String): Boolean = anyKeys.any { it.contains(key) }
        fun matchesTitle(key: String): Boolean = titleKeys.any { it.contains(key) }
        fun matchesArtist(key: String): Boolean = artistKeys.any { it.contains(key) }
    }
}

private val COMBINING_MARKS = "\\p{Mn}+".toRegex()
private val POSIX = Locale.US

private val SONG_ORDER = compareBy<SongBrowseRow>(
    { it.title.isNullOrBlank() },
    { it.title?.lowercase(POSIX) ?: "" },
    { it.artist?.lowercase(POSIX) ?: "" },
    { it.slug.lowercase(POSIX) }
)

private fun hyphenSpace(value: String): String = value.replace('-', ' ')

private fun slugArtist(slug: String): String? {
    val split = slug.indexOf("__")
    return if (split > 0) slug.substring(0, split) else null
}

private fun slugTitle(slug: String): String {
    val split = slug.indexOf("__")
    return if (split >= 0) slug.substring(split + 2) else slug
}

private fun keysOf(vararg values: String?): List<String> =
    values.map(::catalogSearchKey).filter { it.isNotEmpty() }.distinct()
