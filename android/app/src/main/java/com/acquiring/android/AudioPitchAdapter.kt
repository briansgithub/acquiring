package com.acquiring.android

/** Final boundary conversion for the Android audio engine. Theory code must not consume this value. */
internal fun SpelledPitch.toAudioNoteNumber(): Int =
    (octave + 1) * 12 + letter.naturalSemitone + accidental
