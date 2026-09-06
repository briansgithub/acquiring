# Quiz controls, instrument preferences, and foreground playback

Status: implemented in isolated worktrees and merged into the primary checkout.
The iOS real-relaunch UI check and physical-device review remain pending.
Scope: **iOS and Android**, confirmed by the user. This is a focused
attachment to `docs/porting-plan.md`; its existing review
and release gates remain in force. The requested behavior below supersedes older
requirements to continue Quiz audio after navigation or in the background.

Planning runtime: **unknown**. Routes below use the repository's established
Sol/high and Terra/medium assignments; they are capability choices, not pricing
claims. Source observations came from the primary working tree, including pending
instrument normalization/grouping. Implementation must retain those changes.

## Completion — 2026-09-05

Merged `codex/quiz-controls` at `1e471820` into the original primary branch,
`codex/normalize-instrument-volumes`, with a fast-forward. All platform worker
tips are reachable from that branch. Preserved the unrelated uncommitted edits,
including the shared singing-tool dock and existing review-log additions; no
unrelated changes were committed. The final Android source matches the validated
worktree. The combined primary iOS sources were built, installed, and launched:

- `python3 android/scripts/compact_check.py --name ios-quiz-primary-merged-build --keep-success-log -- xcodebuild -quiet -project ios/Acquiring.xcodeproj -scheme Acquiring -derivedDataPath /Users/brian/Library/Developer/Xcode/DerivedData/Acquiring-eazkahspoqupvxcztyfieevjkroa -destination 'platform=iOS Simulator,id=55373408-99CC-4EB3-A771-6ACF29E2D96A' -configuration Debug build CODE_SIGNING_ALLOWED=NO`:
  passed, 134.5 s.
- `xcrun simctl install 55373408-99CC-4EB3-A771-6ACF29E2D96A /Users/brian/Library/Developer/Xcode/DerivedData/Acquiring-eazkahspoqupvxcztyfieevjkroa/Build/Products/Debug-iphonesimulator/Acquiring.app`:
  passed. `xcrun simctl launch 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios`:
  passed; the normal app is open in the existing iPhone 17 simulator.
- `git diff --check` after preserving local edits: passed. Reachability checks
  for the integration branch and all three platform worker branches passed.

The authorized final iOS retry passed the instrument/mode menu test. The lifecycle
test verified background pause and instrument continuity between songs, then
failed on test navigation before its real-relaunch assertions. The narrow test
navigation correction is committed at `9b7aafcd`; no further retry ran. Detailed
Android, normalization, iOS core/selector results and remaining human checks are
in the Quiz controls entry in `docs/porting-plan.md`. No full suite or release ran.

## Behavior contract

| Requirement | Acceptance / chosen semantics |
| --- | --- |
| Compact Transpose | iOS replaces **Shift** and its +/− buttons with a native menu named **Transpose**, showing the current signed semitone value. Preserve −12…+12 and zero as the original key. Android adapts its existing Transpose dropdown. Use each platform's native menu style. |
| Transport tools | Move Instrument and Transpose into the existing transport tools. Instrument becomes one piano-icon button; its accessible label/value identifies the selected sound. Preserve the Waveforms/Synths groups and selected-item indication. |
| Session instrument | One session owner initializes from the saved default once per app run. Quiz changes affect that owner and audio immediately, survive song changes and Android activity recreation, and do not overwrite the default. Song continuity must not restore a conflicting instrument. |
| Settings default | Add a grouped Default Instrument selector. Persist the stable instrument identifier, with Synth Clarinet fallback for missing/invalid values. A deliberate default change also updates the current session immediately; a fresh process starts from the saved default. |
| Three knobs | Replace the balance fader with **Melody / Chord Mix**, to the right of **Arpeggiate**: Tempo → Arpeggiate → Mix. Preserve the existing mapping: 0 = chords, 1 = melody, 0.5 = equal; reset to 0.5. This remains a mix control, not master volume. |
| Responsive selectors | Every production Quiz selector opens and commits a selection on a normal tap while the playback clock continues advancing. No double-tap, pause-first, or reduced-update-rate workaround. |
| Foreground playback only | Leaving Quiz or losing foreground activity pauses at the current position and cancels pending resume intent. Returning requires an explicit Play. Section changes within a visible Quiz retain their existing playback behavior. A new song retains the session instrument. |
| No persistent media controls | No app-owned notification/media transport outside Quiz, Now Playing publication, lock-screen controls, or remote/headset transport commands. Retain foreground audio-focus, interruption, and headphone-disconnection handling. |

## Implementation order

Implementation retained the newer catalog and explicit Synth Clarinet default
merged into the primary branch during this work. That supersedes this plan's
original sawtooth fallback assumption. Normalization covers all current presets
(14 on iOS, 13 on Android), including the new Church Organ. The implementation
and focused-check evidence are recorded in the Quiz controls entry in
`docs/porting-plan.md`. Runtime model remains unknown; route names below record
the requested assignments only.

Treat this as one coherent Quiz revision with internal phases and one final human
review. Run iOS and Android in parallel only when each has an implementer and a
separate worktree. Within either platform, keep phases sequential: they share the
large Quiz view and playback state. Do not assign one agent per requirement.

### 0. Re-anchor and reproduce — Sol/high

1. Start with `git status --short --branch` and the symbol map below. Carry forward
   required pending UI/audio changes; do not start implementation from a stale
   parity tag or sweep unrelated edits into a commit.
2. Reproduce the selector failure on `500 Miles` before changing its architecture.
   Existing iOS tests already claim instrument/mode/section coverage while playing;
   a Pause label alone does not prove ongoing clock updates. Record menu opening,
   action delivery, enabled state, view identity, clock movement, and hit targets.
   Inspect observation-driven reconstruction, overlapping gestures, and overlays
   as hypotheses—not an established cause. Android's draggable play button can
   overlap other tools and needs a hit-target check.
3. Resolve the Android SDK prerequisite early. It was absent during the preceding
   work; the audio-only JVM harness cannot verify Compose UI or media integration.
   Reuse the warm iPhone 17 simulator and incremental build cache.

Exit: a reproducible failure or a precisely documented reproduction gap, one
bounded diagnostic, and a usable platform verification path. Avoid a general audit.

### 1. Establish default and session ownership — Sol/high

- Add a small preference adapter using the existing platform settings mechanism
  (iOS UserDefaults; Android dedicated SharedPreferences or the existing app
  preference abstraction). Inject isolated stores into tests; add no dependency
  or database migration for one enum identifier.
- Introduce one transient session instrument, seeded once from the default.
  Route instrument changes through it so selectors, previews, and the active
  renderer agree. Preserve it across song transitions and Android recreation,
  but do not restore an old session choice after process restart.
- Keep song-specific section, transpose, tempo, mix, and arpeggio continuity intact.
  On song loading, combine that continuity with the session instrument. Continue
  using the existing live configuration/crossfade path instead of reloading audio.

Exit: default/session tests cover missing and invalid values, cross-song selection,
activity recreation, relaunch, and changing the default during a session. The
Settings UI comes in phase 4 so presentation is edited together.

### 2. Make playback belong to the visible Quiz — Sol/high

- Create one idempotent lifecycle-pause entry point. Clear requested playback and
  interruption/focus-resume intent; cancel queued play/load, preview, and inertia
  work; finish scrubbing **without resuming**; pause while preserving position.
  Reject stale callbacks with the existing revision/generation mechanism and
  verify the active Quiz owner before pausing a replacement screen.
- Invoke it on Quiz exit and app inactivity/backgrounding. Resume is allowed only
  after explicit Play with a visible, active Quiz. Re-entry must not reset the
  paused beat or let a delayed section load, focus-gain event, or scrub completion
  restart playback. On iOS, perform the critical pause synchronously on MainActor
  before suspension rather than relying only on a newly launched asynchronous task.
- **iOS:** retire remote command registration and Now Playing publication/callers;
  clear any app-owned legacy metadata and remove the audio background mode. Keep
  AVAudioSession route/interruption handling and existing microphone cleanup.
- **Android:** first move necessary focus/noisy-route handling out of the playback
  service into the foreground playback owner. Then retire service startup,
  MediaSession, notification publication, media-button hooks, and playback-only
  manifest/notification-permission requests. Invalidate automatic focus recovery
  after exit; remove obsolete service wiring as one coherent change.

Exit: focused lifecycle tests pass for exit/background during playback, priming,
scrubbing, and pending section changes; returning stays paused at the saved beat.
No external controls are registered or republished, except explicit legacy cleanup.

### 3. Repair selector interaction at the shared boundary — Sol/high

- Fix the reproduced cause once for all production selector consumers: Instrument,
  Transpose, Section, and display mode. Existing iOS `.equatable()` wrappers are
  already present; adding another wrapper is not an evidence-based fix.
- Give menus stable identity, presentation state, options, and callbacks. Separate
  high-frequency timeline observation from selector ownership where evidence
  requires it. Keep callbacks fresh after song/section changes and retain valid
  disabled states during actual loading or pending commands.
- Resolve gesture interception/overlay conflicts without disabling scrolling,
  timeline interaction, or continuous playback. Preserve native menu presentation
  and ungrouped consumers of the shared selector helper.
- Use one focused regression covering repeated open/select cycles with a moving
  clock at normal and faster tempo. Assert both menu presentation and applied
  selection; do not hide the failure by stopping playback or globally sleeping.

Exit: the interaction regression passes before the controls are repositioned.
Remove temporary diagnostics. If two diagnose/fix/retest cycles fail, summarize
the evidence before expanding the investigation.

### 4. Finish the UI in one pass — Terra/medium

- Reuse the repaired selector for the piano button and compact Transpose menu in
  transport tools. Keep discoverable accessibility names, current values, adequate
  hit areas, and section selection reachable on narrow screens.
- Reuse `PlaybackKnob` / `QuizDial` for Mix. Give all three knobs equal column
  widths, dial sizes, centers, title/value space, and spacing. Use an explicit
  fractional step for iOS Mix—its existing knob defaults to a step of 1. Label
  endpoints and expose percentage values plus reset/adjust accessibility actions.
- Remove the fader's reserved width and obsolete card-height measurement plumbing
  only where no longer used. Keep mix available in both Full and Roots modes;
  Android's existing dial row is currently Full-only while its fader is not.
- Add the grouped Settings default selector using phase 1's binding. Update the
  relevant accessibility identifiers/tests, including removal of iOS transpose
  +/− buttons. Preserve instrument normalization and all existing preset names.

Exit: one integrated platform build and human layout review. Use the existing
small-screen/accessibility coverage instead of creating a device matrix. Allow
one concise handoff from the behavior implementer; avoid alternating models for
individual controls or creating routine documentation/reviewer agents.

## Bounded source map

Search these symbols before reading additional files; line numbers will move.

| Area | iOS | Android |
| --- | --- | --- |
| Quiz controls and restoration | `ios/Acquiring/Features/SongViews.swift`: `QuizView.load`, `transportControls`, `soundControls`, `playbackKnobs`, `QuizSelectorMenu`, `VerticalQuizBalanceFader` | `android/app/src/main/java/com/acquiring/android/MainActivity.kt`: `MainScreen`, `QuizTab`, `transposePickerComposable`, `waveformPickerComposable`, `MelodyChordBalanceFader` |
| Defaults/session | `ios/Acquiring/Infrastructure/AppEnvironment.swift`: `QuizContinuityState`, `rememberQuizSection`, `rememberQuizSettings`; `LibraryViews.swift`: `CatalogSettingsView` | `MainActivity.kt`: root `currentWaveform`, `AppSettingsMenu`; add a small dedicated preference/session owner |
| Knob reuse | `ios/Acquiring/Features/PlaybackKnob.swift` | `android/app/src/main/java/com/acquiring/android/QuizDial.kt` |
| Audio lifetime/media | `ios/Acquiring/Infrastructure/AudioSystem.swift`: `pause`, `publishNowPlaying`, `installRemoteCommandsIfNeeded`; `LibraryViews.swift`: scene phase; `ios/Acquiring/Info.plist` | `QuizPlaybackController.kt`: `pause`, service startup; `QuizPlaybackService.kt`: focus/noisy handlers and MediaSession; `QuizPlaybackEngine.kt`: config/revision handling; `android/app/src/main/AndroidManifest.xml` |

## Final verification and completion

| Focused check | Required evidence |
| --- | --- |
| Selector regression | Extend existing iOS `testQuizInstrumentAndModeMenusApplyWhilePlaying` and `testQuizSectionMenuAppliesPausedAndPlayingSelections`; use an equivalent Android Compose case. Repeated selection succeeds while the clock advances, including after a song change. |
| Preferences | Default persists across a real relaunch; a temporary Quiz selection survives song changes/recreation but does not silently become the saved default. UI, previews, and renderer agree. |
| Lifecycle | Extend Android `QuizPlaybackEngineTest` and the existing injected lifecycle UI pattern; add the equivalent iOS targeted case. Back/Home/lock and pending resume races leave playback paused, position retained, previews stopped, and no automatic restart. |
| Mix/layout | Verify endpoints, equal mix/reset, keyboard/accessibility adjustments, three balanced knobs, Full/Roots access, and no transport overlap. Reuse existing Quiz coverage and `QuizDialTest` where appropriate; human review supplies visual judgment. |
| Media removal | Inspect the built manifests/configuration and remaining registration paths; manually confirm no app-owned persistent notification, lock-screen, or external player controls and preserved foreground interruption handling. |

Run only changed-behavior tests plus one final incremental build/install/launch per
platform; rerun passing checks only after relevant changes. Serialize iOS builds
and simulator use with other active work to avoid the shared build-database lock.
Do not run full suites, inspect screenshots, or publish a release as part of this
revision. Physical iPhone checks use the separately authorized TestFlight path;
record any remaining device-only verification honestly.

Record exact commands/results and unresolved limitations once in the existing
review log. Human review: (1) switch every selector during `500 Miles` playback;
(2) compare the three knobs and both display modes; (3) change songs/defaults and
relaunch; (4) leave Quiz/background the app and inspect external controls.

Keep only a short phase handoff with changed symbols, decisions, evidence, and
next action. Commit coherent in-scope changes when approved. Merge from the
primary checkout, verify the feature tip is reachable, and preserve unrelated
dirty work; never sweep it into the merge or delete unmerged work.
