package com.sacredring.android

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
            if (extraction.songIds.isEmpty()) {
                return@withContext Result.failure(Exception("No sections found on page"))
            }

            val cleanUrl = url.trim().trimEnd('/')
            val slug = cleanUrl.substringAfter("theorytab/view/").replace("/", "__")
            val sections = mutableMapOf<String, ExtractedSection>()
            
            var songTitle = "Unknown"
            var artist = "Unknown"

            for ((index, id) in extraction.songIds.withIndex()) {
                onProgress("Fetching section ${index + 1}/${extraction.songIds.size} ($id)...")
                val apiResult = fetchSection(id)
                
                // Prefer section name from API, then scraper, then default
                val rawName = apiResult.section ?: extraction.sectionMapping[id] ?: "Section ${index + 1}"
                val sectionName = rawName.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
                
                val extracted = DataExtractor.extractSection(apiResult, sectionName)
                sections[id] = extracted
                
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

            db.songDao().insertSong(song)
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
