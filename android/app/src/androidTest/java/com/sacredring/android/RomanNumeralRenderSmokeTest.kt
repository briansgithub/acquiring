package com.sacredring.android

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.io.FileOutputStream

@RunWith(AndroidJUnit4::class)
class RomanNumeralRenderSmokeTest {
    @Test
    fun rendersRepresentativeSymbolsIntoReferenceSheet() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val samples = listOf(
            RomanNumeralDisplay("I"),
            RomanNumeralDisplay("vi"),
            RomanNumeralDisplay("V7"),
            RomanNumeralDisplay("I64"),
            RomanNumeralDisplay("I△42"),
            RomanNumeralDisplay("viiø7"),
            RomanNumeralDisplay("vii°7/V"),
            RomanNumeralDisplay("V7(b9b13)"),
            RomanNumeralDisplay("I6sus4"),
            RomanNumeralDisplay("♭ii7/V(∆-sub)"),
            RomanNumeralDisplay("I△9(no3)(no5)"),
            RomanNumeralDisplay("♭VII", "(mix)")
        )

        val columns = 2
        val cellWidth = 520
        val cellHeight = 150
        val bitmap = Bitmap.createBitmap(
            cellWidth * columns,
            cellHeight * (samples.size / columns),
            Bitmap.Config.ARGB_8888
        )
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.rgb(28, 27, 31))

        val dividerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.rgb(73, 69, 79)
            style = Paint.Style.STROKE
            strokeWidth = 2f
        }
        val painter = RomanNumeralPainter()

        samples.forEachIndexed { index, display ->
            val column = index % columns
            val row = index / columns
            val left = column * cellWidth.toFloat()
            val top = row * cellHeight.toFloat()
            canvas.drawRect(left, top, left + cellWidth, top + cellHeight, dividerPaint)

            val layout = painter.fitDisplay(
                display = display,
                minFontSizePx = 16f,
                maxFontSizePx = 74f,
                maxWidthPx = cellWidth - 32f,
                maxHeightPx = cellHeight - 24f,
                verticalTopGapPx = 4f
            )
            assertNotNull("Could not fit ${display.symbol}", layout)
            requireNotNull(layout)
            painter.draw(
                canvas = canvas,
                layout = layout,
                centerX = left + cellWidth / 2f,
                centerY = top + cellHeight / 2f,
                color = Color.WHITE
            )
        }

        val output = File(context.getExternalFilesDir(null), "roman_numeral_reference.png")
        FileOutputStream(output).use { stream ->
            assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream))
        }
        assertTrue(output.length() > 0L)
    }
}
