# Streamlined Android-to-iOS parity roadmap

This is the sole active execution plan. Final Android behavior at
`android-parity-ios-v1` and [android-app-analysis.md](android-app-analysis.md)
define acceptance. [feature-parity.md](feature-parity.md) preserves the 55 stable
IDs: 52 in-scope capabilities; F013, F052, and F055 remain deferred.
[ios-android-parity-roadmap.md](ios-android-parity-roadmap.md) is historical only.

## Current baseline and execution policy

- Preserve the existing package, catalog, audio/DSP, persistence, UI, and review
  records. This revision neither approves pending features nor starts full testing.
- Implement remaining features in dependency order A–F below. Existing acceptance
  criteria survive the reorder; old checkpoint numbers are mapped on each row.
- Library/settings/harvest/search, Song Detail/Chords, and the first Quiz timelines
  and Play/Pause are implemented to varying review states. All Songs and Playlist
  destinations remain placeholders. Do not rebuild completed surfaces.
- Phase B implementation is complete through B5; human listening/feature reviews
  remain pending. Stop for feedback before C1; full testing is still separately gated.
- Use one implementer per feature. Established routes: Terra/medium for ordinary
  UI/integration, Terra/high for complex state/notation, Sol/high for audio,
  timing, microphone ownership and concurrency, Luna/low for simple isolated
  changes. Escalate to Sol/xhigh for a concrete unresolved concurrency/DSP issue.
  Delegate only substantial independent work; no routine doc/reviewer subagents.
- Use the current runtime model for coordination and report its identity as
  unknown when unavailable. Report the actual implementation route at handoff.
- Use one shared playback configuration before B's controls, one shared card
  action arbiter starting at C1, and shared audio-session/microphone ownership
  before E's capture features. Preserve existing service/package boundaries;
  no new public API or database migration is required by this roadmap revision.

## Fast feature implementation and review

1. Read the relevant final Android behavior and existing iOS caller. Reuse the
   audit; inspect historical commits only when a concrete ambiguity remains.
2. Implement the smallest complete feature, including relevant loading/empty/error
   behavior and accessibility labels/actions. Do not split a modest feature into
   separate shell and wiring checkpoints. Reuse previews; add a focused preview
   only when it materially speeds iteration.
3. Run one incremental Debug build for the warm iPhone 17 simulator, repair compile
   failures, terminate the stale process, install, and launch. Inspect code and
   accessibility text. Human review provides visual/perceptual feedback; agents
   must not inspect screenshots. If visual judgment is needed, describe what the
   human should inspect.
4. Report the checkpoint, actual model, concise change summary, exact check/result,
   and a two-to-four-step review script. Update status once at handoff.
5. Stop after every feature for human critique. Fix issues in that feature; advance
   when the user approves or explicitly directs onward. Carry pending older
   reviews without silently promoting their status. Commit only approved,
   separable changes; preserve unrelated and uncommitted work.

During iteration, build/install/launch and human review are the default checks.
Focused diagnostics/regression tests are justified only by a concrete failure or
material correctness risk. No routine full suites, screenshot inspection,
multi-device matrices, broad audits, or phase-boundary test sweeps. Full testing
starts only after A–F implementation and the explicit approval gate below.

Routine review uses the exact full-catalog `500 Miles` fixture. Other requested
songs remain available for a specific missing case; Weird Al testing stays
deferred until needed. Test scenarios must remain separate from normal catalog
and user-data storage.

## Status and retained records

- `[ ]`: not started.
- `[review]`: implemented with recorded limited checks; human review pending.
- `[approved]`: accepted or explicitly advanced by the user, with recorded basis.
- `[blocked-external]`: blocked by unavailable authority, hardware, or service.
- `[excluded]`: absent from final Android or explicitly outside iOS v1.

Record actual checks, limitations, and review disposition without claiming an
unrun test passed. Feature approval is not complete parity verification: inventory
rows remain Partial until required final evidence is gathered.

### Retained Phase 0–3.4 checkpoints

The following are existing work/review records, not a second execution queue.
Their statuses are preserved. Resolve critiques in place; use A–F for new work.

### Phase 0 — Truth and review harness

1. `[review]` **0.1 Canonical plan (F001-F055).** **Luna/low.** Consolidate this
   plan, archive the deployment diary, and leave the old roadmap as a pointer.
2. `[review]` **0.2 Baseline reconciliation (F002, F004, F006-F012, F054).**
   **Luna/low.** Correct debounce claims, volatile test totals, blank-screen
   status, and over-broad Android-history skips.
3. `[review]` **0.3 Focused UI test inventory (F001-F054).** **Terra/medium.** Split
   stale post-reset tests by feature and mark pending parity tests with reasoned
   `XCTSkip`; release still requires zero skips.
4. `[review]` **0.4 Deterministic review fixtures (F001-F054).** **Terra/medium.**
   Add only the launch arguments, injected services, and small-data previews
   needed to reproduce each visual state without changing production behavior.

### Phase 1 — Library and catalog acquisition

Android chronology: `0b7abac8` through `2f891ebe`'s Library/catalog work.

Final UI rule: the upper-right text **Settings** entry opens a standard grouped
settings Form. Only full-catalog download/resync and their download-specific
status, cancel, and retry controls live there. **Add a TheoryTab Song** and all
harvest-specific progress, cancel, retry, completion, and failure states remain
on the main Library in both empty and ready catalog states.

1. `[review]` **1.1 Library launch shell (F001).** **Luna/medium.** Show native dark
   loading, empty, ready, and failure states with stable identifiers.
2. `[review]` **1.2 Manual harvest (F011).** **Terra/high.** From the main Library,
   expose **Add a TheoryTab Song**, validate the Hooktheory URL, and show
   harvest-specific progress, retry/cancel, completion, failure, and
   retained-catalog messaging in both empty and ready catalog states.
3. `[review]` **1.3 First catalog install (F010, F012).** **Terra/high.** From
   the upper-right Settings Form, install a valid artifact with visible
   download-specific progress, cancellation, failure/retry, refreshed count, and
   an empty-catalog prompt; keep these full-catalog controls out of the main
   Library surface.
4. `[review]` **1.4 Resync, recovery, and durability (F010, F012, F053).**
   **Sol/high** (escalate to **Sol/xhigh** only for actual core recovery or
   durability work). From the upper-right Settings Form, validate
   contract/schema/row floor/payloads, atomically swap, preserve a backup, recover
   failed/cancelled replacements, and retain user entries. No search or detail UI
   is included in Phase 1.

### Phase 2 — Search, selection, Song Detail, and Chords

Android chronology: remaining `0b7abac8` through `2f891ebe` feature work.

1. `[review]` **2.1 Title search input (F002).** **Terra/medium.** No autofocus,
   300 ms debounce, clear action, and loading/empty/error states.
2. `[review]` **2.2 Title suggestions and paging (F002).** **Terra/high.** Render
   complete cards, 20-row pages, Load More, and retain prior results on paging
   failure.
3. `[review]` **2.3 Song selection (F002, F010, F014).** **Terra/medium.** Exclude
   missing-payload rows, expose malformed-payload errors, record history, and
   enter Quiz first.
4. `[review]` **2.4 Recent songs (F003).** **Terra/medium.** Blank-query view shows
   ten MRU items resolved against the current catalog and refreshes on return.
5. `[review]` **2.5 Artist search, recent artists, and artist result page (F004).**
   **Terra/high.** Support artist queries, recent artists, paged suggestions,
   result-page navigation, and restoration across paging/search state.
6. `[review]` **2.6 Header and section selector (F014-F015).** **Terra/high.**
   Preserve artist navigation, canonical ordering, and section changes; defer
   favorite UI to D6 (formerly 8.1). Normalize section types, de-duplicate by normalized
   type, and keep the earliest explicit index for each type.
7. `[review]` **2.7 Info overview (F016).** **Terra/medium.** Show key, tempo, meter,
   duration, beats/bars, chord counts, and sounded/total melody counts,
   including chord-only songs.
8. `[review]` **2.8 Info detail and links (F017).** **Terra/medium.** Show progression
   and change lists, source metadata, slug, system-browser links, and
   progression-pill preview.
9. `[review]` **2.9 Chords inventory (F018).** **Terra/high.** Remove rests, dedupe,
   adapt the grid, handle empty/failure states, and use key-at-chord-onset.
10. `[review]` **2.10 Semantic chord display (F019, F021-F024).** **Terra/high.**
   Keep the Roman numeral always present with an optional additive letter label;
   support fitted inversion, accidental, applied, and borrowed-harmony notation.
11. `[review]` **2.11 Chord preview (F020).** **Sol/high.** Support block/arpeggiated
    modes, 30-1000 ms step, cancellation, fades, and replacement.

### Phase 3 — Quiz

1. `[approved]` **3.1 Quiz shell and navigation (F014, F026).** **Terra/high.** Final
   header, Full/Root-only selector, and exact-origin Quiz → Info → Back behavior;
   reach the Hooktheory source through the Quiz Info transition, matching the
   final Android behavior rather than adding a direct Quiz action.
2. `[review]` **3.2 Chord timeline (F025).** **Terra/high.** Render durations, gaps,
   key-at-onset notation, fixed playhead, and reduced-motion behavior. **Review
   evidence (2026-09-04):** Terra/high implemented the fixed-center chord lane;
   Sol/high reviewed the Android parity rules. Focused `AcquiringTests` and
   `testPhase32ChordTimelineUsesAccessibleCurrentChordText` passed on iPhone 17
   against the exact full-catalog `500 Miles` payload, using text, accessibility,
   and geometry checks only; no screenshot inspection was performed. The other
   requested real-song fixtures remain staged for later checkpoints. iPhone 14 Pro
   verification is deferred. Lock-in-Major timeline
   relabeling remains deliberately deferred to C6 (formerly 3.10), as do transport and
   seek interactions. Human approval is still required.
3. `[approved]` **3.3a Static melody geometry (F025).** **Terra/high.** Render the
   88pt melody lane with 60pt/beat fixed-center alignment to the chord lane,
   pitch/duration, blank rests/gaps, source-order overlap, onset key handling,
   and Lock-in-Major mapping, using the exact `500 Miles` fixture. Text/code
   review only; compile smoke passed. User authorized proceeding to 3.3b on
   2026-09-04. Android has no key-region bands, so they are not required.
4. `[approved]` **3.3b Live melody state (F025).** **Terra/high.** Both lanes now
   follow the existing transport stream, highlight sounded melody events
   (including overlaps), animate forward movement, and snap on pause, reset,
   section changes, and Reduce Motion. Audio and display share audible-event
   end beats; this fixes `500 Miles` Chorus mapping its beat-32 melody end onto
   the beat-33 chord end. Play state comes from the transport stream.
   Android introduction: `3989f388`; final production caller:
   `android-parity-ios-v1:MainActivity.kt` melody draw loop. **Evidence
   (2026-09-04):** incremental Debug build passed; installed and launched on
   iPhone 17. No new tests or screenshots. User authorized proceeding to 3.4
   on 2026-09-04.
   Check: `xcodebuild -quiet -project ios/Acquiring.xcodeproj -scheme Acquiring
   -destination 'platform=iOS Simulator,id=55373408-99CC-4EB3-A771-6ACF29E2D96A'
   -configuration Debug build CODE_SIGNING_ALLOWED=NO` — exit 0.
5. `[review]` **3.4 Play/pause transport (F027, F038).** **Sol/high.** Full mode
   now schedules melody and block chords together using normalized onset,
   event duration, onset key, sawtooth, and equal 0.5 layer gains. The existing
   app-scoped renderer publishes buffering, playing, paused, and failed states;
   startup failures retain position and permit retry. Play requires a loaded
   section, and a pending-command latch prevents duplicate taps. Audio service
   work: Sol/high; timeline/button integration: primary agent.
   Android introduction: `3989f388`; final production timeline builder:
   `android-parity-ios-v1:QuizPlaybackEngine.kt:861` and QuizTab's config/state
   caller. **Evidence (2026-09-04):** incremental Debug build passed (same exact
   `xcodebuild` command as 3.3b, exit 0), then installed/launched on iPhone 17.
   No new tests or screenshots. Human review: `500 Miles` Full mode, Play,
   listen for melody plus chords, Pause, resume. Mixing controls/arpeggiation,
   full continuity, and physical-device recovery stay in later checkpoints.
Historical 3.1-only review evidence (2026-09-04): focused Quiz shell test passed 1/1 on iPhone 17;
result bundle: `/tmp/acquiring-phase31-quiz-9F3ADA87-596F-4BB0-BD4D-50FBB750980C.xcresult`.
Human approval recorded 2026-09-04 after the first-launch/catalog-settings
revisions, based on focused text/element evidence; screenshot review was not claimed.
iPhone 14 Pro and broader device/accessibility coverage remain deferred.

### Timeline refresh follow-up (F025)

`[review]` User-requested playback rendering improvement; Sol/high timing/paired-view implementation. Both lanes now share one `CADisplayLink` and one projected beat based on monotonic timestamps, authoritative transport samples, and the current musical velocity. Section-derived presentations are cached in the child view; high-rate redraws do not drive the full Quiz UI, audio renderer, or Now Playing updates. Independent sample-triggered animations are removed. Seeks, pause/reset, tempo/section changes, and loop boundaries re-anchor; small circular drift corrections avoid backward polling jitter. The link stops during scrubbing, while hidden/inactive, and with Reduce Motion enabled.

Library Settings → Display → Timeline frame rate persists **60 fps** (default) or **Maximum** (device-supported maximum). The ProMotion opt-in is enabled. These are display-rate requests, not guarantees: iOS can lower the actual rate for power/thermal conditions. Audio speed is unchanged. Manual dragging and the existing approximately 16 ms inertia task remain unchanged; this pass synchronizes automatic playback rendering, not inertia physics. B2–B4 and all earlier pending reviews remain pending; B5 is still next.

Checks: `xcrun swiftc -frontend -parse ios/Acquiring/Features/SongViews.swift` and `plutil -lint ios/Acquiring/Info.plist` passed. The first incremental build reported a SwiftUI type-check timeout in the combined pair-view expression; splitting lane, source-observation, presentation-observation, and lifecycle expressions resolved it. The rerun of `xcodebuild -quiet -project ios/Acquiring.xcodeproj -scheme Acquiring -destination 'platform=iOS Simulator,id=55373408-99CC-4EB3-A771-6ACF29E2D96A' -configuration Debug build CODE_SIGNING_ALLOWED=NO` passed (exit 0; existing preview async-alternative warning only). `xcrun simctl install 55373408-99CC-4EB3-A771-6ACF29E2D96A /Users/brian/Library/Developer/Xcode/DerivedData/Acquiring-eazkahspoqupvxcztyfieevjkroa/Build/Products/Debug-iphonesimulator/Acquiring.app` passed. `plutil -extract CADisableMinimumFrameDurationOnPhone raw /Users/brian/Library/Developer/Xcode/DerivedData/Acquiring-eazkahspoqupvxcztyfieevjkroa/Build/Products/Debug-iphonesimulator/Acquiring.app/Info.plist` returned `true`. `SIMCTL_CHILD_ACQUIRING_UI_TEST_SESSION_ID=b2-b3-b4-human-review-500 xcrun simctl launch --terminate-running-process 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios --ui-testing --ui-testing-scenario=library.ready` passed (exit 0, PID 97035), retaining the existing review session. No automated test suites, screenshots, measured FPS/power profiling, physical-device checks, commits, or TestFlight upload.

Human review: (1) play `500 Miles` in Full Quiz and watch both tracks stay aligned while scrolling at the same musical speed; (2) choose Settings → Display → Timeline frame rate → Maximum, return, and compare smoothness; (3) pause, seek/drag, change tempo, and switch sections to check exact stopping/restoration and the new section beginning paused. Actual phone frame-rate/power verification remains for the separately approved final testing stage.

### Compact Quiz layout follow-up (F014, F025, F037)

`[review]` User-requested layout revision; Terra/medium. The inline navigation title now reads `song title by artist` (title only if artist is missing). Removed the duplicate in-content song/artist row and Info button; native Back still returns to song details. The remaining compact header shows only `(key letter scale)` with Lock in Major. Unlocked uses the current source key; locked uses the initial section key's relative major, matching the existing chord/timeline reference. Scale aliases/formatting reuse existing helpers. Chord-card content height is reduced from 90 to 52 points, with fitted Roman/root font maxima reduced from 64/48 to 44/36. No audio, timeline clock, or practice behavior changes; C6 and other pending reviews are not marked complete.

Checks: the exact incremental `xcodebuild`, simulator install, and existing `b2-b3-b4-human-review-500` launch commands in the preceding timeline follow-up passed again (all exit 0; launch PID 98779). A final incremental build included the key-label formatting follow-up. Existing UI-test references to the renamed header/removed Info button now use the song title and native Back; `xcrun swiftc -frontend -parse ios/AcquiringUITests/AcquiringUITests.swift` and `git diff --check -- ios/Acquiring/Features/SongViews.swift ios/AcquiringUITests/AcquiringUITests.swift` passed. UI tests/full suites and screenshots were not run; no TestFlight upload or commit.

Human review: open `500 Miles` in Quiz and check the single title/artist header, smaller chord card, and space for lower controls. Toggle Lock in Major: the parenthesized label should match the existing relative-major context (an already-major section can remain unchanged). Use native Back to confirm song details remain reachable. Stop for critique; full testing remains separately gated.

### Section selector beside transport (F015, F029)

`[review]` User-requested placement revision; Terra/medium. Full Quiz now groups Play/Pause and the section menu in one draggable row, removing the old header picker. The combined row uses a subtle material background, a preferred 330×64-point footprint, and whole-row geometry clamping/restoration. Single-section songs retain the 180×64 Play/Pause footprint without a picker. Root-only keeps its existing header selector until its transport implementation arrives. Section ordering, accessibility identifier/value, and A2's paused-at-start switch behavior are unchanged.

Checks: the same exact incremental `xcodebuild`, simulator install, and `b2-b3-b4-human-review-500` launch commands recorded above passed (all exit 0; launch PID 99603). `git diff --check -- ios/Acquiring/Features/SongViews.swift ios/Acquiring/Features/DraggableQuizTransport.swift` passed. No tests, screenshots, full verification, commit, or TestFlight upload. Review `500 Miles`: select a new section beside Play/Pause while playing (new section starts paused at the beginning); drag the row toward an edge and confirm both controls remain together and reachable. Stop for critique; prior review statuses and the full-testing gate remain unchanged.

## Remaining dependency-ordered features

Each row is one human-review checkpoint, not a group-wide approval. Reuse existing
implementations and the final Android audit; add only the missing behavior.

### A — Finish transport

1. `[approved]` **A1 Reset and loop behavior (F027, F029, F038; old 3.5, reset part of 6.3). Sol/high.** Implemented final-Android Reset beside Play/Pause: stop playback, cancel interfering previews, and reset position/state together while retaining duration. Next Play starts at the beginning. Existing exact-end renderer looping is preserved. User approved A1 with “looks good; proceed”; the section-switching critique belongs to A2. Reset is separate from tempo reset and has accessibility labeling and a shared pending-command guard.

   Original A1 handoff: incremental build passed with `xcodebuild -quiet -project ios/Acquiring.xcodeproj -scheme Acquiring -destination 'platform=iOS Simulator,id=55373408-99CC-4EB3-A771-6ACF29E2D96A' -configuration Debug build CODE_SIGNING_ALLOWED=NO` (exit 0). `xcrun simctl install 55373408-99CC-4EB3-A771-6ACF29E2D96A /Users/brian/Library/Developer/Xcode/DerivedData/Acquiring-eazkahspoqupvxcztyfieevjkroa/Build/Products/Debug-iphonesimulator/Acquiring.app` passed (exit 0). `SIMCTL_CHILD_ACQUIRING_UI_TEST_SESSION_ID=a1-human-review-500 xcrun simctl launch --terminate-running-process 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios --ui-testing --ui-testing-scenario=library.ready` passed (exit 0, PID 76632); this launches the real-catalog review fixture, not a test suite. No automated tests, screenshot inspection, or full testing ran. Review `500 Miles`: Play, Reset (stopped at beginning), Play again (starts at beginning), and allow a section to reach its end to check looping. Subsequent disposition: user approved A1 and requested the A2 section-switch behavior below; prior unrelated pending reviews remain pending.
2. `[approved]` **A2 Section switching and navigation continuity (F014–F015, F027, F029; old 3.5, 6.3). Sol/high.** Explicit user override of Android's section auto-continuation: selecting a different section stops the old playback and starts the new section at the beginning, paused. Merely navigating away and back to the same active Quiz preserves its section, position, settings, and playback state. Provide an accessible Info-to-Quiz return and reject stale loads/commands; process-death restoration and device recovery are not part of this checkpoint. User explicitly advanced A2 with “Proceed with the plan”; no full-test approval is implied.

   Implemented by Sol/high: synchronous section replacement stops old transport/previews before rebuilding; revision-bound load/Play/Pause/Reset commands and replacement observation prevent stale commands/progress from winning. Shared app-lifetime section, mode, tempo, and Lock-in-Major state restore the active Quiz without reloading matching audio. Song Detail has a labeled Quiz return action and shares the section selection; changing section there also stops old playback. No public package API, schema, or engine redesign.

   Checks: the exact incremental `xcodebuild` and `simctl install` commands recorded in A1 passed again for A2 (exit 0 each; existing preview `scheduleBuffer` async-alternative warning only). `SIMCTL_CHILD_ACQUIRING_UI_TEST_SESSION_ID=a2-human-review-500 xcrun simctl launch --terminate-running-process 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios --ui-testing --ui-testing-scenario=library.ready` passed (exit 0, PID 77803). No automated tests, screenshots, or perceptual audio verification ran. Human review: play `500 Miles`, change Verse to Chorus (silent/paused at beginning), press Play and switch rapidly (last selection remains paused at beginning), then play and visit Info → Quiz (same section and continuing position). Subsequent disposition: user directed progression to A3; full testing remains separately gated.
3. `[approved]` **A3 Tap seeking (F028; seek part of old 4.5). Terra/high.** Map tap position around the fixed playhead to bounded beats, retain prior requested playback, and provide an accessible seek equivalent. Implemented both lanes, immediate seek snapping, named one-beat Back/Forward controls, current-position text, and VoiceOver adjustable actions. Seeking cancels previews and uses revision/observation guards; unready/buffering/pending states cannot seek. Drag/inertia is handled in A4 below; Root-only seeking remains C5. User explicitly advanced A3 and requested the A4/A5/B1 batch before the next review.

   Checks: `xcodebuild -quiet -project ios/Acquiring.xcodeproj -scheme Acquiring -destination 'platform=iOS Simulator,id=55373408-99CC-4EB3-A771-6ACF29E2D96A' -configuration Debug build CODE_SIGNING_ALLOWED=NO` passed (exit 0; existing preview `scheduleBuffer` async-alternative warning only). The A1 `simctl install` command passed for this build (exit 0). `SIMCTL_CHILD_ACQUIRING_UI_TEST_SESSION_ID=a3-human-review-500 xcrun simctl launch --terminate-running-process 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios --ui-testing --ui-testing-scenario=library.ready` passed (exit 0, PID 81921). No automated tests, screenshots, or perceptual verification ran.

   Human review with `500 Miles`: while paused, tap ahead/behind the playhead in either lane (both lanes align at the new position without audio); press Play and tap (playback continues from there); try Back/Forward 1 beat and check bounds; change section after seeking (new section still starts paused at the beginning). Subsequent direction: implement A4, A5, and B1 together before the next review; full testing remains separately gated.
4. `[review]` **A4 Drag/inertial seeking (F028; seek part of old 4.5). Sol/high.** Pause around scrubbing, resume only when previously requested, stop at bounds, and arbitrate drag/tap/cancel/inertia exactly once. Implemented shared scrub ownership for both lanes, exclusive tap/drag recognition, silent local drag/coast progress, and one revision-bound seek at settle. Left drags advance, right drags rewind; measured-time inertia stops at bounds or within 2.5 seconds. Tap during coast stops in place without jumping. System cancellation and navigation settle once; section changes and Reset discard stale work. Tempo changes settle the gesture before reconfiguration. Only captured requested playback resumes; zero-tempo remains physically paused.

   User-authorized batch handoff (A4 + A5 + B1): one combined incremental build/install/launch rather than intermediate review stops. `xcodebuild -quiet -project ios/Acquiring.xcodeproj -scheme Acquiring -destination 'platform=iOS Simulator,id=55373408-99CC-4EB3-A771-6ACF29E2D96A' -configuration Debug build CODE_SIGNING_ALLOWED=NO` passed (exit 0; existing preview `scheduleBuffer` async-alternative warning only). `xcrun simctl install 55373408-99CC-4EB3-A771-6ACF29E2D96A /Users/brian/Library/Developer/Xcode/DerivedData/Acquiring-eazkahspoqupvxcztyfieevjkroa/Build/Products/Debug-iphonesimulator/Acquiring.app` passed (exit 0). `SIMCTL_CHILD_ACQUIRING_UI_TEST_SESSION_ID=a4-a5-b1-human-review-500 xcrun simctl launch --terminate-running-process 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios --ui-testing --ui-testing-scenario=library.ready` passed (exit 0, PID 83960); this is the real-catalog review fixture, not a test suite. No automated tests, screenshots, or perceptual verification ran.

   Review with `500 Miles`: (1) paused drag/swipe in both lanes, including tap-to-stop coast, remains silent; (2) playing drag pauses during drag/coast and resumes once afterward; (3) reposition Play/Pause, visit Info and return, then try its move/reset menu; (4) change tempo while playing, set 0%, then reset to 100% (same position/prior intent), and repeat while explicitly paused (stays paused). Inspect placement/gesture feel on the simulator; agents have not viewed images. Await critique of this batch before B2; full testing remains separately gated.
5. `[review]` **A5 Draggable Play/Pause (F029; placement part of old 6.3). Terra/high.** Save normalized placement, clamp to available space, restore across layout/navigation, and provide a non-drag alternative. Implemented a floating control across the available Full Quiz area, normalized UserDefaults placement, finite/clamped restoration, and cancellation-aware drag handling. The original Play/Pause command guards are retained; Reset stays separate. VoiceOver and a long-press menu offer named positions and placement reset. Batch build/install/launch evidence is recorded under A4; human placement review remains pending.

### B — Complete sound controls

Build on the existing audio interfaces with one shared configuration/command
owner; preserve progress and requested play state on changes. Keep synthesis off
the UI path and reuse native-rate output/envelope/cancellation infrastructure
(relevant implementation acceptance from old 7.2; device verification remains gated).

1. `[review]` **B1 Tempo (F030; old 3.7). Terra/medium; corrective audio pass Sol/high.** Support 0–200%, reset to 100%, zero-tempo pause, and position/intent continuity. User reported rough live adjustments after the initial B1 build. Corrected the root cause: slider changes no longer rebuild the timeline, recreate voices, or restart the audio session/engine/poller. Sections load once at native BPM; an additive renderer rate API advances one fractional musical clock in place. Oscillator phase and voice age remain output-sample based; active envelope state is retained. Positive changes preserve position and playing/paused state; zero pauses while retaining prior intent, and restoring positive tempo resumes that intent when the engine is available. Explicit Pause/Reset/new section still clear intent. Play stays disabled at zero; settings and section/navigation continuity remain. Human listening review is pending.

   Corrective-pass checks (reported live-tempo defect; not the final testing stage): with shell pipefail enabled, `swift test --package-path ios/Packages/AcquiringKit --filter 'testQuizRendererTempoRatePreservesPositionAndAdvancesFractionally|testQuizRendererTempoChangePreservesSustainedVoiceAgeAndPhase|testQuizRendererZeroAndPausedRateChangesDoNotMoveTransport|testQuizRendererHonorsOnsetPauseSeekAndLoop|testRendererSeekToEndStaysAtEndUntilPlaybackResumes' 2>&1 | tail -n 65` passed (exit 0, 5 tests/0 failures). These are three new tempo/voice-continuity/paused-zero regressions plus two existing onset/seek/loop-boundary checks; no full suite ran. `xcodebuild -quiet -project ios/Acquiring.xcodeproj -scheme Acquiring -destination 'platform=iOS Simulator,id=55373408-99CC-4EB3-A771-6ACF29E2D96A' -configuration Debug build CODE_SIGNING_ALLOWED=NO` passed (exit 0; existing preview async-alternative warning only). The A4 `simctl install` command passed again (exit 0). `SIMCTL_CHILD_ACQUIRING_UI_TEST_SESSION_ID=b1-live-tempo-review-500 xcrun simctl launch --terminate-running-process 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios --ui-testing --ui-testing-scenario=library.ready` passed (exit 0, PID 87205). No screenshots or perceptual audio inspection by the agent.

   iPhone 14 Pro follow-up (TestFlight 1.0 (4); Sol/high): user reported `Audio session error ... OSStatus error -50`. The shared session configurator passed `.allowAirPlay` with `.playback`, although Apple's SDK permits that explicit option only with `.playAndRecord`. Preview/Quiz playback now uses empty category options (output routing is implicit); microphone sessions retain their existing options. Category-setup and activation failures are logged separately. Renderer, tempo, and engine-restart behavior are unchanged. The same incremental build, simulator install, and `b1-live-tempo-review-500` launch commands above passed again (all exit 0; launch PID 91097; existing preview async-alternative warning only). No tests, screenshots, or physical audio verification ran. The subsequent user-authorized `ios/scripts/deploy-testflight.sh --build 5` passed end-to-end (exit 0); Apple processed 1.0 (5) and made it available to the internal tester group with this fix and the Settings update shortcut. iPhone listening/feature review remains pending; see `archive/ios-testflight-checkpoints-2026-09.md` for the release receipt. Android Settings changes remain unshipped.

   Review `500 Miles`: play and repeatedly sweep positive tempo (e.g. 50–200%) without pauses, restarts, pitch shifts, or beat jumps; set zero then reset to 100% to check retained position/intent; repeat adjustments while explicitly paused and confirm it stays paused. On the next authorized iPhone build, first check that Play and a chord preview no longer raise the audio-session alert. Stop for critique before advancing. A4/A5 pending reviews and the final full-testing approval gate are unchanged.
2. `[review]` **B2 Instrument selection (F032; old 3.7). Terra/high UI, Sol/high shared audio.** Implemented all ten Android instruments, plus six inexpensive synthesized choices requested by the user: Synth Flute, Synth Clarinet, Synth Oboe, Synth Brass, Synth Bell, and Synth Bass (16 total; no samples/downloads/dependencies). Sawtooth remains the default/reset. Selection is retained across sections and Info/Quiz navigation and applies to subsequent chord previews. Live timbre changes use phase-aligned 24 ms crossfades without reloading transport. Human listening review pending.
3. `[review]` **B3 Melody/chord balance (F034; old 3.7). Terra/high UI, Sol/high shared audio.** Implemented Android's single 0…1 blend: melody gain equals the value, chord gain equals one minus the value. The control labels both endpoints, shows 50/50 at the 0.5 default, and offers Reset. Channel-tagged source events are weighted once; smoothed gains reach true zero at either endpoint, while finite previews keep their own gain. Playing/paused state and position are retained. Human listening review pending.
4. `[review]` **B4 Global transpose (F031; transpose part of old 5.6). Sol/high audio, Terra/high UI.** Implemented -12…+12 semitones and Reset to zero through shared sound configuration, applied absolutely from source frequencies rather than cumulatively. Live updates preserve musical clock, tempo, envelope age, and requested playback state; musical previews use the same instrument/transpose once without changing preview timing. Future measured-pitch requests can opt out via `usesMusicalConfiguration: false`; future card/practice consumers remain in C/E. Header key labels explicitly identify source keys. Human review pending.

   User-authorized B2/B3/B4 batch handoff: Sound controls are vertically scrollable with the draggable transport kept outside the scroll content. A sound change completes any active scrub/coast before changing the command revision, preserving its final seek/resume. Shared configuration survives tempo updates, section changes, and same-song navigation. Earlier pending reviews, including the physical iPhone audio fix, remain pending.

   Checks: from `ios/Packages/AcquiringKit`, `swift test --filter 'AcquiringAudioTests\.AcquiringAudioTests/(testSoundConfigurationAndPreviewOptOutNormalizeAtTheBoundary|testWaveformDisplayNamesAreUniqueAndSynthLabelsAreExplicit|testEveryWaveformRendersFiniteBoundedSamples|testQuizRendererLayerGainRampReachesTrueZeroAndLeavesPreviewUnweighted|testQuizRendererLiveTransposeIsAbsoluteAndPreservesTransportAndPhase|testQuizRendererTempoRatePreservesPositionAndAdvancesFractionally|testQuizRendererTempoChangePreservesSustainedVoiceAgeAndPhase|testQuizRendererZeroAndPausedRateChangesDoNotMoveTransport)'` passed (8 tests, 0 failures). This narrowly covers the changed shared renderer and prior live-tempo risk, not the final testing stage. `xcodebuild -quiet -project ios/Acquiring.xcodeproj -scheme Acquiring -destination 'platform=iOS Simulator,id=55373408-99CC-4EB3-A771-6ACF29E2D96A' -configuration Debug build CODE_SIGNING_ALLOWED=NO` passed (exit 0; existing preview async-alternative warning only). `xcrun simctl install 55373408-99CC-4EB3-A771-6ACF29E2D96A /Users/brian/Library/Developer/Xcode/DerivedData/Acquiring-eazkahspoqupvxcztyfieevjkroa/Build/Products/Debug-iphonesimulator/Acquiring.app` passed (exit 0). `SIMCTL_CHILD_ACQUIRING_UI_TEST_SESSION_ID=b2-b3-b4-human-review-500 xcrun simctl launch --terminate-running-process 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios --ui-testing --ui-testing-scenario=library.ready` passed (exit 0, PID 93770). No screenshots, full suites, physical-device verification, commits, or TestFlight upload.

   Review `500 Miles`: (1) play and choose several instruments under Sound, including new synthesized choices; (2) sweep balance between Chords only and Melody only, then Reset to 50/50; (3) select +12, -12, then Reset transpose while listening for continuous position, and try a tempo change; (4) pause, adjust sound (remain paused), visit Info/Chords to preview a chord, then return to Quiz and verify retained settings. Stop for critique; B5 remains next and full testing remains separately gated.
5. `[review]` **B5 Chord arpeggiation (F033; old 7.1). Sol/high audio, Terra/medium UI.** Implemented Sound → Chord arpeggio with all eight Android options (`1/4`, `1/3`, `1/2`, `off`, `1`, `2`, `3`, `4` cycles per beat), Off default/reset, and VoiceOver labels/values. Chord-only, multi-tone selection and 8%/12% slot envelopes derive from fractional native-BPM source time relative to each chord onset. Live tempo changes preserve cycle position and output-sample voice age/phase; live arpeggio/instrument/transpose changes use 24 ms crossfades without reloading the timeline. Each new chord starts its own cycle; seeks choose the slot at the destination, loop/reset return to section-start timing, and pause/zero tempo freeze position. The full sound configuration is retained by every control and across sections/navigation. Melody, single-tone chords, and finite preview-step timing remain unchanged. Phase B implementation is complete; earlier pending reviews are not implicitly approved.

   Focused audio checks: `swift test --package-path ios/Packages/AcquiringKit --filter 'AcquiringAudioTests.AcquiringAudioTests/(testArpeggioOptionsAndTimelineNativeTempoExposeStableBoundaryValues|testQuizRendererArpeggioUsesNativeTempoAndCyclesChordTonesInOrder|testQuizRendererArpeggioUsesFractionalTransportAtSlotBoundary|testQuizRendererTempoChangePreservesArpeggioVoicePhaseAndUsesMusicalPosition|testQuizRendererLiveArpeggioChangeCrossfadesFromOldMode|testQuizRendererArpeggioLeavesMelodyPreviewAndSingleToneChordUnchanged|testQuizRendererTempoChangePreservesSustainedVoiceAgeAndPhase|testQuizRendererZeroAndPausedRateChangesDoNotMoveTransport|testQuizRendererHonorsOnsetPauseSeekAndLoop)'` passed (9 tests, 0 failures). Strengthened the tempo-continuity assertion to compare a sounding sample mid-slot, then reran only `swift test --package-path ios/Packages/AcquiringKit --filter 'AcquiringAudioTests.AcquiringAudioTests/testQuizRendererTempoChangePreservesArpeggioVoicePhaseAndUsesMusicalPosition'` (1 test, 0 failures). No production change or repeat app build was needed.

   Simulator checks: `xcodebuild -quiet -project ios/Acquiring.xcodeproj -scheme Acquiring -destination 'platform=iOS Simulator,id=55373408-99CC-4EB3-A771-6ACF29E2D96A' -configuration Debug build CODE_SIGNING_ALLOWED=NO` passed (exit 0; existing preview async-alternative warning only). `xcrun simctl terminate 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios` and `xcrun simctl install 55373408-99CC-4EB3-A771-6ACF29E2D96A /Users/brian/Library/Developer/Xcode/DerivedData/Acquiring-eazkahspoqupvxcztyfieevjkroa/Build/Products/Debug-iphonesimulator/Acquiring.app` passed (exit 0). `SIMCTL_CHILD_ACQUIRING_UI_TEST_SESSION_ID=b2-b3-b4-human-review-500 xcrun simctl launch --terminate-running-process 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios --ui-testing --ui-testing-scenario=library.ready` passed (exit 0, PID 1392). No screenshots, full suites, physical-device checks, commits, or TestFlight upload.

   Human review with `500 Miles`: (1) open Quiz → Sound → Chord arpeggio, set balance toward Chords only, and compare `1/4`, `1`, `4`, and Off; (2) while playing, sweep positive tempo, set zero, then reset tempo and listen for continuous position/pitch; (3) change instrument/transpose/balance and verify the arpeggio selection remains, then Reset arpeggio to Off; (4) pause and change the setting (remain paused), switch section (beginning, paused), and try Reset/Play. Stop for critique before C1. Full testing requires separate explicit approval after A–F implementation.

### C — Complete Quiz cards and modes

Establish shared preview cancellation and single/double/long-action arbitration
with C1 (old 5.6, preview part of 7.2). Expose named VoiceOver actions. Implement
tap preview now; attach double-tap/long-press practice consumers in E4/E7 when
available. Never add the retired magnifier or expose inactive practice controls.

1. `[ ]` **C1 Active chord/root card and preview (F035–F036, F054; old 3.6, 3.8). Terra/high.** Bind duration/rest/overlap-aware active state and onset-key notation; tap previews replace earlier playback without click-through.
2. `[ ]` **C2 Melody card and preview (F035–F036; old 3.8, 3.9). Terra/high.** Display and preview the active spelled melody pitch with correct rests and unavailable states.
3. `[ ]` **C3 Interval cards and playback (F035–F036; old 3.8, 3.9, 5.7). Terra/high.** Derive previous/current root and melody intervals; support independent/together playback, collapse/repeat, direction, spelling, and duration-aware selection.
4. `[ ]` **C4 Chord-tone row and previews (F035–F036; old 3.8, 3.9). Terra/high.** Bind tones to the active chord; make individual previews cancel exclusively and preserve event/rest semantics.
5. `[ ]` **C5 Root-only mode and seeking (F026, F028; old 3.10). Terra/high.** Hide full-only surfaces, expose root interval/slider controls, and preserve transport while changing modes.
6. `[ ]` **C6 Lock in Major (F037; old 3.10). Terra/high.** Complete fixed relative-Ionian/major spelling across timeline, cards, roots, and preview registers using existing domain rules.

### D — Complete the library

1. `[ ]` **D1 Alphabetical All Songs (F006; old 5.1). Terra/medium.** Entry/states, A–Z/0–9/# groups, counts, one expanded group, index navigation, and sorted rows.
2. `[ ]` **D2 Complexity browse (F007; complexity part of old 5.2). Terra/medium.** Ten buckets, Unrated, correct counts and membership.
3. `[ ]` **D3 Mode browse (F008; mode part of old 5.2). Terra/medium.** Seven canonical modes, counts, and cross-mode membership.
4. `[ ]` **D4 Filter and restoration (F009; old 5.3). Terra/high.** Normalized title/artist fuzzy matching at 250 ms; no-match/legacy warning; preserve filter/group/expansion/scroll without payload loading.
5. `[ ]` **D5 External search (F005; old 5.4). Luna/low.** Hooktheory system-browser handoff, failure/unavailable state, and return continuity.
6. `[ ]` **D6 Favorites (F050; old 8.1). Terra/medium.** Hollow/filled star, unique built-in membership, optimistic rollback, and errors.
7. `[ ]` **D7 Playlist summaries (F051; old 8.2). Terra/medium.** Library accordion, counts, states, and expansion persistence.
8. `[ ]` **D8 Playlist contents and removal (F051, F053; old 8.3). Terra/high.** Newest-first rows, Quiz navigation, swipe removal, unresolved-slug hiding, and separate durable user storage. Full catalog-replacement durability verification is reserved for the approval gate.

### E — Add vocal practice

1. `[ ]` **E1 Microphone/session ownership (F040–F041; old 4.2, ownership parts of 7.2/7.4). Sol/high.** Just-in-time permission, exclusive lease, denial/error handling, native capture/YIN/gates/smoothing reuse, stale-owner rejection, and cleanup. Include a minimal usable capture state for review.
2. `[ ]` **E2 Two-note capture and feedback (F043–F044; old 4.1, 4.3, 4.4). Sol/high.** Manual collapsed/expanded tool, independent three-second slots, stable capture, silence/dropout handling, pitch/spelling/cents, interval name/direction, exact replay and rerecord/cancel.
3. `[ ]` **E3 Pair playback and Flip-Flop (F043, F045; non-seek part of old 4.5). Sol/high.** Pair/alternating playback/capture, independent slot state, cancellation and final pause.
4. `[ ]` **E4 Card sing-back (F042, F044; old 5.5, sing-back parts of 4.1/5.6/5.7). Sol/high.** Root, melody, interval, and chord-tone double taps open target-guided listening after preview settles; use shared ownership/arbitration, target-mode sheet and named accessible actions.
5. `[ ]` **E5 Tessitura calibration (F048; old 6.1). Sol/high.** Permission/cancel/error/retry, three voiced seconds, final-two-second averaging, silence pause and dropout grace/restart.
6. `[ ]` **E6 Target placement and adjustment (F048–F049; old 6.2, target part of 6.3). Terra/high.** Comfortable window, interval-unit placement, contour/tritone rules, anchor/octave stepper, transpose-once, and clear-adjustment/session distinction.
7. `[ ]` **E7 Persistent practice (F046, F049; old 6.4, target-following parts of 6.3/5.6). Sol/high.** Long-press root/melody/chord-tone targets, fast melody tracking with rest/no-signal handling, chord-tone clamping, index restoration, and transport-following placement.
8. `[ ]` **E8 Live markers and scoring (F046–F047; old 6.5). Sol/high.** Bounded live marker, settled contiguous-run scoring using median, explicit unscored result, badges, and stale-sample rejection.

### F — Complete platform behavior

1. `[ ]` **F1 Now Playing and remotes (F039; old 7.3). Sol/high.** Publish song/section and elapsed state; route remote play/pause/stop/seek through the shared transport.
2. `[ ]` **F2 Background/interruption/route recovery (F027, F036, F038–F039, F041–F049; old 7.2/7.4). Sol/high.** Complete output recovery, session transitions, cleanup and stale-result rejection. Device-specific verification follows explicit approval; do not claim hardware behavior verified from a simulator.
3. `[ ]` **F3 Remaining layout/accessibility implementation (F014, F025, F054; old 6.6, implementation part of 9.1). Terra/high.** Compact final native layout, focus, VoiceOver alternatives, Dynamic Type, reduced motion, rotation and iPad adaptation. Add semantics with each earlier feature; reserve broad audit/matrix for the gate.

## Full-app testing approval gate

**Not authorized by this roadmap or by individual feature approvals.** After A–F
implementation, present remaining known gaps and the proposed full-test scope,
then wait for the user's explicit instruction to begin. Do not begin because a
phase ended, an agent continued, or a feature was approved.

Once authorized, perform these former Phase 9 acceptance checks:

1. **T1 Full regression and accessibility (old 9.1).** Run app/package/UI suites;
   reconcile obsolete tests with in-scope parity; collect VoiceOver, Dynamic Type,
   reduced-motion, focus, orientation, small-phone and iPad evidence.
2. **T2 Catalog/data/platform verification (old 9.2; F010, F012, F039, F053).**
   Full catalog and appropriate real songs, clean install/upgrade/offline, failed
   and cancelled/interrupted replacement, backup recovery, user-data durability,
   privacy, background soak, microphone, interruptions, lock screen and routes.
3. **T3 Release readiness (old 9.3).** Resolve failures; rerun affected checks;
   require zero pending/skipped in-scope parity tests and required device evidence.
   Review archive/signature/manifests only in the authorized release workflow.

TestFlight upload and release require separate explicit direction. Full-test
approval alone does not authorize publishing.

## Explicit exclusions and defaults

- Exclude F013 missing-payload auto-harvest, F052 custom-playlist management UI,
  and F055 unused audiation container.
- Exclude the puck/magnifying glass, unused TripleClickable helper, obsolete Quiz
  skip button, database-verification/search-by-slug controls, transient layouts,
  intermediate 55% balance, rename/icon-only history, and Android/release-only
  commits. Preserve the final single-tap preview, double-tap sing-back, and
  long-press practice actions.
- Target iOS 17+, English, dark presentation, iPhone/iPad, both orientations,
  background audio, Dynamic Type, VoiceOver, and reduced motion.
- Use system-browser Hooktheory/YouTube links. Keep download/resync in the
  upper-right Settings Form and Add a TheoryTab Song on the main Library.
- Keep one warm iPhone 17 simulator for iteration; iPhone 14 Pro, iPad and
  hardware evidence belong to approved final testing unless separately requested.
- Preserve existing stored data and uncommitted work. This roadmap requires no
  schema migration or public-interface replacement.
