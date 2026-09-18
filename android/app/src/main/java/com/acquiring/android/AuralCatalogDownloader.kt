package com.acquiring.android

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.zip.GZIPInputStream

/** Downloads an immutable Aural Quiz snapshot before exposing it to the catalog reader. */
object AuralCatalogDownloader {
    private const val MANIFEST_URL =
        "https://github.com/briansgithub/acquiring/releases/download/v1.0.0-data/aural-catalog-manifest.json"
    private const val SCHEMA = "aural-catalog-1"
    private val requiredFiles = listOf("aural-catalog.db", "aural-evidence.db", "aural-popularity.db")
    private val json = Json { ignoreUnknownKeys = true }

    @Serializable private data class Bundle(
        val schemaVersion: String,
        val snapshotId: String,
        val files: List<BundleFile>
    )
    @Serializable private data class BundleFile(
        val name: String,
        val url: String,
        val checksum: String
    )

    suspend fun downloadAndInstall(
        context: Context,
        onProgress: (String) -> Unit = {}
    ): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            onProgress("Checking progression catalog…")
            val client = OkHttpClient()
            val manifest = client.newCall(Request.Builder().url(MANIFEST_URL).build()).execute().use { response ->
                check(response.isSuccessful) { "Catalog update failed: HTTP ${response.code}" }
                json.decodeFromString<Bundle>(requireNotNull(response.body).string())
            }
            check(manifest.schemaVersion == SCHEMA) { "Unsupported progression catalog version" }
            val entries = manifest.files.associateBy { it.name }
            check(entries.keys.containsAll(requiredFiles)) { "Catalog update is incomplete" }
            val staged = mutableListOf<Pair<BundleFile, File>>()
            try {
                requiredFiles.forEachIndexed { index, name ->
                    val entry = requireNotNull(entries[name])
                    require(entry.checksum.matches(Regex("[a-f0-9]{64}"))) { "Invalid catalog checksum" }
                    val target = File(context.filesDir, "$name.installing")
                    target.delete()
                    client.newCall(Request.Builder().url(entry.url).build()).execute().use { response ->
                        check(response.isSuccessful) { "Catalog download failed: HTTP ${response.code}" }
                        val body = requireNotNull(response.body)
                        val size = body.contentLength()
                        var read = 0L
                        body.byteStream().use { source ->
                            GZIPInputStream(source).use { gzip ->
                                FileOutputStream(target).use { output ->
                                    val digest = MessageDigest.getInstance("SHA-256")
                                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                                    while (true) {
                                        val count = gzip.read(buffer)
                                        if (count < 0) break
                                        output.write(buffer, 0, count)
                                        digest.update(buffer, 0, count)
                                        read += count
                                        if (size > 0) onProgress("Downloading progressions ${index + 1}/${requiredFiles.size}")
                                    }
                                    check(digest.digest().joinToString("") { "%02x".format(it) } == entry.checksum) {
                                        "Catalog download did not verify"
                                    }
                                }
                            }
                        }
                    }
                    staged += entry to target
                }
                validate(staged.associate { it.first.name to it.second }, manifest.snapshotId)
                onProgress("Installing progressions…")
                staged.forEach { (entry, file) ->
                    val destination = File(context.filesDir, entry.name)
                    if (!file.renameTo(destination)) {
                        destination.delete()
                        check(file.renameTo(destination)) { "Could not install progression catalog" }
                    }
                }
            } catch (error: Throwable) {
                staged.forEach { (_, file) -> file.delete() }
                throw error
            }
        }
    }

    private fun validate(files: Map<String, File>, snapshotId: String) {
        fun metadata(file: File): Map<String, String> = SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READONLY).use { db ->
            db.rawQuery("PRAGMA quick_check", null).use { cursor -> check(cursor.moveToFirst() && cursor.getString(0) == "ok") { "Catalog database is invalid" } }
            db.rawQuery("SELECT key,value FROM metadata", null).use { cursor ->
                buildMap { while (cursor.moveToNext()) put(cursor.getString(0), cursor.getString(1)) }
            }
        }
        val catalog = metadata(requireNotNull(files["aural-catalog.db"]))
        val evidence = metadata(requireNotNull(files["aural-evidence.db"]))
        val popularity = metadata(requireNotNull(files["aural-popularity.db"]))
        check(catalog["schema_version"] == SCHEMA && catalog["snapshot_id"] == snapshotId) { "Catalog snapshot mismatch" }
        check(evidence["catalog_snapshot"] == snapshotId) { "Catalog evidence mismatch" }
        check(!popularity["snapshotId"].isNullOrBlank() && !popularity["provider"].isNullOrBlank()) { "Popularity data is invalid" }
    }
}
