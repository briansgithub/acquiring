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
import org.junit.Rule
import kotlinx.coroutines.runBlocking
import androidx.test.espresso.Espresso
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.unit.dp

class AuralCatalogDeviceTest {
    @get:Rule val compose=createComposeRule()
    private class Store:AuralPersistence { var raw:String?=null; override fun read()=raw;override fun write(value:String):Boolean { raw=value;return true } }
    @Test fun outlineExpansionHasLargeTargetsAndStableSiblingNumbers() {
        val context=ApplicationProvider.getApplicationContext<Context>()
        AuralCatalog(File(context.filesDir,"aural-catalog.db")).use { catalog ->
            compose.setContent { androidx.compose.material3.MaterialTheme {
                AuralCatalogScreen(catalog,AuralExampleSettings(),AuralSession(Store()),{}, {},null)
            } }
            compose.waitUntil(30_000) { compose.onAllNodesWithTag("AuralExpand-1").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithTag("AuralExpand-1").assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp).performClick()
            compose.waitUntil(30_000) { compose.onAllNodesWithTag("AuralOutline-1.1").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithTag("AuralOutline-1.1").assertTextEquals("1.1")
            compose.onNodeWithTag("AuralExpand-1").performClick()
            compose.onNodeWithTag("AuralOutline-1.1").assertDoesNotExist()
            compose.onNodeWithTag("AuralOutline-2").assertTextEquals("2")
        }
    }
    @Test fun alphabeticalSongsReturnToTheirScrollPositionAndKeepTheQuizDraft() {
        val context=ApplicationProvider.getApplicationContext<Context>(); AppAudioOutput.initialize(context)
        val session=AuralSession(Store(),seedFor={it})
        AuralCatalog(File(context.filesDir,"aural-catalog.db")).use { catalog ->
            val target=catalog.Ranking(AuralExampleSettings(),emptyList(),emptySet(),minLength=3,maxLength=3).page(1).single().target
            runBlocking { session.practicePattern(target,catalog,"recall") }
        }
        compose.setContent { androidx.compose.material3.MaterialTheme { AuralQuizScreen({},session,playExample={}) } }
        compose.onNodeWithTag("AuralContinue").performClick()
        compose.onNodeWithTag("AuralListen").performScrollTo().performClick()
        val exercise=session.view().exercise!!;val degree=exercise.answer.degrees.first()
        compose.onNodeWithTag("AuralDegree-$degree").performScrollTo().performClick()
        compose.onNodeWithTag("AuralMode-songs").performClick()
        val songMatcher=SemanticsMatcher("song row") { it.config.getOrNull(SemanticsProperties.TestTag)?.startsWith("AuralSong-")==true }
        compose.waitUntil(30_000) { compose.onAllNodes(songMatcher).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("AuralSongsList").performScrollToIndex(8)
        val chosen=compose.onAllNodes(songMatcher).fetchSemanticsNodes().first().config[SemanticsProperties.TestTag]
        compose.onNodeWithTag(chosen).performClick()
        compose.waitUntil(30_000) { compose.onAllNodesWithTag("AuralReturnFromPlayback").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("← Return to songs").assertExists()
        compose.onNodeWithTag("PlaybackScreen").assertExists()
        Espresso.pressBack()
        compose.waitUntil(30_000) { compose.onAllNodesWithTag(chosen).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag(chosen).assertIsDisplayed()
        compose.onNodeWithTag("AuralMode-songs").assertIsSelected()
        compose.onNodeWithTag("AuralMode-recall").performClick()
        compose.onNodeWithTag("AuralEntered").performScrollTo().assertTextEquals(degree)
        assertEquals(exercise.id,session.view().exercise!!.id)
        assertTrue(session.view().supported)
    }
    @Test fun sourcePlaybackReturnsToSameQuestionAndDraft() {
        val context=ApplicationProvider.getApplicationContext<Context>(); AppAudioOutput.initialize(context)
        val session=AuralSession(Store(),seedFor={it})
        AuralCatalog(File(context.filesDir,"aural-catalog.db")).use { catalog ->
            val target=catalog.Ranking(AuralExampleSettings(),emptyList(),emptySet(),minLength=3,maxLength=3).page(1).single().target
            runBlocking { session.practicePattern(target,catalog,"recall") }
        }
        compose.setContent { androidx.compose.material3.MaterialTheme { AuralQuizScreen({},session,playExample={}) } }
        compose.onNodeWithTag("AuralContinue").performClick()
        compose.onNodeWithTag("AuralSource").assertExists()
        compose.onNodeWithTag("AuralListen").performScrollTo().performClick()
        val exercise=session.view().exercise!!;val degree=exercise.answer.degrees.first()
        compose.onNodeWithTag("AuralDegree-$degree").performScrollTo().performClick()
        compose.waitUntil(30_000) { compose.onAllNodesWithTag("AuralOpenPlayback").fetchSemanticsNodes().isNotEmpty() && runCatching { compose.onNodeWithTag("AuralOpenPlayback").assertIsEnabled() }.isSuccess }
        compose.onNodeWithTag("AuralOpenPlayback").performScrollTo().performClick()
        compose.waitUntil(30_000) { compose.onAllNodesWithTag("AuralReturnFromPlayback").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("PlaybackScreen").assertExists()
        compose.onNodeWithTag("AuralReturnFromPlayback").performClick()
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
                assertEquals(songs.map { it.title.lowercase(java.util.Locale.ROOT) },songs.map { it.title.lowercase(java.util.Locale.ROOT) }.sorted())
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
                if(row.length>2) assertTrue(catalog.children(p,settings,emptyList(),emptySet()).all { it.length==row.length-1 })
            }
            Log.i("AuralCatalogValidation","loadMs=${loaded-started} rank20Ms=${ranked-loaded} prepared=$prepared totalMs=${SystemClock.elapsedRealtime()-started}")
        }
    }
}
