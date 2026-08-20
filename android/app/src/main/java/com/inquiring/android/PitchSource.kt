package com.inquiring.android

import kotlinx.coroutines.flow.StateFlow

interface PitchSource {
    val pitchFlow: StateFlow<MicrophonePitchTracker.PitchResult>
    fun start(targetMidi: Int)
    fun retarget(targetMidi: Int) = start(targetMidi)
    fun stop()
    fun release()
}
