package com.acquiring.android

import kotlin.math.roundToInt

data class BrowseSubgroup(
    val key: String,
    val label: String,
    val songs: List<SongBrowseRow>
) {
    val id: String get() = songs.firstOrNull()?.slug ?: key
}

enum class BrowseSubgroupStyle {
    TITLE_PREFIX,
    COMPLEXITY_ONES
}

object BrowseSubgrouping {
    const val MINIMUM_SONG_COUNT = 40
    const val MAXIMUM_PREFIX_LENGTH = 3

    fun subgroups(
        songs: List<SongBrowseRow>,
        style: BrowseSubgroupStyle = BrowseSubgroupStyle.TITLE_PREFIX
    ): List<BrowseSubgroup> {
        if (songs.size < MINIMUM_SONG_COUNT) return emptyList()
        val keys = when (style) {
            BrowseSubgroupStyle.TITLE_PREFIX -> titlePrefixKeys(songs)
            BrowseSubgroupStyle.COMPLEXITY_ONES -> songs.map { onesKey(it.complexityRating) }
        }
        return runs(songs, keys)
    }

    fun jumpTargets(subgroups: List<BrowseSubgroup>): List<BrowseSubgroup> {
        val seen = mutableSetOf<String>()
        return subgroups.filter { seen.add(it.key) }
    }

    fun indexOfSubgroup(
        groupCountBeforeExpanded: Int,
        subgroups: List<BrowseSubgroup>,
        targetId: String
    ): Int? {
        var index = groupCountBeforeExpanded + 1
        subgroups.forEach { subgroup ->
            if (subgroup.id == targetId) return index
            index += 1 + subgroup.songs.size
        }
        return null
    }

    fun condensed(subgroups: List<BrowseSubgroup>, limit: Int): List<BrowseSubgroup> {
        if (limit <= 0) return emptyList()
        if (subgroups.size <= limit) return subgroups
        if (limit == 1) return subgroups.take(1)
        val span = (subgroups.size - 1).toDouble()
        val steps = (limit - 1).toDouble()
        return (0 until limit).map { index ->
            subgroups[((index.toDouble() * span / steps).roundToInt())]
        }
    }

    private fun titlePrefixKeys(songs: List<SongBrowseRow>): List<String> {
        val sortKeys = songs.map { normalized(it.title) }
        val length = minOf(sharedPrefixLength(sortKeys) + 1, MAXIMUM_PREFIX_LENGTH)
        return sortKeys.map { bucketKey(it, length) }
    }

    private fun onesKey(rating: Double?): String =
        AllSongsGrouping.complexityOnesDigit(rating)?.toString() ?: "#"

    private fun runs(songs: List<SongBrowseRow>, keys: List<String>): List<BrowseSubgroup> {
        val runs = mutableListOf<BrowseSubgroup>()
        var openKey: String? = null
        var openSongs = mutableListOf<SongBrowseRow>()
        for ((song, key) in songs.zip(keys)) {
            if (key != openKey) {
                if (openKey != null && openSongs.isNotEmpty()) {
                    runs += BrowseSubgroup(openKey, labelFor(openKey), openSongs.toList())
                }
                openKey = key
                openSongs = mutableListOf()
            }
            openSongs += song
        }
        if (openKey != null && openSongs.isNotEmpty()) {
            runs += BrowseSubgroup(openKey, labelFor(openKey), openSongs.toList())
        }
        return if (runs.size > 1) runs else emptyList()
    }

    private fun bucketKey(sortKey: String, length: Int): String {
        if (sortKey.isEmpty()) return "#"
        return sortKey.take(length)
    }

    private fun sharedPrefixLength(sortKeys: List<String>): Int {
        var shared: List<Char>? = null
        for (sortKey in sortKeys) {
            if (sortKey.isEmpty()) continue
            val current = shared
            if (current == null) {
                shared = sortKey.toList()
                continue
            }
            var length = 0
            for ((lhs, rhs) in current.zip(sortKey.toList())) {
                if (lhs != rhs) break
                length += 1
            }
            if (length == 0) return 0
            shared = current.take(length)
        }
        return shared?.size ?: 0
    }

    private fun normalized(title: String?): String = (title ?: "").trim().uppercase()

    private fun labelFor(key: String): String {
        val text = key.trim()
        val first = text.firstOrNull() ?: return "#"
        return first + text.drop(1).lowercase()
    }
}
