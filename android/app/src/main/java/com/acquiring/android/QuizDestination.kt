package com.acquiring.android

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal const val QUIZ_SCREEN_TEST_TAG = "QuizScreen"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuizDestination(
    song: Song,
    sections: Map<String, ExtractedSection>,
    selectedSectionId: String?,
    onSectionChange: (String) -> Unit,
    currentWaveform: AudioEngine.Waveform,
    onWaveformChange: (AudioEngine.Waveform) -> Unit,
    globalTranspose: Int,
    quizTempoPercent: Float,
    onQuizTempoPercentChange: (Float) -> Unit,
    quizArpeggioOptionIndex: Int,
    onQuizArpeggioOptionIndexChange: (Int) -> Unit,
    onTransposeChange: (Int) -> Unit,
    quizPlayButtonXFraction: Float,
    quizPlayButtonYFraction: Float,
    onQuizPlayButtonPositionChange: (Float, Float) -> Unit,
    onArtistClick: (String) -> Unit,
    onShowSongInfo: () -> Unit,
    onSingingTargetsRequested: (SingingTargetRequest) -> Unit,
    comfortablePitchMidi: Double?,
    lastSourceMidi: Int?,
    lastTargetMidi: Int?,
    onUpdateContinuity: (Int, Int) -> Unit,
    tessituraControl: @Composable () -> Unit,
    persistentPitchSource: PitchSource,
    isFavorite: Boolean,
    onToggleFavorite: () -> Unit,
    onBack: () -> Unit
) {
    val sectionsInSongOrder = remember(sections) { sections.sectionsInSongOrder() }
    val selectedSectionKey = selectedSectionId
        ?.takeIf { selectedId -> sectionsInSongOrder.any { it.key == selectedId } }
        ?: sectionsInSongOrder.firstOrNull()?.key
        ?: sections.keys.firstOrNull()
    val selectedSection = sections[selectedSectionKey]
        ?: sectionsInSongOrder.firstOrNull()?.value
        ?: sections.values.first()
    var isSectionExpanded by remember { mutableStateOf(false) }
    var isSimpleMode by remember { mutableStateOf(false) }
    var useRelativeIonianContext by remember { mutableStateOf(false) }
    var quizKeyDisplay by remember { mutableStateOf<QuizKeyDisplay?>(null) }
    val quizArtistLabel = song.artist?.takeIf { it.isNotBlank() }?.let { song.displayArtist }
    val quizArtistQuery = song.artist?.takeIf { it.isNotBlank() }?.let(::canonicalArtistName)

    val transposePickerComposable: @Composable () -> Unit = {
        QuizTransposeMenu(globalTranspose, onTransposeChange)
    }

    val sectionPickerComposable: @Composable () -> Unit = {
        if (sectionsInSongOrder.size > 1) {
            ExposedDropdownMenuBox(
                expanded = isSectionExpanded,
                onExpandedChange = { isSectionExpanded = !isSectionExpanded },
                modifier = Modifier.width(180.dp)
            ) {
                OutlinedTextField(
                    value = selectedSection.safeSectionName,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Section") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = isSectionExpanded) },
                    colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors(),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(64.dp)
                        .menuAnchor()
                        .testTag(QUIZ_SECTION_BUTTON_TEST_TAG)
                )

                ExposedDropdownMenuWithScrollbar(
                    expanded = isSectionExpanded,
                    onDismissRequest = { isSectionExpanded = false }
                ) {
                    sectionsInSongOrder.forEach { (id, section) ->
                        DropdownMenuItem(
                            text = { Text(section.safeSectionName) },
                            onClick = {
                                onSectionChange(id)
                                isSectionExpanded = false
                            },
                            modifier = Modifier.testTag("QuizSection-$id")
                        )
                    }
                }
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .testTag(QUIZ_SCREEN_TEST_TAG)
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .padding(horizontal = 8.dp)
            ) {
                TextButton(
                    onClick = onBack,
                    contentPadding = PaddingValues(horizontal = 8.dp),
                    modifier = Modifier.align(Alignment.CenterStart).height(48.dp)
                ) { Text("< Back") }

                Row(
                    modifier = Modifier.align(Alignment.Center).padding(horizontal = 96.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (!isSimpleMode) {
                        Text(
                            text = song.displayTitle,
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 1
                        )
                        if (quizArtistLabel != null && quizArtistQuery != null) {
                            Text(" by ", style = MaterialTheme.typography.bodySmall)
                            TextButton(
                                onClick = { onArtistClick(quizArtistQuery) },
                                contentPadding = PaddingValues(0.dp),
                                modifier = Modifier
                                    .height(28.dp)
                                    .semantics { contentDescription = quizArtistLabel }
                            ) {
                                Text(text = quizArtistLabel, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                            }
                        }
                    }
                }

                Row(modifier = Modifier.align(Alignment.CenterEnd)) {
                    IconButton(
                        onClick = onShowSongInfo,
                        modifier = Modifier.size(48.dp).testTag(QUIZ_INFO_BUTTON_TEST_TAG)
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Info,
                            contentDescription = "Song information",
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    IconButton(
                        onClick = onToggleFavorite,
                        modifier = Modifier
                            .size(48.dp)
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
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(40.dp)
                    .padding(horizontal = 16.dp)
            ) {
                Row(
                    modifier = Modifier.align(Alignment.CenterStart),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Lock in Major",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Start
                    )
                    Checkbox(
                        checked = useRelativeIonianContext,
                        onCheckedChange = { useRelativeIonianContext = it },
                        modifier = Modifier
                            .scale(0.85f)
                            .semantics { contentDescription = "Lock in Major" }
                    )
                }

                quizKeyDisplay?.let { keyDisplay ->
                    Text(
                        text = keyDisplay.label,
                        textAlign = TextAlign.Center,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold,
                        color = keyDisplay.color,
                        maxLines = 1,
                        modifier = if (keyDisplay.isLockedToMajor) {
                            Modifier
                                .align(Alignment.Center)
                                .border(1.dp, Color.Red, RoundedCornerShape(4.dp))
                                .padding(horizontal = 8.dp, vertical = 2.dp)
                        } else {
                            Modifier.align(Alignment.Center)
                        }
                    )
                }
            }
        }

        QuizTab(
            section = selectedSection,
            isSimpleMode = isSimpleMode,
            onSimpleModeChange = { isSimpleMode = it },
            useRelativeIonianContext = useRelativeIonianContext,
            currentWaveform = currentWaveform,
            onWaveformChange = onWaveformChange,
            sectionPicker = sectionPickerComposable,
            transposePicker = transposePickerComposable,
            tessituraControl = tessituraControl,
            onKeyDisplayChange = { quizKeyDisplay = it },
            globalTranspose = globalTranspose,
            tempoPercent = quizTempoPercent,
            onTempoPercentChange = onQuizTempoPercentChange,
            arpeggioOptionIndex = quizArpeggioOptionIndex,
            onArpeggioOptionIndexChange = onQuizArpeggioOptionIndexChange,
            quizPlayButtonXFraction = quizPlayButtonXFraction,
            quizPlayButtonYFraction = quizPlayButtonYFraction,
            onQuizPlayButtonPositionChange = onQuizPlayButtonPositionChange,
            onSingingTargetsRequested = onSingingTargetsRequested,
            comfortablePitchMidi = comfortablePitchMidi,
            lastSourceMidi = lastSourceMidi,
            lastTargetMidi = lastTargetMidi,
            onUpdateContinuity = onUpdateContinuity,
            sessionKey = "${song.slug}:${selectedSectionKey.orEmpty()}",
            persistentPitchSource = persistentPitchSource
        )
    }
}
