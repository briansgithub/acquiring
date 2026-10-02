package com.acquiring.android

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.security.MessageDigest

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE)
class AuralCatalogDownloaderTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()

    @Test
    fun installedBundleMustMatchManifestChecksumsAndSnapshot() {
        val snapshot = "snapshot-test"
        val catalog = database("aural-catalog.db", mapOf(
            "schema_version" to "aural-catalog-1",
            "snapshot_id" to snapshot
        ))
        val evidence = database("aural-evidence.db", mapOf("catalog_snapshot" to snapshot))
        val popularity = database("aural-popularity.db", mapOf(
            "snapshotId" to "popularity-test",
            "provider" to "test-provider"
        ))
        val manifest = manifest(snapshot, listOf(catalog, evidence, popularity))

        assertTrue(AuralCatalogDownloader.hasInstalledBundleFiles(context))
        assertTrue(AuralCatalogDownloader.installedBundleMatches(context, manifest))

        evidence.appendText("corrupt")
        assertFalse(AuralCatalogDownloader.installedBundleMatches(context, manifest))
    }

    @Test
    fun installedBundleRejectsMixedCatalogAndEvidenceSnapshots() {
        val catalog = database("aural-catalog.db", mapOf(
            "schema_version" to "aural-catalog-1",
            "snapshot_id" to "current"
        ))
        val evidence = database("aural-evidence.db", mapOf("catalog_snapshot" to "older"))
        val popularity = database("aural-popularity.db", mapOf(
            "snapshotId" to "popularity-test",
            "provider" to "test-provider"
        ))

        assertFalse(
            AuralCatalogDownloader.installedBundleMatches(
                context,
                manifest("current", listOf(catalog, evidence, popularity))
            )
        )
    }

    @Test
    fun incompleteBundleIsNotReportedAsInstalled() {
        database("aural-catalog.db", mapOf(
            "schema_version" to "aural-catalog-1",
            "snapshot_id" to "current"
        ))
        File(context.filesDir, "aural-evidence.db").delete()
        File(context.filesDir, "aural-popularity.db").delete()

        assertFalse(AuralCatalogDownloader.hasInstalledBundleFiles(context))
    }

    @Test
    fun schemaTwoBundleIsAcceptedForModeAnalysis() {
        val snapshot = "mode-analysis"
        val catalog = database("aural-catalog.db", mapOf("schema_version" to "aural-catalog-2", "snapshot_id" to snapshot))
        val evidence = database("aural-evidence.db", mapOf("catalog_snapshot" to snapshot))
        val popularity = database("aural-popularity.db", mapOf("snapshotId" to "popularity-test", "provider" to "test-provider"))
        assertTrue(AuralCatalogDownloader.installedBundleMatches(context, manifest(snapshot,listOf(catalog,evidence,popularity),"aural-catalog-2")))
    }

    @Test
    fun publishedSchemaThreeReplacesInstalledSchemaOne() {
        val catalog = database("aural-catalog.db", mapOf("schema_version" to "aural-catalog-1", "snapshot_id" to "old"))
        val evidence = database("aural-evidence.db", mapOf("catalog_snapshot" to "old"))
        val popularity = database("aural-popularity.db", mapOf("snapshotId" to "popularity-test", "provider" to "test-provider"))
        val upgrade = manifest("new", listOf(catalog, evidence, popularity), "aural-catalog-3")
        assertFalse(AuralCatalogDownloader.installedBundleIsNewer(context, upgrade))
        assertFalse(AuralCatalogDownloader.installedBundleMatches(context, upgrade))
        database("aural-catalog.db", mapOf("schema_version" to "aural-catalog-3", "snapshot_id" to "new"))
        database("aural-evidence.db", mapOf("catalog_snapshot" to "new"))
        assertTrue(AuralCatalogDownloader.installedBundleMatches(context, manifest("new", listOf(catalog, evidence, popularity), "aural-catalog-3")))
    }

    @Test
    fun validatedSchemaThreeBundleIsNotDowngradedByOlderPublishedManifest() {
        val snapshot = "grouped-catalog"
        val catalog = database("aural-catalog.db", mapOf("schema_version" to "aural-catalog-3", "snapshot_id" to snapshot))
        val evidence = database("aural-evidence.db", mapOf("catalog_snapshot" to snapshot))
        val popularity = database("aural-popularity.db", mapOf("snapshotId" to "popularity-test", "provider" to "test-provider"))
        assertTrue(AuralCatalogDownloader.installedBundleIsNewer(context, manifest("published-v1",listOf(catalog,evidence,popularity))))
        assertFalse(AuralCatalogDownloader.installedBundleIsNewer(context, manifest(snapshot,listOf(catalog,evidence,popularity),"aural-catalog-3")))
        database("aural-evidence.db", mapOf("catalog_snapshot" to "wrong"))
        assertFalse(AuralCatalogDownloader.installedBundleIsNewer(context, manifest("published-v1",listOf(catalog,evidence,popularity))))
    }

    private fun database(name: String, metadata: Map<String, String>): File {
        val file = File(context.filesDir, name)
        file.delete()
        SQLiteDatabase.openOrCreateDatabase(file, null).use { database ->
            database.execSQL("CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            metadata.forEach { (key, value) ->
                database.execSQL("INSERT INTO metadata(key,value) VALUES(?,?)", arrayOf(key, value))
            }
        }
        return file
    }

    private fun manifest(snapshot: String, files: List<File>, schema: String = "aural-catalog-1") = AuralCatalogDownloader.Bundle(
        schemaVersion = schema,
        snapshotId = snapshot,
        files = files.map {
            AuralCatalogDownloader.BundleFile(
                name = it.name,
                url = "https://example.invalid/${it.name}.gz",
                checksum = sha256(it)
            )
        }
    )

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(8192)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
