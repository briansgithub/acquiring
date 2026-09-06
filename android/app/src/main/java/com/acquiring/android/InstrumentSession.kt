package com.acquiring.android

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

internal interface InstrumentPreferenceStore {
    fun readDefaultIdentifier(): String?
    fun writeDefaultIdentifier(identifier: String)
}

private class SharedPreferencesInstrumentStore(context: Context) : InstrumentPreferenceStore {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    override fun readDefaultIdentifier(): String? = preferences.getString(DEFAULT_INSTRUMENT_KEY, null)

    override fun writeDefaultIdentifier(identifier: String) {
        preferences.edit().putString(DEFAULT_INSTRUMENT_KEY, identifier).apply()
    }

    companion object {
        private const val PREFERENCES_NAME = "instrument_preferences"
        private const val DEFAULT_INSTRUMENT_KEY = "default_instrument"
    }
}

/**
 * Owns the saved default and the transient instrument for one application session.
 * Quiz choices only change [sessionInstrument]; Settings changes both values.
 */
internal class InstrumentSessionOwner(
    private val store: InstrumentPreferenceStore,
    private val applyInstrument: (AudioEngine.Waveform) -> Unit = {}
) {
    private val initialInstrument = decode(store.readDefaultIdentifier())
    private val mutableDefaultInstrument = MutableStateFlow(initialInstrument)
    private val mutableSessionInstrument = MutableStateFlow(initialInstrument)

    val defaultInstrument: StateFlow<AudioEngine.Waveform> = mutableDefaultInstrument.asStateFlow()
    val sessionInstrument: StateFlow<AudioEngine.Waveform> = mutableSessionInstrument.asStateFlow()

    init {
        applyInstrument(initialInstrument)
    }

    fun selectForSession(instrument: AudioEngine.Waveform) {
        mutableSessionInstrument.value = instrument
        applyInstrument(instrument)
    }

    fun selectAsDefault(instrument: AudioEngine.Waveform) {
        store.writeDefaultIdentifier(instrument.name)
        mutableDefaultInstrument.value = instrument
        mutableSessionInstrument.value = instrument
        applyInstrument(instrument)
    }

    companion object {
        internal fun decode(identifier: String?): AudioEngine.Waveform =
            AudioEngine.Waveform.entries.firstOrNull { it.name == identifier }
                ?: AudioEngine.Waveform.CLARINET
    }
}

/** Process owner: initialized once and retained across Activity recreation. */
internal object AppInstrumentSession {
    private val lock = Any()
    @Volatile private var owner: InstrumentSessionOwner? = null

    fun initialize(context: Context) {
        if (owner != null) return
        synchronized(lock) {
            if (owner == null) {
                owner = InstrumentSessionOwner(
                    SharedPreferencesInstrumentStore(context.applicationContext)
                ) { instrument -> AudioEngine.currentWaveform = instrument }
            }
        }
    }

    val defaultInstrument: StateFlow<AudioEngine.Waveform>
        get() = requireOwner().defaultInstrument

    val sessionInstrument: StateFlow<AudioEngine.Waveform>
        get() = requireOwner().sessionInstrument

    fun selectForSession(instrument: AudioEngine.Waveform) {
        requireOwner().selectForSession(instrument)
    }

    fun selectAsDefault(instrument: AudioEngine.Waveform) {
        requireOwner().selectAsDefault(instrument)
    }

    private fun requireOwner(): InstrumentSessionOwner =
        checkNotNull(owner) { "AppInstrumentSession.initialize must run before use" }
}

internal fun AudioEngine.Waveform.categoryName(): String = when (this) {
    AudioEngine.Waveform.SINE,
    AudioEngine.Waveform.SQUARE,
    AudioEngine.Waveform.SAWTOOTH,
    AudioEngine.Waveform.TRIANGLE -> "Waveforms"
    else -> "Synths"
}
