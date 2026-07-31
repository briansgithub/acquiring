package com.sacredring.android

import android.graphics.Canvas as AndroidCanvas
import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

internal data class ScaleDegreeLabel(
    val source: String,
    val prefix: String,
    val degree: String,
    val suffix: String
) {
    val spokenText: String
        get() = buildString {
            prefix.forEach { accidental ->
                when (accidental) {
                    '♭', 'b' -> append("flat ")
                    '♯', '#' -> append("sharp ")
                    else -> append(accidental)
                }
            }
            append(degree)
            if (suffix.isNotEmpty()) append(" $suffix")
        }.trim()

    companion object {
        fun parse(source: String): ScaleDegreeLabel {
            val plain = source.replace("\u0302", "").replace("^", "")
            val digitStart = plain.indexOfFirst(Char::isDigit)
            if (digitStart < 0) {
                return ScaleDegreeLabel(source, "", plain, "")
            }
            var digitEnd = digitStart
            while (digitEnd < plain.length && plain[digitEnd].isDigit()) digitEnd += 1
            return ScaleDegreeLabel(
                source = source,
                prefix = plain.substring(0, digitStart),
                degree = plain.substring(digitStart, digitEnd),
                suffix = plain.substring(digitEnd)
            )
        }
    }
}

internal data class MeasuredScaleDegree(
    val label: ScaleDegreeLabel,
    val fontSizePx: Float,
    val widthPx: Float,
    val topPx: Float,
    val bottomPx: Float,
    val prefixX: Float,
    val prefixWidthPx: Float,
    val degreeCenterX: Float,
    val degreeCenterYPx: Float,
    val degreeWidthPx: Float,
    val suffixX: Float,
    val suffixWidthPx: Float,
    val hatLeftX: Float,
    val hatTipX: Float,
    val hatRightX: Float,
    val hatTipYPx: Float,
    val hatBaseYPx: Float
) {
    val heightPx: Float get() = bottomPx - topPx
}

/** A measured, vector-hatted scale-degree renderer matching the web glyph geometry. */
internal class ScaleDegreePainter(
    private val degreeTypeface: Typeface = Typeface.create("serif", Typeface.BOLD),
    private val accidentalTypeface: Typeface = Typeface.create("serif", Typeface.NORMAL)
) {
    private data class MeasureKey(val label: ScaleDegreeLabel, val fontSizeBits: Int)

    private val paint = Paint(
        Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG or Paint.LINEAR_TEXT_FLAG
    ).apply {
        textAlign = Paint.Align.LEFT
    }

    private val measureCache = object :
        LinkedHashMap<MeasureKey, MeasuredScaleDegree>(64, 0.75f, true) {
        override fun removeEldestEntry(
            eldest: MutableMap.MutableEntry<MeasureKey, MeasuredScaleDegree>?
        ): Boolean = size > 256
    }

    fun measure(source: String, fontSizePx: Float): MeasuredScaleDegree =
        measure(ScaleDegreeLabel.parse(source), fontSizePx)

    fun measure(label: ScaleDegreeLabel, fontSizePx: Float): MeasuredScaleDegree {
        val cacheKey = MeasureKey(label, fontSizePx.toBits())
        measureCache[cacheKey]?.let { return it }

        configureDegreePaint(fontSizePx)
        val degreeWidth = paint.measureText(label.degree)
        val degreeMetrics = paint.fontMetrics

        configureAccidentalPaint(fontSizePx)
        val prefixWidth = paint.measureText(label.prefix)
        val suffixWidth = paint.measureText(label.suffix)
        val accidentalMetrics = paint.fontMetrics

        val hatWidth = fontSizePx * HAT_WIDTH_SCALE
        val hatHeight = fontSizePx * HAT_HEIGHT_SCALE
        val gap = fontSizePx * HAT_GAP_SCALE
        val degreeColumnWidth = max(degreeWidth, hatWidth)
        val prefixGap = if (label.prefix.isEmpty()) 0f else fontSizePx * SIDE_GAP_SCALE
        val suffixGap = if (label.suffix.isEmpty()) 0f else fontSizePx * SIDE_GAP_SCALE
        val width = prefixWidth + prefixGap + degreeColumnWidth + suffixGap + suffixWidth

        val degreeCenterX = prefixWidth + prefixGap + degreeColumnWidth / 2f
        val blockHeight = hatHeight + gap + fontSizePx
        val blockTop = -blockHeight / 2f
        val hatTipY = blockTop
        val hatBaseY = blockTop + hatHeight
        val degreeCenterY = blockTop + hatHeight + gap + fontSizePx / 2f

        val degreeBaseline = baselineForMiddle(degreeCenterY, degreeMetrics)
        var top = min(hatTipY, degreeBaseline + degreeMetrics.ascent)
        var bottom = max(hatBaseY, degreeBaseline + degreeMetrics.descent)

        if (label.prefix.isNotEmpty() || label.suffix.isNotEmpty()) {
            val accidentalBaseline = baselineForMiddle(degreeCenterY, accidentalMetrics)
            top = min(top, accidentalBaseline + accidentalMetrics.ascent)
            bottom = max(bottom, accidentalBaseline + accidentalMetrics.descent)
        }

        return MeasuredScaleDegree(
            label = label,
            fontSizePx = fontSizePx,
            widthPx = width,
            topPx = top,
            bottomPx = bottom,
            prefixX = 0f,
            prefixWidthPx = prefixWidth,
            degreeCenterX = degreeCenterX,
            degreeCenterYPx = degreeCenterY,
            degreeWidthPx = degreeWidth,
            suffixX = prefixWidth + prefixGap + degreeColumnWidth + suffixGap,
            suffixWidthPx = suffixWidth,
            hatLeftX = degreeCenterX - hatWidth / 2f,
            hatTipX = degreeCenterX,
            hatRightX = degreeCenterX + hatWidth / 2f,
            hatTipYPx = hatTipY,
            hatBaseYPx = hatBaseY
        ).also { measureCache[cacheKey] = it }
    }

    fun fit(
        source: String,
        minFontSizePx: Float,
        maxFontSizePx: Float,
        maxWidthPx: Float,
        maxHeightPx: Float
    ): MeasuredScaleDegree? {
        if (maxWidthPx <= 0f || maxHeightPx <= 0f) return null
        val label = ScaleDegreeLabel.parse(source)

        fun fits(layout: MeasuredScaleDegree): Boolean {
            val safety = max(2f, layout.fontSizePx * 0.04f)
            return layout.widthPx + safety <= maxWidthPx && layout.heightPx + safety <= maxHeightPx
        }

        val minimum = measure(label, minFontSizePx)
        if (!fits(minimum)) return null

        var low = minFontSizePx
        var high = max(minFontSizePx, maxFontSizePx)
        var best = minimum
        repeat(12) {
            val middle = (low + high) / 2f
            val candidate = measure(label, middle)
            if (fits(candidate)) {
                best = candidate
                low = middle
            } else {
                high = middle
            }
        }
        return best
    }

    fun draw(
        canvas: AndroidCanvas,
        layout: MeasuredScaleDegree,
        centerX: Float,
        centerY: Float,
        color: Int
    ) {
        val left = centerX - layout.widthPx / 2f
        val degreeCenterY = centerY + layout.degreeCenterYPx

        if (layout.label.prefix.isNotEmpty()) {
            configureAccidentalPaint(layout.fontSizePx, color)
            canvas.drawText(
                layout.label.prefix,
                left + layout.prefixX,
                baselineForMiddle(degreeCenterY, paint.fontMetrics),
                paint
            )
        }

        configureDegreePaint(layout.fontSizePx, color)
        canvas.drawText(
            layout.label.degree,
            left + layout.degreeCenterX - layout.degreeWidthPx / 2f,
            baselineForMiddle(degreeCenterY, paint.fontMetrics),
            paint
        )

        if (layout.label.suffix.isNotEmpty()) {
            configureAccidentalPaint(layout.fontSizePx, color)
            canvas.drawText(
                layout.label.suffix,
                left + layout.suffixX,
                baselineForMiddle(degreeCenterY, paint.fontMetrics),
                paint
            )
        }

        configureHatPaint(layout.fontSizePx, color)
        canvas.drawLine(
            left + layout.hatLeftX,
            centerY + layout.hatBaseYPx,
            left + layout.hatTipX,
            centerY + layout.hatTipYPx,
            paint
        )
        canvas.drawLine(
            left + layout.hatTipX,
            centerY + layout.hatTipYPx,
            left + layout.hatRightX,
            centerY + layout.hatBaseYPx,
            paint
        )
    }

    private fun configureDegreePaint(
        fontSizePx: Float,
        color: Int = android.graphics.Color.WHITE
    ) {
        paint.style = Paint.Style.FILL
        paint.typeface = degreeTypeface
        paint.textSize = fontSizePx
        paint.color = color
    }

    private fun configureAccidentalPaint(
        fontSizePx: Float,
        color: Int = android.graphics.Color.WHITE
    ) {
        paint.style = Paint.Style.FILL
        paint.typeface = accidentalTypeface
        paint.textSize = fontSizePx * ACCIDENTAL_SCALE
        paint.color = color
    }

    private fun configureHatPaint(fontSizePx: Float, color: Int) {
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = max(1.5f, fontSizePx * HAT_STROKE_SCALE)
        paint.strokeCap = Paint.Cap.ROUND
        paint.strokeJoin = Paint.Join.ROUND
        paint.color = color
    }

    private fun baselineForMiddle(centerY: Float, metrics: Paint.FontMetrics): Float =
        centerY - (metrics.ascent + metrics.descent) / 2f

    private companion object {
        const val HAT_HEIGHT_SCALE = 0.20f
        const val HAT_WIDTH_SCALE = 0.52f
        const val HAT_GAP_SCALE = 0.10f
        const val HAT_STROKE_SCALE = 0.07f
        const val ACCIDENTAL_SCALE = 0.66f
        const val SIDE_GAP_SCALE = 0.04f
    }
}

@Composable
internal fun ScaleDegreeText(
    label: String,
    fontSize: TextUnit,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
    minFontSize: TextUnit = 12.sp,
    fitToBounds: Boolean = true
) {
    val density = LocalDensity.current
    val painter = remember { ScaleDegreePainter() }
    val resolvedColor = if (color == Color.Unspecified) {
        androidx.compose.material3.LocalContentColor.current
    } else {
        color
    }

    BoxWithConstraints(modifier = modifier, contentAlignment = Alignment.Center) {
        val baseFontSizePx = with(density) { fontSize.toPx() }
        val minFontSizePx = with(density) { minFontSize.toPx() }
        val maxWidthPx = if (constraints.hasBoundedWidth) constraints.maxWidth.toFloat() else Float.MAX_VALUE
        val maxHeightPx = if (constraints.hasBoundedHeight) constraints.maxHeight.toFloat() else Float.MAX_VALUE

        val measured = remember(
            label,
            baseFontSizePx,
            minFontSizePx,
            maxWidthPx,
            maxHeightPx,
            fitToBounds
        ) {
            if (fitToBounds && (maxWidthPx.isFinite() || maxHeightPx.isFinite())) {
                painter.fit(
                    source = label,
                    minFontSizePx = minFontSizePx,
                    maxFontSizePx = baseFontSizePx,
                    maxWidthPx = maxWidthPx,
                    maxHeightPx = maxHeightPx
                ) ?: painter.measure(label, minFontSizePx)
            } else {
                painter.measure(label, baseFontSizePx)
            }
        }

        val width = with(density) { ceil(measured.widthPx).toInt().coerceAtLeast(1).toDp() }
        val height = with(density) { ceil(measured.heightPx).toInt().coerceAtLeast(1).toDp() }
        Canvas(
            modifier = Modifier
                .size(width, height)
                .semantics {
                    contentDescription = "Scale degree ${measured.label.spokenText}"
                }
        ) {
            painter.draw(
                canvas = drawContext.canvas.nativeCanvas,
                layout = measured,
                centerX = size.width / 2f,
                centerY = -measured.topPx,
                color = resolvedColor.toArgb()
            )
        }
    }
}
