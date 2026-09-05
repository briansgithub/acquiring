# iOS Autonomous Test Report

Autonomous run of the automated half of `docs/ios-testing-agent-prompt.md`.
No human input, screenshots, microphone, physical device, login, or permission
decisions were used. No production behaviour was changed.

## 1. Baseline

| Item | Value |
| --- | --- |
| Working directory | `/Users/brian/Desktop/acquiring` |
| Branch / upstream | `main` … `origin/main` |
| HEAD | `b543f2bee9ceb94e24aa92928646bdb23f7f4526` — *Merge branch 'claude/ui-reset'* (2026-09-05 03:30:31 −0400) |
| `git status --short --branch` at start | `## main...origin/main`, ` M ios/.testflight-build-number` (6 → 8), `?? docs/ios-human-hardware-testing-prompt.md`, `?? docs/ios-testing-agent-prompt.md` |
| Simulator | iPhone 17 `55373408-99CC-4EB3-A771-6ACF29E2D96A`, iOS 26.3.1 (23D8133), x86_64, already booted and reused throughout |
| Untouched device | iPhone 14 Pro `87196416-…` stayed shut down; no devices or runtimes were created |
| Toolchain | Xcode 26.3 (17C529) on macOS 15.7.9 (24G830) |
| UI fixture | `contracts/fixtures/ios_ui_test_catalog.json` — 8 songs (`500 Miles`, `drop dead`, `Bad Romance`, `Honesty`, `The Entertainer`, `Gladiolus Rag`, `Bohemian Rhapsody`, `Everything You Know Is Wrong`), source snapshot `acquiring-full-catalog-fixture-source.db`, schema 3 |
| UI isolation | `UITestSession` gives every launch a private temp catalog directory, a private `UserDefaults` suite, and an **in-memory** SwiftData store. Normal simulator app data was never written, erased, or reset. |
| Real catalog artifact | `catalog.db.gz`, 75,836,096 bytes, `sha256 dbf1f58fb6686050aaf14d41251c5b129d1d8858f45aaa3d9965488ccbd8bb5a`, inflated 110,321,664 bytes (downloaded to the scratchpad only; never installed into a simulator) |
| Elapsed | 03:53 → 05:30 EDT, ≈1 h 37 min of the 3 h budget |

Installed build under test: the Debug build produced by this run, not TestFlight
build 7 or 8. `ios/.testflight-build-number` was left at its pre-existing local
value of 8 and was not committed.

### Reference documents read

`ios/AGENTS.md`, `docs/porting-plan.md` (newest handoff, commit `fba25112`),
`docs/feature-parity.md` scope, `contracts/catalog/contract.json`,
`contracts/catalog/schema.sql`, `android/README.md`,
`android/app/src/main/java/com/acquiring/android/MainActivity.kt`.

Commit `fba25112` *Fix iOS quiz selector updates and refine quiz layout* is the
source of truth for the current Quiz surface. It deliberately removed the beat
readout (`quiz.section.status`) and the beat-step buttons
(`quiz.seekBack` / `quiz.seekForward`), and replaced the Full/Roots segmented
control and the Lock-in-Major toggle with a native menu and a compact icon
button. Tests that still expected the old surface were reconciled, not restored.

## 2. Commands, exit codes, evidence

Evidence root: `/private/tmp/claude-502/-Users-brian-Desktop-acquiring/ae1f11c2-0451-46d0-b8ba-a9d821797f7a/scratchpad/results/`

| # | Command | Exit | Result | Evidence |
| --- | --- | --- | --- | --- |
| 1 | `swift test --package-path ios/Packages/AcquiringKit` | 0 | **180 passed, 0 failed**, 15.7 s test time / 39.2 s wall | `swift-test.log` |
| 2 | `xcodebuild … -scheme Acquiring … test` (baseline, all targets) | 65 | 62 tests: **53 passed, 6 failed, 3 skipped**, 409 s test phase / 8 m 28 s wall | `full-test.log`, `full.xcresult` |
| 3 | `… -only-testing:AcquiringUITests/AutonomousDiagnosticsTests` | 65 | 6 tests, 6 failed (33 assertions) — transpose + retry-identifier diagnostics | `diag1.log`, `diag1.xcresult` |
| 4 | `… /testTransposeTapDeliveryMechanisms` | 65 | 1 failed; full Quiz accessibility tree captured | `diag2.log`, `diag2.xcresult` |
| 5 | `… -only-testing:AcquiringUITests/QuizCoverageTests` | 65 | 8 tests, 3 failed | `cov1.log`, `repair2.log` |
| 6 | `… ` 4 reconciled legacy UI tests | 0 | **4 passed** | `repair1.log`, `repair1.xcresult` |
| 7 | `… /testVolumeMixFader…` after assertion correction | 0 | **1 passed** | `repair3.log` |
| 8 | `… /testQuizStaysOneScreenWithNoClippedControls` at `content_size large` | 0 | **1 passed** | `layout-large.log` |
| 9 | Same, at `content_size accessibility-extra-extra-extra-large` | 65 | **1 failed** — practice dock clipped | `layout-ax5.log` |
| 10 | `… /testFavoriteToggleFlowsThroughToTheFavoritesPlaylist` | 65 | 3 failed (2 product-relevant) | `fav.log` |
| 11 | Real catalog download + contract check + full streaming decode | 0 | **40,979 / 40,979 payloads decoded, 0 failures**, 77,528 sections, 15.4 s | `fullcatalog.log` |
| 12 | `xcodebuild … test` (consolidated end state) | see §7 | see §7 | `final.log`, `final.xcresult` |

Content size was set to `accessibility-extra-extra-extra-large` for command 9
and restored to `large` immediately afterwards; that is the only simulator
setting this run touched.

### Package suite breakdown (command 1)

`AcquiringAudioTests` 21 · `AcquiringCatalogTests` 5 · `AcquiringCoreTests` 15 ·
`AudioParityTests` 8 · `CatalogBrowseTests` 3 · `CatalogCancellationTests` 3 ·
`CatalogRecoveryTests` 19 · `ChordParityTests` 12 · `LibraryDiscoveryTests` 27 ·
`NotationModelsTests` 7 · `PersistentPitchPracticeTests` 17 ·
`PitchDetectorParityTests` 7 · `PitchSmootherParityTests` 6 ·
`PlaybackTimingParityTests` 5 · `QuizIntervalStateTests` 10 ·
`TessituraParityTests` 8 · `VocalTargetParityTests` 7 — all green.

## 3. Confirmed defects

### D1 — Quiz icon buttons expose glyph-sized hit targets; transpose and Reset cannot be operated  (F031, F029, F054)

`Button { … } label: { Image(systemName: "plus").frame(width: 44, height: 44) }`
under `.buttonStyle(.plain)` produces an accessibility/hit frame equal to the SF
Symbol glyph, not the intended 44 × 44 layout frame. Measured on the Quiz screen
at the default content size (`diag2.log`, Quiz tree):

| Control | Reported frame | Expected |
| --- | --- | --- |
| `quiz.transpose.up` | 14 × 14 at (361.0, 563.7) | 44 × 44 |
| `quiz.transpose.down` | 14 × **1.7** at (231.0, 570.0) | 44 × 44 |
| `quiz.reset` | 14.7 × 18 at (164.7, 750.0) | 44 × 44 |
| `quiz.transpose` (value) | 86 × 44 — correct | — |
| `quiz.instrument`, `quiz.section`, `quiz.play` | 174 × 43.7, 120 × 44, 68 × 58 — correct | — |

Consequences, each reproduced:

* **Transpose never changes.** `+1` was attempted while paused, while playing,
  immediately after an instrument-menu selection, and immediately after a
  section-menu selection. In every case `quiz.transpose` stayed
  `0 semitones`. `−12 … +12` and value-tap-to-reset could not be exercised at
  all because the value never leaves zero.
* **Delivery was isolated, not assumed.** `XCUIElement.tap()`, a coordinate tap
  at the element centre, and `press(forDuration: 0.08)` all failed to invoke the
  action, while the sibling `quiz.instrument` menu inside the *same* enabled,
  non-disabled container applied `Sine` in the same test. No `Audio` alert ever
  appeared, so `setSoundConfiguration` was never reached and its error branch
  never fired: this is an **undelivered tap**, not a silently rejected
  configuration. Forcing a re-render afterwards still showed `0 semitones`, so
  it is not a stale display either.
* **Reset does nothing.** From playing, after seeking to beat ≈15, a tap on
  `quiz.reset` left the transport at `Pause` and the timeline at `Beat 15.04`
  (second run: `Beat 17.13`).
* **Touch-target minimum violated** for all three controls at the default text
  size. At `accessibility-extra-extra-extra-large` the glyphs grow and
  `quiz.reset` passes, while `quiz.transpose.up` reaches 43 × 43 and
  `quiz.transpose.down` is still 43 × **4**.

**Root-cause hypothesis:** the label content has no `.contentShape(Rectangle())`,
so the frame modifier expands layout but not hit testing or the accessibility
frame. The neighbouring `quiz.transpose` value button, which works, is the one
that *does* carry `.frame(maxWidth: .infinity, minHeight: 44)` followed by
`.contentShape(Rectangle())` (`ios/Acquiring/Features/SongViews.swift:1307`).
The same shape appears at `SongViews.swift:1291-1294` (minus),
`:1318-1321` (plus) and `:1096-1099` (reset).

**Minimal reproduction:** `AcquiringUITests/AutonomousDiagnosticsTests.swift`
`testTransposeUpWhilePausedWithoutAnyMenuInteraction` (2 UI steps) and
`QuizCoverageTests.testQuizPrimaryControlsMeetMinimumTouchTargets`.

**Proposed fix (not applied — production changes are out of scope):** add
`.contentShape(Rectangle())` to each icon button label after its 44 × 44 frame,
and keep the touch-target test as the regression guard.

### D2 — `catalog.retry` identifier is shadowed by its container  (F012, F001)

In the Settings catalog-failure state every descendant reports the container's
identifier. Captured tree (`diag1.log`):

```
Button, {{34.7, 630.0}, {108.7, 23.0}}, identifier: 'catalog.settings.status.failure', label: 'Try Again'
```

`.accessibilityIdentifier("catalog.settings.status.failure")` on the enclosing
`VStack` (`ios/Acquiring/Features/LibraryViews.swift:471-482`) overrides the
button's own `catalog.retry` (`:480`). The action still exists and is reachable
by its **label**, so recovery is not blocked; the identifier is. This is the
cause of the pre-existing `testLibraryFailureCanRetryToReadyState` failure —
that test was left failing rather than rewritten, because it is reporting a real
regression. The sibling `catalog.download`, which sits outside the identified
container, keeps its own identifier.

**Proposed fix:** move the status identifier onto a non-container element, or
re-apply `catalog.retry` below the container. Same pattern to review wherever a
container identifier wraps interactive children (`quiz.cards` already relies on
this propagation in an existing test comment).

### D3 — Practice dock is clipped at the largest accessibility text size  (F054)

At `accessibility-extra-extra-extra-large`, `vocal.practice.dock` measures
`(12.0, 807.0, 378.0, 77.3)` — bottom edge 884.3 — on an 874 pt screen, i.e.
≈10 pt below the display. At the default `large` size every listed Quiz control
is fully on screen and the case passes. Quiz correctly remains non-scrolling in
both cases, so the overflow is genuinely unreachable content.

### D4 — Favorites accordion row does not reveal its contents  (F051)

Toggling the Quiz star correctly produced `song.favorite` value `Favorite`, and
back on Library the `playlist.favorites` row correctly read `1 songs` — so
membership and the summary count both work (that part of **F050 passes**).
Three taps on that row over ≈9 s never produced either
`playlist.song.the-proclaimers__500-miles` or `playlist.open.favorites`, so the
newest-five preview, "Open Favorites" route, and swipe removal could not be
reached; the count stayed `1 songs`.

**Root-cause hypothesis:** `PlaylistAccordionRow` expands on
`userContent.expandedPlaylistID == summary.id`, set through the async
`selectPlaylist(_:)`; the row's tap may not be settling that state.
**Residual uncertainty:** the sibling `playlists.header` accordion also needed a
retry (its first tap is consumed dismissing the search keyboard), so a
tap-delivery artifact could not be fully excluded within the retry budget. This
is the least-certain finding in this report.

## 4. Harness repairs made (behaviour assertions preserved)

Production code was not modified. Test-side changes:

| Change | Before → after | Why |
| --- | --- | --- |
| `attachScreenshot` made inert | captured + attached a screenshot → no-op | The assignment forbids inspecting screenshots; attachments only cost time. |
| `songDetail.chords.arpeggioSpeed` selector | `app.sliders[…]` → `app.descendants(matching: .any)[…]` | F020 specifies a **rotary** step control; the Slider expectation predates the knob. |
| `quiz.lockInMajor` selector | `app.switches[…]` → `app.buttons[…]` + assert value `Off` | The handoff replaced the toggle with a compact icon button. |
| `quiz.mode` selector | `app.segmentedControls[…]` + `buttons["Full"/"Root-only"]` → native menu tap + value assertion | Full/Roots is now a stable outlined native menu. |
| `quiz.section.status` "Chorus ready" assertions (2 tests) | removed → assert the section selector value **and** that the new section starts at `Beat 1` with the transport showing `Play` | The visible beat readout was removed in `fba25112`; the underlying F015 requirement (new section starts at its beginning, paused) is asserted more directly than before. |
| `quiz.seekForward` × 4 (card-preview test) | beat-step button taps → melody-timeline coordinate taps until distinct previous/current melody cards exist | Beat-step buttons were removed; timeline seeking is the surviving gesture. |
| `scrollToHittable` / `scrollBackToHittable` on Quiz | page swipes → `waitForHittable` | Quiz has no page scrolling; swiping it is a seek gesture, not a scroll. |
| Volume-mix endpoint assertion | required exactly `100/0` and `0/100` at the extreme pixels → assert ≥95 % melody at the top, ≤5 % at the bottom, 50 ± 3 mid-track, and midpoint restoration via the reset action | My original assertion was wrong about the contract: F034 asks for direction plus midpoint in the UI and puts the **true** zero endpoints in the renderer tests, which pass. |

New test files (UI target only): `AcquiringUITests/AutonomousDiagnosticsTests.swift`
(6 focused diagnostics) and `AcquiringUITests/QuizCoverageTests.swift`
(9 breadth cases). Both registered in `ios/Acquiring.xcodeproj/project.pbxproj`.

All four reconciled legacy tests pass after the repairs (command 6, exit 0).

### Harness note

`xcodebuild test -only-testing:` runs the **previously installed** test bundle on
the first invocation after a test method is added or edited, so a newly added
case reports `Executed 0 tests` and an edited case reports the old line numbers.
Every result above was taken from a second, confirmed-fresh invocation. This is
a tooling artifact of this Xcode/simulator pair, not an app defect.

## 5. Feature results

Coverage layer: **pkg** = AcquiringKit package tests, **app** = in-process
`AcquiringTests`, **ui** = `AcquiringUITests` on the simulator, **static** =
source/contract inspection, **data** = real 40,979-song catalog.

### Library, catalog, discovery

| ID | Result | Layer | Att. | Time | Actual vs expected | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| F001 | **PASS** | ui, app, static | 1 | 4 m | Loading / empty / ready / failure states all render with explicit text and correct available actions; no keyboard focus or microphone prompt on launch (`AVAudioApplication.requestRecordPermission()` is only reachable from `acquireMicrophone`, `AudioSystem.swift:614`). Settings retry identifier defect tracked separately as **D2**. | `full.xcresult`, `final.log` |
| F002 | **PASS** | app, ui, static | 1 | 3 m | 300 ms debounce (`LibraryStore.swift:440`), submit bypasses the debounce, 20-row pages (`:401`), paging failure keeps the first page and publishes an error, older responses cannot replace newer ones. | `AcquiringTests` search cases, `full.xcresult` |
| F003 | **PASS** | app, ui | 1 | 2 m | 10-item cap (`HistoryStore.swift:10`), most-recent-first with reopen promotion and no duplication; recents reappear after clearing the query. | `testHistoryUsesAndroidOrderingLimitAndArtistCanonicalization`, `testPhase2SongDetailReviewFlow` |
| F004 | **PASS** | app, ui | 1 | 2 m | Debounced artist suggestions, canonicalised identity, origin preserved without a duplicate artist route; artist results open. | `testOpeningSongArtistPreservesOriginAndAvoidsDuplicateArtistRoute`, `testArtistSearchOpensArtistResults` |
| F005 | **PASS (encoding/state)** / **BLOCKED (live handoff)** | static, ui | 1 | 2 m | `URLComponents` + `URLQueryItem` percent-encode spaces, apostrophes and non-ASCII correctly; blank query is both disabled and guarded; failure raises an explicit alert; the button is explicit, so no per-keystroke external search. One real browser handoff was **not** performed — it leaves the app mid-suite and was judged an unnecessary destabilisation; queued for companion review. | `HooktheorySearchButton.swift`, Library tree in `fav.log` |
| F006 | **PASS** | pkg, data, ui | 1 | 5 m | Against the real catalog, **0** `alphaGroup` mismatches over 40,979 rows versus the audited rule (A–Z, 0–9, else `#`, single-character uppercase only); 37 distinct groups. Group expansion/collapse and open/back verified in the UI. | `fullcatalog.log`, `LibraryDiscoveryTests` |
| F007 | **PASS** | pkg, data | 1 | 3 m | Real-catalog bucket check: **0** mismatches versus `complexityBucket` (0–9, exact 100 → bucket 9, missing/out-of-range → Unrated). Histogram 902 / 2310 / 4795 / 6542 / 6715 / 6971 / 5969 / 4127 / 1940 / 706 + 2 unrated. | `fullcatalog.log` |
| F008 | **PASS** | pkg, data, ui | 1 | 3 m | Exactly the 7 canonical modes present (ionian 22,393 · aeolian 16,944 · mixolydian 2,991 · dorian 2,389 · phrygian 777 · lydian 500 · locrian 117); 5,191 songs belong to more than one mode and 46,111 mode rows exceed 40,979 songs, so counts correctly do **not** sum to catalog size; 640 songs map to no diatonic mode, matching the documented `canonicalMode → nil` rule. | `fullcatalog.log` |
| F009 | **PASS** | pkg, app | 1 | 2 m | 250 ms filter debounce (`AllSongsBrowseStore.swift:127`); normalisation drops only space/hyphen/underscore per Android; stale-response rejection and state restoration covered by store tests. | `LibraryDiscoveryTests`, `full.xcresult` |
| F010 | **PASS** | data, pkg | 1 | 6 m | Bounded streaming pass over the **real** catalog: 40,979 rows read in 200-row batches, every `dataBlob` gunzipped and JSON-decoded — **40,979 ok, 0 failed**, 77,528 sections, 15.4 s, no payload dumped and no full load into memory. Schema `user_version = 3`; all three required tables with all required columns; all three required indexes present. | `fullcatalog.log` |
| F011 | **PASS (deterministic paths)** / **BLOCKED (live import)** | app, ui | 1 | 3 m | "Add a TheoryTab song" is present on the main Library with a catalog and in the empty state, and absent from Settings — confirmed in the captured Library tree. Invalid scheme/host/path rejection without calling the service, retry using the original validated URL, refusal to hide an active update, and harvest-failure retry-to-completion all pass. A live Hooktheory import was not run (network write path, no isolated live credentials). | `AcquiringTests` harvest cases, `testSongHarvestFailureCanRetryToCompletion` |
| F012 | **PASS (validation, staging, real artifact)** / see **D2** | pkg, app, ui, data | 2 | 12 m | `contracts/catalog/` rules validated against the real artifact: schema 3, required tables/columns/indexes, browse-row floor 40,609 satisfied by 40,979 rows. Corrupt / truncated / incompatible / cancelled downloads, commit-boundary cancellation, late-cancellation reconciliation and rollback all pass in `CatalogRecoveryTests` + `AcquiringTests`. Settings exposes exactly one download action for an empty catalog. The real artifact downloaded and inflated cleanly. **D2** affects only the retry button's identifier. | `fullcatalog.log`, `CatalogRecoveryTests`, `testCatalogSettingsOffersOneDownloadActionForAnEmptyCatalog` |

### Song detail and music theory

| ID | Result | Layer | Att. | Time | Actual vs expected | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| F014 | **PASS** | ui | 1 | 4 m | Selecting a song opens Quiz with the right title/artist; explicit Back walks Quiz → Song → originating list; Info/Chords routes preserve context. The removed Quiz Info button is correctly absent and was not demanded. | `testPhase2SongDetailReviewFlow`, `testQuizShellSwitchesModesAndReturnsThroughInfoToOrigin` |
| F015 | **PASS** | ui | 2 | 5 m | Section changes while paused and while playing; a newly chosen section starts at `Beat 1` with the transport reading `Play`, i.e. at its beginning and paused even when the prior section was playing; reopening the menu and rapid switching are stable; selecting the same section is a no-op. | `testQuizSectionMenuAppliesPausedAndPlayingSelections`, repaired `testQuizShellSwitchesModes…` |
| F016 | **PASS (surface + reachability)** | ui, static | 1 | 3 m | The Info tab renders key, BPM, beats/measure, length, beats-and-bars, `chords.count (unique)`, sounded/total melody label, plus key/tempo/meter change lists. Reached and asserted for `500 Miles`; a second sparse payload was not cross-checked field-by-field against source data. | `testPhase2SongDetailReviewFlow`, `SongViews.swift:304-400` |
| F017 | **PASS (metadata/links present)** / **deferred (link activation)** | ui, static | 1 | 3 m | Ordered progression pills with previews, Hooktheory ID / slug / song info, and Hooktheory + YouTube links all render; `songDetail.hooktheoryLink` located and asserted. Activating the external links was deliberately not done in-suite. | `testQuizShellSwitchesModes…` |
| F018 | **PASS** | pkg, ui | 1 | 2 m | Rests excluded from the inventory (explicit empty-state text says so), unique-chord rule matches the audited output, key-at-onset respected; the grid renders and the key row is present. | `ChordParityTests`, `testPhase2SongDetailReviewFlow` |
| F019 | **PASS** | ui, static | 1 | 2 m | "Show letter names" is consumed **only** in the Chords inventory (`SongViews.swift:513`); melody cards render `FittedScaleDegree` only, and the melody interval card is built with `showsPitchNames: false` (`QuizCards.swift:192`). Toggling names does not add letters to melody cards. | `testPhase2SongDetailReviewFlow`, source |
| F020 | **PASS** | ui, static | 2 | 3 m | Arpeggio-step knob spans **30…1,000 ms** and resets to **80 ms** (`SongViews.swift:476-483`); it appears only when Arpeggiate is on and disappears when off. Repeated-tap preview replacement is covered by the card-preview test. | repaired `testPhase2SongDetailReviewFlow` |
| F021 | **PASS** | pkg | 1 | 1 m | Frequency/MIDI conversion, every supported mode resolving to its ionian tonic, transposition, spelling and enharmonic distinctions verified against the shared cross-platform corpus. | `AcquiringCoreTests`, `testSharedParityCorpusIsBundledAndDecodable` |
| F022 | **PASS** | pkg, app | 1 | 1 m | Shared chord corpus matches Android (`testSharedChordCorpusMatchesAndroid`); rests, modifiers, inversions, applied/borrowed/custom harmony and voicing covered by 12 `ChordParityTests`. | `swift-test.log`, `full.xcresult` |
| F023 | **PASS (semantics/layout)** | pkg, ui | 1 | 1 m | Token/layout tests pass; spoken semantics appear in Quiz labels (`Play chord I`, `Play Current chord root E3, scale degree 1̂`). Glyph legibility is a companion item. | `NotationModelsTests`, Quiz tree in `diag2.log` |
| F024 | **PASS (semantics/layout)** | pkg, ui | 1 | 1 m | Degree components and spoken labels correct; card frames fit the compact 44/88 pt rows, and no clipping was detected at either tested text size. | `NotationModelsTests`, `testQuizStaysOneScreen…` |

### Quiz, transport, sound

| ID | Result | Layer | Att. | Time | Actual vs expected | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| F025 | **PASS (simulator)** | pkg, app, ui | 1 | 4 m | Melody and chord lanes stay aligned and report the same beat value; the playhead is fixed; durations, gaps, rests, overlaps, half-open current-event selection and onset-key context are covered by presentation tests. Real-device frame delivery and perceived smoothness remain unverified. | `testChordTimelinePresentation…`, `testMelodyTimelinePresentation…`, `testTimelineTapSeeksWithinBoundsInBothLanes` |
| F026 | **PASS** | ui | 1 | 2 m | Full → Root-only swaps `quiz.cards` for `quiz.rootCards` and exposes `quiz.rootSeek`; returning restores full cards; the menu value follows the selection both while paused and while playing. | `testRootOnlyModeReplacesCardsAndReturnsToFullMode`, `testQuizInstrumentAndModeMenusApplyWhilePlaying` |
| F027 | **PASS (transport)** | pkg, app, ui | 1 | 3 m | One app-scoped transport; Play/Pause round trips correctly; same-context navigation preserves position; loop-seam continuity and render-buffer behaviour covered by `AudioParityTests` and `PlaybackTimingParityTests`. | `swift-test.log`, `testQuizSectionMenu…` |
| F028 | **PASS** | ui, pkg | 1 | 3 m | A tap right of the playhead seeks forward; a tap far left clamps at `Beat 1`; both lanes stay synchronized to the same value; 25 far-right taps settle at the section end and a 26th does not move it. No screen navigation occurred during any gesture. | `testTimelineTapSeeksWithinBoundsInBothLanes` |
| F029 | **FAIL** | ui | 3 | 9 m | Footer order (Reset · Section · Play/Pause rightmost) and reachability are correct, and the superseded floating transport is not required. But **Reset does not act**: from playing at beat ≈15 the transport stayed `Pause` and the position stayed at `Beat 15.04`. See **D1**. | `cov1.log`, `repair2.log` |
| F030 | **PASS** | ui, pkg | 1 | 3 m | Range 0–200 %, one-percent steps (100 → 101 on one increase), tap-reset to 100 %; zero pauses output by construction (`isPlaybackEnabled: tempoPercent > 0`) and 0/50/100/200 % render behaviour is covered by the deterministic renderer tests. | `testTempoAndArpeggioKnobsAdjustAndResetThroughNamedActions`, `AudioParityTests` |
| F031 | **FAIL** | ui | 3 | 21 m | Highest-priority regression. Displayed value never leaves `0 semitones` under any of four conditions; taps are undelivered rather than rejected; −12/0/+12, reset-by-value-tap and no-accumulation could not be exercised. See **D1**. | `diag1.log`, `diag2.log` |
| F032 | **PASS** | pkg, ui, static | 1 | 3 m | All 16 synthesized voices are defined (`AudioContracts.swift:5-39`) with `sawtooth` as the default (`QuizSoundConfiguration.init`); selection applies while paused and while playing without restarting playback; renderer behaviour and bounded levels covered by `AudioParityTests`. | `testQuizInstrumentAndModeMenusApplyWhilePlaying`, `swift-test.log` |
| F033 | **PASS** | ui, static | 1 | 3 m | Knob slot order is exactly `1/4, 1/3, 1/2, Off, 1, 2, 3, 4` (`QuizArpeggioOption`), one step up from `Off` gives `1 cycles per beat` and two steps down gives `1/2 cycles per beat`; tap-reset returns to `Off`. | `testTempoAndArpeggioKnobs…` |
| F034 | **PASS** | ui, pkg | 2 | 5 m | `melodyGain = balance`, `chordGain = 1 − balance`, default 0.5. Vertical fader: top ⇒ 98 % melody, bottom ⇒ 98 % chords, mid-track 50/50, reset action restores 50/50. True 0/1 endpoints verified in renderer tests. | `repair3.log`, `AudioParityTests` |
| F035 | **PASS** | ui, static | 2 | 5 m | Paired melody cards measure 44 pt and single/interval cards 88 pt (`MelodyCardLayout`), asserted on live frames; unavailable melody/rest states are explicit; each card type taps without crashing or raising an `Audio` alert. | repaired `testQuizCardPreviewsDoNotCrashAndMelodyCardsUseCompactHeights` |
| F036 | **PASS (arbitration/no-crash)** | ui, app | 2 | 5 m | Single taps preview; repeated and interleaved taps across chord, root, melody, interval and chord-tone cards replace cleanly with the app still foreground and no stuck preview or alert; preview-generation invalidation covered by `testPreviewPlaybackGeneration…`. Double-tap sing-back and long-press practice reach the microphone owner and are covered under F041–F046. | `repair1.log`, `full.xcresult` |
| F037 | **PASS (behaviour)** | ui, static | 1 | 2 m | Toggling Lock in Major flips value `Off → On → Off`, leaves `quiz.transpose` unchanged (it does not transpose the source), and restores the original key label on unlock. Colour mapping verified statically: major/ionian `#FF0000`, dorian `#FFB014`, phrygian & phrygian-dominant `#EFE600`, lydian `#00D300`, mixolydian `#4800FF`, minor/aeolian/harmonic-minor `#B800E5`, locrian `#FF00CB`, keyed on the **source** mode, with a red outline marking the lock. Visual judgement is a companion item. | `testLockInMajorChangesTheKeyLabel…`, `SongViews.swift:2400-2412` |
| F038 | **PASS (simulator)** | pkg, ui | 1 | 3 m | Finite bounded samples, format contracts, dense onset/seam handling, rapid replacement and cancellation all pass; repeated card-tap previews on the simulator produced no crash, no `Audio` alert and no stuck note. Device `OSStatus`/route behaviour and acoustic quality remain pending. | `AudioParityTests`, `repair1.log` |
| F039 | **PASS (wiring only)** | pkg, app | 1 | 2 m | Now Playing data, remote-command routing, interruption/resume intent and route/media-services recovery pass through the injectable boundaries. Real lock-screen, background and route behaviour is **not** claimed from mocks. | `swift-test.log` |

### Microphone and vocal practice

Every algorithm-level property below was verified; every path that needs real
capture or a permission decision is **BLOCKED** because the production build has
no injectable permission or capture provider — `AVAudioApplication.requestRecordPermission()`
is called directly (`AudioSystem.swift:614`) and `MicrophoneSession` exposes only
an owner enum and a lease. Adding an injection point would be a production
change, which this assignment excludes.

| ID | Result | Layer | Att. | Time | Actual vs expected | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| F040 | **PASS (DSP)** / **BLOCKED (hardware capture)** | pkg, static | 1 | 6 m | See §6 — every baseline constant and behaviour matches. Native `AVAudioConverter` capture could not be exercised without hardware input. | `PitchDetectorParityTests`, `PitchSmootherParityTests`, `AudioSystem.swift:1335-1500` |
| F041 | **BLOCKED** | static | 1 | 2 m | Permission is requested only from `acquireMicrophone`, so a fresh launch cannot prompt — that half is confirmed, and opening the practice dock raised no alert. Allow/deny/retry, owner transitions and stale-release behaviour need a fake permission/capture provider that does not exist. | `testVocalPracticeDockStartsCollapsedAndOpens` |
| F042 | **PASS (model)** / **BLOCKED (UI gesture path)** | pkg | 1 | 2 m | Sing-back target construction, transport pause, settling delay and cancellation pass in the model tests. Driving the double-tap through the UI enters the microphone owner and stops at the permission prompt. | `VocalTargetParityTests` |
| F043 | **PASS (dock lifecycle)** / **BLOCKED (capture)** | ui, pkg | 1 | 2 m | The dock starts collapsed (`vocal.practice.panel` absent), opens on demand to reveal the panel, and raises no permission alert. Three-second timed capture, silence/cancel/re-record and exact-frequency replay are model-verified but not driven end-to-end. | `testVocalPracticeDockStartsCollapsedAndOpens`, `ComfortablePitchCapture` tests |
| F044 | **PASS (numeric)** | pkg | 1 | 1 m | Target/measurement spelling, cents sign and magnitude, and interval direction match numeric references; a no-signal frame is never presented as in-tune. | `VocalTargetParityTests`, `PersistentPitchPracticeTests` |
| F045 | **BLOCKED** | — | 1 | 1 m | Flip-Flop's 3 s / 3 s / 2 s cycle needs the capture provider; no controlled-clock seam exists below the microphone boundary. | — |
| F046 | **PASS (model)** / **BLOCKED (long-press path)** | pkg | 1 | 2 m | Root/melody/chord-tone practice following the active event, fast melody tracking, rest and no-signal handling, chord-tone index clamping and ownership hand-off all pass with fake estimates. The long-press UI entry needs the microphone. | `PersistentPitchPracticeTests` (17) |
| F047 | **PASS (model)** | pkg | 1 | 1 m | Settling, freshness, run IDs, median scoring, minimum-sample rules, no-sample outcomes and discard-on-discontinuity all pass, including scoop delay and the one-wild-frame case. | `PersistentPitchPracticeTests` |
| F048 | **PASS (model)** | pkg | 1 | 1 m | Three voiced seconds with the final two contributing, silence pausing progress, ≤1 s dropout preserving the attempt and longer dropout restarting, plus cancel/retry and release. | `TessituraParityTests`, `testComfortablePitchCapturePausesThenRestartsAfterDropout` |
| F049 | **PASS (model)** | pkg | 1 | 1 m | Comfortable-window/register/tritone/contour resolution, semitone and octave adjustment applied once, transpose applied once, and source transport independence. | `TessituraParityTests`, `VocalTargetParityTests` |

### Durable user data and accessibility

| ID | Result | Layer | Att. | Time | Actual vs expected | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| F050 | **PASS** | app, ui | 4 | 12 m | Unique membership and newest-first ordering pass in-process; a Quiz star toggle updated the control to `Favorite` and the Library `playlist.favorites` row to `1 songs`; favourites survive catalog replacement (`testCatalogReplacementPreservesFavoritesAndCustomPlaylistMembership`). Relaunch persistence is covered in-process — UI launches use an in-memory store by design, so a UI relaunch check is not applicable. | `fav.log`, `AcquiringTests` |
| F051 | **FAIL** | app, ui | 4 | 12 m | Summary count is correct, and cascade deletion, durable identities and catalog-replacement survival pass in-process. The accordion row never revealed its contents, so newest-five preview, opening songs and swipe removal are unverified. See **D4**. | `fav.log`, `testDeletingCustomPlaylistCascadesEntries` |
| F053 | **PASS** | app, pkg | 1 | 2 m | Catalog replacement never overwrites favourites/playlists/history; rollback, interrupted swaps, app-scoped gating and startup recovery all pass against isolated stores. | `CatalogRecoveryTests` (19), `AcquiringTests` gate cases |
| F054 | **FAIL** | ui | 2 | 8 m | Labels, values and named actions are present and meaningful throughout, focus order is usable, Quiz stays one non-scrolling screen at the default text size, and swiping neither scrolls nor navigates. Two defects: glyph-sized touch targets (**D1**) and the practice dock clipped at the largest accessibility text size (**D3**). VoiceOver experience, legibility and other device sizes are companion items. | `layout-large.log`, `layout-ax5.log`, `cov1.log` |

### Additional settings / UI checks

| Check | Result | Actual vs expected | Evidence |
| --- | --- | --- | --- |
| iOS settings / update link | **PASS** | Settings shows Installed Version (`app.installedVersion`) and Check for Updates (`app.checkForUpdates`) opening `itms-beta://testflight.apple.com/v1/app/**6807512572**`, with an explicit failure alert and a written manual fallback. Download/resync lives in Settings; "Add a TheoryTab song" stays on Library — both confirmed in captured trees. The copy describes opening TestFlight, not comparing beta versions. | `LibraryViews.swift:405-448`, `diag1.log`, `fav.log` |
| Android settings / update link | **BLOCKED (toolchain)** / **PASS (static)** | `openUpdateDistribution` targets `https://play.google.com/store/apps/details?id=com.acquiring.android` with `setPackage("com.android.vending")` first, a browser intent fallback, and an explicit message when neither resolves. No Android SDK is installed (`ANDROID_HOME` unset, `~/Library/Android/sdk` absent) and the JDK is 16, so Gradle checks were not run and no emulator was installed. Deferred Play In-App Updates task recorded at `android/README.md:28`. | `MainActivity.kt:115-142` |
| Frame rate | **PASS (configuration)** | `settings.timelineFrameRate` defaults to `.standard` (60 Hz) and persists via `@AppStorage`; both lanes share one projected beat and resynchronise on section, seek, tempo and play-state changes; the footer states that Reduce Motion disables interpolation and that audio speed is unchanged. Simulator cadence is not evidence of ProMotion smoothness, power or thermals. | `LibraryViews.swift:387-407`, `SongViews.swift:2672-2700` |
| Knobs | **PASS (bounds/snaps/actions)** / see **D1** | Tempo 0–200 step 1 reset 100; arpeggio snaps to 8 discrete slots and resets to Off; arpeggio-step 30–1,000 ms resets to 80 ms; named Increase/Decrease/Reset actions work; knob gestures neither scrolled nor navigated the Quiz page. Knob hit areas (96 × 96) are correct — the glyph-sized targets in **D1** are the adjacent icon buttons, not the knobs. | `testTempoAndArpeggioKnobs…`, `diag2.log` |
| Key colours | **PASS (mapping)** | All seven mappings match the specification exactly, keyed on the current **source** mode; locking changes only the label and adds the red outline. Perceived colour is a companion item. | `SongViews.swift:2400-2412` |

Excluded by the prompt and not invented: magnifying-glass/puck, skip and
beat-step controls, floating transport placement, database-verification /
search-by-slug UI, F013 automatic missing-payload harvesting, F052 custom
playlist creation/deletion UI, F055 standalone audiation container.

## 6. Synthetic recording / DSP parity

Every baseline in the prompt's table was checked against current source and
exercised by the package tests (`PitchDetectorParityTests` 7,
`PitchSmootherParityTests` 6, `AcquiringAudioTests` 21 — all green). Constants
were not merely matched; the outputs and state transitions are asserted by those
suites.

| Property | Expected | Found | Source |
| --- | --- | --- | --- |
| Analysis format | Mono PCM16-equivalent @ 16,000 Hz, native input converted | Mono float32 → 16 kHz via `AVAudioConverter`, clamped and rounded to `Int16`; non-finite samples treated as silence rather than trapping | `AudioSystem.swift:1354-1452` |
| Standard tracking | 2,048 window / 512 hop | 2,048 / 512 | `AudioSystem.swift:1377-1380` |
| Fast melody tracking | 1,024 window / 256 hop | 1,024 / 256 | `AudioSystem.swift:1381-1384` |
| YIN | threshold 0.15, ≈65–1,000 Hz, Android lag selection / refinement / invalid handling | 0.15, 65–1,000 Hz, first-below-threshold with local-minimum walk, parabolic refinement, explicit no-detection on a zero-energy buffer | `PitchDetector.swift` |
| Input gates | RMS < 0.0005, confidence < 0.4, non-positive/invalid frequency rejected | exactly those, plus finiteness checks on frequency, confidence, RMS and MIDI | `AudioSystem.swift:1458-1466` |
| Standard smoother | median 3, min publish 2, EMA 0.3, jump > 6 st, reset after 3 | median 3, min 2, EMA 0.3, 6 st, 3 | `PitchSmoother.swift:19-25` |
| Fast smoother | median 1, min publish 1, EMA 1.0, same jump, 1 before reset | median 1, min 1, EMA 1.0, 6 st, 1 | `PitchSmoother.swift:27-33` |
| Dropout | no stale estimate past the > 200 ms boundary | `samplesSinceValidEstimate / 16000 > 0.2` resets the smoother | `AudioSystem.swift:1468-1474` |

Native capture, microphone preprocessing, acoustic leakage and real singing
remain **BLOCKED** physical evidence; the algorithm passes above stand
independently.

## 7. Consolidated end state

Final consolidated `xcodebuild … test` over `AcquiringTests` + `AcquiringUITests`
(command 12), exit **65**, 973 s test phase:

| | Count |
| --- | --- |
| Total | **79** |
| Passed | **64** |
| Failed | **12** |
| Skipped | **3** (pre-existing, unchanged) |

Plus **180 / 180** passing package tests (command 1) and the **40,979 / 40,979**
real-catalog decode (command 11).

Every one of the 12 failures maps to a defect in §3 — there are no unexplained
or flaky failures, and no failure is a stale expectation:

| Defect | Failing tests |
| --- | --- |
| **D1** glyph-sized hit targets | `testTransposeUpWhilePausedWithoutAnyMenuInteraction`, `testTransposeUpWhilePlaying`, `testTransposeBoundsResetAndRepeatedChangesWhilePaused`, `testTransposeImmediatelyAfterInstrumentMenuSelection`, `testTransposeImmediatelyAfterSectionMenuSelection`, `testTransposeTapDeliveryMechanisms`, `testQuizInstrumentAndTransposeMenusApplySelections`, `testQuizPrimaryControlsMeetMinimumTouchTargets`, `testResetStopsPlaybackAndReturnsToTheBeginningWithoutClearingSound` (9) |
| **D2** shadowed retry identifier | `testCatalogSettingsRetryIsAddressableByIdentifierAndLabel`, `testLibraryFailureCanRetryToReadyState` (2) |
| **D4** Favorites row will not expand | `testFavoriteToggleFlowsThroughToTheFavoritesPlaylist` (1) |

**D3** does not appear here because the device text size was restored to `large`
before this run; it reproduces on demand with command 9.

The three pre-existing skips are unchanged and were not converted to passes:

* `testAllSongsCanonicalGroupsAndExpansion` — "All Songs remains a post-reset placeholder"
* `testQuizPlayTogglesToPause` — "needs a deterministic injected audio test double"
* `testSearchSongOpensQuizWithMelodyTimelineAndRestoresNavigation` — "requires atomic review"

Their subject matter is nonetheless covered elsewhere: All Songs grouping by
`LibraryDiscoveryTests` plus the real-catalog cross-check (F006), and Play/Pause
plus melody-timeline navigation by `testQuizSectionMenuAppliesPausedAndPlayingSelections`,
`testTimelineTapSeeksWithinBoundsInBothLanes` and `testPhase2SongDetailReviewFlow`.

### Result tally across all 52 feature IDs and the settings/UI extras

| Status | Count | IDs |
| --- | --- | --- |
| **PASS** (automated scope only) | 39 | F001–F004, F006–F010, F014–F028, F030, F032–F038, F044, F047–F050, F053, plus iOS settings/update link, frame rate, key colours, knobs |
| **PASS with a blocked or deferred part** | 7 | F005, F011, F012, F040, F042, F043, F046 (live handoff, live import, live install, hardware capture, gesture path) |
| **FAIL** | 4 | **F031**, **F029**, **F051**, **F054** |
| **BLOCKED** | 2 (+1 extra) | F041, F045; plus the Android settings/update link check |
| **NOT RUN** | 0 | — |
| Excluded by the prompt | 3 | F013, F052, F055 — plus the superseded floating-transport and beat-step surfaces |

The four status buckets account for all 52 feature IDs (39 + 7 + 4 + 2). `F039`
is PASS for integration wiring only and is repeated in the companion queue for
its real platform behaviour. Nothing is marked **NOT IMPLEMENTED**: every
feature the checklist expects to have a production surface has one, apart from
the deliberately excluded items above. Nothing is marked **FLAKY**: every failure
reproduced on every run that exercised it, and every repaired test passed on
each subsequent run.

## 8. Companion queue (human, device, or credential required)

Build needed: a Debug build of `b543f2be` plus the two new UI test files, or the
next TestFlight build once **D1** is fixed. "Known failure" means this run
already proved it broken; "unverified" means no automated evidence exists either
way.

| ID | Item | Kind |
| --- | --- | --- |
| F031, F029, F054 | Re-check transpose, Reset and touch targets by hand once `.contentShape` is added | **known failure** |
| F051 | Tap the Favorites row on a device and confirm whether it expands | **known failure** |
| F054 | Practice dock clipped at the largest accessibility text size | **known failure** |
| F005 | One real browser handoff to `hooktheory.com/theorytab/search` and return | unverified |
| F011 | One live TheoryTab import into an isolated store | unverified |
| F012 | Installing the downloaded 75.8 MB artifact through the in-app resync, end to end | unverified |
| F016, F017 | Field-by-field Info comparison against a sparse payload; activating the Hooktheory and YouTube links | unverified |
| F023, F024 | Glyph alignment and legibility of dense roman numerals and altered degrees | unverified |
| F025 | Real-device frame delivery and perceived timeline smoothness (ProMotion) | unverified |
| F030, F033, F034, F038 | Audible tempo smoothness, arpeggio pacing, blend, and acoustic quality / stuck-note behaviour | unverified |
| F037 | Perceived key colour and the red lock outline | unverified |
| F039 | Real lock-screen, background, interruption and route behaviour; device `OSStatus` | unverified |
| F040–F049 | Real microphone capture, permission dialogs, singing, marker and scoring feel, comfortable-register perception, Flip-Flop pacing | unverified |
| Android | Gradle build and the Play Store intent, once an SDK and JDK 17+ are installed | unverified |
| Frame rate | ProMotion smoothness, power and thermal behaviour on device | unverified |

## 9. Highest-priority unresolved defects

1. **D1 — Quiz icon buttons expose glyph-sized hit targets.** Transpose is
   entirely inoperable and Reset does nothing; both are core transport controls,
   and the same shape violates the 44 pt minimum. One likely one-line-per-button
   fix. This subsumes the previously reported transpose regression.
2. **D4 — Favorites accordion row does not reveal its contents,** hiding the
   preview, the open route and swipe removal. Least certain of the four; worth a
   quick manual check first.
3. **D3 — Practice dock clipped ≈10 pt at the largest accessibility text size,**
   on a screen that deliberately does not scroll.
4. **D2 — `catalog.retry` identifier shadowed by its container.** Lowest user
   impact (the action still works by label) but it breaks a legitimate existing
   test and the same container pattern appears elsewhere.

## 10. Scope not executed, and why

* Live network writes — one TheoryTab import and an in-app catalog install — were
  not run. The artifact itself was downloaded and fully validated offline
  instead; installing it into a simulator store would have written outside the
  isolated fixtures.
* One real external browser handoff (F005) was skipped to avoid leaving the app
  mid-suite; encoding and blank-query behaviour were verified from source and the
  live Library tree.
* All hardware-microphone paths were left BLOCKED rather than unblocked by adding
  an injection point, which would be a production change.
* Android checks stopped at static inspection: no SDK, `ANDROID_HOME` unset,
  JDK 16. No emulator or SDK was installed.
* Optimized Release audio runs were not made; nothing observed suggested a
  Debug/Release-specific concern.

Execution ended because the feasible automated scope was complete, not because
the 3 h budget expired — roughly 1 h 35 min was used. Nothing is marked NOT RUN.

## 11. Files touched

Test-side only; no production source, no commits, no pushes, no TestFlight upload.

* `ios/AcquiringUITests/AcquiringUITests.swift` — reconciled obsolete selectors (§4)
* `ios/AcquiringUITests/AutonomousDiagnosticsTests.swift` — **new**
* `ios/AcquiringUITests/QuizCoverageTests.swift` — **new**
* `ios/Acquiring.xcodeproj/project.pbxproj` — registers the two new files in the `AcquiringUITests` target
* `docs/ios-autonomous-test-report.md` — this report

`ios/.testflight-build-number` retains the pre-existing local modification (6 → 8)
and was neither reverted nor committed.
