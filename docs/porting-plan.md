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
- Library/settings/harvest/search, Song Detail/Chords, Quiz transport/cards, All
  Songs, Favorites, and Playlists are implemented to varying review states.
  Do not rebuild completed surfaces.
- Phase E/F implementation is complete in the user-authorized combined batch,
  including Android recording/DSP property alignment; human review is pending.
  Prior pending reviews are preserved. Stop at the separate full-testing approval
  gate. TestFlight remains at build 6 (Phase B); C–F have not been released.
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

1. `[review]` **C1 Active chord/root card and preview (F035–F036, F054; old 3.6, 3.8). Terra/high UI, Sol/high shared audio.** Implemented duration/rest/overlap-aware active chord and root buttons with onset-key notation. Full-chord previews retain written voicing/inversion and use native-BPM chord duration; single roots use 450 ms. All card requests share generation-guarded cancellation and 24 ms preview retirement fades. The shared card-action component uses native buttons now and exclusive single/double/long recognizers only when future E handlers are supplied, with guarded named VoiceOver actions.
2. `[review]` **C2 Melody card and preview (F035–F036; old 3.8, 3.9). Terra/high.** Added the active melody degree and tap preview; pitch spelling remains in spoken accessibility labels, not visible melody card text. First/repeated pitches collapse to a single card; rests and gaps have explicit unavailable states. Source spelling uses the event's onset key.
3. `[review]` **C3 Interval cards and playback (F035–F036; old 3.8, 3.9, 5.7). Terra/high UI, Sol/high sequence playback.** Full mode shows previous/current melody cards and their spelled, directional interval; Root-only shows the corresponding root cards and interval. Individual cards preview a pitch; interval taps play previous, current, then both together at 450 ms per step. Melody card placement follows contour. Event-identity caches handle same-onset overlaps and fallback events, including unavailable interval states.
4. `[review]` **C4 Chord-tone row and previews (F035–F036; old 3.8, 3.9). Terra/high.** Added adaptive individual tone buttons from the active chord's voiced notes, with degrees relative to its effective root. Rests/unresolved voicings show unavailable content. Each tap replaces the prior preview through the same audio owner.
5. `[review]` **C5 Root-only mode and seeking (F026, F028; old 3.10). Terra/high integration, Sol/high audio.** Replaced the placeholder with root/interval cards, a native beat-position slider, and the shared floating Play/Pause + section selector, Reset, tempo, and sound controls. Full-only timelines/melody/chord-tone cards are hidden. Slider editing pauses for silent scrubbing and conditionally restores playback; VoiceOver adjustments seek directly. Mode changes apply the resolved root's Simple register to chord audio using a live crossfade, preserving position/tempo/play intent and restoring full voicings on return. Melody audio follows Android's existing mix. Every sound control and navigation restoration retains chord mode.
6. `[review]` **C6 Lock in Major (F037; old 3.10). Terra/high.** Header, melody staff/semantics, chord timeline, and card degrees now share the initial section key's fixed relative-Ionian context, including across later key changes. Both timeline presentations refresh when toggled. Single-pitch preview registers retain enharmonic spelling; interval pairs shift together to preserve their signed interval. Full-chord previews and source transport retain written pitches/voicing.

   Combined C1–C6 handoff (user explicitly requested the whole phase): all six features are implemented for human review; prior pending reviews are unchanged. The new cards live in `ios/Acquiring/Features/QuizCards.swift`, registered in the app target. Removed the obsolete Root-only shell, and updated its existing UI-test selector without running that suite. Preview cancellation covers replacement taps, seek/scrub, section/mode/Lock changes, sound/tempo changes, Reset, and leaving Quiz. Future microphone/practice consumers remain E.

   Focused audio checks, from `ios/Packages/AcquiringKit`: `swift test --filter 'AcquiringAudioTests.AcquiringAudioTests/(testSoundConfigurationAndPreviewOptOutNormalizeAtTheBoundary|testQuizRendererRootOnlyUsesResolvedRootAndLeavesMelodyAndArpeggioAlone|testQuizRendererLiveRootModeCrossfadePreservesTransportAgeAndRestoresFullInversion|testQuizRendererRootOnlyWithoutResolvedRootFadesOutInsteadOfCutting|testQuizRendererLiveArpeggioChangeCrossfadesFromOldMode|testQuizRendererTempoChangePreservesArpeggioVoicePhaseAndUsesMusicalPosition)'` passed (6 tests, 0 failures). After adding transpose-continuity assertions, `swift test --filter 'AcquiringAudioTests.AcquiringAudioTests/(testQuizRendererLiveRootModeCrossfadePreservesTransportAgeAndRestoresFullInversion|testQuizRendererRootOnlyWithoutResolvedRootFadesOutInsteadOfCutting)'` passed (2 tests, 0 failures). Preview fade/sequence listening and UI behavior remain human review; these package tests do not verify AVAudioPlayerNode lifecycle.

   Build/install/launch: `xcodebuild -quiet -project ios/Acquiring.xcodeproj -scheme Acquiring -destination 'platform=iOS Simulator,id=55373408-99CC-4EB3-A771-6ACF29E2D96A' -configuration Debug build CODE_SIGNING_ALLOWED=NO` passed (exit 0; existing preview async-alternative warning and nonblocking unused sound-configuration result warnings). `xcrun simctl terminate 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios` and `xcrun simctl install 55373408-99CC-4EB3-A771-6ACF29E2D96A /Users/brian/Library/Developer/Xcode/DerivedData/Acquiring-eazkahspoqupvxcztyfieevjkroa/Build/Products/Debug-iphonesimulator/Acquiring.app` passed (exit 0). `SIMCTL_CHILD_ACQUIRING_UI_TEST_SESSION_ID=b2-b3-b4-human-review-500 xcrun simctl launch --terminate-running-process 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios --ui-testing --ui-testing-scenario=library.ready` passed (exit 0, PID 5268). Project plist lint and scoped whitespace checks passed. No screenshots, full suites, physical-device testing, commits, or TestFlight upload in this batch.

   Human review: (1) open `500 Miles` → Quiz, play/seek, and tap current/previous melody notes, chord/root, and individual chord tones; (2) tap an interval to hear previous/current/together, then interrupt it with another card or section change; (3) switch Full ↔ Root-only while playing, try the Root-only slider, pause and adjust it, and verify return-to-Full/settings continuity; (4) use the existing minor `Bad Romance` fixture to toggle Lock in Major and compare header, both timelines, card labels, and preview pitches. Stop for critique before D1. Full testing retains its separate approval gate after A–F.

   C1–C3 corrective handoff (2026-09-05): Terra/medium removed visible letter names from melody note/interval cards and made previous/current melody buttons 44 points tall versus 88 points for the single-note/interval card, retaining contour placement and spoken pitch names. Sol/high fixed the reported native card-tap crash: `AVAudioPlayerNode.scheduleBuffer` asserted because its inferred output channel count differed from the mono preview buffer. The player connection, renderer, and buffers now share an explicit 48 kHz mono format. Preview cancellation/fades and transport behavior are unchanged.

   Concrete-failure regression only: `xcodebuild -quiet -project ios/Acquiring.xcodeproj -scheme Acquiring -destination 'platform=iOS Simulator,id=55373408-99CC-4EB3-A771-6ACF29E2D96A' -configuration Debug -only-testing:AcquiringUITests/AcquiringUITests/testQuizCardPreviewsDoNotCrashAndMelodyCardsUseCompactHeights -parallel-testing-enabled NO test CODE_SIGNING_ALLOWED=NO` passed (exit 0; 1 test, 0 failures/skips). It taps chord, melody, interval-sequence/replacement, and chord-tone previews using the `500 Miles` fixture, and asserts 44/44/88-point accessibility frames. The first attempt could not find a card because SwiftUI propagated its container identifier to descendants; the test now uses distinct spoken action labels. No app change was needed for that locator correction. No screenshot inspection or full suite.

   Reinstalled with `xcrun simctl install 55373408-99CC-4EB3-A771-6ACF29E2D96A /Users/brian/Library/Developer/Xcode/DerivedData/Acquiring-eazkahspoqupvxcztyfieevjkroa/Build/Products/Debug-iphonesimulator/Acquiring.app` (exit 0), then relaunched with `SIMCTL_CHILD_ACQUIRING_UI_TEST_SESSION_ID=b2-b3-b4-human-review-500 xcrun simctl launch --terminate-running-process 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios --ui-testing --ui-testing-scenario=library.ready` (exit 0). `open -a Simulator --args -CurrentDeviceUDID 55373408-99CC-4EB3-A771-6ACF29E2D96A` passed. Human review: (1) open `500 Miles`, seek to beat 5, and check degree-only melody cards and their 2:1 height relationship; (2) tap individual cards and an interval, then interrupt it with another card and listen. C reviews remain pending; no commit, physical-device testing, or TestFlight update.

### D — Complete the library

1. `[review]` **D1 Alphabetical All Songs (F006; old 5.1). Terra/medium route.** Library entry, A–Z/individual 0–9/# groups, counts, one expanded group, sticky headings, index navigation, and sorted rows implemented.
2. `[review]` **D2 Complexity browse (F007; complexity part of old 5.2). Terra/medium route.** Ten buckets plus Unrated use existing scalar count/membership queries.
3. `[review]` **D3 Mode browse (F008; mode part of old 5.2). Terra/medium route.** Seven canonical modes use the stored cross-mode memberships and counts.
4. `[review]` **D4 Filter and restoration (F009; old 5.3). Terra/high route.** 250 ms normalized title/artist filtering, empty/error/retry/no-match/legacy states, and cancellation/generation guards implemented. App-lifetime state retains grouping/filter/expansion and native scroll-position binding; browsing never decodes payloads.
5. `[review]` **D5 External search (F005; old 5.4). Luna/low route.** Library and All Songs expose an explicit Search Hooktheory.com button using the current query, with blank-query disabling and browser-open failure feedback. This native button replaces Android's external-search checkbox; local query/navigation remain in place.
6. `[review]` **D6 Favorites (F050; old 8.1). Terra/medium route.** Quiz and Song Detail have hollow/filled stars backed by existing unique SwiftData membership. Shared optimistic state, serialized saves, count reconciliation, rollback, and dismissible errors are implemented.
7. `[review]` **D7 Playlist summaries (F051; old 8.2). Terra/medium route.** Library accordion includes durable counts, loading/empty/error/retry, app-lifetime expansion, five newest preview rows, and an Open Playlist action.
8. `[review]` **D8 Playlist contents and removal (F051, F053; old 8.3). Terra/high route.** Full newest-first list enters Quiz through the origin-preserving route; swipe/named accessible removal updates membership/counts with rollback and retained errors. Resolution hides absent/non-loadable songs without deleting slugs. Catalog and user stores stay separate; catalog-replacement durability verification remains at the approval gate.

   Combined D1–D8 handoff: user explicitly requested the whole next phase. Actual implementation used two Terra/high agents for D1–D4 and D6–D8; the coordinator handled D5 and shared integration locally to avoid another routine agent (coordinator runtime model ID unavailable). New browse/user-library view models reuse existing catalog queries, grouping rules, and SwiftData operations. Catalog revisions refresh relevant presentation state; membership changes invalidate stale playlist loads. `CatalogCoordinator.songs(ids:)` now excludes null payloads, matching Android's loadable-row resolution while still selecting scalar columns only. No schema migration or custom-playlist management was added.

   Verification: `xcodebuild -quiet -project ios/Acquiring.xcodeproj -scheme Acquiring -destination 'platform=iOS Simulator,id=55373408-99CC-4EB3-A771-6ACF29E2D96A' -configuration Debug build CODE_SIGNING_ALLOWED=NO` passed (exit 0; existing unused sound-configuration-result warnings). `plutil -lint ios/Acquiring.xcodeproj/project.pbxproj` passed. One combined build/install/launch replaces per-feature builds for the requested batch; no test suite or screenshot inspection was performed.

   Simulator handoff uses the **normal app**, not `--ui-testing`, so Favorites use durable `UserDataV1` storage. A bounded read found the existing installed catalog has 40,979 browse songs, 40,977 ratings, 46,111 mode memberships, and `500 Miles`; this was catalog selection for review, not full-catalog validation. `xcrun simctl terminate 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios`, `xcrun simctl install 55373408-99CC-4EB3-A771-6ACF29E2D96A /Users/brian/Library/Developer/Xcode/DerivedData/Acquiring-eazkahspoqupvxcztyfieevjkroa/Build/Products/Debug-iphonesimulator/Acquiring.app`, `xcrun simctl launch --terminate-running-process 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios`, and `open -a Simulator --args -CurrentDeviceUDID 55373408-99CC-4EB3-A771-6ACF29E2D96A` passed (exit 0). Existing catalog/user data were retained. The eight-song automated fixture remains unchanged and intentionally has no complexity ratings.

   Human review: (1) Library → All Songs: browse Alphabetical/Complexity/Mode, filter `the proclaimers`, and open `500 Miles`; (2) Back twice, check retained browse state, then try Search Hooktheory.com and return; (3) star `500 Miles`, return to Library → Playlists → Favorites → Open Favorites; optionally star `Bad Romance` to compare newest-first ordering; (4) swipe-remove a song and confirm its count/star update. Stop for critique before E1. No commit or TestFlight upload in this batch; full testing still needs separate approval after A–F.

### E — Add vocal practice

1. `[review]` **E1 Microphone/session ownership (F040–F041; old 4.2, ownership parts of 7.2/7.4). Sol/high.** Just-in-time permission, exclusive lease, denial/error handling, native capture/YIN/gates/smoothing reuse, stale-owner rejection, and cleanup. Capture is connected to the visible practice controls.
2. `[review]` **E2 Two-note capture and feedback (F043–F044; old 4.1, 4.3, 4.4). Sol/high.** Manual collapsed/expanded tool, independent three-second wall-time slots, last accepted estimate, silence/dropout handling, pitch/spelling/cents, interval name/direction, exact replay and rerecord/cancel.
3. `[review]` **E3 Pair playback and Flip-Flop (F043, F045; non-seek part of old 4.5). Sol/high.** Pair playback and repeated three-second first capture, three-second second capture, two-second pause; independent slot state and cancellation.
4. `[review]` **E4 Card sing-back (F042, F044; old 5.5, sing-back parts of 4.1/5.6/5.7). Sol/high.** Root, melody, interval, and chord-tone double taps open target-guided listening after preview settles; shared ownership/arbitration, target-mode sheet and named accessible actions.
5. `[review]` **E5 Tessitura calibration (F048; old 6.1). Sol/high.** Permission/cancel/error/retry, three voiced seconds, final-two-second averaging, silence pause and one-second dropout grace/restart.
6. `[review]` **E6 Target placement and adjustment (F048–F049; old 6.2, target part of 6.3). Terra/high.** Comfortable window, interval-unit placement, contour/tritone rules, anchor/octave stepper, transpose-once, and clear-adjustment/session distinction.
7. `[review]` **E7 Persistent practice (F046, F049; old 6.4, target-following parts of 6.3/5.6). Sol/high.** Long-press root/melody/chord-tone targets, fast melody tracking with rest/no-signal handling, chord-tone clamping, index restoration, and transport-following placement.
8. `[review]` **E8 Live markers and scoring (F046–F047; old 6.5). Sol/high.** Bounded live marker, settled contiguous-run scoring using median, explicit unscored result, badges, and stale-sample rejection.

### F — Complete platform behavior

1. `[review]` **F1 Now Playing and remotes (F039; old 7.3). Sol/high.** Publish song/section and elapsed state; route remote play/pause/stop/toggle/seek through the shared transport.
2. `[review]` **F2 Background/interruption/route recovery (F027, F036, F038–F039, F041–F049; old 7.2/7.4). Sol/high.** Output recovery, session transitions, cleanup and stale-result rejection are implemented. Device-specific verification follows explicit approval; hardware behavior is not verified by the simulator.
3. `[review]` **F3 Remaining layout/accessibility implementation (F014, F025, F054; old 6.6, implementation part of 9.1). Terra/high.** Adaptive practice controls/sheets, named VoiceOver alternatives, Dynamic Type and reduced-motion behavior, compact seek controls and adaptive key/Lock-in-Major header. Broad focus/orientation/iPad/VoiceOver audit remains gated.

#### E/F implementation handoff — 2026-09-05

Routes: Sol/high for microphone ownership, platform audio and practice orchestration;
Terra/high for practice UI and timeline feedback; root integration/runtime identity
unknown. One combined handoff was explicitly requested. Existing cards now expose
double-tap Sing Back and long-press persistent practice. Song Detail and Quiz share
the practice controller and song-scoped tessitura anchor. Leaving a song or
backgrounding cleans up capture; section changes clear run-ID scores but retain
the comfortable anchor. Seeking/pausing discards partial scores, and natural run
transitions finalize them. Native sheets own cancellation and named actions.

Recording/DSP parity was checked against final Android `MicrophonePitchTracker.kt`,
`PitchDetector.kt`, and `PitchSmoother.kt`, not against historical prototypes:

| Property | Both analysis paths |
|---|---|
| PCM analysis | Mono, signed PCM16, 16,000 Hz |
| Standard window / hop | 2,048 / 512 samples (128 / 32 ms) |
| Fast melody window / hop | 1,024 / 256 samples (64 / 16 ms) |
| YIN / frequency limits | Threshold 0.15; 65–1,000 Hz |
| Accepted frame gates | RMS ≥ 0.0005; confidence ≥ 0.4; positive finite frequency |
| Standard smoother | Median 3; publish after 2 valid median outputs; EMA 0.3 new / 0.7 retained |
| Fast smoother | Median 1; publish after 1; EMA 1 |
| Octave rejection | Jump > 6 semitones; reseed after 3 standard / 1 fast rejection(s) |
| Invalid detection gap | Clear smoothing after > 200 ms |
| Capture timing | Manual 3 s wall time, latest valid pitch; tessitura 3 voiced s, final 2 s mean, 1 s dropout grace |

iOS requests `.measurement`, 16 kHz and hop-sized I/O, averages resolved channels,
resamples with AVAudioConverter, and scales to PCM16. Android uses AudioRecord's
UNPROCESSED → VOICE_RECOGNITION → MIC fallback. These are platform-specific input
paths, not a guarantee of identical physical preprocessing or latency. Tap frame
requests scale to the resolved hardware rate; Apple may coalesce callbacks. Fast
readings delayed beyond 48 ms are discarded, and scoring consumes fresh samples
on a 16 ms monotonic timer. Real iPhone microphone/route evidence is still pending.

Focused checks justified by the explicit DSP requirement:
`swift test --package-path ios/Packages/AcquiringKit --filter PitchDetectorParityTests`
passed (7 tests, 0 failures); `swift test --package-path ios/Packages/AcquiringKit --filter PitchSmootherParityTests`
passed (6 tests, 0 failures). `plutil -lint ios/Acquiring.xcodeproj/project.pbxproj`
passed. The initial combined build caught unsupported SwiftUI accessibility calls
and a plain-String format interpolation in the new practice view; these were
corrected. The rebuild passed; a final incremental build also passed after the
last calibration-access and score-reset changes. Exact build command:
`xcodebuild -quiet -project ios/Acquiring.xcodeproj -scheme Acquiring -destination 'platform=iOS Simulator,id=55373408-99CC-4EB3-A771-6ACF29E2D96A' -configuration Debug build CODE_SIGNING_ALLOWED=NO`
(exit 0; existing unused sound-configuration return warnings remain).

Normal-app handoff (no `--ui-testing`; catalog and durable user data retained):
`xcrun simctl terminate 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios`,
`xcrun simctl install 55373408-99CC-4EB3-A771-6ACF29E2D96A /Users/brian/Library/Developer/Xcode/DerivedData/Acquiring-eazkahspoqupvxcztyfieevjkroa/Build/Products/Debug-iphonesimulator/Acquiring.app`,
`xcrun simctl launch --terminate-running-process 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios`,
and `open -a Simulator --args -CurrentDeviceUDID 55373408-99CC-4EB3-A771-6ACF29E2D96A`
passed (exit 0). Scoped source/whitespace checks passed. No screenshots or full
suites were run. No commit, physical-device install, or TestFlight upload.

Human review: (1) Open `500 Miles` and expand Vocal practice; inspect two slots,
record/replay/interval/Flip-Flop controls and calibration access. (2) Double-tap a
pitched melody/root/chord-tone card or interval; inspect the guided sheet, target
labels and Done/cancel behavior. (3) Long-press an active root/melody/chord-tone
card; inspect persistent feedback, start playback and review timeline markers and
scores if microphone input is available. (4) Adjust the comfortable anchor,
switch section, then leave the song; check expected continuity and cleanup.
Real-phone singing, latency, Bluetooth, lock screen, interruptions and background
recovery remain unverified. All E/F review statuses remain pending; stop here.
The full-app test proposal is T1–T3 below and requires explicit approval. Release
is separately authorized, including any TestFlight build needed for phone review.

During this handoff the user reproduced a long-press crash. The concrete simulator
trace (`Acquiring-2026-09-05-012617.ips`, PID 12234) identified the practice status
label force-unwrapping a cleared selection while SwiftUI was still rendering the
child. The label now handles nil/idle, and score badges snapshot dictionary values
instead of force-unwrapping mutable lookups. The same incremental build command
passed again (exit 0), install and normal launch passed (exit 0, PID 12525).
Termination reported no process because the previous app had already crashed.
Press-and-hold → microphone permission/error/cancel → idle is now an explicit
human-review and eventual targeted regression case. No full suite was started.

### Tempo/arpeggiation knob refinement — human review pending

Implemented after E/F at the user's request. Terra/high built `PlaybackKnob`;
the coordinating runtime (exact identity unavailable) wired the existing setters.
The initial handoff placed Tempo and Arpeggiate below the cards with a vertical
fallback; the single-screen refinement below supersedes that layout. Tempo uses 0–200%
in 1% steps; arpeggiation snaps through Android's `1/4, 1/3, 1/2, Off, 1, 2, 3, 4`
order. The 270° controls follow `QuizDial.kt`: drag to turn, tap to reset (100%
or Off). Readouts, VoiceOver adjustable/reset actions and long-press menus for
single-step Increase/Decrease/Reset support precise changes. Chords preview speed
also uses a knob (30–1,000 ms, reset 80 ms). Existing playback timing/configuration
and persistence setters are reused; this supersedes B1's slider and B5's Sound
menu placement, without changing their audio acceptance criteria.

Checks: `plutil -lint ios/Acquiring.xcodeproj/project.pbxproj`,
`xcrun swiftc -parse ios/Acquiring/Features/PlaybackKnob.swift`, and
`git diff --check` passed. One incremental build:
`xcodebuild -quiet -project ios/Acquiring.xcodeproj -scheme Acquiring -destination 'platform=iOS Simulator,id=55373408-99CC-4EB3-A771-6ACF29E2D96A' -configuration Debug build CODE_SIGNING_ALLOWED=NO`
passed (exit 0; existing unused-return and preview async-alternative warnings).
`xcrun simctl terminate 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios`,
`xcrun simctl install 55373408-99CC-4EB3-A771-6ACF29E2D96A /Users/brian/Library/Developer/Xcode/DerivedData/Acquiring-eazkahspoqupvxcztyfieevjkroa/Build/Products/Debug-iphonesimulator/Acquiring.app`,
`xcrun simctl launch --terminate-running-process 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios`,
and `open -a Simulator --args -CurrentDeviceUDID 55373408-99CC-4EB3-A771-6ACF29E2D96A`
passed (normal app, PID 13750; existing data retained). No additional test suites
or screenshot inspection. Human review: (1) open `500 Miles`, turn Tempo while
playing, check zero/pause and tap-reset; (2) turn Arpeggiate through its positions
and tap Off, then try the long-press precision menu; (3) optionally open Chords,
enable Arpeggiate and adjust/reset its step-time knob. Await feedback.

### Single-screen Quiz and sound-selector refinement — human review pending

User-directed UI override after the knob handoff: Quiz no longer has a page
ScrollView or floating transport. Play/Pause, section, beat-step and Reset controls
have a dedicated row. This supersedes A5's floating-placement acceptance for the
current UI; its implementation/preferences remain intact but unused. Timeline
seeking and knob adjustment remain available; Quiz disables both edge and
content swipe-back recognition and restores it on leaving (native Back remains).
Apple documents the separate [content-pop recognizer](https://developer.apple.com/documentation/uikit/uinavigationcontroller/interactivecontentpopgesturerecognizer).

The centered 24pt key/scale under the navigation title follows Android's exact
mode colors, including retaining the current source mode color while the locked
label shows the initial relative major with a red outline. Lock-in-Major is a
44pt icon button; Full/Roots uses a compact menu. Compact cards retain degree-only
melody labels and 44/88pt paired/single heights. Two 96pt knobs share a row with
instrument, transpose and balance. Vocal practice is a 44pt bottom dock opening
a manual sheet; guided/calibration flows share its existing ownership. Main Quiz
does not scroll; deliberately opened practice sheets may scroll.

Terra/high implemented compact cards/knobs and vocal-dock/presentation subfeatures;
the coordinator (exact runtime identity unavailable) integrated Quiz/header and
selectors. Sol/high traced sound/revision ownership and ran the focused Release
renderer regression; no audio-engine changes were needed in this refinement.

**Open failure:** instrument selection now uses a direct-button chooser with all
16 instruments; its Sine selection was confirmed by the targeted UI check during
playback. Transpose uses minus/plus and tap-value-to-zero, but the same check still
reports zero after tapping plus, even after waiting for chooser dismissal and
button hittability. Do not claim transpose fixed or ship this as a verified fix.
No revision/configuration overwrite was found by the bounded Sol code trace.
Pause automated retries for human confirmation of the actual touch behavior.

Validation: `git diff --check` and Swift parse passed. The incremental test/build
compiled the app successfully. The final focused command was
`xcodebuild -quiet -project ios/Acquiring.xcodeproj -scheme Acquiring -destination 'platform=iOS Simulator,id=55373408-99CC-4EB3-A771-6ACF29E2D96A' -configuration Debug -only-testing:AcquiringUITests/AcquiringUITests/testQuizInstrumentAndTransposeMenusApplySelections -parallel-testing-enabled NO -test-timeouts-enabled YES -default-test-execution-time-allowance 180 -maximum-test-execution-time-allowance 180 test CODE_SIGNING_ALLOWED=NO`:
exit 65, one failed test at the transpose-value expectation. Later assertions
(key centering, no scrolling/swipe navigation) were not reached. The instrument
menu attempt previously failed hit testing; the direct-button chooser passed
that step. `swift test -c release --filter AcquiringAudioTests.testQuizRendererLiveTransposeIsAbsoluteAndPreservesTransportAndPhase`
from `ios/Packages/AcquiringKit` passed (one test). Full suites, screenshots,
physical-device verification and TestFlight upload were not performed.

Final normal handoff: `xcodebuild -quiet -project ios/Acquiring.xcodeproj -scheme Acquiring -destination 'platform=iOS Simulator,id=55373408-99CC-4EB3-A771-6ACF29E2D96A' -configuration Debug build CODE_SIGNING_ALLOWED=NO`
passed (exit 0). The same `simctl install`, normal `simctl launch
--terminate-running-process`, and Simulator-open commands recorded in the knob
handoff passed again (exit 0; PID 17782). No UI-testing launch arguments were
used for the handoff, and the existing user catalog/data were retained.

Human review with `500 Miles`: (1) check all main controls fit, centered colored
key and compact lock toggle; (2) play, choose an instrument, tap Shift +/−/value
and report whether the number changes; (3) drag a timeline/knob and swipe elsewhere
without moving the page; (4) open/close the bottom Practice tool. Portrait fit,
actual touch behavior and visual usability still need review; broader layout and
accessibility coverage remain at the full-testing gate.

### Quiz layout and stable outlined selectors — human review pending

`[review]` User-requested follow-up; implementation by gpt-5.6-terra/high,
coordinator runtime identity unavailable. Removed the key/scale parentheses,
visible beat readouts, and previous/next beat buttons. Reset, section selection,
and Play/Pause now sit above Practice in a trailing footer, with Play/Pause
rightmost. Timeline seeking and its spoken position remain available. The
vertical balance fader sits to the right of the compact cards, measuring their
actual height so its track meets the melody-card top and chord-tone-card bottom.
Like current Android, up favors melody, down favors chords, and the upright
caption reads Volume Mix. The 44pt touch area retains 0.01 adjustment and reset
actions. Visual alignment remains for human review.

The user also reported that section choices react without applying **only while
playing** on iPhone 14 Pro. The focused pre-fix simulator run selected Chorus and
Verse successfully while paused, then failed native hit testing on Chorus during
playback (invalid activation point on two attempts), exhausting its 240-second
test allowance. Playback publishes every 50ms; the inline selector was rebuilt
with those updates. Section loading itself accepts a different valid ID and
updates selection synchronously before the audio load.

Section, Instrument, and Full/Roots now share an Equatable native SwiftUI Menu
view with a 1pt rounded outline, inset labels, selected-option checkmarks, and
44pt triggers. It refreshes for meaningful selector inputs rather than playback
progress. Equality includes the song/section identity needed by each callback,
options, selected ID, enabled state, and presentation values. Document section
keys are used consistently; they are not ExtractedSection's composite IDs.
The comparator is nonisolated and options are Sendable for Swift 6. Instrument
returns from its sheet workaround to this native menu. Scope is explicitly the
three main Quiz selectors; other screens, knobs, transpose buttons, and practice
flows are unchanged. Switching sections still starts the new section paused.

The initial layout-only incremental Debug build passed. Final verification of
the shared selectors used:

```sh
xcodebuild -quiet -project ios/Acquiring.xcodeproj -scheme Acquiring -destination 'platform=iOS Simulator,id=55373408-99CC-4EB3-A771-6ACF29E2D96A' -configuration Debug -only-testing:AcquiringUITests/AcquiringUITests/testQuizSectionMenuAppliesPausedAndPlayingSelections -only-testing:AcquiringUITests/AcquiringUITests/testQuizInstrumentAndModeMenusApplyWhilePlaying -parallel-testing-enabled NO -test-timeouts-enabled YES -default-test-execution-time-allowance 240 -maximum-test-execution-time-allowance 240 -resultBundlePath /tmp/acquiring-quiz-selectors-verified.xcresult test CODE_SIGNING_ALLOWED=NO
```

Passed, exit 0: **2 tests, 0 failures, 0 skips**, on the warm iPhone 17 simulator.
The exact full-catalog `500 Miles` fixture covers paused/reopened section menus,
section choice while playing and the resulting paused state, plus Instrument
and Full/Root-only choices while playing. Tests use ordinary native menu taps
without bypassing hit testing. The first shared-selector attempt stopped at a
Swift 6 Equatable-isolation compile error; the corrected command above passed.
The existing audio preview async-alternative warning remains unrelated.
`git diff --check -- ios/Acquiring/Features/SongViews.swift ios/AcquiringUITests/AcquiringUITests.swift`
passed. No full suite or screenshot inspection ran. Older tests referencing
removed beat-step/status controls and the prior transpose review remain pending.

Final normal simulator handoff:

```sh
xcrun simctl terminate 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios
xcrun simctl install 55373408-99CC-4EB3-A771-6ACF29E2D96A /Users/brian/Library/Developer/Xcode/DerivedData/Acquiring-eazkahspoqupvxcztyfieevjkroa/Build/Products/Debug-iphonesimulator/Acquiring.app
xcrun simctl launch 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios
open -a Simulator
```

Terminate reported no running app (exit 3 after the test runner had closed it).
Install, normal launch, and Simulator-open passed (exit 0; launch PID 22641).
Normal catalog/user data were retained. No physical-device delivery or TestFlight
upload was performed. The user subsequently authorized committing this follow-up
and merging the current branch into `main`; visual/physical review remains pending.
The pre-existing `.testflight-build-number` edit is preserved outside the commit.
Implementation worktree `/Users/brian/Desktop/acquiring-ios-quiz-layout` remains
with matching uncommitted source/test edits; the primary checkout was validated.

Human review with `500 Miles`: (1) check the unparenthesized key, card-aligned
vertical fader, and lower-right transport; (2) while playing, choose an instrument
and Full/Roots using the matching outlined menus; (3) switch sections while
playing and verify the new selection starts paused, including on iPhone 14 Pro
when a separately authorized build is delivered. Earlier pending review statuses
and the separate full-testing gate are unchanged.

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
