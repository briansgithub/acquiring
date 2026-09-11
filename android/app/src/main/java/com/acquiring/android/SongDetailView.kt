package com.acquiring.android

import android.content.Context
import android.content.Intent
import android.content.ActivityNotFoundException
import android.graphics.Paint
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.focusTarget
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.style.TextAlign

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.exponentialDecay
import androidx.compose.animation.core.tween
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.input.pointer.util.addPointerInputChange
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.Info
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.zIndex
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import androidx.room.Room
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.*
import kotlin.math.min
import kotlin.math.roundToInt


internal const val QUIZ_FAVORITE_STAR_TEST_TAG = "QuizFavoriteStar"
internal const val QUIZ_INFO_BUTTON_TEST_TAG = "QuizInfoButton"
internal const val QUIZ_SECTION_BUTTON_TEST_TAG = "QuizSectionButton"
internal const val QUIZ_MODE_SWITCH_TEST_TAG = "QuizModeSwitch"
internal const val QUIZ_TEMPO_DIAL_TEST_TAG = "QuizTempoDial"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SongDetailView(
    song: Song,
    complexityRating: Double? = null,
    sections: Map<String, ExtractedSection>,
    selectedSectionId: String?,
    onSectionChange: (String) -> Unit,
    currentTab: Int,
    onTabChange: (Int) -> Unit,
    showLetterNames: Boolean,
    onShowLetterNamesChange: (Boolean) -> Unit,
    isArpeggiated: Boolean,
    onArpeggiatedChange: (Boolean) -> Unit,
    arpeggioStepMs: Float,
    onArpeggioStepMsChange: (Float) -> Unit,
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
    val selectedSection = sections[selectedSectionKey] ?: sectionsInSongOrder.firstOrNull()?.value ?: sections.values.first()
    var isSectionExpanded by remember { mutableStateOf(false) }
    var isSimpleMode by remember { mutableStateOf(false) }
    var useRelativeIonianContext by remember { mutableStateOf(false) }
    // The quiz's key/scale readout is rendered by the song header rather than by
    // QuizTab itself, so QuizTab publishes it up here as playback moves through
    // key changes.
    var quizKeyDisplay by remember { mutableStateOf<QuizKeyDisplay?>(null) }
    val uriHandler = LocalUriHandler.current

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
    
    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
        if (currentTab != 2) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp)
            ) {
                TextButton(onClick = onBack) { Text("< Back") }
                Text(
                    text = selectedSection.safeSongInfo,
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f).padding(start = 8.dp)
                )
                // The source link lives on the song info page only.
                if (currentTab == 0) {
                    TextButton(onClick = { uriHandler.openUri(song.url) }) { Text("URL") }
                }
            }
        } else {
            val canonicalArtist = song.artist
                ?.takeIf { it.isNotBlank() }
                ?.let(::canonicalArtistName)
            Column(modifier = Modifier.fillMaxWidth()) {
                // Back shares the title line: it sits at the start while the
                // "song by artist" string stays centred on the screen.
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
                        // Symmetric inset keeps the string centred on the screen
                        // while stopping a long title from running under the buttons.
                        modifier = Modifier.align(Alignment.Center).padding(horizontal = 96.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        if (!isSimpleMode) {
                            Text(
                                text = song.title ?: "Unknown Title",
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 1
                            )
                            canonicalArtist?.let { artist ->
                                Text(" by ", style = MaterialTheme.typography.bodySmall)
                                TextButton(
                                    onClick = { onArtistClick(artist) },
                                    contentPadding = PaddingValues(0.dp),
                                    modifier = Modifier.height(28.dp)
                                ) {
                                    Text(text = artist, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                                }
                            }
                        }
                    }

                    Row(modifier = Modifier.align(Alignment.CenterEnd)) {
                        IconButton(
                            onClick = { onTabChange(0) },
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
        }

        if (currentTab != 2) {
            ScrollableTabRow(
                selectedTabIndex = currentTab,
                edgePadding = 0.dp
            ) {
                Tab(selected = currentTab == 0, onClick = { onTabChange(0) }) {
                    Text("Info", modifier = Modifier.padding(16.dp))
                }
                Tab(selected = currentTab == 1, onClick = { onTabChange(1) }) {
                    Text("Chords", modifier = Modifier.padding(16.dp))
                }
                Tab(selected = currentTab == 2, onClick = { onTabChange(2) }) {
                    Text("Quiz", modifier = Modifier.padding(16.dp))
                }
            }
        }

        when (currentTab) {
            0 -> InfoTab(
                song,
                complexityRating,
                selectedSection,
                sections,
                selectedSectionKey,
                onSectionChange
            )
            1 -> ChordsTab(
                section = selectedSection,
                showLetterNames = showLetterNames,
                onShowLetterNamesChange = onShowLetterNamesChange,
                isArpeggiated = isArpeggiated,
                onArpeggiatedChange = onArpeggiatedChange,
                arpeggioStepMs = arpeggioStepMs,
                onArpeggioStepMsChange = onArpeggioStepMsChange
            )
            2 -> QuizTab(
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

        // Section selector overlay for non-Quiz tabs
        if (currentTab != 2 && sectionsInSongOrder.size > 1) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(16.dp)
            ) {
                sectionPickerComposable()
            }
        }
    }
}

/** The quiz's live key/scale readout, hoisted so the song header can render it. */
data class QuizKeyDisplay(
    val label: String,
    val color: Color,
    val isLockedToMajor: Boolean
)
