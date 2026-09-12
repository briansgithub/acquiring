package com.acquiring.android

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

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
    onArtistClick: (String) -> Unit,
    onShowSongInfo: () -> Unit,
    onSingingTargetsRequested: (SingingTargetRequest) -> Unit,
    octaveOffset: Int,
    persistentPitchSource: PitchSource,
    isFavorite: Boolean,
    onToggleFavorite: () -> Unit,
    onBack: () -> Unit,
    singingDockExpanded: Boolean = false,
    stopPersistentSignal: Int = 0,
    onPersistentMonitoringChange: (Boolean) -> Unit = {},
    onRequestCollapseDock: () -> Unit = {}
) {
    val sectionsInSongOrder = remember(sections) { sections.sectionsInSongOrder() }
    val selectedSectionKey = selectedSectionId
        ?.takeIf { selectedId -> sectionsInSongOrder.any { it.key == selectedId } }
        ?: sectionsInSongOrder.firstOrNull()?.key
        ?: sections.keys.firstOrNull()
    val selectedSection = sections[selectedSectionKey]
        ?: sectionsInSongOrder.firstOrNull()?.value
        ?: sections.values.first()
    var isSimpleMode by remember { mutableStateOf(false) }
    var useRelativeIonianContext by remember { mutableStateOf(false) }
    var quizKeyDisplay by remember { mutableStateOf<QuizKeyDisplay?>(null) }
    var showTitleSheet by remember { mutableStateOf(false) }
    var showQuizHelp by remember { mutableStateOf(false) }
    var isPlaying by remember { mutableStateOf(false) }
    var playEnabled by remember { mutableStateOf(false) }
    var isPersistentMonitoring by remember { mutableStateOf(false) }
    val playAction = remember { arrayOf({}) }
    val resetAction = remember { arrayOf({}) }
    val persistentToggle = remember { arrayOf({}) }
    val persistentStop = remember { arrayOf({}) }
    val quizArtistLabel = song.artist?.takeIf { it.isNotBlank() }?.let { song.displayArtist }
    val quizTitleText = buildString {
        append(song.displayTitle)
        if (quizArtistLabel != null) {
            append(" by ")
            append(quizArtistLabel)
        }
    }
    LaunchedEffect(isPersistentMonitoring) {
        onPersistentMonitoringChange(isPersistentMonitoring)
        if (isPersistentMonitoring) onRequestCollapseDock()
    }
    var handledStopSignal by remember { mutableStateOf(stopPersistentSignal) }
    LaunchedEffect(stopPersistentSignal) {
        if (stopPersistentSignal == handledStopSignal) return@LaunchedEffect
        handledStopSignal = stopPersistentSignal
        persistentStop[0]()
    }

    Box(modifier = Modifier.fillMaxSize()) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .testTag(QUIZ_SCREEN_TEST_TAG)
    ) {
        QuizScreenHeader(
            titleText = quizTitleText.takeUnless { isSimpleMode },
            onBack = onBack,
            onTitleClick = { showTitleSheet = true },
            useRelativeIonianContext = useRelativeIonianContext,
            onLockInMajorChange = { useRelativeIonianContext = it },
            keyDisplay = quizKeyDisplay,
            isMonitoring = isPersistentMonitoring,
            onToggleMonitoring = { persistentToggle[0]() },
            onShowHelp = { showQuizHelp = true }
        )

        QuizTab(
            section = selectedSection,
            isSimpleMode = isSimpleMode,
            onSimpleModeChange = { isSimpleMode = it },
            useRelativeIonianContext = useRelativeIonianContext,
            currentWaveform = currentWaveform,
            onWaveformChange = onWaveformChange,
            onKeyDisplayChange = { quizKeyDisplay = it },
            globalTranspose = globalTranspose,
            tempoPercent = quizTempoPercent,
            onTempoPercentChange = onQuizTempoPercentChange,
            arpeggioOptionIndex = quizArpeggioOptionIndex,
            onArpeggioOptionIndexChange = onQuizArpeggioOptionIndexChange,
            onSingingTargetsRequested = onSingingTargetsRequested,
            octaveOffset = octaveOffset,
            sessionKey = "${song.slug}:${selectedSectionKey.orEmpty()}",
            persistentPitchSource = persistentPitchSource,
            modifier = Modifier.weight(1f),
            onTransportActions = { playing, enabled, play, reset ->
                playAction[0] = play
                resetAction[0] = reset
                if (isPlaying != playing) isPlaying = playing
                if (playEnabled != enabled) playEnabled = enabled
            },
            onPersistentPracticeActions = { active, toggle, stop ->
                persistentToggle[0] = toggle
                persistentStop[0] = stop
                if (isPersistentMonitoring != active) isPersistentMonitoring = active
            }
        )

        QuizTransportBar(
            showSecondaryRow = !singingDockExpanded,
            isFavorite = isFavorite,
            onToggleFavorite = onToggleFavorite,
            currentWaveform = currentWaveform,
            onWaveformChange = onWaveformChange,
            transpose = globalTranspose,
            onTransposeChange = onTransposeChange,
            onReset = { resetAction[0]() },
            resetEnabled = true,
            isPlaying = isPlaying,
            playEnabled = playEnabled,
            onPlay = { playAction[0]() },
            onShowSongInfo = onShowSongInfo,
            isSimpleMode = isSimpleMode,
            onSimpleModeChange = { isSimpleMode = it },
            sectionOptions = sectionsInSongOrder.map { it.key to it.value.safeSectionName },
            selectedSectionId = selectedSectionKey.orEmpty(),
            selectedSectionLabel = selectedSection.safeSectionName,
            onSectionChange = onSectionChange
        )
    }
        if (showQuizHelp) {
            Surface(
                color = MaterialTheme.colorScheme.scrim.copy(alpha = 0.72f),
                modifier = Modifier
                    .fillMaxSize()
                    .clickable { showQuizHelp = false }
                    .semantics { contentDescription = "Quiz help overlay" }
            ) {
                Column(modifier = Modifier.padding(24.dp)) {
                    Text("Quiz help", style = MaterialTheme.typography.titleLarge)
                    Text(
                        "Tap a card to hear it. Double-tap to sing it back. Use the microphone button for live pitch practice.",
                        modifier = Modifier.padding(top = 12.dp)
                    )
                    Text(
                        "The singing dock’s octave offset moves targets only. Expand the dock from its handle without starting the microphone.",
                        modifier = Modifier.padding(top = 8.dp)
                    )
                    Text(
                        "Tap anywhere to dismiss without activating a control.",
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            }
        }
        if (showTitleSheet) {
            ModalBottomSheet(onDismissRequest = { showTitleSheet = false }) {
                SelectionContainer {
                    Text(
                        text = quizTitleText,
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp)
                    )
                }
            }
        }
    }
}
