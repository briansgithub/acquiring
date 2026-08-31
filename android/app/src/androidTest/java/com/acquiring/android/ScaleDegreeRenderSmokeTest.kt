package com.acquiring.android

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
class ScaleDegreeRenderSmokeTest {
    @Test
    fun rendersNaturalAndChromaticDegreesIntoReferenceSheet() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val samples = listOf(
            "1\u0302", "2\u0302", "3\u0302", "4\u0302",
            "5\u0302", "6\u0302", "7\u0302", "♭2\u0302",
            "♭3\u0302", "♯4\u0302", "♭6\u0302", "♭7\u0302",
            "♭♭7\u0302", "♯♯4\u0302", "♯5\u0302", "1\u0302"
        )

        val columns = 4
        val cellWidth = 250
        val cellHeight = 190
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
        val painter = ScaleDegreePainter()

        samples.forEachIndexed { index, label ->
            val column = index % columns
            val row = index / columns
            val left = column * cellWidth.toFloat()
            val top = row * cellHeight.toFloat()
            canvas.drawRect(left, top, left + cellWidth, top + cellHeight, dividerPaint)

            // The first two rows approximate the large practice card. The
            // second two rows approximate the compact chord-tone buttons.
            val maxFontSize = if (row < 2) 128f else 84f
            val layout = painter.fit(
                source = label,
                minFontSizePx = 32f,
                maxFontSizePx = maxFontSize,
                maxWidthPx = cellWidth - 32f,
                maxHeightPx = cellHeight - 24f
            )
            assertNotNull("Could not fit $label", layout)
            requireNotNull(layout)
            painter.draw(
                canvas = canvas,
                layout = layout,
                centerX = left + cellWidth / 2f,
                centerY = top + cellHeight / 2f,
                color = Color.WHITE
            )
        }

        val output = File(context.getExternalFilesDir(null), "scale_degree_reference.png")
        FileOutputStream(output).use { stream ->
            assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream))
        }
        assertTrue(output.length() > 0L)
    }
}
