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
musical window already ended, the renderer emits nothing for it. The opening window is retained alongside the moving window, within the same
combined 48-second retained PCM budget. A render block can wrap immediately into
that window without waiting for the poller. Audible-device review remains open. No new output graph, preview owner or measured-Hz replay
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
section-based callers in SongViews.swift are `QuizHeader.displayedKey`,
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

Fresh portable execution also passed all 26 native-stream and 14 native-cue-stream
scenarios against the existing PWA renderer, including exact PCM16 block hashes,
onset frames and musical positions at the fixtures' controlled rates. B05 splice
cases were excluded. These execute PWA code and do not establish bit-exact Swift
stream output. Only the 14 Sonic preparation cases currently have Swift/C PCM16
hash tests. Existing Swift synthesis/envelopes and the 48 kHz Float graph remain
separate from Android stream PCM16 representation.

Latest saved turn_context on this resume is `2026-11-22T01:31:42.565Z`,
`gpt-6-astra` / `high`. Scheduling commit `5c8c8538` started iOS run `44972264186`.
Follow-up source review preserves Android fallback when a full chord omits its
root and skips mode names with no native bundled clip. Cue Off and Lock suppress
speech immediately, without waiting for asynchronous replacement preparation.


## Delayed replacement and loop review

Lead review of `a5841257` identified missing speech semantic identity and eviction
of the loop-opening window. Installed speech now records cue, transpose, Lock and
chord mode. The renderer suppresses incompatible clips immediately and rejects a
result prepared for an obsolete configuration. Volume/mix/waveform changes keep
compatible speech audible. Silent old phrases continue advancing their logical
positions, so a completed phrase cannot restart when same-family replacement
arrives. Root-to-melody changes use the new phrase's current elapsed offset.

`prepareLookahead` prepares and retains the opening eight-second window together
with the moving window, merging overlaps. Their combined PCM must fit the same
48-second budget; neither is added by the callback. This supports Loop wraps even
when no poller replacement arrives at the boundary. Tests exercise delayed cue,
transpose, Lock and chord-mode replacement, stale results, volume-only continuity,
completion during a pending replacement, and two later laps from a final-window
installation. The long-section test checks all 64 cues with combined retained PCM
bounded on every request. Fresh remote execution is pending for these fixes.

Run `44972419307` at exact head `a5841257` passed its Swift package step; the iPhone
app step was still running when these review fixes were prepared. No pass from
that head is attributed to the later changes.
