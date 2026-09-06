package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Test

class InstrumentSessionOwnerTest {
    private class FakeStore(var identifier: String? = null) : InstrumentPreferenceStore {
        override fun readDefaultIdentifier(): String? = identifier
        override fun writeDefaultIdentifier(identifier: String) {
            this.identifier = identifier
        }
    }

    @Test
    fun missingAndInvalidDefaultsUseSawtooth() {
        assertEquals(
            AudioEngine.Waveform.SAWTOOTH,
            InstrumentSessionOwner(FakeStore()).sessionInstrument.value
        )
        assertEquals(
            AudioEngine.Waveform.SAWTOOTH,
            InstrumentSessionOwner(FakeStore("removed-instrument")).sessionInstrument.value
        )
    }

    @Test
    fun quizSelectionSurvivesScreensWithoutChangingSavedDefault() {
        val store = FakeStore(AudioEngine.Waveform.SAWTOOTH.name)
        val applied = mutableListOf<AudioEngine.Waveform>()
        val session = InstrumentSessionOwner(store, applied::add)

        session.selectForSession(AudioEngine.Waveform.WARM_ORGAN)

        assertEquals(AudioEngine.Waveform.WARM_ORGAN, session.sessionInstrument.value)
        assertEquals(AudioEngine.Waveform.SAWTOOTH, session.defaultInstrument.value)
        assertEquals(AudioEngine.Waveform.SAWTOOTH.name, store.identifier)
        assertEquals(AudioEngine.Waveform.WARM_ORGAN, applied.last())
    }

    @Test
    fun changingDefaultUpdatesTheSessionAndPersistsForRelaunch() {
        val store = FakeStore()
        val session = InstrumentSessionOwner(store)

        session.selectForSession(AudioEngine.Waveform.SINE)
        session.selectAsDefault(AudioEngine.Waveform.ELECTRIC_PIANO)
        val relaunched = InstrumentSessionOwner(store)

        assertEquals(AudioEngine.Waveform.ELECTRIC_PIANO, session.defaultInstrument.value)
        assertEquals(AudioEngine.Waveform.ELECTRIC_PIANO, session.sessionInstrument.value)
        assertEquals(AudioEngine.Waveform.ELECTRIC_PIANO, relaunched.sessionInstrument.value)
    }
}
