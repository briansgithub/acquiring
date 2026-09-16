package com.acquiring.android

import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class AuralCurriculumTest {
    private fun generated(skill: String = "compare", seed: Long = 1, support: Int = 0, family: String = "dominant-return", transfer: Boolean = false) =
        AuralCurriculum.generate(AuralTarget(family, skill, support, transfer), seed)
    private fun cell(p: AuralProgress, skill: String = "compare", family: String = "dominant-return") = AuralCurriculum.cell(p, family, skill)
    private fun train(input: AuralProgress, skill: String, count: Int, support: Int = 0, transfer: Boolean = false, correct: Boolean = true): AuralProgress {
        var progress = input
        repeat(count) { i -> progress = AuralCurriculum.record(progress, generated(skill, progress.attempts * 57L + i, support, transfer = transfer), correct, now = 1000L + progress.attempts) }
        return progress
    }
    private fun pc(n: Int) = ((n % 12) + 12) % 12

    @Test fun everyChordHasCorrectFunctionAndPitchClassesAcrossKeysAndInversions() {
        val intervals = listOf(0, 2, 4, 5, 7, 9, 11)
        for (family in AuralCurriculum.families) repeat(30) { seed ->
            val ex = generated("identify", seed.toLong(), family = family.id, transfer = seed % 2 == 0)
            val tonic = MusicTheory.NOTE_TO_PC.getValue(ex.keyTonic)
            for (event in ex.events + ex.context) {
                val root = pc(tonic + if (event.degree == "V/V") 2 else intervals[AuralCurriculum.degrees.indexOf(event.degree)])
                val quality = when (event.degree) { "I", "IV", "V", "V/V" -> listOf(0, 4, 7); "vii°" -> listOf(0, 3, 6); else -> listOf(0, 3, 7) }
                assertEquals(root, pc(event.rootMidi))
                assertEquals(quality, event.notes.map { pc(it - root) }.distinct().sorted())
                assertEquals(event.notes.min(), event.bassMidi)
                assertTrue(event.notes.all { it in 24..108 })
            }
        }
    }

    @Test fun seedAndSerializedProvenanceReconstructExercise() {
        for (skill in AuralCurriculum.skills) {
            val ex = generated(skill.id, 128)
            assertEquals(ex, generated(skill.id, 128))
            assertEquals(ex, Json.decodeFromString<AuralExercise>(Json.encodeToString(ex)))
            assertEquals(ex, AuralCurriculum.generate(ex.provenance.target, ex.provenance.seed))
            val recorded = AuralCurriculum.record(AuralProgress(), ex, true).recent.last()
            assertEquals(ex, AuralCurriculum.generate(AuralTarget(recorded.familyId, recorded.skillId, recorded.support, recorded.transfer, microphoneKind = recorded.microphoneKind), recorded.seed))
        }
        val targeted = AuralCurriculum.generate(AuralTarget("dominant-return", "reproduce", 1, microphoneKind = "rootSequence"), 811)
        val entry = AuralCurriculum.record(AuralProgress(), targeted, true).recent.last()
        assertEquals(targeted, AuralCurriculum.generate(AuralTarget(entry.familyId, entry.skillId, entry.support, entry.transfer, microphoneKind = entry.microphoneKind), entry.seed))
    }

    @Test fun variationGraduallyBroadensWhileAlternativesStaySameLength() {
        val beginning = mutableSetOf<String>(); val advanced = mutableSetOf<String>(); val timbres = mutableSetOf<String>(); val inverted = mutableSetOf<Boolean>()
        repeat(120) { seed ->
            val early = generated(seed = seed.toLong(), support = 2)
            val late = generated("identify", seed.toLong(), transfer = true)
            beginning.add(early.keyTonic); advanced.add(late.keyTonic); timbres.add(late.instrument)
            assertTrue(early.events.all { pc(it.rootMidi) == pc(it.bassMidi) })
            late.events.forEach { inverted.add(pc(it.rootMidi) != pc(it.bassMidi)) }
            assertTrue(late.options.all { it.degrees.size == late.events.size })
            assertEquals(late.options.size, late.options.map { it.degrees }.distinct().size)
            assertEquals(1, late.options.count { it.id == late.answer.optionId })
        }
        assertEquals(3, beginning.size); assertEquals(12, advanced.size); assertEquals(3, timbres.size); assertTrue(true in inverted)
    }

    @Test fun promptsAndOptionIdentifiersDoNotRevealAnswers() {
        for (skill in AuralCurriculum.skills) {
            val ex = generated(skill.id, 772)
            assertFalse(ex.prompt.contains(ex.fullDegrees.joinToString(" → ")))
            assertFalse(ex.prompt.contains(AuralCurriculum.families.first().label))
            assertTrue(ex.options.all { it.id.matches(Regex("option-\\d+")) })
        }
    }

    @Test fun missingHarmonyIsExplicitModelRecallRatherThanAnAmbiguousNewComposition() {
        for (skill in listOf("recall", "complete", "audiate")) {
            val ex = generated(skill, 123)
            assertEquals("sequence", ex.responseType)
            assertEquals(skill != "recall", ex.referenceRequired)
            assertTrue(AuralCurriculum.evaluate(ex, ex.answer.degrees))
            assertFalse(AuralCurriculum.evaluate(ex, emptyList()))
            assertEquals(if (skill == "recall") ex.fullDegrees else listOf(ex.events[ex.gapIndex!!].degree), ex.answer.degrees)
            if (skill == "audiate") assertEquals(ex.events.lastIndex, ex.gapIndex)
        }
    }

    @Test fun secondaryDominantIsNotConfusedWithDiatonicSupertonic() {
        val ex = generated("recall", 1, 2, "secondary-dominant")
        assertTrue("V/V" in ex.answer.degrees)
        assertFalse(AuralCurriculum.evaluate(ex, ex.answer.degrees.map { if (it == "V/V") "ii" else it }))
    }

    @Test fun microphoneTasksSeparateRootBassScaleDegreeAndRootSequence() {
        val kinds = mutableSetOf<String>(); var invertedBass = false
        repeat(200) { seed ->
            val ex = generated("reproduce", seed.toLong())
            val task = ex.microphoneTask!!
            kinds.add(task.kind)
            assertEquals(task.targetMidis, ex.answer.targetMidis)
            if (task.kind == "scaleDegree") {
                assertEquals(listOf(48 + MusicTheory.NOTE_TO_PC.getValue(ex.keyTonic) + MusicTheory.SCALE_INTERVALS.getValue("major")[task.scaleDegree!! - 1]), task.targetMidis)
            } else {
                assertEquals(task.eventIndices.map { if (task.kind == "bass") ex.events[it].bassMidi else ex.events[it].rootMidi }, task.targetMidis)
                if (task.kind == "bass" && pc(ex.events[task.eventIndices.first()].rootMidi) != pc(task.targetMidis.first())) invertedBass = true
            }
            assertFalse(AuralCurriculum.evaluate(ex, task.targetMidis.map { it.toString() }))
        }
        assertEquals(setOf("root", "bass", "scaleDegree", "rootSequence"), kinds)
        assertTrue(invertedBass)
    }

    @Test fun practiceFadesAssistanceWithoutManufacturingMastery() {
        var p = AuralProgress()
        repeat(8) { i ->
            p = AuralCurriculum.record(p, generated(seed = i.toLong(), support = if (i < 2) 2 else 1), true)
            assertEquals(if (i < 1) 2 else if (i < 3) 1 else 0, cell(p).support)
            assertEquals(0, cell(p).independentCorrect)
            assertFalse(cell(p).mastered)
        }
    }

    @Test fun previewsHintsRepeatedPlaysAndRetriesRemainPractice() {
        var p = AuralProgress()
        p = AuralCurriculum.record(p, generated(seed = 1), true, assistance = listOf("hint"))
        p = AuralCurriculum.record(p, generated(seed = 2), true, plays = 2)
        p = AuralCurriculum.record(p, generated(seed = 3), true, attempt = 2)
        p = AuralCurriculum.record(p, generated(seed = 4), true, assistance = listOf("preview"))
        assertEquals(0, cell(p).independentCorrect)
        assertEquals(4, cell(p).practice)
        assertEquals(3, cell(p).practiceCorrect)
    }

    @Test fun assistedRetryDoesNotPostponeIndependentFailureReview() {
        val ex = generated(seed = 919)
        val failed = AuralCurriculum.record(AuralProgress(), ex, false, now = 1000)
        val retried = AuralCurriculum.record(failed, ex, true, attempt = 2, assistance = listOf("hint"), now = 2000)
        assertEquals(cell(failed).dueAt, cell(retried).dueAt)
        assertEquals(cell(failed).lastCorrect, cell(retried).lastCorrect)
        assertEquals(0, cell(retried).streak)
        assertEquals(listOf(false), cell(retried).recentIndependent)
    }

    @Test fun familiarityAndRepeatedGradingCannotManufactureIndependentEvidence() {
        val ex = generated(seed = 811)
        val first = AuralCurriculum.beginExercise(AuralProgress(), ex)
        assertFalse(first.second.previouslyExposed)
        var p = AuralCurriculum.record(first.first, first.second, true)
        p = AuralCurriculum.record(p, first.second, true)
        p = AuralCurriculum.record(p, ex.copy(id = "different-id", seed = 92), true)
        assertEquals(1, cell(p).independentCorrect)
        val reloaded = AuralCurriculum.beginExercise(Json.decodeFromString<AuralProgress>(Json.encodeToString(first.first)), ex)
        assertTrue(reloaded.second.previouslyExposed)
        assertEquals(0, cell(AuralCurriculum.record(reloaded.first, reloaded.second, true)).independentCorrect)
    }

    @Test fun uncertainMicrophoneIsNeutralAndResolvedTechnicalRetryRemainsFirstPass() {
        val ex = generated("reproduce", 62)
        val prepared = AuralProgress(cells = mapOf("dominant-return:reproduce" to AuralCell(practice = 4, practiceCorrect = 4, microphonePractice = mapOf(ex.microphoneTask!!.kind to 1))))
        val started = AuralCurriculum.beginExercise(prepared, ex)
        val uncertain = AuralCurriculum.record(started.first, started.second, false, technicalUncertainty = true)
        assertEquals(started.first.cells, uncertain.cells); assertEquals(0, uncertain.attempts)
        val resolved = AuralCurriculum.record(uncertain, started.second, true)
        assertEquals(1, cell(resolved, "reproduce").independentCorrect)
    }

    @Test fun eachMicrophoneKindReceivesPracticeBeforeIndependentCreditAndContributesToMastery() {
        var p = AuralProgress()
        val rootsOnly = AuralCell(practice = 4, practiceCorrect = 4, independentAttempts = 8, independentCorrect = 8, transferCorrect = 3, keys = listOf("C", "G", "F"), recentIndependent = List(8) { true }, microphonePractice = mapOf("root" to 4), microphoneIndependent = mapOf("root" to 8))
        assertFalse(cell(p.copy(cells = mapOf("dominant-return:reproduce" to rootsOnly)), "reproduce").mastered)
        for ((index, kind) in AuralCurriculum.microphoneKinds.withIndex()) {
            val first = AuralCurriculum.generate(AuralTarget("dominant-return", "reproduce", 0, microphoneKind = kind), 100L + index)
            p = AuralCurriculum.record(p, first, true)
            assertEquals(0, cell(p, "reproduce").microphoneIndependent[kind] ?: 0)
            assertEquals(1, cell(p, "reproduce").microphonePractice[kind])
            val second = AuralCurriculum.generate(AuralTarget("dominant-return", "reproduce", 0, microphoneKind = kind), 900L + index)
            p = AuralCurriculum.record(p, second, true)
            assertEquals(1, cell(p, "reproduce").microphoneIndependent[kind])
        }
    }

    @Test fun phasesRequireAdjacentIndependentEvidenceAndFamiliesRequirePrerequisites() {
        var p = AuralProgress()
        assertTrue(AuralCurriculum.skillUnlocked(p, "dominant-return", "guided"))
        assertFalse(AuralCurriculum.skillUnlocked(p, "dominant-return", "compare"))
        p = train(p, "guided", 4, 2)
        assertTrue(AuralCurriculum.skillUnlocked(p, "dominant-return", "compare"))
        p = train(p, "compare", 6, 2)
        assertFalse(AuralCurriculum.skillUnlocked(p, "dominant-return", "identify"))
        assertFalse(AuralCurriculum.familyUnlocked(p, "plagal-return"))
        for (index in 1 until AuralCurriculum.skills.lastIndex) {
            p = train(p, AuralCurriculum.skills[index].id, 2)
            assertTrue(AuralCurriculum.skillUnlocked(p, "dominant-return", AuralCurriculum.skills[index + 1].id))
        }
        assertTrue(AuralCurriculum.familyUnlocked(p, "plagal-return"))
        assertFalse(AuralCurriculum.familyUnlocked(p, "secondary-dominant"))
        assertEquals(0, cell(p, "identify", "plagal-return").independentCorrect)
    }

    @Test fun masteryRequiresIndependentEvidenceDiverseKeysAndTransferAndCanRecoverAfterErrors() {
        var p = train(AuralProgress(), "compare", 10, correct = false)
        p = train(p, "compare", 12)
        assertFalse(cell(p).mastered)
        p = train(p, "compare", 10, transfer = true)
        assertTrue(cell(p).keys.size >= 3)
        assertTrue(cell(p).transferCorrect >= 2)
        assertTrue(cell(p).mastered)
        val oneKey = p.copy(cells = mapOf("dominant-return:compare" to cell(p).copy(keys = listOf("C"))))
        assertFalse(cell(oneKey).mastered)
        assertTrue(AuralCurriculum.skillUnlocked(p, "dominant-return", "identify"))
    }

    @Test fun successfulLearnerCanReachEveryPhaseAndHarmonicFamily() {
        var p = AuralProgress(); val skills = mutableSetOf<String>(); val families = mutableSetOf<String>()
        repeat(700) { step ->
            val target = AuralCurriculum.selectTarget(p, step.toLong(), 1000L + step)
            skills.add(target.skillId); families.add(target.familyId)
            val started = AuralCurriculum.beginExercise(p, AuralCurriculum.generate(target, step * 37L), 1000L + step)
            p = AuralCurriculum.record(started.first, started.second, true, now = 1000L + step)
        }
        assertEquals(AuralCurriculum.skills.map { it.id }.toSet(), skills)
        assertEquals(AuralCurriculum.families.map { it.id }.toSet(), families)
        assertTrue(p.cells.values.any { it.mastered })
        assertTrue(p.recent.size <= 120); assertTrue(p.exposures.size <= 512)
    }

    @Test fun hintsOnlyLearnerCannotAcquireIndependentMasteryOrSkipSkillPrerequisites() {
        var p = AuralProgress()
        val encountered = mutableSetOf<String>()
        repeat(100) { step ->
            val target = AuralCurriculum.selectTarget(p, step.toLong(), 1000L + step)
            encountered += target.skillId
            val (exposed, exercise) = AuralCurriculum.beginExercise(p, AuralCurriculum.generate(target, step * 101L), 1000L + step)
            p = AuralCurriculum.record(exposed, exercise, true, assistance = listOf("guidance"), now = 1000L + step)
        }
        assertEquals(setOf("guided", "compare"), encountered)
        assertTrue(p.cells.values.all { it.independentAttempts == 0 && !it.mastered })
    }

    @Test fun learnerWhoSkipsMicrophoneCanReachAudiationWithReproductionUnassessed() {
        var p = AuralProgress()
        val encountered = mutableSetOf<String>()
        repeat(700) { step ->
            val target = AuralCurriculum.selectTarget(p, step.toLong(), 1000L + step, microphoneEnabled = false)
            encountered += target.skillId
            val (exposed, exercise) = AuralCurriculum.beginExercise(p, AuralCurriculum.generate(target, step * 127L), 1000L + step)
            p = AuralCurriculum.record(exposed, exercise, true, assistance = if (step % 5 == 0) listOf("replay") else emptyList(), now = 1000L + step)
        }
        assertTrue("audiate" in encountered)
        assertFalse("reproduce" in encountered)
        assertTrue(p.cells.keys.none { it.endsWith(":reproduce") })
    }

    @Test fun schedulerRevisitsOldSkillsAndSupportsOptionalMicrophone() {
        var p = train(AuralProgress(), "guided", 4, 2)
        p = train(p, "compare", 6).copy(attempts = 10)
        val target = AuralCurriculum.selectTarget(p, 88, Long.MAX_VALUE / 2, false)
        assertEquals("compare", target.skillId)
        assertEquals(target, AuralCurriculum.selectTarget(p, 88, Long.MAX_VALUE / 2, false))
        repeat(30) { assertNotEquals("reproduce", AuralCurriculum.selectTarget(p, it.toLong(), microphoneEnabled = false).skillId) }
    }

    @Test fun corruptProgressIsSanitizedAndNeverTrustsMasteredOrSupportFlags() {
        assertEquals(AuralProgress(), AuralCurriculum.normalize(AuralProgress(version = 99)))
        val p = AuralCurriculum.normalize(AuralProgress(attempts = -5, cells = mapOf("unknown:guided" to AuralCell(), "dominant-return:compare" to AuralCell(practice = -2, practiceCorrect = 88, independentAttempts = -2, independentCorrect = 500, keys = listOf("BAD", "C", "C"), mastered = true, support = 0))))
        assertEquals(0, p.attempts); assertEquals(1, p.cells.size); assertFalse(cell(p).mastered); assertEquals(2, cell(p).support); assertEquals(0, cell(p).independentCorrect)
    }

    @Test fun invalidTargetsFailRatherThanSilentlyGeneratingWrongMusic() {
        assertThrows(IllegalArgumentException::class.java) { AuralCurriculum.generate(AuralTarget("dominant-return", "guided", variantId = "prepared"), 1) }
        assertThrows(IllegalArgumentException::class.java) { AuralCurriculum.generate(AuralTarget("missing", "guided"), 1) }
        assertThrows(IllegalArgumentException::class.java) { AuralCurriculum.generate(AuralTarget("dominant-return", "missing"), 1) }
        assertThrows(IllegalArgumentException::class.java) { AuralCurriculum.generate(AuralTarget("dominant-return", "guided", 8), 1) }
        val original = AuralProgress()
        AuralCurriculum.record(original, generated(), false)
        assertEquals(AuralProgress(), original)
    }

    @Test fun explicitVariantsSurviveEveryPhaseAndSupportLevelAndReconstructFromHistory() {
        for (family in AuralCurriculum.families) for (variant in family.variants) {
            for (skill in AuralCurriculum.skills) for (support in 0..2) {
                val target = AuralTarget(family.id, skill.id, support, variantId = variant.id)
                val ex = AuralCurriculum.generate(target, 432L)
                assertEquals(variant.degrees, ex.fullDegrees)
                assertEquals(variant.degrees, ex.events.map { it.degree })
                assertEquals(ex, AuralCurriculum.generate(ex.provenance.target, ex.seed))
                val record = AuralCurriculum.record(AuralProgress(), ex, true).recent.last()
                assertFalse(record.independent)
                assertEquals(ex, AuralCurriculum.generate(AuralTarget(record.familyId, record.skillId, record.support,
                    record.transfer, microphoneKind = record.microphoneKind, variantId = record.requestedVariantId), record.seed))
            }
        }
    }

    @Test fun variantSelectionCannotEarnMasteryEvenWhenGuidanceHasFaded() {
        var progress = AuralProgress()
        repeat(20) { n ->
            val ex = AuralCurriculum.generate(AuralTarget("dominant-return", "identify", 0, true, variantId = "departure"), n.toLong())
            progress = AuralCurriculum.record(progress, ex, true)
        }
        val cell = AuralCurriculum.cell(progress, "dominant-return", "identify")
        assertEquals(20, cell.practice)
        assertEquals(0, cell.independentAttempts)
        assertEquals(0, cell.transferCorrect)
        assertFalse(cell.mastered)
        assertFalse(AuralCurriculum.familyUnlocked(progress, "plagal-return"))
    }

    @Test fun explicitVariantsHaveDistinctAttemptIdentitiesForTheSameSeed() {
        val target = AuralTarget("dominant-return", "compare", variantId = "direct")
        val direct = AuralCurriculum.generate(target, 45L)
        val departure = AuralCurriculum.generate(target.copy(variantId = "departure"), 45L)
        assertNotEquals(direct.id, departure.id)
        assertNotEquals(direct.fingerprint, departure.fingerprint)
    }
}
