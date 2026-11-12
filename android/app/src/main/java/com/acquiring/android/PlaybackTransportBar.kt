package com.acquiring.android

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.Divider
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import kotlin.math.roundToInt

internal val PLAYBACK_TRANSPORT_CONTROL = 44.dp
internal val PLAYBACK_TRANSPORT_SELECTOR = 72.dp
internal val PLAYBACK_TRANSPORT_PLAY = 88.dp
internal val PLAYBACK_TRANSPORT_GAP = 8.dp
internal val PLAYBACK_TRANSPORT_WIDTH = 376.dp
internal val PLAYBACK_SECTION_LOOP_WIDTH = 56.dp
internal const val PLAYBACK_SECTION_LOOP_TEST_TAG = "PlaybackSectionLoop"
internal val PLAYBACK_TRANSPORT_CORNER = 8.dp
internal const val PLAYBACK_VOICE_BUTTON_TEST_TAG = "PlaybackVoiceControls"
internal const val PLAYBACK_VOICE_VOLUME_TEST_TAG = "PlaybackVoiceVolume"

@Composable
internal fun playbackTransportOutline(): BorderStroke =
    BorderStroke(1.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.45f))

@Composable
internal fun PlaybackTransportIconButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    prominent: Boolean = false,
    width: Dp = PLAYBACK_TRANSPORT_CONTROL,
    content: @Composable () -> Unit
) {
    Surface(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.size(width = width, height = PLAYBACK_TRANSPORT_CONTROL),
        shape = RoundedCornerShape(PLAYBACK_TRANSPORT_CORNER),
        color = if (prominent) MaterialTheme.colorScheme.primary else Color.Transparent,
        contentColor = if (prominent) {
            MaterialTheme.colorScheme.onPrimary
        } else {
            MaterialTheme.colorScheme.onSurface
        },
        border = if (prominent) null else playbackTransportOutline()
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.size(width, PLAYBACK_TRANSPORT_CONTROL)) {
            content()
        }
    }
}

@Composable
internal fun PlaybackOutlinedSelector(
    label: String,
    modifier: Modifier = Modifier,
    width: Dp? = PLAYBACK_TRANSPORT_SELECTOR,
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
                .height(PLAYBACK_TRANSPORT_CONTROL)
                .testTag(testTag)
                .semantics {
                    contentDescription = caption ?: label
                    this.stateDescription = stateDescription
                    role = Role.Button
                },
            shape = RoundedCornerShape(PLAYBACK_TRANSPORT_CORNER),
            color = Color.Transparent,
            border = playbackTransportOutline()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(PLAYBACK_TRANSPORT_CONTROL)
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
internal fun PlaybackTransportBar(
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
    rootDegreeCue: PlaybackRootDegreeCue = PlaybackRootDegreeCue.OFF,
    onRootDegreeCueChange: (PlaybackRootDegreeCue) -> Unit = {},
    voiceVolume: Float = DEFAULT_PLAYBACK_VOICE_VOLUME,
    onVoiceVolumeChange: (Float) -> Unit = {},
    loopSection: Boolean = true,
    onLoopSectionChange: (Boolean) -> Unit = {},
    modifier: Modifier = Modifier,
    onPreviousSong: (() -> Unit)? = null,
    onNextSong: (() -> Unit)? = null,
    previousSongEnabled: Boolean = true,
    nextSongEnabled: Boolean = true
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(start = 12.dp, end = 12.dp, bottom = 8.dp),
        verticalArrangement = Arrangement.spacedBy(PLAYBACK_TRANSPORT_GAP)
    ) {
        Row(
            modifier = Modifier.width(PLAYBACK_TRANSPORT_WIDTH),
            horizontalArrangement = Arrangement.spacedBy(PLAYBACK_TRANSPORT_GAP),
            verticalAlignment = Alignment.CenterVertically
        ) {
            PlaybackTransportIconButton(
                onClick = onToggleFavorite,
                modifier = Modifier
                    .testTag(PLAYBACK_FAVORITE_STAR_TEST_TAG)
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
            PlaybackInstrumentMenu(
                selectedInstrument = currentWaveform,
                onInstrumentSelected = onWaveformChange
            )
            PlaybackTransposeMenu(
                transpose = transpose,
                onTransposeSelected = onTransposeChange
            )
            PlaybackVoiceControls(
                cue = rootDegreeCue,
                onCueChange = onRootDegreeCueChange,
                volume = voiceVolume,
                onVolumeChange = onVoiceVolumeChange,
                width = PLAYBACK_TRANSPORT_CONTROL
            )
            PlaybackTransportIconButton(
                onClick = onReset,
                enabled = resetEnabled,
                modifier = Modifier.semantics { contentDescription = "Reset" }
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
            }
            PlaybackTransportIconButton(
                onClick = onPlay,
                enabled = playEnabled,
                prominent = true,
                width = PLAYBACK_TRANSPORT_PLAY,
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
        if (showSecondaryRow || onPreviousSong != null || onNextSong != null) {
            Row(
                modifier = Modifier.width(PLAYBACK_TRANSPORT_WIDTH),
                horizontalArrangement = Arrangement.spacedBy(PLAYBACK_TRANSPORT_GAP),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (showSecondaryRow) {
                    PlaybackTransportIconButton(
                        onClick = onShowSongInfo,
                        modifier = Modifier
                            .testTag(PLAYBACK_INFO_BUTTON_TEST_TAG)
                            .semantics { contentDescription = "Song information" }
                    ) {
                        Icon(
                            Icons.Outlined.Info,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    PlaybackModeSelector(
                        isSimpleMode = isSimpleMode,
                        onSimpleModeChange = onSimpleModeChange
                    )
                    if (sectionOptions.size > 1) {
                        PlaybackSectionSelector(
                            options = sectionOptions,
                            selectedSectionId = selectedSectionId,
                            selectedSectionLabel = selectedSectionLabel,
                            onSectionChange = onSectionChange,
                            modifier = Modifier.weight(1f)
                        )
                    }
                    PlaybackSectionLoopToggle(
                        loopSection = loopSection,
                        onToggle = { onLoopSectionChange(!loopSection) }
                    )
                }
                onPreviousSong?.let { previous ->
                    PlaybackTransportIconButton(
                        onClick = previous,
                        enabled = previousSongEnabled,
                        modifier = Modifier.testTag("PlaybackPreviousSong")
                            .semantics { contentDescription = "Previous song" }
                    ) {
                        Icon(Icons.Default.KeyboardArrowLeft, contentDescription = null, modifier = Modifier.size(18.dp))
                    }
                }
                onNextSong?.let { next ->
                    PlaybackTransportIconButton(
                        onClick = next,
                        enabled = nextSongEnabled,
                        modifier = Modifier.testTag("PlaybackNextSong")
                            .semantics { contentDescription = "Next song" }
                    ) {
                        Icon(Icons.Default.KeyboardArrowRight, contentDescription = null, modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun PlaybackModeSelector(
    isSimpleMode: Boolean,
    onSimpleModeChange: (Boolean) -> Unit
) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val label = if (isSimpleMode) "Root" else "Full"
    PlaybackOutlinedSelector(
        label = label,
        caption = null,
        expanded = expanded,
        onExpandedChange = { expanded = it },
        testTag = PLAYBACK_MODE_SWITCH_TEST_TAG,
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

private val voiceOptionGroups = listOf(
    "Melody" to listOf(
        PlaybackRootDegreeCue.MELODY_FUNCTION,
        PlaybackRootDegreeCue.MELODY_CHORD_TONE
    ),
    "Chord" to listOf(
        PlaybackRootDegreeCue.SPOKEN_NUMBER,
        PlaybackRootDegreeCue.SUNG_NUMBER_WITH_DETAILS
    ),
    "Pulses" to listOf(
        PlaybackRootDegreeCue.ROOT_PULSES,
        PlaybackRootDegreeCue.HARMONIC_DISTANCE
    )
)

@Composable
private fun VoiceSectionHeading(title: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 0.dp)
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.semantics { heading() }
        )
        Divider(
            modifier = Modifier.padding(top = 1.dp),
            thickness = 1.dp,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
        )
    }
}

@Composable
private fun VoiceOptionRow(
    option: PlaybackRootDegreeCue,
    selectedCue: PlaybackRootDegreeCue,
    onSelect: (PlaybackRootDegreeCue) -> Unit
) {
    val isSelected = option == selectedCue
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 32.dp)
            .clickable { onSelect(option) }
            .padding(start = 28.dp, end = 8.dp)
            .testTag("PlaybackRootDegree-${option.name}")
            .semantics {
                role = Role.RadioButton
                selected = isSelected
            },
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = option.controlLabel,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f)
        )
        RadioButton(
            selected = isSelected,
            onClick = null,
            modifier = Modifier.size(20.dp)
        )
    }
}

private val PlaybackRootDegreeCue.controlLabel: String
    get() = when (this) {
        PlaybackRootDegreeCue.OFF -> "Off"
        PlaybackRootDegreeCue.ROOT_PULSES -> "Root Pulses"
        PlaybackRootDegreeCue.HARMONIC_DISTANCE -> "Harmonic Distance"
        PlaybackRootDegreeCue.SPOKEN_NUMBER -> "Spoken Number"
        PlaybackRootDegreeCue.SUNG_NUMBER_WITH_DETAILS -> "Sung Number + Details"
        PlaybackRootDegreeCue.MELODY_FUNCTION -> "Melody function"
        PlaybackRootDegreeCue.MELODY_CHORD_TONE -> "Melody chord tones"
    }

@Composable
private fun PlaybackSectionLoopToggle(
    loopSection: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier
) {
    val label = if (loopSection) "Loop" else "Song"
    PlaybackTransportIconButton(
        onClick = onToggle,
        width = PLAYBACK_SECTION_LOOP_WIDTH,
        modifier = modifier
            .testTag(PLAYBACK_SECTION_LOOP_TEST_TAG)
            .semantics {
                contentDescription = if (loopSection) {
                    "Looping this section"
                } else {
                    "Playing through the song"
                }
                stateDescription = label
                role = Role.Button
            }
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1
        )
    }
}

@Composable
internal fun PlaybackVoiceControls(
    cue: PlaybackRootDegreeCue,
    onCueChange: (PlaybackRootDegreeCue) -> Unit,
    volume: Float,
    onVolumeChange: (Float) -> Unit,
    modifier: Modifier = Modifier,
    width: Dp = 56.dp
) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val voiceIconTint = androidx.compose.material3.LocalContentColor.current
    PlaybackTransportIconButton(
        onClick = { expanded = !expanded },
        width = width,
        modifier = modifier
            .testTag(PLAYBACK_VOICE_BUTTON_TEST_TAG)
            .semantics {
                contentDescription = "Voice settings"
                stateDescription = cue.controlLabel
                role = Role.Button
            }
    ) {
        androidx.compose.foundation.Canvas(Modifier.size(24.dp)) {
            val stroke = Stroke(width = size.minDimension * 0.085f)
            val headRadius = size.minDimension * 0.18f
            drawCircle(
                color = voiceIconTint,
                radius = headRadius,
                center = androidx.compose.ui.geometry.Offset(size.width * 0.39f, size.height * 0.29f),
                style = stroke
            )
            val shoulders = Path().apply {
                moveTo(size.width * 0.10f, size.height * 0.88f)
                cubicTo(size.width * 0.11f, size.height * 0.57f, size.width * 0.67f, size.height * 0.57f, size.width * 0.69f, size.height * 0.88f)
            }
            drawPath(shoulders, voiceIconTint, style = stroke)
            val nearWave = Path().apply {
                moveTo(size.width * 0.67f, size.height * 0.35f)
                cubicTo(size.width * 0.83f, size.height * 0.40f, size.width * 0.83f, size.height * 0.60f, size.width * 0.67f, size.height * 0.65f)
            }
            val farWave = Path().apply {
                moveTo(size.width * 0.79f, size.height * 0.20f)
                cubicTo(size.width * 1.06f, size.height * 0.35f, size.width * 1.06f, size.height * 0.65f, size.width * 0.79f, size.height * 0.80f)
            }
            drawPath(nearWave, voiceIconTint, style = stroke)
            drawPath(farWave, voiceIconTint, style = stroke)
        }
    }
    if (expanded) {
        Dialog(onDismissRequest = { expanded = false }) {
            Surface(
                modifier = Modifier.width(300.dp),
                shape = RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.surface
            ) {
                Column(
                    modifier = Modifier
                        .heightIn(max = 560.dp)
                        .verticalScroll(rememberScrollState())
                        .padding(top = 8.dp, bottom = 4.dp)
                ) {
                    Text(
                        "Metadata Speak Aloud",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp)
                    )
                    VoiceOptionRow(PlaybackRootDegreeCue.OFF, cue) { selected ->
                        onCueChange(selected)
                        expanded = false
                    }
                    voiceOptionGroups.forEach { (group, options) ->
                        VoiceSectionHeading(group)
                        options.forEach { option ->
                            VoiceOptionRow(option, cue) { selected ->
                                onCueChange(selected)
                                expanded = false
                            }
                        }
                    }
                    Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp)) {
                        Text("Voice volume ${(volume * 100).roundToInt()}%", style = MaterialTheme.typography.labelMedium)
                        Slider(
                            value = volume,
                            onValueChange = onVolumeChange,
                            modifier = Modifier
                                .testTag(PLAYBACK_VOICE_VOLUME_TEST_TAG)
                                .semantics { contentDescription = "Voice volume" }
                        )
                    }
                    TextButton(
                        onClick = { expanded = false },
                        modifier = Modifier.align(Alignment.End).padding(end = 12.dp)
                    ) { Text("Done") }
                }
            }
        }
    }
}

@Composable
private fun PlaybackSectionSelector(
    options: List<Pair<String, String>>,
    selectedSectionId: String,
    selectedSectionLabel: String,
    onSectionChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    Box(modifier) {
        PlaybackOutlinedSelector(
            label = selectedSectionLabel,
            width = null,
            usesSubheadline = true,
            expanded = expanded,
            onExpandedChange = { expanded = it },
            testTag = PLAYBACK_SECTION_BUTTON_TEST_TAG,
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
                        modifier = Modifier.testTag("PlaybackSection-$id")
                    )
                }
            }
        }
    }
}
