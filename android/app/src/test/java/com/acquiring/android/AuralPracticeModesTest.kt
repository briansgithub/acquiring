package com.acquiring.android

import org.junit.Assert.*
import org.junit.Test

class AuralPracticeModesTest {
    private class Store : AuralPersistence {
        var raw: String? = null
        override fun read() = raw
        override fun write(value: String): Boolean { raw = value; return true }
    }
    private fun answer(lesson: AuralSession, correct: Boolean = true) {
        lesson.played(); lesson.grade(correct)
    }

    @Test fun everyExistingSkillMapsIntoExactlyThreeModesWithoutChangingSavedIds() {
        assertEquals(listOf("recognize", "recall", "sing"), AuralPracticeModes.modes.map { it.id })
        assertEquals("recognize", AuralPracticeModes.forSkill("guided").id)
        for (skill in AuralCurriculum.skills.filter { it.id != "guided" }) {
            assertEquals(1, AuralPracticeModes.modes.count { skill.id in it.skills })
        }
    }

    @Test fun recognizeIntroducesProgressionThenFadesComparisonHelpAndAddsIdentification() {
        val lesson = AuralSession(Store(), seedFor = { it })
        val skills = mutableListOf<String>()
        val supports = mutableListOf<Int>()
        repeat(7) {
            lesson.practiceMode("dominant-return", "departure", "recognize")
            skills += lesson.view().exercise!!.skillId
            supports += lesson.view().exercise!!.support
            answer(lesson)
        }
        assertEquals(listOf("guided", "compare", "compare", "compare", "compare", "identify", "identify"), skills)
        assertEquals(listOf(2, 2, 2, 1, 1, 2, 2), supports)
        assertEquals(0, lesson.view().progress.cells.values.sumOf { it.independentAttempts })
        assertEquals(setOf("dominant-return:guided", "dominant-return:compare", "dominant-return:identify"), lesson.view().progress.cells.keys)
    }

    @Test fun recallBuildsThreeSkillsThenReviewsAllOfThemAndResumesItsPendingActivity() {
        val store = Store()
        val lesson = AuralSession(store, seedFor = { it })
        val skills = mutableListOf<String>()
        repeat(18) {
            lesson.practiceMode("predominant-cadence", "departure", "recall")
            skills += lesson.view().exercise!!.skillId
            assertEquals("departure", lesson.view().exercise!!.variantId)
            answer(lesson)
        }
        assertEquals(List(4) { "recall" } + List(4) { "complete" } + List(4) { "audiate" }, skills.take(12))
        assertEquals(listOf("recall", "complete", "audiate", "recall", "complete", "audiate"), skills.drop(12))
        val restored = AuralSession(store).view()
        assertEquals("audiate", restored.exercise!!.skillId)
        assertEquals(lesson.view().progress, restored.progress)
        assertEquals(3, restored.progress.cells.size)
        assertEquals(0, restored.progress.cells.values.sumOf { it.independentAttempts })
    }

    @Test fun failedActivityGetsAnotherSupportedAttemptInsteadOfBeingSkipped() {
        val lesson = AuralSession(Store(), seedFor = { it })
        repeat(4) { lesson.practiceMode("dominant-return", "direct", "recall"); answer(lesson) }
        lesson.practiceMode("dominant-return", "direct", "recall")
        assertEquals("complete", lesson.view().exercise!!.skillId)
        answer(lesson, false)
        lesson.practiceMode("dominant-return", "direct", "recall")
        assertEquals("complete", lesson.view().exercise!!.skillId)
        assertEquals(2, lesson.view().exercise!!.support)
        assertTrue(lesson.view().supported)
    }

    @Test fun singCyclesKindsButSupportsAnExplicitTaskAndRetriesErrors() {
        val lesson = AuralSession(Store(), seedFor = { it })
        val kinds = mutableListOf<String>()
        repeat(4) {
            lesson.practiceMode("dominant-return", "departure", "sing")
            kinds += lesson.view().exercise!!.microphoneTask!!.kind
            answer(lesson)
        }
        assertEquals(AuralCurriculum.microphoneKinds, kinds)
        lesson.practiceMode("dominant-return", "departure", "sing", "bass")
        assertEquals("bass", lesson.view().exercise!!.microphoneTask!!.kind)
        answer(lesson, false)
        lesson.practiceMode("dominant-return", "departure", "sing")
        assertEquals("bass", lesson.view().exercise!!.microphoneTask!!.kind)
        assertEquals(0, lesson.view().progress.cells.values.sumOf { it.independentAttempts })
    }

    @Test fun invalidModeDoesNotReplacePendingExerciseOrProgress() {
        val lesson = AuralSession(Store(), seedFor = { it })
        lesson.practiceMode("dominant-return", "direct", "recall")
        val before = lesson.view()
        assertThrows(IllegalArgumentException::class.java) { lesson.practiceMode("dominant-return", "direct", "missing") }
        assertEquals(before, lesson.view())
    }

    @Test fun consolidatedBadgeRequiresEachUnderlyingSkillRatherThanOneStrongScore() {
        val ready = AuralCell(independentAttempts = 6, independentCorrect = 6, transferCorrect = 2,
            keys = listOf("C", "G", "F"), recentIndependent = List(6) { true })
        val mode = AuralPracticeModes.forSkill("recall")
        val partial = AuralProgress(cells = mapOf("dominant-return:recall" to ready))
        assertTrue(AuralCurriculum.cell(partial, "dominant-return", "recall").mastered)
        assertFalse(AuralPracticeModes.mastered(partial, "dominant-return", mode))
        val complete = partial.copy(cells = mode.skills.associate { "dominant-return:$it" to ready })
        assertTrue(AuralPracticeModes.mastered(complete, "dominant-return", mode))
        assertFalse(AuralPracticeModes.mastered(complete, "dominant-return", AuralPracticeModes.forSkill("identify")))
    }
}
