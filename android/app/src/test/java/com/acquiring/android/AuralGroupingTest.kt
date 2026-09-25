package com.acquiring.android

import org.junit.Assert.*
import org.junit.Test

class AuralGroupingTest {
    @Test fun chordBucketsPreserveQualityAndIgnoreInversionsAndDecorations() {
        for (label in listOf("V65", "V43", "V42", "V9/ii", "V11", "V13sus4"))
            assertEquals(label, auralStartGroup("V7"), auralStartGroup(label))
        assertEquals(auralStartGroup("♭VII7"), auralStartGroup("bVII9(mix)"))
        assertEquals(auralStartGroup("I"), auralStartGroup("Iadd9sus4"))
        val labels=listOf("I", "i", "I7", "I△7", "ii°", "iiø7", "III+")
        assertEquals(labels.size, labels.map { auralStartGroup(it)!!.id }.toSet().size)
    }
    @Test fun oldDefaultMigratesOnceAndLaterExplicitMixedChoiceSurvives() {
        val store=object:AuralPersistence {
            var value="""{"version":1,"exampleSettings":{"analysis":"allModes"}}"""
            override fun read()=value
            override fun write(value:String):Boolean {this.value=value;return true}
        }
        val session=AuralSession(store)
        assertEquals("relativeMajor",session.exampleSettings.analysis)
        session.setExampleSettings(session.exampleSettings.copy(analysis="allModes",groupingPriority="start"))
        val restored=AuralSession(store)
        assertEquals("allModes",restored.exampleSettings.analysis)
        assertEquals("start",restored.exampleSettings.groupingPriority)
    }
}
