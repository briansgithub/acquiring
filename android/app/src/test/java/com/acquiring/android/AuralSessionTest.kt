package com.acquiring.android

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class AuralSessionTest {
    private class MemoryStore(var raw: String? = null, var writable: Boolean = true) : AuralPersistence {
        override fun read() = raw
        override fun write(value: String): Boolean { if (writable) raw = value; return writable }
    }
    private fun session(store: MemoryStore = MemoryStore()) = AuralSession(store, clock = { 1_000L }, seedFor = { it * 991L })

    @Test fun cannotSubmitBeforeHearingOrSubmitTwice() {
        val lesson = session()
        lesson.next(); lesson.submit(emptyList())
        assertFalse(lesson.view().answered)
        lesson.played(); lesson.submit(emptyList())
        assertTrue(lesson.view().answered)
        val progress = lesson.view().progress
        lesson.submit(emptyList())
        assertEquals(progress, lesson.view().progress)
    }

    @Test fun retryRemainsSupportedAndDoesNotAdvanceWithoutAnotherListen() {
        val lesson = session()
        lesson.next(); lesson.played(); lesson.submit(emptyList()); lesson.retry()
        assertTrue(lesson.view().supported)
        assertFalse(lesson.view().heard)
        lesson.submit(emptyList())
        assertFalse(lesson.view().answered)
    }

    @Test fun technicalUncertaintyChangesNoEvidence() {
        val lesson = session(); lesson.next(); lesson.played()
        val before = lesson.view().progress
        lesson.technical("Unclear pitch; try again")
        assertEquals(before, lesson.view().progress)
        assertFalse(lesson.view().answered)
    }

    @Test fun interruptionRequiresNewPlaybackAndLeavesUnassistedEvidenceUntouched() {
        val lesson = session(); lesson.next(); lesson.played()
        val before = lesson.view().progress
        lesson.interrupted()
        assertFalse(lesson.view().heard)
        assertTrue(lesson.view().supported)
        assertEquals(before, lesson.view().progress)
    }

    @Test fun exposurePersistsBeforeAnswerAndResumeCannotClaimFreshness() {
        val store = MemoryStore()
        val first = session(store); first.next()
        assertEquals(1, first.view().progress.exposures.size)
        val restored = session(store)
        assertEquals(first.view().exercise!!.seed, restored.view().exercise!!.seed)
        assertTrue(restored.view().exercise!!.previouslyExposed)
        assertTrue(restored.view().supported)
        assertFalse(restored.view().heard)
    }

    @Test fun selectedProgressionPersistsAndHelpFadesWithoutIndependentCredit() {
        val store = MemoryStore()
        val lesson = session(store)
        repeat(6) { n ->
            lesson.practice("predominant-cadence", "recall", variantId = "departure")
            val exercise = lesson.view().exercise!!
            assertEquals(listOf("I", "ii", "V", "I"), exercise.fullDegrees)
            assertEquals(if (n < 2) 2 else if (n < 4) 1 else 0, exercise.support)
            assertTrue(lesson.view().supported)
            lesson.played(); lesson.submit(exercise.answer.degrees)
        }
        val restored = session(store).view()
        assertEquals("departure", restored.exercise!!.provenance.target.variantId)
        assertEquals(lesson.view().exercise!!.events, restored.exercise.events)
        assertEquals(0, restored.progress.cells.values.sumOf { it.independentAttempts })
        assertEquals(6, restored.progress.cells.values.sumOf { it.practiceCorrect })
    }

    @Test fun microphonePreferenceDoesNotChangeExplicitSingingPractice() {
        val lesson = session()
        lesson.practice("dominant-return", "reproduce", "bass", "departure")
        val exercise = lesson.view().exercise
        lesson.setMicrophonePreference(false)
        assertFalse(lesson.view().microphoneEnabled)
        assertEquals(exercise, lesson.view().exercise)
    }

    @Test fun invalidPendingGeneratorDoesNotEraseValidProgress() {
        val store = MemoryStore()
        val lesson = session(store); lesson.next(); lesson.played(); lesson.submit(emptyList())
        val saved = Json.decodeFromString<AuralSavedSession>(store.raw!!)
        store.raw = Json.encodeToString(saved.copy(current = saved.current!!.copy(generatorVersion = "obsolete")))
        val restored = session(store).view()
        assertNull(restored.exercise)
        assertEquals(saved.progress, restored.progress)
        assertTrue(restored.storageWarning.contains("kept"))
    }

    @Test fun corruptStorageAndFailedWritesRemainUsable() {
        val store = MemoryStore("not-json", writable = false)
        val lesson = session(store)
        assertTrue(lesson.view().storageWarning.isNotEmpty())
        lesson.next(); lesson.played(); lesson.submit(emptyList())
        assertTrue(lesson.view().answered)
        assertTrue(lesson.view().storageWarning.contains("could not be saved"))
    }

    @Test fun microphonePreferencePersistsWithoutAwardingReproduction() {
        val store = MemoryStore()
        val lesson = session(store); lesson.enableMicrophone(false)
        val restored = session(store).view()
        assertFalse(restored.microphoneEnabled)
        assertTrue(restored.progress.cells.isEmpty())
    }

    @Test fun malformedPendingPayloadKeepsValidEvidence() {
        val store = MemoryStore()
        val lesson = session(store); lesson.next(); lesson.played(); lesson.submit(emptyList())
        val progress = lesson.view().progress
        val envelope = Json.parseToJsonElement(store.raw!!).jsonObject
        store.raw = JsonObject(envelope + ("current" to JsonPrimitive("invalid example"))).toString()
        val restored = session(store).view()
        assertNull(restored.exercise)
        assertEquals(progress, restored.progress)
    }

    @Test fun explorationIsSupportedAndPreservesMicrophoneSubtypeOnRestart() {
        val store = MemoryStore()
        val lesson = session(store)
        lesson.practice("secondary-dominant", "reproduce", "rootSequence")
        assertEquals("rootSequence", lesson.view().exercise!!.microphoneTask!!.kind)
        assertTrue(lesson.view().supported)
        lesson.played(); lesson.grade(true)
        assertEquals(0, lesson.view().progress.cells.values.sumOf { it.independentCorrect })
        assertEquals("rootSequence", session(store).view().exercise!!.microphoneTask!!.kind)
    }

    @Test fun supportFadesFromFullModelToStartingCueToNoAnswerMaterial() {
        val views = (2 downTo 0).map { support ->
            val exercise = AuralCurriculum.generate(AuralTarget("dominant-return", "recall", support), 42L)
            auralQuestionPresentation(AuralLessonView(exercise, AuralProgress(), false, false, support == 2, support > 0, true, "", ""))
        }
        assertTrue(views[0].guidance!!.contains("→"))
        assertTrue(views[1].guidance!!.contains("starting cue"))
        assertFalse(views[1].guidance!!.contains("→"))
        assertNull(views[2].guidance)
    }

    @Test fun unsupportedQuestionPresentationContainsNoGuidanceOrFamilyName() {
        for (family in AuralCurriculum.families) for (skill in AuralCurriculum.skills.filter { it.id != "guided" }) {
            val exercise = AuralCurriculum.generate(AuralTarget(family.id, skill.id, support = 0), 31L)
            val view = AuralLessonView(exercise, AuralProgress(), true, false, false, false, true, "", "")
            val visible = auralQuestionPresentation(view)
            assertNull("${family.id}/${skill.id} exposed guidance", visible.guidance)
            assertFalse(visible.title.contains(family.label))
            assertFalse(visible.prompt.contains(exercise.fullDegrees.joinToString(" → ")))
            assertNotNull(auralQuestionPresentation(view.copy(guidanceVisible = true)).guidance)
        }
    }

    @Test fun missingHarmonyPromptKeepsReferenceAndSilentGapDuration() {
        for (skill in listOf("complete", "audiate")) {
            val exercise = AuralCurriculum.generate(AuralTarget(AuralCurriculum.families.first().id, skill, 0), 99L)
            val prompt = auralPromptEvents(exercise)
            val originalStart = exercise.context.size + 1
            assertEquals(exercise.events, prompt.subList(originalStart, originalStart + exercise.events.size))
            val maskedStart = originalStart + exercise.events.size + 1
            val gap = exercise.gapIndex!!
            assertTrue(prompt[maskedStart + gap].notes.isEmpty())
            assertEquals(exercise.events[gap].beats, prompt[maskedStart + gap].beats, 0.0)
            exercise.events.indices.filter { it != gap }.forEach { index ->
                assertEquals(exercise.events[index], prompt[maskedStart + index])
            }
        }
    }
}
