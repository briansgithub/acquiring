package com.sacredring.android

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.util.zip.GZIPInputStream

object DatabaseDownloader {

    private const val DEFAULT_CATALOG_URL =
        "https://github.com/briansgithub/diatonic_ring/releases/download/v1.0.0-data/catalog.db.gz"

    suspend fun downloadAndInstallCatalog(
        context: Context,
        currentDb: AppDatabase? = null,
        url: String = DEFAULT_CATALOG_URL,
        onProgress: (String) -> Unit = {}
    ): Result<Boolean> = withContext(Dispatchers.IO) {

        try {
            onProgress("Connecting to catalog download...")
            val client = OkHttpClient()
            val request = Request.Builder().url(url).build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    return@withContext Result.failure(Exception("Download failed: HTTP ${response.code}"))
                }

                val body = response.body ?: return@withContext Result.failure(Exception("Empty response body"))
                val contentLength = body.contentLength()

                val gzFile = File(context.cacheDir, "catalog.db.gz")
                val targetDbFile = context.getDatabasePath("sacred-ring-db")

                // Ensure parent database directory exists
                targetDbFile.parentFile?.mkdirs()

                onProgress("Downloading full library & chords (56.6 MB)...")

                body.byteStream().use { inputStream ->
                    FileOutputStream(gzFile).use { outputStream ->
                        val buffer = ByteArray(8192)
                        var bytesRead: Int
                        var totalRead = 0L

                        while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                            outputStream.write(buffer, 0, bytesRead)
                            totalRead += bytesRead
                            if (contentLength > 0) {
                                val percent = (totalRead * 100 / contentLength).toInt()
                                onProgress("Downloading catalog: $percent%")
                            }
                        }
                    }
                }

                onProgress("Decompressing & installing database...")

                // Close active DB connection if provided
                currentDb?.close()

                // Clean up any existing database and WAL/journal files
                val walFile = File(targetDbFile.path + "-wal")
                val shmFile = File(targetDbFile.path + "-shm")
                val journalFile = File(targetDbFile.path + "-journal")
                if (targetDbFile.exists()) targetDbFile.delete()
                if (walFile.exists()) walFile.delete()
                if (shmFile.exists()) shmFile.delete()
                if (journalFile.exists()) journalFile.delete()

                GZIPInputStream(gzFile.inputStream()).use { gzStream ->
                    FileOutputStream(targetDbFile).use { outDbStream ->
                        gzStream.copyTo(outDbStream)
                    }
                }


                // Delete temporary gzip file
                if (gzFile.exists()) gzFile.delete()

                onProgress("Full library installed! (34,101 songs ready with chords)")

                Result.success(true)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
