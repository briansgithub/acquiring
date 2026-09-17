package com.acquiring.android

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class AuralCorpusSessionTest {
    private class Store(var raw: String? = null) : AuralPersistence {
        override fun read() = raw
        override fun write(value: String): Boolean { raw = value; return true }
    }
    private val provider = object : AuralExampleProvider {
        override fun example(base: AuralExercise, settings: AuralExampleSettings, context: AuralSelectionContext): AuralCorpusProvenance {
            val source = corpusFixture(base, settings)
            return source.copy(familiar = AuralExposureIndex(context.heardSourceIds).contains(source.passage.sourceId))
        }
    }
    private fun session(store: Store = Store(), provider: AuralExampleProvider? = this.provider) =
        AuralSession(store, clock = { 1234L }, seedFor = { it * 1234567 }, exampleProvider = provider)

    @Test fun sourceExposureRecordsActualListeningAndSurvivesChangedInstrumentsViewsAndSeeds() {
        val store = Store()
        val lesson = session(store)
        lesson.practice("dominant-return", "recall", variantId = "departure")
        assertFalse(lesson.view().exercise!!.previouslyExposed)
        lesson.practice("dominant-return", "recall", variantId = "departure")
        assertFalse(lesson.view().exercise!!.previouslyExposed) // generated but never heard
        lesson.listeningStarted()
        lesson.interrupted()
        lesson.setExampleSettings(AuralExampleSettings(distinguishInversions = true))
        lesson.setInstrument(AudioEngine.Waveform.FLUTE)
        lesson.practice("dominant-return", "recall", variantId = "departure")
        assertTrue(lesson.view().exercise!!.previouslyExposed)
        assertTrue(lesson.view().supported)
        assertEquals("harmony_bass", lesson.view().exercise!!.provenance.corpus!!.passage.view)
        val restored = session(store, null)
        assertEquals(lesson.view().exercise!!.events, restored.view().exercise!!.events)
        assertTrue(restored.view().exercise!!.previouslyExposed)
    }
    @Test fun restoreUsesFrozenSourceAndRecomputesPitchAnswersEvenWithoutDatabase() {
        val store = Store()
        val lesson = session(store)
        lesson.practice("dominant-return", "reproduce", microphoneKind = "bass", variantId = "departure")
        val original = lesson.view().exercise!!
        // Saved answer corruption is ignored; validated source notes are the authority.
        val saved = Json.decodeFromString<AuralSavedSession>(store.raw!!)
        store.raw = Json.encodeToString(saved.copy(current = original.copy(answer = original.answer.copy(targetMidis = listOf(1)))))
        val restored = session(store, null).view().exercise!!
        assertEquals(original.events, restored.events)
        assertEquals(original.answer, restored.answer)
        assertEquals(original.provenance.corpus, restored.provenance.corpus)
        assertEquals(original.provenance.exampleSettings, restored.provenance.exampleSettings)
        assertEquals(original.tempo, restored.tempo)
        assertEquals(original.tempo, original.provenance.corpus!!.playbackTempo)
    }

    @Test fun hearingLongerPassageMakesItsContainedShorterPassageSupported() {
        val provider = object : AuralExampleProvider {
            override fun example(base: AuralExercise, settings: AuralExampleSettings, context: AuralSelectionContext): AuralCorpusProvenance {
                val source = corpusFixture(base, settings, sourceStart = if (base.variantId == "direct") 3 else 2)
                return source.copy(familiar = AuralExposureIndex(context.heardSourceIds).contains(source.passage.sourceId))
            }
        }
        val lesson = session(provider = provider)
        lesson.practice("dominant-return", "recall", variantId = "departure") // [2,4)
        lesson.played()
        lesson.setExampleSettings(AuralExampleSettings(distinguishInversions = true))
        lesson.practice("dominant-return", "identify", variantId = "direct") // [3,4)
        assertTrue(lesson.view().exercise!!.previouslyExposed)
        assertTrue(lesson.view().supported)
    }
    @Test fun changesApplyNextExerciseAndEvidenceStaysInItsOriginalInversionView() {
        val store = Store()
        val lesson = session(store)
        lesson.practice("dominant-return", "recall", variantId = "departure")
        val original = lesson.view().exercise!!
        lesson.setExampleSettings(AuralExampleSettings(distinguishInversions = true, variety = false, favorites = true))
        assertEquals(original, lesson.view().exercise)
        lesson.played(); lesson.submit(original.answer.degrees)
        var saved = Json.decodeFromString<AuralSavedSession>(store.raw!!)
        assertEquals(1, saved.progress.attempts)
        assertEquals(0, saved.inversionProgress.attempts)
        lesson.practice("dominant-return", "recall", variantId = "departure")
        val inverted = lesson.view().exercise!!
        assertTrue(inverted.provenance.exampleSettings!!.distinguishInversions)
        assertFalse(inverted.provenance.exampleSettings!!.popularity) // unavailable data
        assertFalse(inverted.provenance.exampleSettings!!.variety)
        lesson.played(); lesson.submit(inverted.answer.degrees)
        saved = Json.decodeFromString<AuralSavedSession>(store.raw!!)
        assertEquals(1, saved.progress.attempts)
        assertEquals(1, saved.inversionProgress.attempts)
    }
    @Test fun badProviderOrMusicalPayloadFallsBackWithoutChangingTarget() {
        val provider = object : AuralExampleProvider {
            override fun example(base: AuralExercise, settings: AuralExampleSettings, context: AuralSelectionContext): AuralCorpusProvenance {
                val p = corpusFixture(base, settings)
                return p.copy(passage = p.passage.copy(familyId = "wrong-family"))
            }
        }
        val lesson = session(provider = provider)
        lesson.practice("dominant-return", "recall", variantId = "departure")
        val ex = lesson.view().exercise!!
        assertEquals("dominant-return", ex.familyId)
        assertEquals("departure", ex.variantId)
        assertEquals("recall", ex.skillId)
        assertNull(ex.provenance.corpus)
        assertNotNull(ex.provenance.fallbackReason)
    }
}
