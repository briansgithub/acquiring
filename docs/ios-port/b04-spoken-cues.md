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
