package com.acquiring.android

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex

object BrowseScrubberDefaults {
    val TouchWidth = 34.dp
}

/**
 * Fast-scroll track for one expanded All Songs group.
 *
 * A press or vertical drag on the strip jumps to the run under the thumb and
 * consumes the pointer so the list underneath does not steal the gesture.
 */
@Composable
fun BrowseScrubber(
    targets: List<BrowseSubgroup>,
    modifier: Modifier = Modifier,
    onScrub: (BrowseSubgroup) -> Unit
) {
    if (targets.isEmpty()) return
    val latestOnScrub by rememberUpdatedState(onScrub)
    val latestTargets by rememberUpdatedState(targets)
    var activeId by remember(targets) { mutableStateOf<String?>(null) }

    Box(
        modifier = modifier
            .zIndex(1f)
            .width(BrowseScrubberDefaults.TouchWidth)
            .fillMaxHeight()
            .semantics { contentDescription = "Song index" }
            .pointerInput(Unit) {
                awaitEachGesture {
                    val down = awaitFirstDown()
                    fun select(y: Float) {
                        val entries = latestTargets
                        if (entries.isEmpty()) return
                        val height = size.height.toFloat().coerceAtLeast(1f)
                        val slot = (y / height * entries.size).toInt()
                            .coerceIn(entries.indices)
                        val target = entries[slot]
                        if (target.id != activeId) {
                            activeId = target.id
                            latestOnScrub(target)
                        }
                    }
                    select(down.position.y)
                    drag(down.id) { change ->
                        select(change.position.y)
                        change.consume()
                    }
                }
            }
            .testTag("AllSongsScrubber")
    ) {
        Column(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .width(22.dp)
                .fillMaxHeight()
                .padding(vertical = 6.dp)
                .background(
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.75f),
                    shape = RoundedCornerShape(50)
                )
                .padding(vertical = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            targets.forEach { target ->
                val selected = target.id == activeId
                Text(
                    text = target.label,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (selected) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                    modifier = Modifier
                        .weight(1f)
                        .testTag("AllSongsScrubber-${target.key}")
                )
            }
        }
    }
}
