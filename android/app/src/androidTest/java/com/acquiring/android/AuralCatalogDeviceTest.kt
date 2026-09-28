package com.acquiring.android

import android.content.Context
import android.os.SystemClock
import android.util.Log
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import org.junit.Rule
import kotlinx.coroutines.runBlocking
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.mutableStateOf
import androidx.room.Room
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

class AuralCatalogDeviceTest {
    @get:Rule val compose=createComposeRule()
    private class Store:AuralPersistence { var raw:String?=null; override fun read()=raw;override fun write(value:String):Boolean { raw=value;return true } }
    @Test fun progressionQueueCoversEveryEligibleSongBeyondFirstBrowsePage() {
        val context=ApplicationProvider.getApplicationContext<Context>()
        AuralCatalog(File(context.filesDir,"aural-catalog.db")).use { catalog ->
            val ranking=catalog.Ranking(AuralExampleSettings(),emptyList(),emptySet(),minimumPopularityPercent=80)
            val row=try { ranking.page(1).single() } finally { ranking.close() }
            val expected=catalog.songs(row.target,80).map { it.id }.toSet()
            val candidates=catalog.queueCandidates(row.target)
            val queue=orderedQueue(candidates,80,kotlin.random.Random(8))
            assertTrue("Fixture should exercise more than one page of songs",expected.size>30)
            assertEquals(expected,queue.map { it.slug }.toSet())
            assertEquals(expected.size,queue.size)
            assertTrue(queue.zipWithNext().all { (a,b) ->
                val sa=candidates.first { it.song.slug==a.slug }.score ?: -1.0
                val sb=candidates.first { it.song.slug==b.slug }.score ?: -1.0
                sa>=sb
            })
        }
    }
    @Test fun queueSectionReferencesResolveAgainstSongLibrary() = runBlocking {
        val context=ApplicationProvider.getApplicationContext<Context>()
        val db=Room.databaseBuilder(context,AppDatabase::class.java,AppDatabase.DB_NAME)
            .addMigrations(AppDatabase.MIGRATION_1_2,AppDatabase.MIGRATION_2_3).build()
        try {
            AuralCatalog(File(context.filesDir,"aural-catalog.db")).use { catalog ->
                val rank=catalog.Ranking(AuralExampleSettings(),emptyList(),emptySet(),minimumPopularityPercent=80)
                val target=try { rank.page(1).single().target } finally { rank.close() }
                val entries=orderedQueue(catalog.queueCandidates(target),80)
                var exact=0
                val resolvable=entries.take(30).count { entry ->
                    val song=db.songDao().getSongBySlug(entry.slug)
                    val sections=song?.dataBlob?.let { blob -> runCatching {
                        HooktheoryDataCompat.migrateSections(Json { ignoreUnknownKeys=true }.decodeFromString<Map<String,ExtractedSection>>(DataUtils.decompress(blob)))
                    }.onFailure { Log.i("AuralQueueResolve","decode ${entry.slug}: ${it.javaClass.simpleName}: ${it.message?.take(160)}") }.getOrNull() }
                    if(sections?.entries?.any { (key,section) -> auralSectionIdentity(entry.slug,key,section)==entry.sectionId }==true) exact++
                    sections?.let { resolveQueuedSection(entry.slug,entry,it) }!=null
                }
                assertEquals("Every sampled section should resolve without ambiguity",30,resolvable)
                assertTrue("Stable identities should resolve sampled sections",exact>0)
            }
        } finally { db.close() }
    }
    @Test fun warmCatalogReusesReaderAndHidesUnmatchedGroups() = runBlocking {
        val context=ApplicationProvider.getApplicationContext<Context>()
        val store=AuralCatalogStore.get(context)
        val started=SystemClock.elapsedRealtime()
        val first=store.acquire()
        val prepared=SystemClock.elapsedRealtime()
        val catalog=first.value
        first.release()
        val second=store.acquire()
        assertSame(catalog,second.value)
        val reused=SystemClock.elapsedRealtime()
        try {
            val settings=AuralExampleSettings()
            val buckets=catalog.matchingBuckets(settings,minimumPopularityPercent=90)
            val grouped=SystemClock.elapsedRealtime()
            assertTrue(buckets.isNotEmpty())
            val v=requireNotNull(auralStartGroup("V")).id
            assertFalse(buckets[385].orEmpty().any { it.id==v })
            assertSame(buckets,catalog.matchingBuckets(settings.copy(groupingPriority="start"),minimumPopularityPercent=90))
            val widened=catalog.matchingBuckets(settings,minimumPopularityPercent=80)
            assertTrue(widened.values.sumOf { it.size } >= buckets.values.sumOf { it.size })
            val filtered=SystemClock.elapsedRealtime()
            val query=AuralProgressionQuery(chords=listOf(AuralChordConstraint(5),AuralChordConstraint(1)))
            val searched=catalog.matchingBuckets(settings,query,90)
            assertTrue(searched.isNotEmpty())
            searched[3].orEmpty().take(5).forEach { group ->
                val ranking=catalog.Ranking(settings,emptyList(),emptySet(),3,3,query,group.id,90)
                try { assertTrue("Visible group must have a match: ${group.label}",ranking.page(1).isNotEmpty()) }
                finally { ranking.close() }
            }
            Log.i("AuralCatalogLoad","device: prepare=${prepared-started}ms reuse=${reused-prepared}ms groups=${grouped-reused}ms cutoffChange=${filtered-grouped}ms search+ranking=${SystemClock.elapsedRealtime()-filtered}ms buckets=${buckets.values.sumOf { it.size }}")
        } finally { second.release() }
        Unit
    }
    @Test fun longProgressionHeaderDoesNotHideSongTab() {
        val degrees=List(129) { if(it % 2 == 0) "I(no3)(no5)" else "V(no3)(no5)" }
        compose.setContent { androidx.compose.material3.MaterialTheme { Column(Modifier.fillMaxSize()) {
            AuralProgressionHeading("long-device-progression",degrees,countOnly=false)
            AuralModeTabs("compare",onSongs={}) {}
        } } }
        compose.onNodeWithTag("AuralProgressionExpand").assertIsDisplayed().performClick()
        compose.onNodeWithTag("AuralMode-songs").assertIsDisplayed().performClick()
        compose.onNodeWithTag("AuralProgressionExpand").assertIsDisplayed().performClick()
        compose.onNodeWithTag("AuralMode-songs").assertIsDisplayed()
    }
    @Test fun emptyLongStartGroupWithPopularityCutoffLoadsWithoutError() {
        val context=ApplicationProvider.getApplicationContext<Context>()
        AuralCatalog(File(context.filesDir,"aural-catalog.db")).use { catalog ->
            val buckets=catalog.groupedBuckets(AuralExampleSettings())
            val length=requireNotNull(buckets.keys.maxOrNull())
            val start=requireNotNull(buckets.getValue(length).firstOrNull { it.label=="V" })
            val ranking=catalog.Ranking(AuralExampleSettings(),emptyList(),emptySet(),length,length,startGroup=start.id,minimumPopularityPercent=90)
            try {
                val rows=ranking.page()
                assertTrue(length>=100)
                assertTrue(rows.isEmpty())
                assertFalse(ranking.hasMore)
                assertTrue(ranking.page().isEmpty())
            } finally { ranking.close() }
        }
    }
    @Test fun popularityCutoffFiltersRowsSongsAndChosenSource() {
        val context=ApplicationProvider.getApplicationContext<Context>()
        AuralCatalog(File(context.filesDir,"aural-catalog.db")).use { catalog ->
            val settings=AuralExampleSettings()
            val ranking=catalog.Ranking(settings,emptyList(),emptySet(),minLength=3,maxLength=3,minimumPopularityPercent=80)
            val rows=try { ranking.page(8) } finally { ranking.close() }
            assertTrue(rows.isNotEmpty())
            rows.forEach { row ->
                val songs=catalog.songs(row.target,80)
                assertEquals(row.songs,songs.size)
                assertTrue(songs.isNotEmpty())
                assertTrue(songs.all { (it.popularityScore ?: -1.0) >= 0.8 })
                assertTrue(catalog.songs(row.target).size >= songs.size)
            }
            val first=rows.first().target
            val passage=catalog.passage(first,settings,AuralSelectionContext(),42,first.id,minimumPopularityPercent=80)
            assertTrue((catalog.popularity[passage.songId]?.score ?: -1.0) >= 0.8)
        }
    }
    @Test fun globalFrequencyPagesStayOrderedAndIgnoreSongEligibilityForCounts() {
        val context=ApplicationProvider.getApplicationContext<Context>()
        AuralCatalog(File(context.filesDir,"aural-catalog.db")).use { catalog ->
            val started=SystemClock.elapsedRealtime()
            val settings=AuralExampleSettings()
            val ranking=catalog.Ranking(settings,emptyList(),emptySet(),minimumPopularityPercent=80)
            val initialized=SystemClock.elapsedRealtime()
            val rows=try {
                val first=ranking.page(30)
                val firstPage=SystemClock.elapsedRealtime()
                val second=ranking.page(30)
                Log.i("AuralCatalogLoad","device: globalFrequency init=${initialized-started}ms first=${firstPage-initialized}ms second=${SystemClock.elapsedRealtime()-firstPage}ms")
                first+second
            } finally { ranking.close() }
            assertEquals(60,rows.size)
            assertEquals(rows.sortedWith(AuralCatalog.rowOrder("mostSongs")),rows)
            rows.take(8).forEach { row ->
                assertEquals(catalog.songs(row.target).size,row.globalSongs)
                assertEquals(catalog.songs(row.target,80).size,row.songs)
                assertTrue(row.globalSongs>=row.songs)
            }
            val longer=catalog.Ranking(settings,emptyList(),emptySet(),minLength=4,minimumPopularityPercent=80)
            try { assertTrue(longer.page(30).all { it.length>=4 }) } finally { longer.close() }
            Log.i("AuralCatalogLoad","device: globalFrequency60=${SystemClock.elapsedRealtime()-started}ms")
        }
    }
    @Test fun defaultCatalogShowsUngroupedFrequencyResults() {
        val context=ApplicationProvider.getApplicationContext<Context>()
        AuralCatalog(File(context.filesDir,"aural-catalog.db")).use { catalog ->
            val settings=mutableStateOf(AuralExampleSettings())
            val coreLength=mutableStateOf(2)
            compose.setContent { androidx.compose.material3.MaterialTheme {
                AuralCatalogScreen(catalog,settings.value,AuralSession(Store()),{}, {},null,
                    onSettingsChange={settings.value=it},minimumPopularityPercent=80,
                    minimumCoreLength=coreLength.value,onMinimumCoreLengthChange={coreLength.value=it})
            } }
            compose.onNodeWithTag("AuralSort").assertExists()
            compose.onNodeWithTag("AuralSort").performClick()
            compose.onNodeWithTag("AuralSort-mostSongs").assertExists()
            compose.onNodeWithTag("AuralSort-recommended").performClick()
            assertEquals("recommended",settings.value.sortOrder)
            compose.onNodeWithTag("AuralSort").performClick()
            compose.onNodeWithTag("AuralSort-mostSongs").performClick()
            compose.onNodeWithTag("AuralMoreBrowsingOptions").performClick()
            compose.onNodeWithTag("AuralMinimumPopularity").assertExists()
            compose.onNodeWithTag("AuralCoreLengthIncrease").performClick()
            assertEquals(3,coreLength.value)
            compose.onNodeWithText("Core ≥3 chords",substring=true).assertExists()
            compose.onNodeWithTag("AuralFlatList").assertExists()
            compose.onNodeWithTag("AuralInversions").assertExists()
            compose.onNodeWithTag("AuralGroup-length").performScrollTo().performClick()
            assertEquals("length",settings.value.groupingPriority)
            compose.onNodeWithTag("AuralGroup-none").performScrollTo().performClick()
            compose.onNodeWithTag("AuralMoreBrowsingOptions").performScrollTo().performClick()
            compose.onNodeWithTag("AuralPrimary-length:3").assertDoesNotExist()
            val sequence=SemanticsMatcher("global progression") {
                it.config.getOrNull(SemanticsProperties.TestTag)?.startsWith("AuralPattern-")==true
            }
            compose.waitUntil(60_000) { compose.onAllNodes(sequence).fetchSemanticsNodes().isNotEmpty() }
            assertTrue(compose.onAllNodes(sequence).fetchSemanticsNodes().isNotEmpty())
        }
    }
    @Test fun outlineExpansionHasLargeTargetsAndStableSiblingNumbers() {
        val context=ApplicationProvider.getApplicationContext<Context>()
        val browseStorageName="aural_catalog_outline_device_test"
        context.getSharedPreferences(browseStorageName,Context.MODE_PRIVATE).edit().clear().commit()
        AuralCatalog(File(context.filesDir,"aural-catalog.db")).use { catalog ->
            val tonicGroup = requireNotNull(auralStartGroup("I")).id
            val start = requireNotNull(catalog.groupedBuckets(AuralExampleSettings())[3]?.firstOrNull { it.id==tonicGroup })
            val leaf = "3|${start.id}"
            compose.setContent { androidx.compose.material3.MaterialTheme {
                AuralCatalogScreen(catalog,AuralExampleSettings(groupingPriority="length"),AuralSession(Store()),{}, {},null,
                    browseStorageName=browseStorageName)
            } }
            compose.waitUntil(30_000) { compose.onAllNodesWithTag("AuralCatalogLoading").fetchSemanticsNodes().isEmpty() }
            val matching=catalog.matchingBuckets(AuralExampleSettings(),minimumPopularityPercent=null)
            val groupIndex=matching.keys.sortedDescending().indexOf(3)+1
            val subgroupIndex=groupIndex+1+requireNotNull(matching[3]).indexOfFirst { it.id==start.id }
            compose.onNodeWithTag("AuralCatalog").performScrollToIndex(groupIndex)
            compose.onNodeWithTag("AuralPrimary-length:3").performClick()
            compose.onNodeWithTag("AuralCatalog").performScrollToIndex(subgroupIndex)
            compose.onNodeWithTag("AuralSubgroup-$leaf").performClick()
            compose.waitUntil(30_000) { compose.onAllNodesWithTag("AuralSubgroupReady-$leaf",useUnmergedTree=true).fetchSemanticsNodes().isNotEmpty() }
            repeat(8) {
                if(compose.onAllNodesWithTag("AuralExpand-$leaf-1").fetchSemanticsNodes().isNotEmpty()) return@repeat
                compose.onNodeWithTag("AuralCatalog").performTouchInput { swipeUp() }
            }
            compose.onNodeWithTag("AuralExpand-$leaf-1").assertExists()
            compose.onNodeWithTag("AuralExpand-$leaf-1").assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp).performClick()
            compose.waitUntil(30_000) { compose.onAllNodesWithTag("AuralOutline-$leaf-1.1").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithTag("AuralOutline-$leaf-1.1").assertTextEquals("1.1")
            compose.onNodeWithTag("AuralExpand-$leaf-1").performClick()
            compose.waitUntil(5_000) { compose.onAllNodesWithTag("AuralOutline-$leaf-1.1").fetchSemanticsNodes().isEmpty() }
            compose.onNodeWithTag("AuralOutline-$leaf-2").assertTextEquals("2")
        }
    }
    @Test fun popularitySongDelegatesToTheHostAndKeepsTheQuizDraft() {
        val context=ApplicationProvider.getApplicationContext<Context>(); AppAudioOutput.initialize(context)
        val session=AuralSession(Store(),seedFor={it})
        var opened:AuralSourcePassage?=null
        AuralCatalog(File(context.filesDir,"aural-catalog.db")).use { catalog ->
            val target=catalog.Ranking(AuralExampleSettings(),emptyList(),emptySet(),minLength=3,maxLength=3).page(1).single().target
            runBlocking { session.practicePattern(target,catalog,"recall") }
        }
        compose.setContent { androidx.compose.material3.MaterialTheme { AuralQuizScreen({},session,
            openFullPlayback={ passage,_ -> opened=passage; true },playExample={}) } }
        compose.waitUntil(30_000) { compose.onAllNodesWithText("Continue").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Continue").performClick()
        compose.onNodeWithTag("AuralListen").performScrollTo().performClick()
        val exercise=session.view().exercise!!;val degree=exercise.answer.degrees.first()
        compose.onNodeWithTag("AuralDegree-$degree").performScrollTo().performClick()
        compose.onNodeWithTag("AuralMode-songs").performClick()
        val songMatcher=SemanticsMatcher("song row") { it.config.getOrNull(SemanticsProperties.TestTag)?.startsWith("AuralSong-")==true }
        compose.waitUntil(30_000) { compose.onAllNodes(songMatcher).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("AuralSongsList").performScrollToIndex(8)
        val chosen=compose.onAllNodes(songMatcher).fetchSemanticsNodes().first().config[SemanticsProperties.TestTag]
        compose.onNodeWithTag("AuralSongPopularity-${chosen.removePrefix("AuralSong-")}",useUnmergedTree=true).assertExists()
        compose.onNodeWithTag(chosen).performClick()
        compose.waitUntil(30_000) { opened!=null }
        assertEquals(chosen.removePrefix("AuralSong-"),opened!!.songId)
        compose.onNodeWithTag("PlaybackScreen").assertDoesNotExist()
        compose.waitUntil(30_000) { compose.onAllNodesWithTag(chosen).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag(chosen).assertIsDisplayed()
        compose.onNodeWithTag("AuralMode-songs").assertIsSelected()
        compose.onNodeWithTag("AuralMode-recall").performClick()
        compose.onNodeWithTag("AuralEntered").performScrollTo().assertTextEquals(degree)
        assertEquals(exercise.id,session.view().exercise!!.id)
        assertTrue(session.view().supported)
    }
    @Test fun sourcePlaybackDelegatesToTheHostAndKeepsTheQuestionAndDraft() {
        val context=ApplicationProvider.getApplicationContext<Context>(); AppAudioOutput.initialize(context)
        val session=AuralSession(Store(),seedFor={it})
        var opened:AuralSourcePassage?=null
        AuralCatalog(File(context.filesDir,"aural-catalog.db")).use { catalog ->
            val target=catalog.Ranking(AuralExampleSettings(),emptyList(),emptySet(),minLength=3,maxLength=3).page(1).single().target
            runBlocking { session.practicePattern(target,catalog,"recall") }
        }
        compose.setContent { androidx.compose.material3.MaterialTheme { AuralQuizScreen({},session,
            openFullPlayback={ passage,_ -> opened=passage; true },playExample={}) } }
        compose.waitUntil(30_000) { compose.onAllNodesWithText("Continue").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Continue").performClick()
        compose.onNodeWithTag("AuralSource").assertExists()
        compose.onNodeWithTag("AuralListen").performScrollTo().performClick()
        val exercise=session.view().exercise!!;val degree=exercise.answer.degrees.first()
        compose.onNodeWithTag("AuralDegree-$degree").performScrollTo().performClick()
        compose.waitUntil(30_000) { compose.onAllNodesWithTag("AuralOpenPlayback").fetchSemanticsNodes().isNotEmpty() && runCatching { compose.onNodeWithTag("AuralOpenPlayback").assertIsEnabled() }.isSuccess }
        compose.onNodeWithTag("AuralOpenPlayback").performScrollTo().performClick()
        compose.waitUntil(30_000) { opened!=null }
        assertEquals(exercise.provenance.corpus!!.passage.sourceId,opened!!.sourceId)
        compose.onNodeWithTag("PlaybackScreen").assertDoesNotExist()
        compose.onNodeWithTag("AuralEntered").performScrollTo().assertTextEquals(degree)
        assertEquals(exercise.id,session.view().exercise!!.id); assertTrue(session.view().supported)
    }
    @Test fun exhaustiveCatalogRanksAndResolvesOfflinePassages() {
        val context=ApplicationProvider.getApplicationContext<Context>()
        val started=SystemClock.elapsedRealtime()
        AuralCatalog(File(context.filesDir,"aural-catalog.db")).use { catalog ->
            val loaded=SystemClock.elapsedRealtime()
            val settings=AuralExampleSettings()
            val rank=catalog.Ranking(settings,emptyList(),emptySet())
            val first=rank.page(10); val second=rank.page(10)
            assertEquals(20,(first+second).map { it.target.id }.distinct().size)
            assertEquals((first+second).sortedWith(AuralCatalog.rowOrder).map { it.target.id },(first+second).map { it.target.id })
            val ranked=SystemClock.elapsedRealtime()
            var prepared=0
            for(row in first.take(4)) {
                val p=row.target
                assertEquals(p.id,catalog.lookup(p.tokens,p.view)?.id)
                val songs=catalog.songs(p)
                assertEquals(row.songs,songs.size)
                assertEquals(songs.size,songs.map { it.id }.distinct().size)
                assertTrue(songs.zipWithNext().all { (a,b) -> (a.popularityScore ?: -1.0) >= (b.popularityScore ?: -1.0) })
                assertTrue(songs.any { it.popularityScore!=null })
                songs.forEach { song -> assertEquals(catalog.popularity[song.id]?.score,song.popularityScore) }
                val selectedSong=songs.last()
                val selectedPassage=catalog.passage(p,settings,AuralSelectionContext(),0,p.id,selectedSong.id)
                assertEquals(selectedSong.id,selectedPassage.songId)
                assertTrue(catalog.playback(selectedPassage,wholeSong=true).sections.containsKey(selectedPassage.sectionId))
                assertThrows(IllegalArgumentException::class.java) { catalog.passage(p,settings,AuralSelectionContext(),0,p.id,"not-a-song") }
                val passage=catalog.passage(p,settings,AuralSelectionContext(),42,p.id)
                val source=catalog.playback(passage)
                assertEquals(passage.sectionId,source.sectionId)
                assertTrue(source.section.chords.size>passage.endIndex)
                assertTrue(source.endBeat>source.startBeat)
                for(skill in listOf("identify","recall","complete","audiate","reproduce")) {
                    val base=AuralCurriculum.generate(AuralTarget(p.id,skill,pattern=p,variantId=p.id,octaveShift=1),42)
                    val ex=auralWithCorpus(base,AuralCorpusProvenance(catalog.snapshotId,null,"structural-patterns-1",passage,settings,seed=42,semitoneShift=12))
                    assertEquals(p.labels,ex.fullDegrees); assertEquals(p.tokens.size,ex.events.size); prepared++
                }
                if(row.length>2) assertTrue(catalog.children(p,settings,emptyList(),emptySet()).all {
                    it.length < row.length && !auralReduceLoop(it.target.tokens).redundant &&
                        p.tokens.windowed(it.length).contains(it.target.tokens)
                })
            }
            Log.i("AuralCatalogValidation","loadMs=${loaded-started} rank20Ms=${ranked-loaded} prepared=$prepared totalMs=${SystemClock.elapsedRealtime()-started}")
        }
    }

    @Test fun loopReductionFiltersPagesAndPreservesOriginalLookup() {
        val context=ApplicationProvider.getApplicationContext<Context>()
        val file=File(context.filesDir,"aural-catalog.db")
        AuralCatalog(file).use { catalog ->
            val settings=AuralExampleSettings()
            val started=SystemClock.elapsedRealtime()
            val group=requireNotNull(catalog.groupedBuckets(settings)[4]?.firstOrNull {
                it.degree==1 && it.accidental.isEmpty() && it.quality=="major" && it.seventhQuality=="none"
            })
            val discovered=SystemClock.elapsedRealtime()
            val rank=catalog.Ranking(settings,emptyList(),emptySet(),4,4,startGroup=group.id)
            try {
                val first=rank.page(30)
                val opened=SystemClock.elapsedRealtime()
                val rows=first+rank.page(30)
                Log.i("AuralLoopValidation","groupsMs=${discovered-started} firstPageMs=${opened-discovered} secondPageMs=${SystemClock.elapsedRealtime()-opened} snapshot=${catalog.snapshotId}")
                assertEquals(60,rows.size)
                assertEquals(60,rows.map { it.target.id }.distinct().size)
                assertTrue(rows.all { !auralReduceLoop(it.target.tokens).redundant })
                assertEquals(rows.sortedWith(AuralCatalog.rowOrder),rows)
            } finally { rank.close() }
            var repeated:List<String>?=null
            android.database.sqlite.SQLiteDatabase.openDatabase(file.path,null,android.database.sqlite.SQLiteDatabase.OPEN_READONLY).use { db ->
                db.rawQuery("SELECT tokens FROM catalog_run WHERE view=?",arrayOf(settings.catalogView())).use { cursor ->
                    while(repeated==null && cursor.moveToNext()) {
                        val raw=java.util.zip.GZIPInputStream(cursor.getBlob(0).inputStream()).bufferedReader().use { it.readText() }
                        val tokens=kotlinx.serialization.json.Json.decodeFromString<List<String>>(raw)
                        repeated=tokens.windowed(4).firstOrNull { auralReduceLoop(it).redundant }
                    }
                }
            }
            val tokens=requireNotNull(repeated)
            val original=requireNotNull(catalog.lookup(tokens,settings.catalogView()))
            val reduction=auralReduceLoop(tokens)
            val representative=requireNotNull(catalog.lookup(tokens.subList(reduction.start,reduction.start+reduction.length),settings.catalogView()))
            assertFalse(auralReduceLoop(representative.tokens).redundant)
            assertTrue(catalog.songs(representative).map { it.id }.containsAll(catalog.songs(original).map { it.id }))
            assertTrue(catalog.children(original,settings,emptyList(),emptySet()).all { !auralReduceLoop(it.target.tokens).redundant })
        }
    }
}
