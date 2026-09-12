package com.acquiring.android

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal val QUIZ_TRANSPORT_CONTROL = 44.dp
internal val QUIZ_TRANSPORT_SELECTOR = 72.dp
internal val QUIZ_TRANSPORT_PLAY = 88.dp
internal val QUIZ_TRANSPORT_GAP = 8.dp
internal val QUIZ_TRANSPORT_WIDTH = 324.dp
internal val QUIZ_TRANSPORT_CORNER = 8.dp

@Composable
internal fun quizTransportOutline(): BorderStroke =
    BorderStroke(1.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.45f))

@Composable
internal fun QuizTransportIconButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    prominent: Boolean = false,
    width: Dp = QUIZ_TRANSPORT_CONTROL,
    content: @Composable () -> Unit
) {
    Surface(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.size(width = width, height = QUIZ_TRANSPORT_CONTROL),
        shape = RoundedCornerShape(QUIZ_TRANSPORT_CORNER),
        color = if (prominent) MaterialTheme.colorScheme.primary else Color.Transparent,
        contentColor = if (prominent) {
            MaterialTheme.colorScheme.onPrimary
        } else {
            MaterialTheme.colorScheme.onSurface
        },
        border = if (prominent) null else quizTransportOutline()
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.size(width, QUIZ_TRANSPORT_CONTROL)) {
            content()
        }
    }
}

@Composable
internal fun QuizOutlinedSelector(
    label: String,
    modifier: Modifier = Modifier,
    width: Dp? = QUIZ_TRANSPORT_SELECTOR,
    caption: String? = null,
    usesSubheadline: Boolean = false,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    testTag: String,
    stateDescription: String = label,
    menuContent: @Composable () -> Unit
) {
    val sizedModifier = if (width == null) modifier.fillMaxWidth() else modifier.width(width)
    Box(modifier = sizedModifier) {
        Surface(
            onClick = { onExpandedChange(!expanded) },
            modifier = Modifier
                .fillMaxWidth()
                .height(QUIZ_TRANSPORT_CONTROL)
                .testTag(testTag)
                .semantics {
                    contentDescription = caption ?: label
                    this.stateDescription = stateDescription
                    role = Role.Button
                },
            shape = RoundedCornerShape(QUIZ_TRANSPORT_CORNER),
            color = Color.Transparent,
            border = quizTransportOutline()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(QUIZ_TRANSPORT_CONTROL)
                    .padding(horizontal = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                if (caption != null) {
                    Text(caption, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                        maxLines = 1
                    )
                } else {
                    Text(
                        text = label,
                        style = if (usesSubheadline) {
                            MaterialTheme.typography.bodySmall
                        } else {
                            MaterialTheme.typography.labelMedium
                        },
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
        menuContent()
    }
}

@Composable
internal fun QuizTransportBar(
    showSecondaryRow: Boolean,
    isFavorite: Boolean,
    onToggleFavorite: () -> Unit,
    currentWaveform: AudioEngine.Waveform,
    onWaveformChange: (AudioEngine.Waveform) -> Unit,
    transpose: Int,
    onTransposeChange: (Int) -> Unit,
    onReset: () -> Unit,
    resetEnabled: Boolean,
    isPlaying: Boolean,
    playEnabled: Boolean,
    onPlay: () -> Unit,
    onShowSongInfo: () -> Unit,
    isSimpleMode: Boolean,
    onSimpleModeChange: (Boolean) -> Unit,
    sectionOptions: List<Pair<String, String>>,
    selectedSectionId: String,
    selectedSectionLabel: String,
    onSectionChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(start = 12.dp, end = 12.dp, bottom = 8.dp),
        verticalArrangement = Arrangement.spacedBy(QUIZ_TRANSPORT_GAP)
    ) {
        Row(
            modifier = Modifier.width(QUIZ_TRANSPORT_WIDTH),
            horizontalArrangement = Arrangement.spacedBy(QUIZ_TRANSPORT_GAP),
            verticalAlignment = Alignment.CenterVertically
        ) {
            QuizTransportIconButton(
                onClick = onToggleFavorite,
                modifier = Modifier
                    .testTag(QUIZ_FAVORITE_STAR_TEST_TAG)
                    .semantics {
                        contentDescription = if (isFavorite) {
                            "Remove from ${PlaylistIds.FAVORITES_NAME}"
                        } else {
                            "Add to ${PlaylistIds.FAVORITES_NAME}"
                        }
                        stateDescription = if (isFavorite) "Favorited" else "Not favorited"
                        role = Role.Button
                    }
            ) {
                Icon(
                    imageVector = if (isFavorite) {
                        Icons.Filled.Star
                    } else {
                        ImageVector.vectorResource(R.drawable.ic_star_outline)
                    },
                    contentDescription = null,
                    tint = if (isFavorite) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    },
                    modifier = Modifier.size(18.dp)
                )
            }
            QuizInstrumentMenu(
                selectedInstrument = currentWaveform,
                onInstrumentSelected = onWaveformChange
            )
            QuizTransposeMenu(
                transpose = transpose,
                onTransposeSelected = onTransposeChange
            )
            QuizTransportIconButton(
                onClick = onReset,
                enabled = resetEnabled,
                modifier = Modifier.semantics { contentDescription = "Reset" }
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
            }
            QuizTransportIconButton(
                onClick = onPlay,
                enabled = playEnabled,
                prominent = true,
                width = QUIZ_TRANSPORT_PLAY,
                modifier = Modifier.semantics {
                    contentDescription = if (isPlaying) "Pause" else "Play"
                }
            ) {
                if (isPlaying) {
                    Text("Ⅱ", fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                } else {
                    Icon(
                        imageVector = Icons.Default.PlayArrow,
                        contentDescription = null,
                        modifier = Modifier.size(22.dp)
                    )
                }
            }
        }
        if (showSecondaryRow) {
            Row(
                modifier = Modifier.width(QUIZ_TRANSPORT_WIDTH),
                horizontalArrangement = Arrangement.spacedBy(QUIZ_TRANSPORT_GAP),
                verticalAlignment = Alignment.CenterVertically
            ) {
                QuizTransportIconButton(
                    onClick = onShowSongInfo,
                    modifier = Modifier
                        .testTag(QUIZ_INFO_BUTTON_TEST_TAG)
                        .semantics { contentDescription = "Song information" }
                ) {
                    Icon(
                        Icons.Outlined.Info,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                }
                QuizModeSelector(
                    isSimpleMode = isSimpleMode,
                    onSimpleModeChange = onSimpleModeChange
                )
                if (sectionOptions.size > 1) {
                    QuizSectionSelector(
                        options = sectionOptions,
                        selectedSectionId = selectedSectionId,
                        selectedSectionLabel = selectedSectionLabel,
                        onSectionChange = onSectionChange,
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }
    }
}

@Composable
private fun QuizModeSelector(
    isSimpleMode: Boolean,
    onSimpleModeChange: (Boolean) -> Unit
) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val label = if (isSimpleMode) "Root" else "Full"
    QuizOutlinedSelector(
        label = label,
        caption = null,
        expanded = expanded,
        onExpandedChange = { expanded = it },
        testTag = QUIZ_MODE_SWITCH_TEST_TAG,
        stateDescription = if (isSimpleMode) "Root Only" else "Full Chords"
    ) {
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = { Text("Full Chords") },
                onClick = {
                    onSimpleModeChange(false)
                    expanded = false
                }
            )
            DropdownMenuItem(
                text = { Text("Root Only") },
                onClick = {
                    onSimpleModeChange(true)
                    expanded = false
                }
            )
        }
    }
}

@Composable
private fun QuizSectionSelector(
    options: List<Pair<String, String>>,
    selectedSectionId: String,
    selectedSectionLabel: String,
    onSectionChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    Box(modifier) {
        QuizOutlinedSelector(
            label = selectedSectionLabel,
            width = null,
            usesSubheadline = true,
            expanded = expanded,
            onExpandedChange = { expanded = it },
            testTag = QUIZ_SECTION_BUTTON_TEST_TAG,
            stateDescription = selectedSectionLabel,
            modifier = Modifier.fillMaxWidth()
        ) {
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                options.forEach { (id, name) ->
                    DropdownMenuItem(
                        text = { Text(name) },
                        onClick = {
                            onSectionChange(id)
                            expanded = false
                        },
                        modifier = Modifier.testTag("QuizSection-$id")
                    )
                }
            }
        }
    }
}
