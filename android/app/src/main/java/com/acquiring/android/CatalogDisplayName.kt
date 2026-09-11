package com.acquiring.android

import java.text.Normalizer
import java.util.Locale

/** Display-only cleanup. Catalog IDs, URLs, and stored names remain unchanged. */
object CatalogDisplayName {
    private val blinkStyleArtist = Regex("^[a-z]+-[0-9]+$")
    private val legacySlug = Regex("^[a-z0-9]+(?:[-_]+[a-z0-9]+)+$")
    private val slugSeparators = Regex("[-_]+")
    private val entityPattern = Regex("&(#(?:[xX][0-9a-fA-F]+|[0-9]+)|[a-zA-Z]+);")
    private val posix = Locale.US

    private val entities = mapOf(
        "amp" to "&", "quot" to "\"", "apos" to "'", "lt" to "<", "gt" to ">", "nbsp" to " ",
        "lsquo" to "‘", "rsquo" to "’", "ldquo" to "“", "rdquo" to "”", "ndash" to "–", "mdash" to "—",
        "hellip" to "…", "eacute" to "é", "Eacute" to "É", "aacute" to "á", "Aacute" to "Á",
        "agrave" to "à", "Agrave" to "À", "egrave" to "è", "Egrave" to "È", "iacute" to "í", "Iacute" to "Í",
        "oacute" to "ó", "Oacute" to "Ó", "uacute" to "ú", "Uacute" to "Ú", "ntilde" to "ñ", "Ntilde" to "Ñ",
        "auml" to "ä", "Auml" to "Ä", "ouml" to "ö", "Ouml" to "Ö", "uuml" to "ü", "Uuml" to "Ü",
        "ccedil" to "ç", "Ccedil" to "Ç", "szlig" to "ß", "oslash" to "ø", "Oslash" to "Ø",
        "aring" to "å", "Aring" to "Å", "aelig" to "æ", "AElig" to "Æ"
    )

    fun title(value: String?): String = format(value) ?: "Unknown Title"

    fun artist(value: String?): String {
        if (value != null) {
            val text = clean(value)
            if (blinkStyleArtist.matches(text)) return text
        }
        return format(value) ?: "Unknown Artist"
    }

    fun format(value: String?): String? {
        if (value == null) return null
        val text = clean(value)
        if (text.isEmpty()) return null
        if (!legacySlug.matches(text)) return text
        return slugSeparators.replace(text, " ").split(' ').joinToString(" ") { word ->
            word.replaceFirstChar { ch -> ch.titlecase(posix) }
        }
    }

    fun clean(value: String): String {
        val decoded = Normalizer.normalize(decodeEntities(value), Normalizer.Form.NFC)
        val mapped = buildString {
            decoded.codePoints().forEach { code ->
                val scalar = String(intArrayOf(code), 0, 1)
                when {
                    Character.isWhitespace(code) || Character.isSpaceChar(code) -> append(' ')
                    code < 0x20 || code in 0x7f..0x9f -> Unit
                    else -> append(scalar)
                }
            }
        }
        return mapped.split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString(" ")
    }

    private fun decodeEntities(value: String): String {
        var text = value
        repeat(2) {
            val matches = entityPattern.findAll(text).toList()
            if (matches.isEmpty()) return text
            var changed = false
            val builder = StringBuilder(text)
            for (match in matches.asReversed()) {
                val token = match.groupValues[1]
                val replacement = if (token.startsWith("#")) {
                    val isHex = token.length >= 2 && token[1].lowercaseChar() == 'x'
                    val digits = token.substring(if (isHex) 2 else 1)
                    digits.toIntOrNull(if (isHex) 16 else 10)?.let { code ->
                        if (code in 0xD800..0xDFFF || !Character.isValidCodePoint(code)) {
                            null
                        } else {
                            String(intArrayOf(code), 0, 1)
                        }
                    }
                } else {
                    entities[token]
                }
                if (replacement != null) {
                    builder.replace(match.range.first, match.range.last + 1, replacement)
                    changed = true
                }
            }
            text = builder.toString()
            if (!changed) return text
        }
        return text
    }
}

val Song.displayTitle: String get() = CatalogDisplayName.title(title)
val Song.displayArtist: String get() = CatalogDisplayName.artist(artist)
val SongBrowseRow.displayTitle: String get() = CatalogDisplayName.title(title)
val SongBrowseRow.displayArtist: String get() = CatalogDisplayName.artist(artist)
