package com.acquiring.android

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

internal const val PLAYBACK_DIAL_START_ANGLE = 135f
internal const val PLAYBACK_DIAL_SWEEP_ANGLE = 270f

internal fun dialFractionForPosition(position: Offset, center: Offset): Float {
    var angle = Math.toDegrees(
        atan2(
            (position.y - center.y).toDouble(),
            (position.x - center.x).toDouble()
        )
    ).toFloat()
    if (angle < 0f) angle += 360f
    val relative = (angle - PLAYBACK_DIAL_START_ANGLE + 360f) % 360f
    return when {
        relative <= PLAYBACK_DIAL_SWEEP_ANGLE -> relative / PLAYBACK_DIAL_SWEEP_ANGLE
        relative < 315f -> 1f
        else -> 0f
    }
}

@Composable
internal fun PlaybackDial(
    label: String,
    valueLabel: String,
    value: Float,
    onValueChange: (Float) -> Unit,
    valueRange: ClosedFloatingPointRange<Float>,
    steps: Int = 0,
    ringLabels: List<String> = emptyList(),
    onTap: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
    enabled: Boolean = true
) {
    val primary = if (enabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
    val track = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.18f)
    val knob = MaterialTheme.colorScheme.surfaceVariant
    val knobHighlight = MaterialTheme.colorScheme.surface
    val endpointColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f)
    val rangeSize = (valueRange.endInclusive - valueRange.start).coerceAtLeast(0.0001f)
    val fraction = ((value - valueRange.start) / rangeSize).coerceIn(0f, 1f)
    val semanticsSteps = steps.coerceAtLeast(0)
    // A pair marks the two ends of the sweep. Longer lists stay off the dial;
    // the center readout is the current step.
    val endpoints = if (ringLabels.size == 2) ringLabels else emptyList()

    fun snap(raw: Float): Float {
        val bounded = raw.coerceIn(valueRange.start, valueRange.endInclusive)
        if (semanticsSteps <= 0) return bounded
        val intervals = semanticsSteps.toFloat()
        val snapped = ((bounded - valueRange.start) / rangeSize * intervals).roundToInt()
        return valueRange.start + snapped / intervals * rangeSize
    }

    Column(
        modifier = modifier.alpha(if (enabled) 1f else 0.38f),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
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
                    if (enabled) {
                        setProgress { requested ->
                            onValueChange(snap(requested))
                            true
                        }
                    } else {
                        disabled()
                    }
                }
                .then(
                    if (enabled && onTap != null) {
                        Modifier.clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClickLabel = "Reset $label",
                            role = Role.Button,
                            onClick = onTap
                        )
                    } else {
                        Modifier
                    }
                )
                .pointerInput(enabled, valueRange, semanticsSteps) {
                    if (!enabled) return@pointerInput
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
                    startAngle = PLAYBACK_DIAL_START_ANGLE,
                    sweepAngle = PLAYBACK_DIAL_SWEEP_ANGLE,
                    useCenter = false,
                    topLeft = arcTopLeft,
                    size = arcSize,
                    style = Stroke(width = stroke)
                )
                drawArc(
                    color = primary,
                    startAngle = PLAYBACK_DIAL_START_ANGLE,
                    sweepAngle = PLAYBACK_DIAL_SWEEP_ANGLE * fraction,
                    useCenter = false,
                    topLeft = arcTopLeft,
                    size = arcSize,
                    style = Stroke(width = stroke)
                )

                val angle = Math.toRadians(
                    (PLAYBACK_DIAL_START_ANGLE + PLAYBACK_DIAL_SWEEP_ANGLE * fraction).toDouble()
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
            }
            if (endpoints.size == 2) {
                DialEndpointLabel(endpoints[0], PLAYBACK_DIAL_START_ANGLE, endpointColor)
                DialEndpointLabel(
                    endpoints[1],
                    PLAYBACK_DIAL_START_ANGLE + PLAYBACK_DIAL_SWEEP_ANGLE,
                    endpointColor
                )
            }
            Text(
                text = valueLabel,
                modifier = Modifier.align(Alignment.Center).clearAndSetSemantics {},
                color = primary,
                fontWeight = FontWeight.Bold,
                fontSize = dialReadoutSize(valueLabel),
                textAlign = TextAlign.Center,
                maxLines = 1,
                softWrap = false
            )
        }
        Text(
            text = label,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 2.dp)
                .clearAndSetSemantics {},
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelLarge,
            textAlign = TextAlign.Center,
            maxLines = 2
        )
    }
}

@Composable
private fun BoxScope.DialEndpointLabel(text: String, angleDegrees: Float, color: Color) {
    Text(
        text = text,
        modifier = Modifier
            .align(Alignment.Center)
            .offset {
                val radius = 46.dp.toPx()
                val angle = Math.toRadians(angleDegrees.toDouble())
                IntOffset(
                    (radius * cos(angle)).roundToInt(),
                    (radius * sin(angle)).roundToInt()
                )
            }
            .clearAndSetSemantics {},
        color = color,
        fontSize = 11.sp,
        textAlign = TextAlign.Center,
        maxLines = 1,
        softWrap = false
    )
}

private fun dialReadoutSize(valueLabel: String) = when {
    valueLabel.length <= 4 -> 16.sp
    valueLabel.length <= 6 -> 13.sp
    else -> 11.sp
}
