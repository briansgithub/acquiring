# B04 spoken and pulsed cues

Work in progress on `ios-port-spoken-cues`. No app-visible completion or Swift
runtime parity is claimed yet. No local Swift/Xcode toolchain is available.

## Authority and first slice

Android `3c887223b2d06b4c3a1010d0f8a23ceaf8977d08` remains the frozen PCM authority.
Supplemental `2728f3f326d4a889d5d1b96d2557bdb57afc95f1`, test
`PlaybackRootDegreeCueTest.lockInMajorUsesTheSongsOpeningKeyInEverySection`,
requires a song-opening G-major reference even in a later G-dorian section.
The timeline caller must supply that reference. Metadata alone does not verify it.

| Behavior | Android source | Swift implementation and test |
| --- | --- | --- |
| Root degree pulses; tonic held | PlaybackEngine.createActiveEvent/renderRootPulse | PlaybackCueContext, QuizPCMRenderer; PlaybackCueTests pulse count/tail cases |
| Distance plus one, separate major reference | PlaybackEngine.harmonicPulseCount | PlaybackCueContext; pulse count case |
| Replace chord voices, retain melody, suppress arpeggio | PlaybackEngine.createActiveEvent/sanitized | QuizPCMRenderer; replacement case |
| Gain ceiling 1.4, default 0.5, tanh knee 0.85 | PlaybackEngine, SpokenRootDegrees | PlaybackCueMath, QuizSoundConfiguration; gain case |
| Separate preceding-chord mode window and C3-B3 tonic | PlaybackEngine.modeAnnouncementWindow, SpokenRootDegrees.spokenKeyTonicMidi | PlaybackCueMath; window case, scheduling pending |

Speech preparation/Sonic, exact bundled asset delivery, shared native fixture
execution, timeline metadata and saved-settings caller wiring remain unfinished.
Tests written in this first slice are unrun Swift tests. The existing iOS Float
renderer has different envelopes from Android PCM16, so no bit-exact stream
claim follows from these pulse semantics. Graph conversion remains a separate
48 kHz concern.

Saved turn_context at `2026-11-21T22:11:02.581Z` records `gpt-6-astra` and `high`.

## Speech preparation slice

Added a mono PCM16 Sonic subset as an AcquiringSonic C target and Swift phrase
preparation. Java wrapping operations and Float arithmetic are explicit; this
is a port requiring execution against the frozen native hashes. The local
machine also lacks a C compiler, so compilation remains a remote CI check.
No Swift or C runtime parity is claimed from source inspection.

SwiftPM bundles 66 exact PCM banks, 47 MiB, with the original PWA SHA manifest.
The loader reads a single pitch slice per request and performs no network I/O.
No voice assets were generated. Playback installation and asynchronous preparation
outside the renderer lock are still pending.

`node contracts/fixtures/check-b04-cues.cjs` passed with Windows Node 24.18:
66 assets match both Android and PWA SHA/lengths; all 14 existing PWA Sonic cases
match JVM PCM16 hashes; native-sonic/native-cue-stream/native-stream hashes are
pinned. The latter two are provenance checks, not new render executions.
Focused Swift tests will compare the C preparation output against the 14 frozen
Sonic hashes. Resource loading also has a focused package test, still unrun.

The AppEnvironment settings handoff now carries persisted cue, voice volume and
Lock in Major into QuizSoundConfiguration and preserves them when replacing the
instrument. The parent read-before-write exclusivity fix is retained. Existing
SongViews control reconstruction and timeline speech metadata still need updates
before claiming that saved cues reach audible playback.

Draft [PR61](https://github.com/briansgithub/acquiring/pull/61) targets
`ios-port-melody-function`. PR54 head/base was confirmed as `821d7b5e` /
`ios-port-song-settings` immediately before opening. All three layers are linked.

## Scheduling and metadata slice

`PlaybackCueTimeline.annotate` now supplies root degree/accidental, source key,
song-opening major reference, sounding root, suffix and B03 melody annotations.
`QuizView.timeline` passes the first ordered section's beat-one key. Singing
register folding and the B03 rising B4-to-C5 spoken exception are retained.

`SpeechTimelinePreparation` loads exact banks, orders accidentals before the
number, adds native suffix clips, fits phrases with Sonic, and prepares a separate
mode window at the end of the preceding chord. Mode speech uses the transposed
new tonic in C3-B3 and is suppressed by Lock in Major. Melody chord-tone filtering
uses B03's source-role predicate. This source projection does not change role
labels when the sounding pitch is transposed.

The audio system prepares eight seconds of lookahead on a background task. Its
existing 50 ms transport poller requests replacement with four seconds of
headroom, and entry, seeks and tempo changes prime preparation. A preparation
revision rejects results invalidated by a seek, setting change or replacement.
The renderer retains each phrase's logical sample position across replacement,
so completed phrases do not replay after gain or tempo changes. Retained PCM is
bounded at 48 seconds per prepared window, not per section. Preparation temporarily
holds one full bounded phrase while slicing the window; old and incoming windows
can coexist during replacement. Asset loading/decoding and Sonic never run under
the renderer lock or in its callback. The existing callback lock remains.

Late preparation skips the elapsed prefix at the current playhead. If the cue's
musical window already ended, the renderer emits nothing for it. On a loop wrap,
the next poll primes the opening window; if preparation has not completed, those
initial samples are silent rather than replayed late. This timing policy needs
audible-device review. No new output graph, preview owner or measured-Hz replay
path was introduced.

The single `QuizSoundConfiguration.replacing` path keeps cue and voice volume
through mode, waveform, transpose, arpeggio, mix, Lock and restoration updates.
AppEnvironment still performs its parent read-before-write exclusivity fix.

Focused tests in `SpeechTimelineTests.swift` cover the supplemental Android
G-major/G-dorian case in
`testNewAndroidSongOpeningReferenceOverridesChorusRelativeMajor`, mode-window
separation/Lock suppression, >48 seconds cumulative speech in a long section,
stale seek preparation, expired cues, and completed-phrase continuity. These new
tests are pending fresh remote execution.

B06 retains the song-wide **presentation** reference handoff. The remaining
section-based callers in SongViews.swift are `QuizHeader.displayKey`,
`MelodyTimelinePresentation.init`, and `ChordTimelinePresentation.init`, plus the
`QuizTimelinePairView` paths that construct those presentations. B04 only wires
the audio reference. No new voice controls or VocalPractice views were changed.

## Exact-head CI evidence

Per lead handoff, `f4bb5ea910ad644ab94554a9b76ac06fe66fcb6f` passed all 254 Swift
package tests in iOS run `44956283926`, including PlaybackCueTests and
SpokenCuePreparationTests. That executes the 14 PCM16 Sonic hashes and bundled
resource lookup on macOS. The app built; iPhone UI recorded 21 failed assertions,
the same count as parent PR53. The scoped instrument UI test passed on both.
This is not evidence for the later scheduling/metadata changes, nor proof that
all UI failures are identical. Device listening and 48 kHz graph acceptance remain
open. Fresh CI is required for the scheduling head.
