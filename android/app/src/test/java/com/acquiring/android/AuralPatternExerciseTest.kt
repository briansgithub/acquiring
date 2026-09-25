package com.acquiring.android

import org.junit.Assert.*
import org.junit.Test
import kotlinx.serialization.json.*

class AuralPatternExerciseTest {
    private fun pattern(mode: String="minor", length: Int=4): AuralPatternTarget {
        val tokens=(0 until length).map { i -> buildJsonObject { put("mode",mode); put("root",if(i%2==0) 1 else 5); put("type",if(i%3==0) 7 else 5) }.toString() }
        return AuralPatternTarget(auralPatternId(tokens,"harmony"),"harmony",tokens,(0 until length).map { if(it%2==0) "i7" else "v" },0,0,"test")
    }
    @Test fun longMinorPatternIsNotTruncatedAndUsesAllThreeModes() {
        val p=pattern(length=150)
        for(skill in listOf("identify","recall","complete","audiate","reproduce")) {
            val ex=AuralCurriculum.generate(AuralTarget(p.id,skill,pattern=p,octaveShift=1,microphoneKind="rootSequence"),42)
            assertEquals(150,ex.events.size)
            assertTrue(ex.events.all { it.notes.isNotEmpty() && it.notes.all { note -> note in 1..127 } })
            assertEquals(ex,AuralCurriculum.generate(ex.provenance.target,42))
            if(skill=="reproduce") assertEquals(150,ex.microphoneTask!!.targetMidis.size)
            val plan=auralPlaybackPlan(auralPromptEvents(ex),ex.tempo.toDouble(),8000,streaming=true)
            assertTrue(plan.durationMs>120000)
        }
    }
    @Test fun patternMasteryDoesNotDisappearOnNormalizationOrBleedIntoOtherPatterns() {
        val p=pattern(); val q=pattern(length=5)
        val ex=AuralCurriculum.generate(AuralTarget(p.id,"recall",variantId=p.id,pattern=p),11)
        val recorded=AuralCurriculum.record(AuralProgress(),ex,true)
        assertEquals(1,AuralCurriculum.cell(AuralCurriculum.normalize(recorded),p.id,"recall").practiceCorrect)
        assertEquals(0,AuralCurriculum.cell(recorded,q.id,"recall").practiceCorrect)
        assertEquals(0,AuralCurriculum.cell(recorded,p.id,"identify").practiceCorrect)
    }
    @Test fun changedTokenCannotReuseAnExistingPatternIdentity() {
        val p=pattern()
        assertThrows(IllegalArgumentException::class.java) { AuralCurriculum.generate(AuralTarget(p.id,"recall",pattern=p.copy(tokens=p.tokens.reversed())),1) }
    }
    @Test fun repeatedChordHasDistinctDecoysAndRecallVocabularyIncludesNonAnswers() {
        val source = pattern()
        val tokens = List(4) { source.tokens.first() }
        val p = source.copy(id=auralPatternId(tokens,"harmony"),tokens=tokens,labels=List(4) { "i7" })
        val ex = AuralCurriculum.generate(AuralTarget(p.id,"identify",pattern=p),19)
        assertEquals(4,ex.options.size)
        assertEquals(1,ex.options.count { it.degrees == ex.answer.degrees })
        assertEquals(4,ex.options.map { it.degrees }.distinct().size)
        assertTrue(auralPatternVocabulary(p).any { it !in p.labels })
    }
    @Test fun relativeMajorPatternUsesMajorReferenceWithoutModalToken() {
        val tokens = listOf(
            """{"version":"aural-relative-1","rootPc":2,"intervals":[0,3,7]}""",
            """{"version":"aural-relative-1","rootPc":7,"intervals":[0,4,7]}"""
        )
        val pattern = AuralPatternTarget(auralPatternId(tokens,"relative_harmony"),"relative_harmony",tokens,listOf("ii","V"),0,0,"test")
        val exercise = AuralCurriculum.generate(AuralTarget(pattern.id,"recall",pattern=pattern),17)
        assertEquals(listOf("ii","V"),exercise.fullDegrees)
        assertEquals("tonic",exercise.context.single().degree)
        assertEquals(2,(exercise.events[0].rootMidi-MusicTheory.NOTE_TO_PC.getValue(exercise.keyTonic)+120)%12)
        assertEquals(7,(exercise.events[1].rootMidi-MusicTheory.NOTE_TO_PC.getValue(exercise.keyTonic)+120)%12)
    }
    @Test fun analysisSettingsResolveOneCatalogView() {
        assertEquals("relative_harmony",AuralExampleSettings().catalogView())
        assertEquals("harmony",AuralExampleSettings(analysis="allModes").catalogView())
        assertEquals("relative_harmony",AuralExampleSettings(analysis="relativeMajor").catalogView())
        assertEquals("harmony_bass",AuralExampleSettings(distinguishInversions=true,analysis="filterMode",modeFilter="dorian").catalogView())
    }
}
