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
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

internal data class RomanNumeralDisplay(
    val symbol: String,
    val borrowedLabel: String? = null
) {
    companion object {
        private val borrowedTagPattern =
            Regex("\\((min|mix|dor|phr|lyd|loc|maj|hmin|phdm|bor)\\)")
        private val borrowedTags = mapOf(
            "minor" to "min",
            "dorian" to "dor",
            "phrygian" to "phr",
            "lydian" to "lyd",
            "mixolydian" to "mix",
            "locrian" to "loc",
            "major" to "maj",
            "harmonicMinor" to "hmin",
            "phrygianDominant" to "phdm"
        )

        fun fromChord(symbol: String, borrowed: JsonElement?): RomanNumeralDisplay {
            val borrowedLabel = when (borrowed) {
                is JsonArray -> "(bor)"
                is JsonPrimitive -> {
                    val value = borrowed.contentOrNull.orEmpty()
                    borrowedTags[value]?.let { "($it)" }
                        ?: if (value.startsWith("[")) "(bor)" else null
                }
                else -> null
            }
            return RomanNumeralDisplay(
                symbol = if (borrowedLabel == null) symbol else symbol.replace(borrowedTagPattern, ""),
                borrowedLabel = borrowedLabel
            )
        }
    }
}

internal enum class GlyphStyle {
    BASE,
    SUPER,
    SUB,
    FIGURED,
    SUFFIX,
    DIMINISHED,
    BORROWED
}

internal data class GlyphPlacement(
    val text: String,
    val xPx: Float,
    val centerYOffsetPx: Float,
    val style: GlyphStyle
)

internal data class MeasuredRomanNumeral(
    val symbol: String,
    val baseFontSizePx: Float,
    val widthPx: Float,
    val topPx: Float,
    val bottomPx: Float,
    private val glyphs: List<GlyphPlacement>
) {
    val heightPx: Float get() = bottomPx - topPx

    internal fun placements(): List<GlyphPlacement> = glyphs
}

internal data class MeasuredRomanNumeralDisplay(
    val display: RomanNumeralDisplay,
    val roman: MeasuredRomanNumeral,
    val baseFontSizePx: Float,
    val widthPx: Float,
    val topPx: Float,
    val bottomPx: Float,
    val romanCenterYOffsetPx: Float,
    val borrowedCenterYOffsetPx: Float,
    val borrowedWidthPx: Float
) {
    val heightPx: Float get() = bottomPx - topPx
}

/**
 * Native counterpart of web-player/lib/romanNumeralCanvas.js.
 *
 * The generic serif family gives the analysis symbols a more typeset character
 * while retaining Android's built-in glyph fallback for accidentals and quality
 * marks. All sizing and positioning constants intentionally mirror the web app.
 */
internal class RomanNumeralPainter(
    private val boldTypeface: Typeface = Typeface.create("serif", Typeface.BOLD),
    private val mediumTypeface: Typeface = Typeface.create("serif", Typeface.NORMAL)
) {
    private val paint = Paint(
        Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG or Paint.LINEAR_TEXT_FLAG
    ).apply {
        textAlign = Paint.Align.LEFT
    }

    private val tokenCache = object : LinkedHashMap<String, List<RomanNumeralPart>>(64, 0.75f, true) {
        override fun removeEldestEntry(
            eldest: MutableMap.MutableEntry<String, List<RomanNumeralPart>>?
        ): Boolean = size > 256
    }

    private data class MeasureKey(val symbol: String, val fontSizeBits: Int)
    private data class DisplayMeasureKey(val display: RomanNumeralDisplay, val fontSizeBits: Int)

    private val measureCache = object :
        LinkedHashMap<MeasureKey, MeasuredRomanNumeral>(256, 0.75f, true) {
        override fun removeEldestEntry(
            eldest: MutableMap.MutableEntry<MeasureKey, MeasuredRomanNumeral>?
        ): Boolean = size > 1024
    }

    private val displayMeasureCache = object :
        LinkedHashMap<DisplayMeasureKey, MeasuredRomanNumeralDisplay>(256, 0.75f, true) {
        override fun removeEldestEntry(
            eldest: MutableMap.MutableEntry<DisplayMeasureKey, MeasuredRomanNumeralDisplay>?
        ): Boolean = size > 1024
    }

    fun measure(symbol: String, baseFontSizePx: Float): MeasuredRomanNumeral {
        val cacheKey = MeasureKey(symbol, baseFontSizePx.toBits())
        measureCache[cacheKey]?.let { return it }
        val parts = tokenCache.getOrPut(symbol) { RomanNumeralTokenizer.tokenize(symbol) }
        val glyphs = mutableListOf<GlyphPlacement>()
        var cursor = 0f
        var index = 0

        while (index < parts.size) {
            when (val span = parts.stackSpanAt(index)) {
                2 -> {
                    cursor += appendTwoRowStack(
                        glyphs = glyphs,
                        cursor = cursor,
                        top = parts[index].text,
                        bottom = parts[index + 1].text,
                        baseFontSizePx = baseFontSizePx
                    )
                    index += span
                }
                3 -> {
                    cursor += appendThreePartStack(
                        glyphs = glyphs,
                        cursor = cursor,
                        top = parts[index].text,
                        suffix = parts[index + 1].text,
                        bottom = parts[index + 2].text,
                        baseFontSizePx = baseFontSizePx
                    )
                    index += span
                }
                else -> {
                    cursor += appendPart(
                        glyphs = glyphs,
                        cursor = cursor,
                        part = parts[index],
                        baseFontSizePx = baseFontSizePx
                    )
                    index += 1
                }
            }
        }

        var top = Float.POSITIVE_INFINITY
        var bottom = Float.NEGATIVE_INFINITY
        glyphs.forEach { glyph ->
            configurePaint(glyph.style, baseFontSizePx)
            val centerY = glyph.centerYOffsetPx
            val metrics = paint.fontMetrics
            val baseline = baselineForMiddle(centerY, metrics)
            top = min(top, baseline + metrics.ascent)
            bottom = max(bottom, baseline + metrics.descent)
        }

        if (!top.isFinite() || !bottom.isFinite()) {
            top = -baseFontSizePx * 0.5f
            bottom = baseFontSizePx * 0.5f
        }

        return MeasuredRomanNumeral(
            symbol = symbol,
            baseFontSizePx = baseFontSizePx,
            widthPx = cursor,
            topPx = top,
            bottomPx = bottom,
            glyphs = glyphs
        ).also { measureCache[cacheKey] = it }
    }

    fun measureDisplay(
        display: RomanNumeralDisplay,
        baseFontSizePx: Float
    ): MeasuredRomanNumeralDisplay {
        val cacheKey = DisplayMeasureKey(display, baseFontSizePx.toBits())
        displayMeasureCache[cacheKey]?.let { return it }
        val roman = measure(display.symbol, baseFontSizePx)
        val borrowedLabel = display.borrowedLabel
        if (borrowedLabel == null) {
            return MeasuredRomanNumeralDisplay(
                display = display,
                roman = roman,
                baseFontSizePx = baseFontSizePx,
                widthPx = roman.widthPx,
                topPx = roman.topPx,
                bottomPx = roman.bottomPx,
                romanCenterYOffsetPx = 0f,
                borrowedCenterYOffsetPx = 0f,
                borrowedWidthPx = 0f
            ).also { displayMeasureCache[cacheKey] = it }
        }

        val centerOffset = baseFontSizePx * BORROWED_ROW_OFFSET
        configurePaint(GlyphStyle.BORROWED, baseFontSizePx)
        val borrowedWidth = paint.measureText(borrowedLabel)
        val metrics = paint.fontMetrics
        val borrowedBaseline = baselineForMiddle(centerOffset, metrics)
        val borrowedTop = borrowedBaseline + metrics.ascent
        val borrowedBottom = borrowedBaseline + metrics.descent

        return MeasuredRomanNumeralDisplay(
            display = display,
            roman = roman,
            baseFontSizePx = baseFontSizePx,
            widthPx = max(roman.widthPx, borrowedWidth),
            topPx = min(roman.topPx - centerOffset, borrowedTop),
            bottomPx = max(roman.bottomPx - centerOffset, borrowedBottom),
            romanCenterYOffsetPx = -centerOffset,
            borrowedCenterYOffsetPx = centerOffset,
            borrowedWidthPx = borrowedWidth
        ).also { displayMeasureCache[cacheKey] = it }
    }

    fun fitDisplay(
        display: RomanNumeralDisplay,
        minFontSizePx: Float,
        maxFontSizePx: Float,
        maxWidthPx: Float,
        maxHeightPx: Float,
        verticalTopGapPx: Float = 0f
    ): MeasuredRomanNumeralDisplay? {
        if (maxWidthPx <= 0f || maxHeightPx <= 0f) return null

        fun fits(layout: MeasuredRomanNumeralDisplay): Boolean {
            val horizontalSafety = max(1.5f, layout.baseFontSizePx * 0.06f)
            val verticalSafety = max(2f, layout.baseFontSizePx * 0.06f)
            return layout.widthPx + horizontalSafety <= maxWidthPx &&
                layout.heightPx + verticalTopGapPx + verticalSafety <= maxHeightPx
        }

        val minimum = measureDisplay(display, minFontSizePx)
        if (!fits(minimum)) return null

        var low = minFontSizePx
        var high = max(minFontSizePx, maxFontSizePx)
        var best = minimum
        repeat(12) {
            val middle = (low + high) / 2f
            val candidate = measureDisplay(display, middle)
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
        layout: MeasuredRomanNumeralDisplay,
        centerX: Float,
        centerY: Float,
        color: Int
    ) {
        drawRoman(
            canvas = canvas,
            layout = layout.roman,
            centerX = centerX,
            centerY = centerY + layout.romanCenterYOffsetPx,
            color = color
        )

        val borrowedLabel = layout.display.borrowedLabel ?: return
        configurePaint(GlyphStyle.BORROWED, layout.baseFontSizePx, color)
        val metrics = paint.fontMetrics
        val borrowedCenterY = centerY + layout.borrowedCenterYOffsetPx
        val baseline = baselineForMiddle(borrowedCenterY, metrics)
        canvas.drawText(
            borrowedLabel,
            centerX - layout.borrowedWidthPx / 2f,
            baseline,
            paint
        )
    }

    private fun drawRoman(
        canvas: AndroidCanvas,
        layout: MeasuredRomanNumeral,
        centerX: Float,
        centerY: Float,
        color: Int
    ) {
        val left = centerX - layout.widthPx / 2f
        layout.placements().forEach { glyph ->
            configurePaint(glyph.style, layout.baseFontSizePx, color)
            val metrics = paint.fontMetrics
            val glyphCenterY = centerY + glyph.centerYOffsetPx
            val baseline = baselineForMiddle(glyphCenterY, metrics)
            canvas.drawText(glyph.text, left + glyph.xPx, baseline, paint)
        }
    }

    private fun appendPart(
        glyphs: MutableList<GlyphPlacement>,
        cursor: Float,
        part: RomanNumeralPart,
        baseFontSizePx: Float
    ): Float {
        if (part.kind == RomanNumeralPartKind.SUPER) {
            val quality = splitQuality(part.text)
            if (quality != null) {
                val glyphStyle = qualityStyle(quality.first)
                val glyphText = qualityDisplayText(quality.first)
                val glyphWidth = measureText(glyphText, glyphStyle, baseFontSizePx)
                glyphs += GlyphPlacement(
                    text = glyphText,
                    xPx = cursor,
                    centerYOffsetPx = -baseFontSizePx * SUPER_Y_OFFSET,
                    style = glyphStyle
                )
                if (quality.second.isEmpty()) return glyphWidth

                val digitWidth = measureText(quality.second, GlyphStyle.FIGURED, baseFontSizePx)
                glyphs += GlyphPlacement(
                    text = quality.second,
                    xPx = cursor + glyphWidth,
                    centerYOffsetPx = -baseFontSizePx * SUPER_Y_OFFSET,
                    style = GlyphStyle.FIGURED
                )
                return glyphWidth + digitWidth
            }
        }

        val style = when (part.kind) {
            RomanNumeralPartKind.BASE -> GlyphStyle.BASE
            RomanNumeralPartKind.SUPER -> GlyphStyle.SUPER
            RomanNumeralPartKind.SUB -> GlyphStyle.SUB
            RomanNumeralPartKind.SUFFIX -> GlyphStyle.SUFFIX
        }
        val yOffset = when (part.kind) {
            RomanNumeralPartKind.SUPER -> -baseFontSizePx * SUPER_Y_OFFSET
            RomanNumeralPartKind.SUB -> baseFontSizePx * SUB_Y_OFFSET
            else -> 0f
        }
        val width = measureText(part.text, style, baseFontSizePx)
        glyphs += GlyphPlacement(part.text, cursor, yOffset, style)
        return width
    }

    private fun appendTwoRowStack(
        glyphs: MutableList<GlyphPlacement>,
        cursor: Float,
        top: String,
        bottom: String,
        baseFontSizePx: Float
    ): Float {
        val quality = splitQuality(top)
        val topY = -baseFontSizePx * SUPER_Y_OFFSET
        val bottomY = baseFontSizePx * SUB_Y_OFFSET
        if (quality != null) {
            val glyphStyle = qualityStyle(quality.first)
            val glyphText = qualityDisplayText(quality.first)
            val glyphWidth = measureText(glyphText, glyphStyle, baseFontSizePx)
            val topDigitWidth = measureText(quality.second, GlyphStyle.FIGURED, baseFontSizePx)
            val bottomWidth = measureText(bottom, GlyphStyle.FIGURED, baseFontSizePx)

            glyphs += GlyphPlacement(glyphText, cursor, topY, glyphStyle)
            if (quality.second.isNotEmpty()) {
                glyphs += GlyphPlacement(
                    quality.second,
                    cursor + glyphWidth,
                    topY,
                    GlyphStyle.FIGURED
                )
            }
            glyphs += GlyphPlacement(bottom, cursor + glyphWidth, bottomY, GlyphStyle.FIGURED)
            return glyphWidth + max(topDigitWidth, bottomWidth)
        }

        val topWidth = measureText(top, GlyphStyle.FIGURED, baseFontSizePx)
        val bottomWidth = measureText(bottom, GlyphStyle.FIGURED, baseFontSizePx)
        glyphs += GlyphPlacement(top, cursor, topY, GlyphStyle.FIGURED)
        glyphs += GlyphPlacement(bottom, cursor, bottomY, GlyphStyle.FIGURED)
        return max(topWidth, bottomWidth)
    }

    private fun appendThreePartStack(
        glyphs: MutableList<GlyphPlacement>,
        cursor: Float,
        top: String,
        suffix: String,
        bottom: String,
        baseFontSizePx: Float
    ): Float {
        val topY = -baseFontSizePx * SUPER_Y_OFFSET
        val bottomY = baseFontSizePx * SUB_Y_OFFSET
        val topWidth = measureText(top, GlyphStyle.FIGURED, baseFontSizePx)
        val suffixWidth = measureText(suffix, GlyphStyle.SUFFIX, baseFontSizePx)
        val bottomWidth = measureText(bottom, GlyphStyle.FIGURED, baseFontSizePx)

        glyphs += GlyphPlacement(top, cursor, topY, GlyphStyle.FIGURED)
        glyphs += GlyphPlacement(suffix, cursor + topWidth, topY, GlyphStyle.SUFFIX)
        glyphs += GlyphPlacement(bottom, cursor, bottomY, GlyphStyle.FIGURED)
        return max(topWidth + suffixWidth, bottomWidth)
    }

    private fun measureText(text: String, style: GlyphStyle, baseFontSizePx: Float): Float {
        if (text.isEmpty()) return 0f
        configurePaint(style, baseFontSizePx)
        return paint.measureText(text)
    }

    private fun configurePaint(
        style: GlyphStyle,
        baseFontSizePx: Float,
        color: Int = android.graphics.Color.WHITE
    ) {
        paint.color = color
        paint.typeface = if (style == GlyphStyle.SUFFIX || style == GlyphStyle.BORROWED) {
            mediumTypeface
        } else {
            boldTypeface
        }
        paint.textSize = baseFontSizePx * when (style) {
            GlyphStyle.BASE -> 1f
            GlyphStyle.SUPER -> SUPER_SCALE
            GlyphStyle.SUB -> SUB_SCALE
            GlyphStyle.FIGURED -> FIGURED_DIGIT_SCALE
            GlyphStyle.SUFFIX -> SUFFIX_SCALE
            GlyphStyle.DIMINISHED -> DIMINISHED_SCALE
            GlyphStyle.BORROWED -> BORROWED_FONT_SCALE
        }
    }

    private fun splitQuality(text: String): Pair<Char, String>? {
        val first = text.firstOrNull() ?: return null
        if (first != '°' && first != 'ø') return null
        return first to text.drop(1)
    }

    private fun qualityStyle(character: Char): GlyphStyle =
        if (character == '°') GlyphStyle.DIMINISHED else GlyphStyle.SUPER

    private fun qualityDisplayText(character: Char): String =
        if (character == '°') DIMINISHED_DISPLAY_GLYPH else character.toString()

    private fun baselineForMiddle(centerY: Float, metrics: Paint.FontMetrics): Float =
        centerY - (metrics.ascent + metrics.descent) / 2f

    private companion object {
        const val SUPER_SCALE = 0.68f
        const val SUB_SCALE = 0.58f
        const val FIGURED_DIGIT_SCALE = 0.58f
        const val DIMINISHED_SCALE = 0.46f
        const val SUFFIX_SCALE = 0.72f
        const val SUPER_Y_OFFSET = 0.28f
        const val SUB_Y_OFFSET = 0.16f
        const val BORROWED_ROW_OFFSET = 0.30f
        const val BORROWED_FONT_SCALE = 0.55f
        const val DIMINISHED_DISPLAY_GLYPH = "○"
    }
}

@Composable
internal fun RomanNumeralText(
    display: RomanNumeralDisplay,
    fontSize: TextUnit,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
    minFontSize: TextUnit = 8.sp,
    fitToBounds: Boolean = true
) {
    val density = LocalDensity.current
    val inspectionMode = LocalInspectionMode.current
    val painter = remember { RomanNumeralPainter() }
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

        // Preview tooling can report zero-sized constraints during its first
        // pass; measuring at the requested size keeps previews deterministic.
        val boundedWidth = if (inspectionMode && maxWidthPx <= 0f) Float.MAX_VALUE else maxWidthPx
        val boundedHeight = if (inspectionMode && maxHeightPx <= 0f) Float.MAX_VALUE else maxHeightPx

        val measured = remember(
            display,
            baseFontSizePx,
            minFontSizePx,
            boundedWidth,
            boundedHeight,
            fitToBounds
        ) {
            if (fitToBounds && (boundedWidth.isFinite() || boundedHeight.isFinite())) {
                painter.fitDisplay(
                    display = display,
                    minFontSizePx = minFontSizePx,
                    maxFontSizePx = baseFontSizePx,
                    maxWidthPx = boundedWidth,
                    maxHeightPx = boundedHeight
                ) ?: painter.measureDisplay(display, minFontSizePx)
            } else {
                painter.measureDisplay(display, baseFontSizePx)
            }
        }

        val width = with(density) { ceil(measured.widthPx).toInt().coerceAtLeast(1).toDp() }
        val height = with(density) { ceil(measured.heightPx).toInt().coerceAtLeast(1).toDp() }
        Canvas(
            modifier = Modifier
                .size(width, height)
                .semantics {
                    contentDescription = listOfNotNull(display.symbol, display.borrowedLabel)
                        .joinToString(" ")
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
