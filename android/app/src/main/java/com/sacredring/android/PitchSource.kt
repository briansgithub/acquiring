package com.sacredring.android

import kotlinx.coroutines.flow.StateFlow

interface PitchSource {
    val pitchFlow: StateFlow<MicrophonePitchTracker.PitchResult>
    fun start(targetMidi: Int)
    fun stop()
    fun release()
}
