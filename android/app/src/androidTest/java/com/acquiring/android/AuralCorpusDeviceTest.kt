package com.acquiring.android

import android.content.Context
import android.os.SystemClock
import android.util.Log
import androidx.test.core.app.ApplicationProvider
import androidx.compose.ui.test.junit4.createComposeRule
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.io.File

/** Run after provisioning the immutable offline runtime.db as files/aural-corpus.db. */
class AuralCorpusDeviceTest {
    // A separate foreground test activity obtains audio focus without entering user quiz state.
    @get:Rule val compose = createComposeRule()

    @Test(timeout = 45_000) fun installedCorpusPassagePlaysThroughNativeOutput() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val file = File(context.filesDir, "aural-corpus.db")
        assertTrue("Install the runtime snapshot before this integration test", file.isFile)
        compose.setContent { androidx.compose.material3.Text("Corpus playback validation") }
        AppAudioOutput.initialize(context)
        val provider = SqliteAuralExampleProvider(file)
        val target = AuralTarget("dominant-return", "identify", support = 0, transfer = true,
            variantId = "direct", instrumentOverride = "CLARINET", octaveShift = 1)
        val candidates = (1L..96L).asSequence()
            .map { AuralCurriculum.generate(target, (it * 2654435761L) and 0xffffffffL) }
            .filter { it.tempo == 96 }.take(12)
            .mapNotNull { base -> provider.example(base, AuralExampleSettings(), AuralSelectionContext())?.let { auralWithCorpus(base, it) } }
            .toList()
        val exercise = requireNotNull(candidates.minByOrNull { auralPromptEvents(it).sumOf { event -> event.beats } }) {
            "The installed snapshot must supply a direct dominant-return example"
        }
        val events = auralPromptEvents(exercise)
        val duration = auralPlaybackPlan(events, exercise.tempo.toDouble(), AppAudioOutput.sampleRate).durationMs
        assertTrue("Use a short corpus example for the native playback test", duration <= 10_000)
        assertEquals(listOf("V", "I"), exercise.fullDegrees)
        assertNotNull(exercise.provenance.corpus)
        val audio = AuralAudio(context)
        var started = false
        var completed = false
        try {
            runBlocking {
                withTimeout(20_000) {
                    audio.play(events, exercise.tempo, exercise.instrument,
                        exposureStartBeat = exercise.context.sumOf { it.beats } + .75) {
                        assertFalse("Exposure callback must run once", started)
                        started = true
                    }
                    completed = true
                }
            }
        } finally { audio.dispose() }
        assertTrue("The output head must reach the actual corpus passage", started)
        assertTrue("Native output must reach the end of the passage", completed)
        Log.i("AuralCorpusValidation", "nativePlaybackCompleted=true durationMs=${duration.toLong()} tempo=${exercise.tempo}")
    }

    @Test fun installedSnapshotServesValidatedPassagesInBothViews() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val file = File(context.filesDir, "aural-corpus.db")
        assertTrue("Install the runtime snapshot before this integration test", file.isFile)
        val provider = SqliteAuralExampleProvider(file)
        val elapsed = mutableListOf<Long>()
        for (bassSensitive in listOf(false, true)) {
            var served = 0
            val settings = AuralExampleSettings(distinguishInversions = bassSensitive)
            AuralCurriculum.families.forEach { family -> family.variants.forEach { variant ->
                val base = AuralCurriculum.generate(AuralTarget(family.id, "reproduce", variantId = variant.id,
                    microphoneKind = "bass", octaveShift = 1), 12345)
                val started = SystemClock.elapsedRealtime()
                val source = provider.example(base, settings, AuralSelectionContext())
                elapsed += SystemClock.elapsedRealtime() - started
                if (source != null) {
                    val exercise = auralWithCorpus(base, source)
                    assertEquals(variant.degrees, exercise.fullDegrees)
                    assertEquals(source.passage.events.map { it.bassMidi + 12 }, exercise.events.map { it.bassMidi })
                    assertEquals(source.passage.events.map { it.beats }, exercise.events.map { it.beats })
                    assertNotNull(exercise.provenance.corpus)
                    served++
                }
            } }
            assertTrue("The installed index must supply examples in both musical views", served > 0)
            Log.i("AuralCorpusValidation", "view=$bassSensitive served=$served targets=15")
        }
        Log.i("AuralCorpusValidation", "queries=${elapsed.size} maxMs=${elapsed.maxOrNull()} medianMs=${elapsed.sorted()[elapsed.size / 2]}")
    }
}
