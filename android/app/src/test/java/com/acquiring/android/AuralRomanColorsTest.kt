package com.acquiring.android

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AuralRomanColorsTest {
    @Test fun everyNumeralUsesItsOwnScaleDegreeColor() {
        assertEquals(Color(0xFFFF0000), auralRomanColor("I"))
        assertEquals(Color(0xFFFFB014), auralRomanColor("iiø7"))
        assertEquals(Color(0xFFEFE600), auralRomanColor("III+"))
        assertEquals(Color(0xFF00D300), auralRomanColor("iv6"))
        assertEquals(Color(0xFF4800FF), auralRomanColor("V/V"))
        assertEquals(Color(0xFFB800E5), auralRomanColor("♭VI"))
        assertEquals(Color(0xFFFF00CB), auralRomanColor("vii°7/V"))
    }

    @Test fun nonRomanAndMalformedLabelsRemainNeutral() {
        assertNull(auralRomanDegree("tonic"))
        assertNull(auralRomanDegree("?"))
        assertEquals("I → V/V → ♭VI", auralRomanSequence(listOf("I", "V/V", "♭VI")).text)
    }
}
