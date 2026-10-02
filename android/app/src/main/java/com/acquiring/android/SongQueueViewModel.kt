package com.acquiring.android

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import java.util.UUID
import kotlin.random.Random
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.jsonPrimitive

internal fun auralSectionIdentity(slug: String, sourceName: String, section: ExtractedSection): String {
    val source=(section.numericId ?: section.songId)?.jsonPrimitive?.content
    val encoded=buildJsonArray {
        add("section");add(slug);add(source ?: sourceName);add(section.sectionName.orEmpty())
        if(source==null) section.sectionIndex?.let { add(it) } ?: add(JsonNull) else add(JsonNull)
    }
    return auralDigest(encoded.toString())
}

internal fun resolveQueuedSection(slug: String, entry: QueuedSong, sections: Map<String,ExtractedSection>): String? {
    if(entry.sectionId.isEmpty()) return sections.sectionsInSongOrder().firstOrNull()?.key
    val exact=sections.entries.firstOrNull { (key,section) ->
        key==entry.sectionId || auralSectionIdentity(slug,key,section)==entry.sectionId
    }?.key
    if(exact!=null) return exact
    // Older exported sections may lack stable source IDs. A unique name is safe;
    // repeated Verse/Chorus names are ambiguous and must not select another passage.
    return sections.entries.filter { it.value.safeSectionName==entry.sectionName }
        .singleOrNull()?.key
}

internal data class QueuedSong(
    val slug: String,
    val title: String,
    val artist: String,
    val sectionId: String,
    val sectionName: String
)

internal data class QueueCandidate(val song: QueuedSong, val score: Double?)

internal fun orderedQueue(candidates: List<QueueCandidate>, minimumPopularityPercent: Int?, random: Random = Random.Default): List<QueuedSong> =
    candidates.filter { auralMeetsMinimumPopularity(it.score, minimumPopularityPercent) }
        .groupBy { it.song.slug }
        .values.map { matches -> matches.map { it.song }.distinctBy { it.sectionId }.random(random) to matches.first().score }
        .sortedWith(compareByDescending<Pair<QueuedSong,Double?>> { it.second ?: -1.0 }
            .thenBy { it.first.title.lowercase() }.thenBy { it.first.slug })
        .map { it.first }

/** Survives Activity rotation; song blobs are loaded on demand by MainScreen. */
internal class SongQueueViewModel : ViewModel() {
    var active by mutableStateOf(false)
        private set
    var loading by mutableStateOf(false)
        private set
    var entries by mutableStateOf(emptyList<QueuedSong>())
        private set
    private var originalEntries = emptyList<QueuedSong>()
    var index by mutableStateOf(0)
        private set
    var started by mutableStateOf(false)
        private set
    var shuffleEnabled by mutableStateOf(false)
        private set
    var originQuiz by mutableStateOf(false)
        private set
    var suggestedName by mutableStateOf("")
        private set
    var savedPlaylistId by mutableStateOf<String?>(null)
        private set
    var notice by mutableStateOf<String?>(null)
        private set
    var exhausted by mutableStateOf(false)
        private set
    var loadToken by mutableStateOf(UUID.randomUUID().toString())
        private set
    var autoStart by mutableStateOf(false)
        private set
    // Aural examples stay on the selected section until the listener chooses another song.
    val playbackCompletionKey: String?
        get() = if (originQuiz) null else loadToken
    var sectionOverride by mutableStateOf<String?>(null)
        private set
    private var consumedCompletion: String? = null
    private var unavailableCount = 0
    private var generation = 0

    fun begin(originQuiz: Boolean, name: String): Int {
        generation++
        active = true
        loading = true
        entries = emptyList()
        originalEntries = emptyList()
        index = 0
        started = false
        shuffleEnabled = false
        this.originQuiz = originQuiz
        suggestedName = name
        savedPlaylistId = null
        notice = null
        exhausted = false
        loadToken = UUID.randomUUID().toString()
        autoStart = true
        return generation
    }

    fun finishPreparation(expected: Int, songs: List<QueuedSong>, playlistId: String? = null, shuffled: Boolean = false) {
        if (!active || expected != generation) return
        originalEntries = songs
        shuffleEnabled = shuffled
        entries = if (shuffled) songs.shuffled() else songs
        savedPlaylistId = playlistId
        loading = false
        if (songs.isEmpty()) notice = "No matching songs are available."
        loadToken = UUID.randomUUID().toString()
    }

    fun error(expected: Int, message: String) {
        if (active && expected == generation) { loading = false; notice = message }
    }

    fun showNotice(message: String) { notice = message }
    fun markSaved(id: String) { savedPlaylistId = id; notice = "Playlist saved" }

    fun toggleShuffle(random: Random = Random.Default) {
        if (entries.size < 2) return
        val current = entries.getOrNull(index)
        shuffleEnabled = !shuffleEnabled
        val shuffled = originalEntries.shuffled(random)
        entries = if (shuffleEnabled) {
            if (shuffled == originalEntries) shuffled.drop(1) + shuffled.first() else shuffled
        } else originalEntries
        index = if (started && current != null) entries.indexOf(current).coerceAtLeast(0) else 0
        savedPlaylistId = null
        notice = if (shuffleEnabled) "Queue shuffled" else "Original order restored"
    }

    fun start() {
        if (entries.isEmpty()) return
        started = true
        autoStart = true
        loadToken = UUID.randomUUID().toString()
    }

    fun select(position: Int, resume: Boolean) {
        if (position !in entries.indices) return
        started = true
        index = position
        unavailableCount = 0
        exhausted = false
        sectionOverride = null
        autoStart = resume
        consumedCompletion = null
        loadToken = UUID.randomUUID().toString()
    }

    fun changeSection(sectionId: String, resume: Boolean) {
        sectionOverride = sectionId
        autoStart = resume
        consumedCompletion = null
        loadToken = UUID.randomUUID().toString()
    }

    fun completed(token: String): Boolean {
        if (!active || originQuiz || token != loadToken || consumedCompletion == token || entries.isEmpty()) return false
        consumedCompletion = token
        if (index == entries.lastIndex) {
            autoStart = false
            notice = "Queue finished"
            return false
        }
        select(index + 1, resume = true)
        return true
    }

    fun unavailable(token: String, message: String) {
        if (!active || token != loadToken) return
        unavailableCount++
        notice = message
        if (index < entries.lastIndex) {
            val count = unavailableCount
            select(index + 1, autoStart)
            unavailableCount = count
        } else {
            autoStart = false
            exhausted = true
            notice = "No playable songs remain in this queue. $message"
        }
    }

    fun dismiss() {
        generation++
        active = false
        loading = false
        entries = emptyList()
        originalEntries = emptyList()
        started = false
        PlaybackController.pause()
    }
}
