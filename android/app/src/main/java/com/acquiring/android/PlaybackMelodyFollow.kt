package com.acquiring.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.ui.graphics.Color
import kotlinx.serialization.json.JsonObject

internal data class MelodyFollowUi(
    val pitch: SpelledPitch?,
    val currentLabel: String,
    val previousLabel: String,
    val intervalState: MelodyIntervalState?,
    val pitchCards: List<MelodyPitchCard>,
    val displayMode: MelodyPitchCardDisplayMode,
    val functionText: String,
    val functionColor: Color
)

/**
 * Reads the playhead beat in its own composition, so a new melody note can
 * refresh the caption without rebuilding the timeline canvas.
 */
@Composable
internal fun PlaybackMelodyFollow(
    beatState: State<Double>,
    section: ExtractedSection,
    melody: List<MelodyNote>,
    activeEventIndex: PlaybackActiveEventIndex,
    isSimpleMode: Boolean,
    sungMelodyPitches: List<SpelledPitch?>,
    useRelativeIonianContext: Boolean,
    ionianContextKey: KeyInfo,
    currentChord: JsonObject?,
    content: @Composable (MelodyFollowUi) -> Unit
) {
    val beat = beatState.value
    val currentMelodyNote = activeEventIndex.melodyNoteAtBeat(beat)
    val melodyIntervalState = if (isSimpleMode || currentMelodyNote == null) {
        null
    } else {
        resolveMelodyIntervalState(melody, currentMelodyNote.beat, section::getKeyAtBeat)?.let { state ->
            val index = melody.indexOfFirst { it === currentMelodyNote }
            val current = sungMelodyPitches.getOrNull(index) ?: state.current
            val previous = sungMelodyPitches.getOrNull(index - 1) ?: state.previous
            state.copy(
                previous = previous,
                current = current,
                interval = calculateNamedInterval(previous, current)
            )
        }
    }
    val currentMelodyPitch = currentMelodyNote
        ?.takeIf { note -> !note.isRest && note.duration > 0.0 }
        ?.let { note -> sungMelodyPitches.getOrNull(melody.indexOfFirst { it === note }) }
    val previousLabel = melodyIntervalState?.let { state ->
        if (useRelativeIonianContext) ionianContextDegreeLabel(state.previous, ionianContextKey)
        else state.previousDegreeLabel
    }.orEmpty()
    val currentLabel = currentMelodyPitch?.let { pitch ->
        if (useRelativeIonianContext) {
            ionianContextDegreeLabel(pitch, ionianContextKey)
        } else {
            melodyIntervalState?.currentDegreeLabel
                ?: currentMelodyNote?.let { note ->
                    MusicTheory.getDegreeLabelFromSpelling(
                        pitch,
                        section.getKeyAtBeat(normalizePlaybackBeat(note.beat))
                    )
                }.orEmpty()
        }
    }.orEmpty()
    val description = describeMelodyFunction(
        buildMelodyFunctionInput(
            section = section,
            melody = melody,
            activeNote = currentMelodyNote,
            activeChord = currentChord
        )
    )
    content(
        MelodyFollowUi(
            pitch = currentMelodyPitch,
            currentLabel = currentLabel,
            previousLabel = previousLabel,
            intervalState = melodyIntervalState,
            pitchCards = melodyIntervalState?.let { state ->
                buildMelodyPitchCards(
                    state = state,
                    previousLabel = previousLabel,
                    currentLabel = currentLabel
                )
            }.orEmpty(),
            displayMode = melodyPitchCardDisplayMode(currentMelodyPitch, melodyIntervalState),
            functionText = melodyFunctionCardText(description),
            functionColor = if (description.tone == MelodyFunctionTone.NEUTRAL) {
                MaterialTheme.colorScheme.onPrimary
            } else {
                melodyFunctionColor(description.tone)
            }
        )
    )
}
