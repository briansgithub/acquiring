package com.acquiring.android

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * Playback controls saved per song slug. Section changes keep the in-memory
 * values. A different song publishes defaults immediately, then replaces them
 * with that song's row if one exists. Full/Root and the selected section are
 * not stored here.
 */
internal class SongPlaybackSettingsViewModel : ViewModel() {
    var songSlug: String? = null
        private set

    var lockInMajor by mutableStateOf(false)
        private set

    var tempoPercent by mutableStateOf(DEFAULT_PLAYBACK_TEMPO_PERCENT)
        private set

    var arpeggioOptionIndex by mutableStateOf(DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX)
        private set

    var melodyChordBalance by mutableStateOf(DEFAULT_MELODY_CHORD_BALANCE)
        private set

    /** Null means the Settings default instrument, not a stored override. */
    var instrumentName by mutableStateOf<String?>(null)
        private set

    var transpose by mutableStateOf(0)
        private set

    var rootDegreeCue by mutableStateOf(PlaybackRootDegreeCue.OFF)
        private set

    var voiceVolume by mutableStateOf(DEFAULT_PLAYBACK_VOICE_VOLUME)
        private set

    var loopSection by mutableStateOf(true)
        private set

    private var dao: SongPlaybackSettingsDao? = null
    private var scopeOverride: CoroutineScope? = null
    private val scope: CoroutineScope
        get() = scopeOverride ?: viewModelScope

    private var loadGeneration = 0
    private var editedThisLoad = false
    private val pending = ArrayDeque<SongPlaybackSettings>()
    private var persistJob: Job? = null

    /** Tests pass a scheduler-controlled scope so loads can be held and released. */
    internal fun useScope(scope: CoroutineScope) {
        scopeOverride = scope
    }

    fun attachDao(dao: SongPlaybackSettingsDao) {
        this.dao = dao
        if (pending.isNotEmpty()) startPersistLoop()
    }

    fun enterSong(slug: String) {
        if (songSlug == slug) return
        songSlug = slug
        val generation = ++loadGeneration
        editedThisLoad = false
        applyDefaults()
        val store = dao ?: return
        scope.launch {
            val row = store.get(slug)?.let(::sanitizeSongPlaybackSettings)
            if (generation != loadGeneration || editedThisLoad) return@launch
            if (row != null) apply(row)
        }
    }

    fun clearSession() {
        loadGeneration++
        songSlug = null
        editedThisLoad = false
        applyDefaults()
    }

    fun updateLockInMajor(value: Boolean) = edit { lockInMajor = value }

    fun updateTempoPercent(value: Float) = edit {
        tempoPercent = if (value.isFinite()) value.coerceIn(0f, 200f) else DEFAULT_PLAYBACK_TEMPO_PERCENT
    }

    fun updateArpeggioOptionIndex(index: Int) = edit {
        arpeggioOptionIndex = index.takeIf { it in PLAYBACK_ARPEGGIO_OPTIONS.indices }
            ?: DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX
    }

    fun updateMelodyChordBalance(value: Float) = edit {
        melodyChordBalance = if (value.isFinite()) {
            value.coerceIn(0f, 1f)
        } else {
            DEFAULT_MELODY_CHORD_BALANCE
        }
    }

    fun updateInstrument(waveform: AudioEngine.Waveform) = edit { instrumentName = waveform.name }

    fun updateTranspose(value: Int) = edit {
        transpose = value.coerceIn(PLAYBACK_TRANSPOSE_RANGE.first, PLAYBACK_TRANSPOSE_RANGE.last)
    }

    fun updateRootDegreeCue(value: PlaybackRootDegreeCue) = edit { rootDegreeCue = value }

    fun updateVoiceVolume(value: Float) = edit {
        voiceVolume = if (value.isFinite()) value.coerceIn(0f, 1f) else DEFAULT_PLAYBACK_VOICE_VOLUME
    }

    fun updateLoopSection(value: Boolean) = edit { loopSection = value }

    private fun edit(update: () -> Unit) {
        if (songSlug == null) return
        update()
        editedThisLoad = true
        schedulePersist()
    }

    private fun schedulePersist() {
        val slug = songSlug ?: return
        val snapshot = snapshot(slug)
        val last = pending.lastOrNull()
        if (last != null && last.slug == slug) pending.removeLast()
        pending.addLast(snapshot)
        startPersistLoop()
    }

    private fun startPersistLoop() {
        if (persistJob?.isActive == true) return
        val store = dao ?: return
        persistJob = scope.launch {
            while (pending.isNotEmpty()) {
                store.upsert(pending.removeFirst())
            }
        }
    }

    private fun applyDefaults() {
        lockInMajor = false
        tempoPercent = DEFAULT_PLAYBACK_TEMPO_PERCENT
        arpeggioOptionIndex = DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX
        melodyChordBalance = DEFAULT_MELODY_CHORD_BALANCE
        instrumentName = null
        transpose = 0
        rootDegreeCue = PlaybackRootDegreeCue.OFF
        voiceVolume = DEFAULT_PLAYBACK_VOICE_VOLUME
        loopSection = true
    }

    private fun apply(row: SongPlaybackSettings) {
        lockInMajor = row.lockInMajor
        tempoPercent = row.tempoPercent
        arpeggioOptionIndex = row.arpeggioOptionIndex
        melodyChordBalance = row.melodyChordBalance
        instrumentName = row.instrument
        transpose = row.transpose
        rootDegreeCue = PlaybackRootDegreeCue.entries.firstOrNull { it.name == row.rootDegreeCue }
            ?: PlaybackRootDegreeCue.OFF
        voiceVolume = row.voiceVolume
        loopSection = row.loopSection
    }

    private fun snapshot(slug: String) = SongPlaybackSettings(
        slug = slug,
        lockInMajor = lockInMajor,
        tempoPercent = tempoPercent,
        arpeggioOptionIndex = arpeggioOptionIndex,
        melodyChordBalance = melodyChordBalance,
        instrument = instrumentName,
        transpose = transpose,
        rootDegreeCue = rootDegreeCue.name,
        voiceVolume = voiceVolume,
        loopSection = loopSection
    )
}
