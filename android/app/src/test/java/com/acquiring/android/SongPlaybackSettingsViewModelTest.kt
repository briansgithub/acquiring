package com.acquiring.android

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SongPlaybackSettingsViewModelTest {
    @Test
    fun missingRowStaysAtDefaultsAndWritesNothing() = runTest {
        val dao = FakeDao()
        val state = viewModel(dao)
        state.enterSong("song-a")
        advanceUntilIdle()

        assertEquals(DEFAULT_PLAYBACK_TEMPO_PERCENT, state.tempoPercent)
        assertEquals(DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX, state.arpeggioOptionIndex)
        assertEquals(DEFAULT_MELODY_CHORD_BALANCE, state.melodyChordBalance)
        assertEquals(PlaybackRootDegreeCue.OFF, state.rootDegreeCue)
        assertEquals(DEFAULT_PLAYBACK_VOICE_VOLUME, state.voiceVolume)
        assertEquals(0, state.transpose)
        assertFalse(state.lockInMajor)
        assertTrue(state.loopSection)
        assertNull(state.instrumentName)
        assertEquals(0, dao.upserts)
        assertTrue(dao.rows.isEmpty())
    }

    @Test
    fun roundTripRestoresTheSavedSnapshot() = runTest {
        val dao = FakeDao()
        val state = viewModel(dao)
        state.enterSong("song-a")
        advanceUntilIdle()
        state.updateLockInMajor(true)
        state.updateTempoPercent(90f)
        state.updateArpeggioOptionIndex(1)
        state.updateMelodyChordBalance(0.25f)
        state.updateInstrument(AudioEngine.Waveform.FLUTE)
        state.updateTranspose(99)
        state.updateRootDegreeCue(PlaybackRootDegreeCue.SPOKEN_NUMBER)
        state.updateVoiceVolume(0.8f)
        state.updateLoopSection(false)
        advanceUntilIdle()

        state.clearSession()
        assertEquals(DEFAULT_PLAYBACK_TEMPO_PERCENT, state.tempoPercent)
        assertNull(state.instrumentName)

        state.enterSong("song-a")
        advanceUntilIdle()
        assertTrue(state.lockInMajor)
        assertEquals(90f, state.tempoPercent)
        assertEquals(1, state.arpeggioOptionIndex)
        assertEquals(0.25f, state.melodyChordBalance)
        assertEquals(AudioEngine.Waveform.FLUTE.name, state.instrumentName)
        assertEquals(PLAYBACK_TRANSPOSE_RANGE.last, state.transpose)
        assertEquals(PlaybackRootDegreeCue.SPOKEN_NUMBER, state.rootDegreeCue)
        assertEquals(0.8f, state.voiceVolume)
        assertFalse(state.loopSection)
    }

    @Test
    fun changingSongPublishesDefaultsImmediately() = runTest {
        val dao = FakeDao()
        val state = viewModel(dao)
        state.enterSong("song-a")
        advanceUntilIdle()
        state.updateTempoPercent(80f)
        state.updateInstrument(AudioEngine.Waveform.FLUTE)
        advanceUntilIdle()

        state.enterSong("song-b")
        assertEquals(DEFAULT_PLAYBACK_TEMPO_PERCENT, state.tempoPercent)
        assertNull(state.instrumentName)
        assertEquals("song-b", state.songSlug)

        advanceUntilIdle()
        assertEquals(80f, dao.rows.getValue("song-a").tempoPercent)
        assertEquals(AudioEngine.Waveform.FLUTE.name, dao.rows.getValue("song-a").instrument)
        assertNull(dao.rows["song-b"])
        assertEquals(DEFAULT_PLAYBACK_TEMPO_PERCENT, state.tempoPercent)
    }

    @Test
    fun reenteringTheSameSongKeepsTheValues() = runTest {
        val dao = FakeDao()
        val state = viewModel(dao)
        state.enterSong("song-a")
        advanceUntilIdle()
        state.updateTempoPercent(80f)
        state.updateLoopSection(false)
        val gets = dao.gets
        state.enterSong("song-a")
        advanceUntilIdle()

        assertEquals(80f, state.tempoPercent)
        assertFalse(state.loopSection)
        assertEquals(gets, dao.gets)
    }

    @Test
    fun lateLoadCannotClobberANewerEdit() = runTest {
        val dao = FakeDao()
        val gate = CompletableDeferred<Unit>()
        dao.holdNextGet(gate)
        dao.rows["song-a"] = saved("song-a", tempoPercent = 40f)
        val state = viewModel(dao)
        state.enterSong("song-a")
        advanceUntilIdle()
        state.updateTempoPercent(80f)
        gate.complete(Unit)
        advanceUntilIdle()

        assertEquals(80f, state.tempoPercent)
        assertEquals(80f, dao.rows.getValue("song-a").tempoPercent)
    }

    @Test
    fun lateLoadForThePreviousSongDoesNotApply() = runTest {
        val dao = FakeDao()
        val gate = CompletableDeferred<Unit>()
        dao.holdNextGet(gate)
        val state = viewModel(dao)
        state.enterSong("song-a")
        advanceUntilIdle()
        dao.rows["song-a"] = saved("song-a", tempoPercent = 40f)
        state.enterSong("song-b")
        assertEquals(DEFAULT_PLAYBACK_TEMPO_PERCENT, state.tempoPercent)
        gate.complete(Unit)
        advanceUntilIdle()

        assertEquals("song-b", state.songSlug)
        assertEquals(DEFAULT_PLAYBACK_TEMPO_PERCENT, state.tempoPercent)
        assertNull(state.instrumentName)
    }

    @Test
    fun invalidStoredFieldsFallBackAndNullInstrumentStaysNull() = runTest {
        val dao = FakeDao()
        dao.rows["song-a"] = saved("song-a").copy(
            tempoPercent = 500f,
            arpeggioOptionIndex = 99,
            melodyChordBalance = 0.2f,
            instrument = "BANJO",
            transpose = 3,
            rootDegreeCue = "NOPE",
            voiceVolume = 0.7f,
            lockInMajor = true,
            loopSection = false
        )
        dao.rows["song-b"] = saved("song-b", tempoPercent = 90f).copy(instrument = null)
        val state = viewModel(dao)
        state.enterSong("song-a")
        advanceUntilIdle()

        assertEquals(DEFAULT_PLAYBACK_TEMPO_PERCENT, state.tempoPercent)
        assertEquals(DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX, state.arpeggioOptionIndex)
        assertEquals(PlaybackRootDegreeCue.OFF, state.rootDegreeCue)
        assertNull(state.instrumentName)
        assertEquals(0.2f, state.melodyChordBalance)
        assertEquals(3, state.transpose)
        assertEquals(0.7f, state.voiceVolume)
        assertTrue(state.lockInMajor)
        assertFalse(state.loopSection)
        assertEquals(0, dao.upserts)

        state.enterSong("song-b")
        advanceUntilIdle()
        assertNull(state.instrumentName)
        assertEquals(90f, state.tempoPercent)
        assertNull(dao.rows.getValue("song-b").instrument)
    }

    @Test
    fun sliderTicksCoalesceToTheLatestSnapshot() = runTest {
        val dao = FakeDao()
        val gate = CompletableDeferred<Unit>()
        dao.upsertGate = gate
        val state = viewModel(dao)
        state.enterSong("song-a")
        advanceUntilIdle()
        state.updateTempoPercent(10f)
        advanceUntilIdle()
        state.updateTempoPercent(20f)
        state.updateTempoPercent(30f)
        assertEquals(1, dao.upserts)
        gate.complete(Unit)
        advanceUntilIdle()

        assertEquals(30f, dao.rows.getValue("song-a").tempoPercent)
        assertEquals(2, dao.upserts)
    }

    private fun kotlinx.coroutines.test.TestScope.viewModel(dao: FakeDao): SongPlaybackSettingsViewModel =
        SongPlaybackSettingsViewModel().apply {
            useScope(this@viewModel)
            attachDao(dao)
        }

    private fun saved(slug: String, tempoPercent: Float = DEFAULT_PLAYBACK_TEMPO_PERCENT) = SongPlaybackSettings(
        slug = slug,
        lockInMajor = false,
        tempoPercent = tempoPercent,
        arpeggioOptionIndex = DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX,
        melodyChordBalance = DEFAULT_MELODY_CHORD_BALANCE,
        instrument = null,
        transpose = 0,
        rootDegreeCue = PlaybackRootDegreeCue.OFF.name,
        voiceVolume = DEFAULT_PLAYBACK_VOICE_VOLUME,
        loopSection = true
    )

    private class FakeDao : SongPlaybackSettingsDao {
        val rows = mutableMapOf<String, SongPlaybackSettings>()
        var gets = 0
        var upserts = 0
        var upsertGate: CompletableDeferred<Unit>? = null
        private val getGates = ArrayDeque<CompletableDeferred<Unit>>()

        fun holdNextGet(gate: CompletableDeferred<Unit>) {
            getGates.addLast(gate)
        }

        override suspend fun get(slug: String): SongPlaybackSettings? {
            gets++
            if (getGates.isNotEmpty()) getGates.removeFirst().await()
            return rows[slug]
        }

        override suspend fun upsert(entity: SongPlaybackSettings) {
            upserts++
            upsertGate?.await()
            upsertGate = null
            rows[entity.slug] = entity
        }
    }
}
