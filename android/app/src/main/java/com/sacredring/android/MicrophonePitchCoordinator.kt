package com.sacredring.android

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

internal enum class MicrophonePitchOwner {
    QUIZ_PERSISTENT,
    SINGING_TOOL
}

/**
 * A [PitchSource] lease that can only control the shared microphone while it owns it.
 *
 * Call [claim] before starting a new interaction. Once another lease claims the microphone,
 * delayed stop/start calls from this lease are ignored so they cannot disrupt the new owner.
 */
internal interface ExclusivePitchSource : PitchSource {
    val ownsMicrophone: StateFlow<Boolean>
    fun claim()
}

/** Serializes the app's quiz-related microphone interactions over one pitch tracker. */
internal class MicrophonePitchCoordinator(
    private val delegate: PitchSource
) {
    private val lock = Any()
    private val ownership = MicrophonePitchOwner.entries.associateWith { MutableStateFlow(false) }
    private var owner: MicrophonePitchOwner? = null
    private var isReleased = false

    fun sourceFor(requestedOwner: MicrophonePitchOwner): ExclusivePitchSource =
        OwnedPitchSource(requestedOwner)

    fun release() {
        synchronized(lock) {
            if (isReleased) return
            isReleased = true
            delegate.release()
            owner = null
            ownership.values.forEach { it.value = false }
        }
    }

    private fun claim(requestedOwner: MicrophonePitchOwner) {
        synchronized(lock) {
            if (isReleased || owner == requestedOwner) return
            delegate.stop()
            owner?.let { ownership.getValue(it).value = false }
            owner = requestedOwner
            ownership.getValue(requestedOwner).value = true
        }
    }

    private fun start(requestedOwner: MicrophonePitchOwner, targetMidi: Int) {
        synchronized(lock) {
            if (isReleased || owner != requestedOwner) return
            delegate.start(targetMidi)
        }
    }

    private fun stop(requestedOwner: MicrophonePitchOwner) {
        synchronized(lock) {
            if (isReleased || owner != requestedOwner) return
            delegate.stop()
            owner = null
            ownership.getValue(requestedOwner).value = false
        }
    }

    private inner class OwnedPitchSource(
        private val requestedOwner: MicrophonePitchOwner
    ) : ExclusivePitchSource {
        override val pitchFlow = delegate.pitchFlow
        override val ownsMicrophone: StateFlow<Boolean> =
            ownership.getValue(requestedOwner).asStateFlow()

        override fun claim() = this@MicrophonePitchCoordinator.claim(requestedOwner)

        override fun start(targetMidi: Int) =
            this@MicrophonePitchCoordinator.start(requestedOwner, targetMidi)

        override fun stop() = this@MicrophonePitchCoordinator.stop(requestedOwner)

        override fun release() = stop()
    }
}
