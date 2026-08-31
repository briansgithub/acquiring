package com.acquiring.android

/**
 * The recurring section types found in the Hooktheory corpus, in structural
 * song order. Exact per-song sectionIndex values take precedence over this
 * list; it is the fallback for older Android catalogs that lack those indices.
 */
internal val CANONICAL_SECTION_TYPES = listOf(
    "Intro",
    "Intro and Verse",
    "Verse",
    "Verse and Pre-Chorus",
    "Pre-Chorus",
    "Pre-Chorus and Chorus",
    "Chorus",
    "Chorus Lead-Out",
    "Bridge",
    "Solo",
    "Instrumental",
    "Pre-Outro",
    "Outro"
)

private const val UNKNOWN_SECTION_RANK = 100000

internal fun normalizeSectionType(name: String?): String = name
    .orEmpty()
    .trim()
    .lowercase()
    .replace(Regex("[\\u2010-\\u2014]"), "-")
    .replace(Regex("\\s+"), " ")

internal fun sectionTypeKey(name: String?): String = normalizeSectionType(name)
    .replace(Regex("[-_\\s]+"), " ")
    .trim()

private fun sectionWords(name: String?): String = sectionTypeKey(name)
    .replace(Regex("[^a-z0-9]+"), " ")
    .trim()

private fun trailingOrdinal(words: String): Int = Regex("\\b(\\d+)$")
    .find(words)
    ?.groupValues
    ?.get(1)
    ?.toIntOrNull()
    ?.coerceAtMost(999)
    ?: 0

internal fun canonicalSectionRank(name: String?): Int {
    val words = sectionWords(name)
    val ordinal = trailingOrdinal(words)

    if (words.isEmpty()) return UNKNOWN_SECTION_RANK
    if ("intro and verse" in words) return 1000 + ordinal
    if ("verse and pre chorus" in words) return 3000 + ordinal
    if ("pre chorus and chorus" in words) return 5000 + ordinal
    if ("chorus lead out" in words) return 7000 + ordinal
    if ("bridge and outro" in words) return 11500 + ordinal
    if ("pre outro" in words) return 11000 + ordinal

    if (Regex("\\bintro\\b").containsMatchIn(words)) return ordinal
    if (Regex("\\bverse\\b").containsMatchIn(words)) return 2000 + ordinal
    if (Regex("\\bpre chorus\\b").containsMatchIn(words)) return 4000 + ordinal
    if (Regex("\\bchorus\\b").containsMatchIn(words)) return 6000 + ordinal
    if (Regex("\\bbridge\\b").containsMatchIn(words)) return 8000 + ordinal
    if (Regex("\\bsolo\\b").containsMatchIn(words)) return 9000 + ordinal
    if (Regex("\\binstrumental\\b").containsMatchIn(words)) return 10000 + ordinal
    if (Regex("\\boutro\\b").containsMatchIn(words)) return 12000 + ordinal

    return UNKNOWN_SECTION_RANK
}

private data class SectionCandidate(
    val entry: Map.Entry<String, ExtractedSection>,
    val sourcePosition: Int,
    val explicitIndex: Int?,
    val canonicalRank: Int
)

/**
 * Return one entry per normalized section type in exact song order when the
 * data has section indices, or canonical structural order for legacy data.
 */
internal fun Map<String, ExtractedSection>.sectionsInSongOrder(): List<Map.Entry<String, ExtractedSection>> {
    val byType = linkedMapOf<String, SectionCandidate>()

    entries.forEachIndexed { sourcePosition, entry ->
        val normalized = sectionTypeKey(entry.value.safeSectionName)
        val typeKey = normalized.ifEmpty { "\u0000$sourcePosition" }
        val candidate = SectionCandidate(
            entry = entry,
            sourcePosition = sourcePosition,
            explicitIndex = entry.value.sectionIndex?.takeIf { it >= 0 },
            canonicalRank = canonicalSectionRank(entry.value.safeSectionName)
        )
        val current = byType[typeKey]

        if (
            current == null
            || (candidate.explicitIndex != null
                && (current.explicitIndex == null || candidate.explicitIndex < current.explicitIndex))
        ) {
            byType[typeKey] = candidate
        }
    }

    val unique = byType.values.toList()
    val hasExplicitOrder = unique.any { it.explicitIndex != null }

    return unique.sortedWith(Comparator { a, b ->
        if (hasExplicitOrder) {
            val aIndex = a.explicitIndex
            val bIndex = b.explicitIndex
            if (aIndex != null && bIndex != null) {
                val indexed = aIndex.compareTo(bIndex)
                if (indexed != 0) return@Comparator indexed
            } else if (aIndex != null) {
                return@Comparator -1
            } else if (bIndex != null) {
                return@Comparator 1
            }
        }

        val canonical = a.canonicalRank.compareTo(b.canonicalRank)
        if (canonical != 0) canonical else a.sourcePosition.compareTo(b.sourcePosition)
    }).map { it.entry }
}
