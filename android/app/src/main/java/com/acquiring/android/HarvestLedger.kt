package com.acquiring.android

import android.database.sqlite.SQLiteDatabase
import androidx.room.withTransaction
import java.io.File

/**
 * Keeps manually harvested songs alive across a catalog install.
 *
 * DatabaseDownloader replaces `acquiring-db` as a whole file, so a harvested row
 * written only into the catalog is destroyed by every "Download Full Library".
 * The ledger in [UserDataDatabase] is what survives that swap, and [replay]
 * rebuilds from it whatever the new catalog does not carry itself.
 *
 * Ordering is not negotiable: [adopt] must run before the swap, because it reads
 * the outgoing catalog, and [replay] after it.
 */
object HarvestLedger {

    private const val LEGACY_ADOPTION_KEY = "legacyHarvestsAdopted"

    /**
     * A diff this large is not a set of manual harvests — it is a catalog that
     * was re-keyed or rebuilt. Adopting it would pin thousands of stale rows
     * into every future catalog, so the sweep declines instead.
     */
    internal const val LEGACY_ADOPTION_LIMIT = 500

    /** Records a harvest as it is written into the catalog. */
    suspend fun record(
        userDb: UserDataDatabase,
        song: Song,
        alphaGroup: String,
        modes: Iterable<String>
    ) {
        userDb.harvestLedgerDao().record(
            HarvestedSong(
                slug = song.slug,
                artist = song.artist,
                title = song.title,
                url = song.url,
                status = song.status,
                dataBlob = song.dataBlob ?: return,
                alphaGroup = alphaGroup,
                modes = HarvestedSong.encodeModes(modes),
                harvestedAt = System.currentTimeMillis()
            )
        )
    }

    /**
     * One-time amnesty for songs harvested before this ledger shipped: the
     * outgoing catalog is the only record of them, and the swap deletes it.
     *
     * Running it on every install would permanently resurrect songs the catalog
     * later prunes on purpose, so a flag beside the rows closes it afterwards.
     * "Looks harvested" is the absence of a complexity rating — every shipped
     * catalog row has one, and a harvest never computes one.
     */
    suspend fun adopt(currentDb: AppDatabase, stagedDbFile: File, userDb: UserDataDatabase) {
        val dao = userDb.harvestLedgerDao()
        if (dao.hasFlag(LEGACY_ADOPTION_KEY)) return

        // Slugs first, payloads only for the survivors: the candidate set is
        // bounded but its chord blobs are not, and most of them are about to be
        // discarded as "the new catalog has this one too".
        val candidateSlugs = currentDb.songDao().getUnratedSlugsWithChords(LEGACY_ADOPTION_LIMIT + 1)
        if (candidateSlugs.size > LEGACY_ADOPTION_LIMIT) return
        val stagedSlugs = slugsPresent(stagedDbFile, candidateSlugs)
        val adoptable = candidateSlugs.filter { it !in stagedSlugs }

        val now = System.currentTimeMillis()
        val entries = adoptable.mapNotNull { slug ->
            val song = currentDb.songDao().getSongBySlug(slug) ?: return@mapNotNull null
            HarvestedSong(
                slug = song.slug,
                artist = song.artist,
                title = song.title,
                url = song.url,
                status = song.status,
                dataBlob = song.dataBlob ?: return@mapNotNull null,
                alphaGroup = AllSongsGrouping.alphabeticalGroup(song.title),
                modes = HarvestedSong.encodeModes(currentDb.songDao().getModesForSlug(song.slug)),
                harvestedAt = now
            )
        }
        userDb.withTransaction {
            dao.adopt(entries)
            dao.setFlag(HarvestLedgerMeta(LEGACY_ADOPTION_KEY, now.toString()))
        }
    }

    /**
     * Rebuilds every ledgered harvest the catalog is missing, and returns how
     * many rows it actually wrote.
     *
     * A slug the catalog already carries is left alone: that copy is newer and
     * carries a complexity rating a harvest never produces. Idempotent, so a
     * redundant pass after an interrupted install costs one query per entry.
     */
    suspend fun replay(catalogDb: AppDatabase, userDb: UserDataDatabase): Int {
        var restored = 0
        for (entry in userDb.harvestLedgerDao().getAll()) {
            if (catalogDb.songDao().songExists(entry.slug)) continue
            val song = entry.toSong()
            val browseModes = entry.modeSet().map { mode -> SongBrowseMode(entry.slug, mode) }
            catalogDb.withTransaction {
                catalogDb.songDao().insertSong(song)
                catalogDb.songDao().upsertBrowseEntry(
                    SongBrowseEntry(
                        slug = entry.slug,
                        artist = entry.artist,
                        title = entry.title,
                        alphaGroup = entry.alphaGroup,
                        complexityRating = null,
                        complexityBucket = null
                    )
                )
                catalogDb.songDao().deleteBrowseModes(entry.slug)
                if (browseModes.isNotEmpty()) {
                    catalogDb.songDao().insertBrowseModes(browseModes)
                }
            }
            restored++
        }
        return restored
    }

    /**
     * Which of [slugs] the staged catalog already carries.
     *
     * Asks about the candidates rather than reading forty thousand slugs back:
     * the question is only ever about a bounded handful. The staged file is not
     * the open database, so it is read directly, with the same read-only handle
     * DatabaseDownloader.ensureBrowseSchema already opens it with.
     */
    private fun slugsPresent(databaseFile: File, slugs: List<String>): Set<String> {
        if (!databaseFile.exists() || slugs.isEmpty()) return emptySet()
        val present = HashSet<String>()
        SQLiteDatabase.openDatabase(
            databaseFile.path,
            null,
            SQLiteDatabase.OPEN_READONLY
        ).use { staged ->
            // Chunked to stay well inside SQLite's bound-variable ceiling.
            for (chunk in slugs.chunked(200)) {
                val placeholders = chunk.joinToString(",") { "?" }
                staged.rawQuery(
                    "SELECT slug FROM songs WHERE slug IN ($placeholders)",
                    chunk.toTypedArray()
                ).use { cursor ->
                    while (cursor.moveToNext()) present.add(cursor.getString(0))
                }
            }
        }
        return present
    }
}
