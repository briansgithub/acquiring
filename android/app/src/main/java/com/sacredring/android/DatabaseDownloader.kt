package com.sacredring.android

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.zip.GZIPInputStream

object DatabaseDownloader {

    private const val EXPECTED_BROWSE_SONGS = 34_101L

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
                val stagedDbFile = File(targetDbFile.parentFile, "${targetDbFile.name}.installing")

                // Ensure parent database directory exists
                targetDbFile.parentFile?.mkdirs()
                deleteDatabaseFiles(stagedDbFile)

                try {
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

                    onProgress("Preparing catalog update...")
                    GZIPInputStream(gzFile.inputStream()).use { gzStream ->
                        FileOutputStream(stagedDbFile).use { outDbStream ->
                            gzStream.copyTo(outDbStream)
                        }
                    }

                    ensureBrowseSchema(stagedDbFile)
                    validateCatalog(context, stagedDbFile)

                    onProgress("Installing catalog...")
                    currentDb?.close()
                    deleteDatabaseSidecars(targetDbFile)
                    replaceDatabaseAtomically(stagedDbFile, targetDbFile)

                    onProgress("Full library installed! (34,101 songs ready with chords)")

                    Result.success(true)
                } finally {
                    runCatching { Files.deleteIfExists(gzFile.toPath()) }
                    runCatching { deleteDatabaseFiles(stagedDbFile) }
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Keeps older catalog downloads openable by schema v3. New exports already
     * contain populated complexity/mode metadata; older exports receive a safe
     * alphabetical-only backfill without ever reading a dataBlob into memory.
     */
    private fun ensureBrowseSchema(databaseFile: File) {
        SQLiteDatabase.openDatabase(
            databaseFile.path,
            null,
            SQLiteDatabase.OPEN_READWRITE
        ).use { catalog ->
            catalog.beginTransaction()
            try {
                SongBrowseSchema.createStatements.forEach(catalog::execSQL)
                catalog.execSQL(SongBrowseSchema.BACKFILL_ENTRIES)
                catalog.execSQL(SongBrowseSchema.NORMALIZE_ALPHA_GROUPS)
                // Let Room validate the downloaded file and write its current
                // identity hash, even if an older export carried a v1 hash.
                catalog.execSQL("DROP TABLE IF EXISTS room_master_table")
                catalog.version = AppDatabase.SCHEMA_VERSION
                catalog.setTransactionSuccessful()
            } finally {
                catalog.endTransaction()
            }
        }
    }

    private fun validateCatalog(context: Context, databaseFile: File) {
        val roomDatabase = Room.databaseBuilder(
            context.applicationContext,
            AppDatabase::class.java,
            databaseFile.name
        )
            .addMigrations(AppDatabase.MIGRATION_1_2, AppDatabase.MIGRATION_2_3)
            .setJournalMode(RoomDatabase.JournalMode.TRUNCATE)
            .build()
        try {
            // Force Room's exact table/column/index validation before the live
            // database is closed or replaced.
            roomDatabase.openHelper.writableDatabase
        } finally {
            roomDatabase.close()
        }

        SQLiteDatabase.openDatabase(
            databaseFile.path,
            null,
            SQLiteDatabase.OPEN_READONLY
        ).use { catalog ->
            catalog.rawQuery("PRAGMA quick_check", null).use { cursor ->
                if (!cursor.moveToFirst() || cursor.getString(0) != "ok") {
                    throw IOException("Downloaded catalog failed its integrity check")
                }
            }
            val songs = catalog.queryLong("SELECT COUNT(*) FROM songs")
            val browseEntries = catalog.queryLong("SELECT COUNT(*) FROM song_browse_entries")
            val browseEntriesWithChords = catalog.queryLong(
                """
                SELECT COUNT(*)
                FROM song_browse_entries AS entries
                INNER JOIN songs ON songs.slug = entries.slug
                WHERE songs.dataBlob IS NOT NULL
                """.trimIndent()
            )
            if (
                songs < EXPECTED_BROWSE_SONGS ||
                browseEntries != EXPECTED_BROWSE_SONGS ||
                browseEntriesWithChords != browseEntries
            ) {
                throw IOException(
                    "Downloaded catalog is incomplete: " +
                        "$browseEntries browse rows, $browseEntriesWithChords with chords"
                )
            }
        }
        deleteDatabaseSidecars(databaseFile)
    }

    private fun SQLiteDatabase.queryLong(sql: String): Long =
        rawQuery(sql, null).use { cursor ->
            if (!cursor.moveToFirst()) 0L else cursor.getLong(0)
        }

    private fun replaceDatabaseAtomically(stagedDbFile: File, targetDbFile: File) {
        try {
            Files.move(
                stagedDbFile.toPath(),
                targetDbFile.toPath(),
                StandardCopyOption.ATOMIC_MOVE,
                StandardCopyOption.REPLACE_EXISTING
            )
            return
        } catch (_: AtomicMoveNotSupportedException) {
            // Same-directory moves are normally atomic. Keep a recoverable
            // backup for filesystems that do not advertise atomic replacement.
        }

        val backupDbFile = File(targetDbFile.parentFile, "${targetDbFile.name}.backup")
        deleteDatabaseFiles(backupDbFile)
        var hasBackup = false
        try {
            if (targetDbFile.exists()) {
                Files.move(
                    targetDbFile.toPath(),
                    backupDbFile.toPath(),
                    StandardCopyOption.REPLACE_EXISTING
                )
                hasBackup = true
            }
            Files.move(
                stagedDbFile.toPath(),
                targetDbFile.toPath(),
                StandardCopyOption.REPLACE_EXISTING
            )
            deleteDatabaseFiles(backupDbFile)
        } catch (installError: Exception) {
            if (hasBackup) {
                try {
                    Files.deleteIfExists(targetDbFile.toPath())
                    Files.move(
                        backupDbFile.toPath(),
                        targetDbFile.toPath(),
                        StandardCopyOption.REPLACE_EXISTING
                    )
                } catch (restoreError: Exception) {
                    installError.addSuppressed(restoreError)
                }
            }
            throw installError
        }
    }

    private fun deleteDatabaseFiles(databaseFile: File) {
        Files.deleteIfExists(databaseFile.toPath())
        deleteDatabaseSidecars(databaseFile)
    }

    private fun deleteDatabaseSidecars(databaseFile: File) {
        listOf("-wal", "-shm", "-journal").forEach { suffix ->
            Files.deleteIfExists(File(databaseFile.path + suffix).toPath())
        }
    }
}
