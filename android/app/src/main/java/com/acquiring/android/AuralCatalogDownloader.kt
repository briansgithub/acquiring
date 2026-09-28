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
    private val supportedSchemas = setOf("aural-catalog-1", "aural-catalog-2", "aural-catalog-3")
    private val requiredFiles = listOf("aural-catalog.db", "aural-evidence.db", "aural-popularity.db")
    private val json = Json { ignoreUnknownKeys = true }

    @Serializable internal data class Bundle(
        val schemaVersion: String,
        val snapshotId: String,
        val files: List<BundleFile>
    )
    @Serializable internal data class BundleFile(
        val name: String,
        val url: String,
        val checksum: String
    )

    /**
     * Keeps the Aural bundle aligned with the published manifest without
     * re-downloading roughly 435 MB when the exact snapshot is already present.
     */
    suspend fun ensureInstalled(
        context: Context,
        onProgress: (String) -> Unit = {}
    ): Result<Boolean> = install(context, force = false, onProgress)

    suspend fun downloadAndInstall(
        context: Context,
        onProgress: (String) -> Unit = {}
    ): Result<Unit> = install(context, force = true, onProgress).map { }

    fun hasInstalledBundleFiles(context: Context): Boolean =
        requiredFiles.all { File(context.filesDir, it).isFile }

    private suspend fun install(
        context: Context,
        force: Boolean,
        onProgress: (String) -> Unit
    ): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            onProgress("Checking progression catalog…")
            val client = OkHttpClient()
            val manifest = client.newCall(Request.Builder().url(MANIFEST_URL).build()).execute().use { response ->
                check(response.isSuccessful) { "Catalog update failed: HTTP ${response.code}" }
                json.decodeFromString<Bundle>(requireNotNull(response.body).string())
            }
            check(manifest.schemaVersion in supportedSchemas) { "Unsupported progression catalog version" }
            val entries = manifest.files.associateBy { it.name }
            check(entries.keys.containsAll(requiredFiles)) { "Catalog update is incomplete" }
            if (installedBundleIsNewer(context, manifest)) {
                onProgress("Newer progression catalog is ready")
                return@runCatching false
            }
            if (!force && installedBundleMatches(context, manifest)) {
                onProgress("Progression catalog is ready")
                return@runCatching false
            }
            val staged = mutableListOf<Pair<BundleFile, File>>()
            try {
                requiredFiles.forEachIndexed { index, name ->
                    val entry = requireNotNull(entries[name])
                    require(entry.checksum.matches(Regex("[a-f0-9]{64}"))) { "Invalid catalog checksum" }
                    val target = File(context.filesDir, "$name.installing")
                    target.delete()
                    staged += entry to target
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
                }
                validate(staged.associate { it.first.name to it.second }, manifest.snapshotId)
                onProgress("Installing progressions…")
                AuralCatalogStore.get(context).replaceInstalled {
                    val backups = mutableMapOf<File, File>()
                    val replacements = mutableListOf<File>()
                    try {
                        staged.forEach { (entry, _) ->
                            val destination = File(context.filesDir, entry.name)
                            val backup = File(context.filesDir, "${entry.name}.backup")
                            check(!backup.exists()) { "An earlier catalog backup needs recovery" }
                            if (destination.exists()) {
                                check(destination.renameTo(backup)) { "Could not preserve installed progression catalog" }
                                backups[destination] = backup
                            }
                        }
                        staged.forEach { (entry, file) ->
                            val destination = File(context.filesDir, entry.name)
                            check(file.renameTo(destination)) { "Could not install progression catalog" }
                            replacements += destination
                        }
                        backups.values.forEach { it.delete() }
                    } catch (error: Throwable) {
                        var recoveryFailed = false
                        replacements.forEach { if (it.exists() && !it.delete()) recoveryFailed = true }
                        backups.forEach { (destination, backup) ->
                            if (backup.exists() && !backup.renameTo(destination)) recoveryFailed = true
                        }
                        if (recoveryFailed) throw IllegalStateException("Catalog update failed; previous files remain in .backup for recovery", error)
                        throw error
                    }
                }
                true
            } catch (error: Throwable) {
                staged.forEach { (_, file) -> file.delete() }
                throw error
            }
        }
    }

    internal fun installedBundleMatches(context: Context, manifest: Bundle): Boolean = runCatching {
        if (manifest.schemaVersion !in supportedSchemas) return@runCatching false
        val entries = manifest.files.associateBy { it.name }
        if (!entries.keys.containsAll(requiredFiles)) return@runCatching false
        val files = requiredFiles.associateWith { File(context.filesDir, it) }
        if (files.values.any { !it.isFile }) return@runCatching false
        if (requiredFiles.any { name -> sha256(requireNotNull(files[name])) != requireNotNull(entries[name]).checksum }) {
            return@runCatching false
        }
        validate(files, manifest.snapshotId)
        true
    }.getOrDefault(false)

    internal fun installedBundleIsNewer(context: Context, manifest: Bundle): Boolean = runCatching {
        if (!hasInstalledBundleFiles(context)) return@runCatching false
        val catalogFile = File(context.filesDir, "aural-catalog.db")
        val installed = SQLiteDatabase.openDatabase(catalogFile.path, null, SQLiteDatabase.OPEN_READONLY).use { db ->
            db.rawQuery("SELECT key,value FROM metadata WHERE key IN ('schema_version','snapshot_id')", null).use { cursor ->
                buildMap { while (cursor.moveToNext()) put(cursor.getString(0), cursor.getString(1)) }
            }
        }
        val localVersion = installed["schema_version"]?.substringAfterLast('-')?.toIntOrNull() ?: return@runCatching false
        val offeredVersion = manifest.schemaVersion.substringAfterLast('-').toIntOrNull() ?: return@runCatching false
        if (localVersion <= offeredVersion) return@runCatching false
        validate(requiredFiles.associateWith { File(context.filesDir, it) }, installed["snapshot_id"] ?: return@runCatching false)
        true
    }.getOrDefault(false)

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered().use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
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
        check(catalog["schema_version"] in supportedSchemas && catalog["snapshot_id"] == snapshotId) { "Catalog snapshot mismatch" }
        check(evidence["catalog_snapshot"] == snapshotId) { "Catalog evidence mismatch" }
        check(!popularity["snapshotId"].isNullOrBlank() && !popularity["provider"].isNullOrBlank()) { "Popularity data is invalid" }
    }
}
