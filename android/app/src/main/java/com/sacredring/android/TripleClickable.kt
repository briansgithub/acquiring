package com.sacredring.android

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.input.pointer.AwaitPointerEventScope
import androidx.compose.ui.input.pointer.PointerInputChange
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalViewConfiguration
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics

internal enum class TapSequenceAction {
    SINGLE,
    DOUBLE,
    TRIPLE
}

internal fun tapSequenceAction(tapCount: Int): TapSequenceAction = when (tapCount) {
    1 -> TapSequenceAction.SINGLE
    2 -> TapSequenceAction.DOUBLE
    else -> TapSequenceAction.TRIPLE
}

private suspend fun AwaitPointerEventScope.awaitNextTap(
    previousUp: PointerInputChange
): PointerInputChange? = withTimeoutOrNull(viewConfiguration.doubleTapTimeoutMillis) {
    val minimumUptime = previousUp.uptimeMillis + viewConfiguration.doubleTapMinTimeMillis
    var down: PointerInputChange
    do {
        down = awaitFirstDown(requireUnconsumed = false)
    } while (down.uptimeMillis < minimumUptime)
    down.consume()
    waitForUpOrCancellation()?.also { it.consume() }
}

/**
 * Like combinedClickable for taps, with a third tap reserved for persistent pitch practice.
 * Lower-count actions are intentionally delayed until the system double-tap window expires.
 */
internal fun Modifier.tripleClickable(
    enabled: Boolean = true,
    onClick: () -> Unit,
    onDoubleClick: () -> Unit,
    onTripleClick: () -> Unit
): Modifier = composed {
    val viewConfiguration = LocalViewConfiguration.current
    val latestOnClick by rememberUpdatedState(onClick)
    val latestOnDoubleClick by rememberUpdatedState(onDoubleClick)
    val latestOnTripleClick by rememberUpdatedState(onTripleClick)

    val semanticsModifier = if (enabled) {
        Modifier.semantics {
            onClick(label = "Play note") {
                latestOnClick()
                true
            }
            customActions = listOf(
                CustomAccessibilityAction("Open Singing Interval Tool") {
                    latestOnDoubleClick()
                    true
                },
                CustomAccessibilityAction("Toggle persistent pitch practice") {
                    latestOnTripleClick()
                    true
                }
            )
        }
    } else {
        Modifier
    }

    semanticsModifier.pointerInput(enabled, viewConfiguration.doubleTapTimeoutMillis) {
        if (!enabled) return@pointerInput

        awaitEachGesture {
            awaitFirstDown(requireUnconsumed = false).consume()
            val firstUp = waitForUpOrCancellation()?.also { it.consume() }
                ?: return@awaitEachGesture

            var tapCount = 1
            val secondUp = awaitNextTap(firstUp)
            if (secondUp != null) {
                tapCount = 2
                if (awaitNextTap(secondUp) != null) tapCount = 3
            }

            when (tapSequenceAction(tapCount)) {
                TapSequenceAction.SINGLE -> latestOnClick()
                TapSequenceAction.DOUBLE -> latestOnDoubleClick()
                TapSequenceAction.TRIPLE -> latestOnTripleClick()
            }
        }
    }
}
