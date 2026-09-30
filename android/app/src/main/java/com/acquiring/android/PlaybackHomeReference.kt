package com.acquiring.android

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

internal data class PlaybackHomeReference(val note: Int, val chord: List<Int>)

/** References follow the sounding key, independently of chord inversions or display context. */
internal fun playbackHomeReference(key: KeyInfo): PlaybackHomeReference {
    val theoryKey = key.copy(scale = canonicalScaleName(key.scale))
    val homeChord = buildJsonObject {
        put("root", 1)
        put("type", 5)
    }
    return PlaybackHomeReference(
        note = MusicTheory.getMidiNote("1", 0, theoryKey),
        chord = ChordInterpreter.getChordNotes(homeChord, theoryKey)
    )
}
