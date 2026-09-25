package com.acquiring.android

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class AuralProgressionQueryTest {
    @Test fun consecutiveWholeChordsAndQuality() {
        val query=AuralProgressionQuery(chords=listOf(AuralChordConstraint(5),AuralChordConstraint(1,family="minor")))
        assertTrue(query.matches(listOf("ii", "V7", "i9", "IV")))
        assertFalse(query.matches(listOf("V7", "IV", "i9")))
        assertFalse(query.matches(listOf("V/V", "i9")))
        assertFalse(query.matches(listOf("IV", "i9")))
        assertTrue(AuralProgressionQuery().matches(emptyList()))
    }

    @Test fun accidentalsAndExactForms() {
        assertTrue(AuralChordConstraint(7,"♭").matches("bVII13sus4"))
        assertFalse(AuralChordConstraint(7).matches("♭VII13sus4"))
        assertTrue(AuralChordConstraint(5,family="7").matches("V9"))
        assertFalse(AuralChordConstraint(5,family="7").matches("V△7"))
        assertTrue(AuralChordConstraint(5,exact="V7/V").matches("V7/V"))
        assertFalse(AuralChordConstraint(5,exact="V7/V").matches("V7"))
        assertTrue(AuralChordConstraint(2,exact="iiø7").matches("iiø7"))
    }

    @Test fun queryIsVersionedAndRoundTrips() {
        val query=AuralProgressionQuery(chords=listOf(AuralChordConstraint(4,"♯",exact="♯IV+")))
        assertEquals(query,Json.decodeFromString<AuralProgressionQuery>(Json.encodeToString(query)))
    }

    @Test fun exactFormUsesRootAndOptionalInversion() {
        val root=AuralChordConstraint(5,exact="V7")
        assertTrue(root.matches("V65", "V7"))
        assertFalse(root.matches("V65", "V△7"))
        val inversion=root.copy(inversion="V65")
        assertTrue(inversion.matches("V65", "V7"))
        assertFalse(inversion.matches("V43", "V7"))
        assertTrue(AuralProgressionQuery(chords=listOf(inversion)).matches(listOf("V65"),listOf("V7")))
    }
}
