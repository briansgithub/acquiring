package com.inquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ScaleDegreeRendererTest {
    private val painter = ScaleDegreePainter()

    @Test
    fun parsesCombiningHatAndAccidentalsIndependently() {
        assertEquals(
            ScaleDegreeLabel("1\u0302", "", "1", ""),
            ScaleDegreeLabel.parse("1\u0302")
        )
        assertEquals(
            ScaleDegreeLabel("♭7\u0302", "♭", "7", ""),
            ScaleDegreeLabel.parse("♭7\u0302")
        )
        assertEquals(
            ScaleDegreeLabel("♯♯4\u0302", "♯♯", "4", ""),
            ScaleDegreeLabel.parse("♯♯4\u0302")
        )
    }

    @Test
    fun vectorHatIsCenteredOverDigitNotAccidentalPrefix() {
        val natural = painter.measure("7\u0302", 100f)
        val flat = painter.measure("♭7\u0302", 100f)

        assertEquals(natural.degreeCenterX, natural.hatTipX, 0.001f)
        assertEquals(flat.degreeCenterX, flat.hatTipX, 0.001f)
        assertTrue(flat.prefixWidthPx > 0f)
        assertTrue(flat.degreeCenterX > flat.prefixWidthPx)
        assertTrue(flat.hatLeftX > 0f)
    }

    @Test
    fun hatHasRoundedChevronGeometryAboveDegree() {
        val layout = painter.measure("3\u0302", 100f)

        assertTrue(layout.hatTipYPx < layout.hatBaseYPx)
        assertEquals(layout.hatTipX - layout.hatLeftX, layout.hatRightX - layout.hatTipX, 0.001f)
        assertTrue(layout.hatBaseYPx < layout.degreeCenterYPx)
    }

    @Test
    fun chromaticDegreeFitsInsideSmallNoteButton() {
        val layout = painter.fit(
            source = "♭7\u0302",
            minFontSizePx = 16f,
            maxFontSizePx = 84f,
            maxWidthPx = 160f,
            maxHeightPx = 150f
        )

        assertNotNull(layout)
        requireNotNull(layout)
        assertTrue(layout.widthPx <= 160f)
        assertTrue(layout.heightPx <= 150f)
    }

    @Test
    fun accessibilitySpellingExpandsAccidentalNames() {
        assertEquals("flat 7", ScaleDegreeLabel.parse("♭7\u0302").spokenText)
        assertEquals("sharp sharp 4", ScaleDegreeLabel.parse("♯♯4\u0302").spokenText)
    }
}
