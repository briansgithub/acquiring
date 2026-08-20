package com.inquiring.android

import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.material3.Text
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

internal const val QUIZ_DIAL_START_ANGLE = 135f
internal const val QUIZ_DIAL_SWEEP_ANGLE = 270f

internal fun dialFractionForPosition(position: Offset, center: Offset): Float {
    var angle = Math.toDegrees(
        atan2(
            (position.y - center.y).toDouble(),
            (position.x - center.x).toDouble()
        )
    ).toFloat()
    if (angle < 0f) angle += 360f
    val relative = (angle - QUIZ_DIAL_START_ANGLE + 360f) % 360f
    return when {
        relative <= QUIZ_DIAL_SWEEP_ANGLE -> relative / QUIZ_DIAL_SWEEP_ANGLE
        relative < 315f -> 1f
        else -> 0f
    }
}

@Composable
internal fun QuizDial(
    label: String,
    valueLabel: String,
    value: Float,
    onValueChange: (Float) -> Unit,
    valueRange: ClosedFloatingPointRange<Float>,
    steps: Int = 0,
    ringLabels: List<String> = emptyList(),
    onTap: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val primary = MaterialTheme.colorScheme.primary
    val track = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.18f)
    val knob = MaterialTheme.colorScheme.surfaceVariant
    val knobHighlight = MaterialTheme.colorScheme.surface
    val labelColor = MaterialTheme.colorScheme.onSurface
    val density = LocalDensity.current
    val rangeSize = (valueRange.endInclusive - valueRange.start).coerceAtLeast(0.0001f)
    val fraction = ((value - valueRange.start) / rangeSize).coerceIn(0f, 1f)
    val semanticsSteps = steps.coerceAtLeast(0)

    fun snap(raw: Float): Float {
        val bounded = raw.coerceIn(valueRange.start, valueRange.endInclusive)
        if (semanticsSteps <= 0) return bounded
        val intervals = semanticsSteps.toFloat()
        val snapped = ((bounded - valueRange.start) / rangeSize * intervals).roundToInt()
        return valueRange.start + snapped / intervals * rangeSize
    }

    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium)
        Text(valueLabel, color = primary, style = MaterialTheme.typography.labelSmall)
        Box(
            modifier = Modifier
                .size(100.dp)
                .semantics {
                    contentDescription = "$label: $valueLabel"
                    progressBarRangeInfo = ProgressBarRangeInfo(
                        current = value,
                        range = valueRange,
                        steps = (semanticsSteps - 1).coerceAtLeast(0)
                    )
                    setProgress { requested ->
                        onValueChange(snap(requested))
                        true
                    }
                }
                .then(if (onTap != null) Modifier.clickable(onClick = onTap) else Modifier)
                .pointerInput(valueRange, semanticsSteps) {
                    detectDragGestures(
                        onDragStart = { position ->
                            val dialCenter = Offset(size.width / 2f, size.height / 2f)
                            val raw = valueRange.start +
                                dialFractionForPosition(position, dialCenter) * rangeSize
                            onValueChange(snap(raw))
                        },
                        onDrag = { change, _ ->
                            change.consume()
                            val dialCenter = Offset(size.width / 2f, size.height / 2f)
                            val raw = valueRange.start +
                                dialFractionForPosition(change.position, dialCenter) * rangeSize
                            onValueChange(snap(raw))
                        }
                    )
                },
            contentAlignment = Alignment.Center
        ) {
            Canvas(
                modifier = Modifier.size(100.dp)
            ) {
                val stroke = 4.dp.toPx()
                val dialRadius = 30.dp.toPx()
                val arcRadius = 34.dp.toPx()
                val arcSize = Size(arcRadius * 2f, arcRadius * 2f)
                val arcTopLeft = Offset(center.x - arcRadius, center.y - arcRadius)

                drawCircle(
                    color = androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.18f),
                    radius = dialRadius,
                    center = center + Offset(0f, 2.dp.toPx())
                )
                drawCircle(knob, radius = dialRadius)
                drawCircle(knobHighlight.copy(alpha = 0.35f), radius = dialRadius * 0.76f)
                drawArc(
                    color = track,
                    startAngle = QUIZ_DIAL_START_ANGLE,
                    sweepAngle = QUIZ_DIAL_SWEEP_ANGLE,
                    useCenter = false,
                    topLeft = arcTopLeft,
                    size = arcSize,
                    style = Stroke(width = stroke)
                )
                drawArc(
                    color = primary,
                    startAngle = QUIZ_DIAL_START_ANGLE,
                    sweepAngle = QUIZ_DIAL_SWEEP_ANGLE * fraction,
                    useCenter = false,
                    topLeft = arcTopLeft,
                    size = arcSize,
                    style = Stroke(width = stroke)
                )

                val angle = Math.toRadians(
                    (QUIZ_DIAL_START_ANGLE + QUIZ_DIAL_SWEEP_ANGLE * fraction).toDouble()
                )
                val indicatorRadius = dialRadius * 0.70f
                drawCircle(
                    color = primary,
                    radius = stroke * 0.8f,
                    center = Offset(
                        center.x + indicatorRadius * cos(angle).toFloat(),
                        center.y + indicatorRadius * sin(angle).toFloat()
                    )
                )

                if (ringLabels.size > 1) {
                    ringLabels.forEachIndexed { index, text ->
                        val labelFraction = index.toFloat() / (ringLabels.size - 1)
                        val labelAngle = Math.toRadians(
                            (QUIZ_DIAL_START_ANGLE + QUIZ_DIAL_SWEEP_ANGLE * labelFraction).toDouble()
                        )
                        val selected = index == (fraction * (ringLabels.size - 1)).roundToInt()
                        val radius = 45.dp.toPx()
                        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                            color = (if (selected) primary else labelColor.copy(alpha = 0.65f)).toArgb()
                            textAlign = Paint.Align.CENTER
                            textSize = with(density) { (if (selected) 9.sp else 7.sp).toPx() }
                            typeface = if (selected) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
                        }
                        drawContext.canvas.nativeCanvas.drawText(
                            text,
                            center.x + radius * cos(labelAngle).toFloat(),
                            center.y + radius * sin(labelAngle).toFloat() + paint.textSize / 3f,
                            paint
                        )
                    }
                }
            }
        }
    }
}
