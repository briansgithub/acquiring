# Pitch Recording Audit Record

- **Date:** August 13, 2026
- **Auditor:** Codex 5.6 Sol Ultra (`gpt-5.6-sol`, ultra reasoning)
- **Device used for hardware validation:** Google Pixel 7a, Android 14 / API 34
- **Scope:** Android microphone capture, YIN pitch detection, smoothing, pitch-recording cards, relative-interval calculation, and pitch-gauge presentation
- **Change status:** Read-only audit; no production source files were changed

## Validation performed

The audit combined source review, focused JVM tests, synthetic signal sweeps, formula probes, and two deliberately limited Pixel 7a hardware checks.

The live Pixel route selected the bottom built-in microphone through `VOICE_RECOGNITION`, with a mono PCM16 16 kHz app stream over the device's 48 kHz input path. No audio read errors were observed. An app-generated A-flat 3 reference tone (MIDI 56) passed through the complete speaker-to-microphone, detector, smoother, card, and gauge path and was displayed as octave 3 at `+1 cent`. Capturing an app-generated reference through the speaker was accepted as valid behavior for this audit.

Twenty-five focused pitch, smoothing, capture, and interval unit tests completed without failures. A clean synthetic sweep covering 2,349 pure and harmonic-rich vocal-range cases produced no missed detections or octave errors; the maximum observed pitch error was 2.27 cents.

## Audit conclusion

Clean monophonic pitch detection and the core frequency-to-MIDI, cents, and relative-interval arithmetic were accurate in the tested Pixel 7a path. The active rolling pitch gauge also mapped valid pitch values correctly.

The audit nevertheless identified implementation risks worth addressing:

1. Timed cards retain the latest published estimate rather than aggregating stable voiced frames across the recording. A transient or stale estimate can therefore become the saved pitch, and flip-flop mode can retain a prior take after silence or failure.
2. `MicrophonePitchTracker.stop()` discards the canceled capture job, so a subsequent `start()` cannot reliably await the prior recorder's teardown.
3. A strong second harmonic with a weak fundamental can create an initial octave-high lock before the smoother has an established pitch against which to reject it.
4. Target cards can present a synthetic green `+0 cents` before a microphone estimate, dropouts can leave stale readings visible, and the octave footer is wrong during the half-semitone immediately below a C boundary.
5. Measured interval magnitude, direction, register, and cents are numerically correct, but reconstructing names from MIDI alone can lose the source's enharmonic spelling, such as displaying a diminished fifth where the source interval was an augmented fourth.

This file is the permanent repository record of that audit and its attribution.
