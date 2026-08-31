package com.acquiring.android

import androidx.room.withTransaction
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request

class HarvestService(private val db: AppDatabase) {
    private val client = OkHttpClient()
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun harvest(url: String, onProgress: (String) -> Unit = {}): Result<Song> = withContext(Dispatchers.IO) {
        try {
            onProgress("Scraping page...")
            val extraction = Scraper.extractSectionIds(url)
            if (extraction.sections.isEmpty()) {
                return@withContext Result.failure(Exception("No sections found on page"))
            }

            val cleanUrl = url.trim().trimEnd('/')
            val slug = cleanUrl.substringAfter("theorytab/view/").replace("/", "__")
            // Preserve the tab order returned by Hooktheory when serializing the song.
            val sections = linkedMapOf<String, ExtractedSection>()
            val apiResultsById = mutableMapOf<String, HooktheoryApiResult>()
            
            var songTitle = "Unknown"
            var artist = "Unknown"

            for ((index, sectionRef) in extraction.sections.withIndex()) {
                val id = sectionRef.songId
                onProgress("Fetching section ${index + 1}/${extraction.sections.size} ($id)...")
                val apiResult = apiResultsById.getOrPut(id) { fetchSection(id) }
                
                // The page tab identifies the section type even when multiple tabs
                // share one API song ID, so it takes precedence over API metadata.
                val rawName = sectionRef.sectionName ?: apiResult.section ?: "Section ${index + 1}"
                val sectionName = rawName.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
                
                val extracted = DataExtractor.extractSection(apiResult, sectionName, index)
                var sectionKey = id
                var duplicate = 1
                while (sections.containsKey(sectionKey)) {
                    sectionKey = "$id#$index-${duplicate++}"
                }
                sections[sectionKey] = extracted
                
                if (index == 0) {
                    songTitle = apiResult.song
                    artist = apiResult.artist ?: url.substringAfter("view/").substringBefore("/")
                }
            }

            onProgress("Saving to database...")
            // Serialize and compress (skipping actual compression for now, just storing JSON string)
            val fullDataJson = json.encodeToString(sections)
            val song = Song(
                slug = slug,
                artist = artist,
                title = songTitle,
                url = url,
                status = "enriched",
                dataBlob = fullDataJson.toByteArray(Charsets.UTF_8)
            )

            val existingBrowseEntry = db.songDao().getBrowseEntryBySlug(song.slug)
            val browseEntry = AllSongsGrouping.browseEntry(
                song = song,
                complexityRating = existingBrowseEntry?.complexityRating
            )
            val browseModes = AllSongsGrouping.modesInSections(sections.values)
                .map { mode -> SongBrowseMode(song.slug, mode.key) }
            db.withTransaction {
                db.songDao().insertSong(song)
                db.songDao().upsertBrowseEntry(browseEntry)
                db.songDao().deleteBrowseModes(song.slug)
                if (browseModes.isNotEmpty()) {
                    db.songDao().insertBrowseModes(browseModes)
                }
            }
            onProgress("Harvest complete!")
            Result.success(song)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun fetchSection(id: String): HooktheoryApiResult {
        val apiUrl = "https://api.hooktheory.com/v1/songs/public/$id?fields=ID,song,section,jsonData"
        val request = Request.Builder().url(apiUrl).build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw Exception("API Error: ${response.code}")
            val body = response.body?.string() ?: throw Exception("Empty response body")
            return json.decodeFromString<HooktheoryApiResult>(body)
        }
    }
}
