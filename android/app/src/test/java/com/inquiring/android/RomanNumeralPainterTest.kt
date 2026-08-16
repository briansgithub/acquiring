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
class RomanNumeralPainterTest {
    private val painter = RomanNumeralPainter()

    @Test
    fun figuredBassDigitsShareAColumn() {
        val layout = painter.measure("I64", 100f)
        val glyphs = layout.placements()

        assertEquals(listOf("I", "6", "4"), glyphs.map { it.text })
        assertEquals(glyphs[1].xPx, glyphs[2].xPx, 0.001f)
        assertTrue(glyphs[1].centerYOffsetPx < 0f)
        assertTrue(glyphs[2].centerYOffsetPx > 0f)
    }

    @Test
    fun appliedChordSlashStaysOnTheBaseRow() {
        val layout = painter.measure("V7/vi", 100f)
        val glyphs = layout.placements()

        assertEquals(listOf("V", "7", "/", "vi"), glyphs.map { it.text })
        assertTrue(glyphs[1].centerYOffsetPx < 0f)
        assertEquals(0f, glyphs[2].centerYOffsetPx, 0.001f)
        assertEquals(0f, glyphs[3].centerYOffsetPx, 0.001f)
        assertTrue(glyphs[2].xPx > glyphs[1].xPx)
    }

    @Test
    fun inversionStackEndsBeforeAppliedChordDenominator() {
        val layout = painter.measure("V43/ii", 100f)
        val glyphs = layout.placements()

        assertEquals(listOf("V", "4", "3", "/", "ii"), glyphs.map { it.text })
        assertEquals(glyphs[1].xPx, glyphs[2].xPx, 0.001f)
        assertTrue(glyphs[3].xPx > glyphs[1].xPx)
        assertEquals(0f, glyphs[3].centerYOffsetPx, 0.001f)
    }

    @Test
    fun fittedComplexSymbolStaysInsideRequestedBounds() {
        val maxWidth = 220f
        val maxHeight = 80f
        val layout = painter.fitDisplay(
            display = RomanNumeralDisplay("I△9(no3)(no5)"),
            minFontSizePx = 8f,
            maxFontSizePx = 72f,
            maxWidthPx = maxWidth,
            maxHeightPx = maxHeight,
            verticalTopGapPx = 4f
        )

        assertNotNull(layout)
        requireNotNull(layout)
        assertTrue(layout.widthPx + 1.5f <= maxWidth)
        assertTrue(layout.heightPx + 6f <= maxHeight)
    }

    @Test
    fun borrowedLabelOccupiesASeparateLowerRow() {
        val layout = painter.measureDisplay(
            RomanNumeralDisplay("♭VII", "(mix)"),
            40f
        )

        assertTrue(layout.romanCenterYOffsetPx < 0f)
        assertTrue(layout.borrowedCenterYOffsetPx > 0f)
        assertTrue(layout.bottomPx > layout.roman.bottomPx)
    }
}
