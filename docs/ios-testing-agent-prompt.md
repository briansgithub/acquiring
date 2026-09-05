# Prompt 1 — Autonomous testing with bounded closed-loop diagnosis

Run the automated portion of Acquiring's iOS parity testing entirely autonomously. This assignment authorizes these tests, isolated test data, and necessary test-harness changes when I give you this prompt to execute. Do not ask for human feedback, visual inspection, singing, account login, device connection, or permission decisions. Record unavailable prerequisites and continue independent checks.

Your loop is: establish expected behavior → run a meaningful check → inspect the failure → correct a demonstrably faulty test/setup, or add a focused diagnostic → rerun within budget → record the outcome → advance. Product defects may remain unresolved; documenting them is a valid completion of this testing assignment. Do not change production behavior, weaken correct assertions, disable features, or substitute direct state changes for failed UI taps to manufacture a pass. Production fixes, TestFlight uploads, commits, and pushes are outside this assignment.

This prompt supersedes the earlier testing instruction to pause for human feedback after a failure. Once the bounded attempts are exhausted, mark the case and proceed. If a necessary action requires new authority or an unavailable resource, do not perform it or ask for it: record BLOCKED and a proposed next action. Finish all remaining feasible work.

## Baseline and scope

Work in `/Users/brian/Desktop/acquiring`. Read applicable `AGENTS.md` instructions and record `git status --short --branch`, commit, relevant local changes, simulator/runtime and fixture identity. Preserve other work. Use the existing iPhone 17 simulator, one booted simulator at a time. Do not create extra devices/runtimes or overwrite normal user data. The physical iPhone 14 Pro is outside this prompt.

Read `docs/feature-parity.md`, the newest relevant handoffs in `docs/porting-plan.md`, and the corresponding final behavior in `docs/android-app-analysis.md`. Use the Android audit and its pinned reference for musical behavior; use subsequent explicit user-approved changes for iOS layout and interaction. Inspect current callers to resolve stale documentation. Do not equate a completed implementation checkpoint, a package test, or a successful build with verified production behavior.

The last release reported in this conversation is TestFlight build 7; subsequent UI refinements may not be in that build. Resolve the current Git state and installed build when execution starts. The newer UI handoff describes:

- A centered, colored key/scale with no parentheses, below song title/artist; a compact Lock-in-Major icon.
- No vertical page scrolling or swipe-back navigation on Quiz. Timeline seeking and knob manipulation remain gestures. Library/playlist scrolling and explicitly opened practice sheets are separate behaviors.
- A vertical Volume Mix fader beside the cards: up favors melody, down favors chords; its track aligns with the melody-card top and chord-tone-card bottom.
- Reset, section selection, and Play/Pause in the footer above Practice; Play/Pause is rightmost. Visible beat readouts and beat-step buttons have been removed; accessible timeline seeking remains.
- Stable outlined native menus for Section, Instrument, and Full/Roots, including selected checkmarks. The older instrument sheet workaround is superseded locally.
- A collapsed vocal-practice dock at the bottom.

Two focused local tests have passed for section/instrument/mode menus during playback. This is prior evidence, not a pass for the current run or TestFlight build 7. Transpose remains an unresolved interaction regression. Older tests may still expect the instrument sheet, beat-step controls, floating transport, Info button, or parentheses. Reconcile those expectations with the latest requirements; do not restore obsolete UI to satisfy old tests.


## Time and retry limits

Use these defaults unless the execution request specifies different limits:

| Work | Limit and outcome |
| --- | --- |
| Shared setup/build | One initial attempt and at most one targeted repair/retry; 30 minutes total. Stop only owned processes if they exceed the bound. If simulator setup fails, continue independent package/static checks. |
| Routine feature | Aim for 5 minutes; hard limit 10 minutes of feature-specific work. |
| DSP/audio concurrency or catalog recovery | Hard limit 20 minutes per feature or shared failure cluster. Use controlled time and synthetic data to avoid real-time waits. |
| A failing feature | Initial attempt plus at most two diagnose/correct/retest cycles. The time limit or retry limit, whichever comes first, ends that investigation. Do not reset the budget by changing songs, error wording, subcases or test names. |
| Individual UI test | 240 seconds maximum. If it times out, retain text diagnostics and terminate that test run cleanly. Do not let a hung test prevent subsequent features from running. |
| Existing suite or full-catalog streaming pass | 30 minutes per command. Record how far it got if incomplete. Count a shared run once, not once per feature it covers. |
| Whole autonomous assignment | 3 hours wall time by default, including setup and waits. Prioritize initial coverage of all feature groups before spending remaining retry budget. At the deadline report remaining work as NOT RUN; do not claim comprehensive completion. |

Track elapsed time and attempts in the report. Budget time is a stopping rule, not a target to consume. Rerun a passing check only after a relevant change or new evidence. If one shared defect blocks several features, investigate it once and cross-link dependent BLOCKED cases.

## Execution and evidence

1. Smoke-test launch, search/open `500 Miles`, Play/Pause, live section/instrument/mode/transpose selection, and card tap/long-press delivery. An unrelated failure must not prevent remaining coverage.
2. Reuse existing core, catalog, audio, app-integration and UI tests. Run the available suites once, then narrow follow-ups. A package pass does not establish a production UI pass.
3. Observe actual UI events through accessibility identifiers, labels, values and coordinates; use text-only diagnostics/logs. For a selector failure, distinguish tap delivery, displayed value, configuration acceptance and rendered output. Do not bypass failed hit testing and call the case passed.
4. Do not inspect screenshots, images, videos or screenshot attachments. Disable/omit optional screenshot attachments in test helpers. Anything requiring eyes, ears or a real voice becomes a companion-review item, never a reason to pause this assignment.
5. Keep large logs/results on disk; retain command session handles and await the original processes. Do not launch duplicate builds/suites because a tool yields. Use unique result directories.
6. Clean-install, swap, interruption and recovery tests must use disposable identified stores/test containers. Never erase the normal simulator app/database, corrupt personal stores, fill the disk, or reset the user's permissions. When isolation cannot be achieved, mark the case BLOCKED.
7. Use fixture faults for network/disk/swap errors. A live catalog/import/browser check is optional when credentials and resources already permit it; otherwise test the deterministic integration path and record live coverage as blocked or deferred. No login prompts, new paid resources, TestFlight deployment or physical device work.
8. Test-harness repairs must preserve the intended requirement. Classify obsolete tests separately from app defects. If a justified assertion needs newer UI semantics, document the before/after expectation and rerun within budget.

Use `500 Miles` by the Proclaimers for routine UI flows. Add the requested catalog songs only where their verified payload supplies missing coverage: `Drop Dead`, `Bad Romance`, `Honesty`, `The Entertainer`, `Gladiolus Rag`, and `Bohemian Rhapsody`, matched to their correct artists. Weird Al's `Everything You Know Is Wrong` remains optional after the core pass. Do not infer musical properties from a song title. Use synthetic fixtures for exact domain/DSP boundaries.

## Feature acceptance checklist

Each row needs an autonomous result. Group execution by dependency, but preserve feature IDs. These results cover the automated evidence only; physical/perceptual acceptance belongs to the companion prompt. If a production surface is absent, mark that integration NOT IMPLEMENTED while separately reporting any passing reusable logic.

### Library, catalog, and discovery

| Feature | Expected behavior | Efficient test |
| --- | --- | --- |
| F001 — Launch/Library | Loading, no-catalog, ready, and failure states are usable and explicit. Fresh launch does not unexpectedly focus the keyboard or request microphone permission. | Use existing launch scenarios, then one isolated genuinely empty store. Verify visible text, enabled actions, retry, and no crash. |
| F002 — Title search | Approximately 300 ms debounce; correct suggestions; Enter does not appear inert; 20-row paging; clear/loading/no-match/error states; old queries cannot replace newer results. | Type `500 Miles`, submit, clear, rapidly replace the query, then load a second page. Inject paging failure and confirm prior results remain, with no duplicate rows. Use a controlled clock for debounce boundaries. |
| F003 — Song history | Ten-item most-recent-first history; reopening moves an entry to the front without duplication. Blank/focused-query suggestions follow the audited contract. | Add/reopen more than ten fixture songs through history logic, then verify one UI flow and persistence across relaunch. Distinguish missing focus behavior from working storage. |
| F004 — Artist search/history | Debounced artist suggestions, recent artists, pagination, canonicalized artist identity, and the correct artist's song list. Returning restores the originating search. | Search the Proclaimers, open results, select a song, return, and verify state. Cover aliases/case, rapid query replacement, empty results, and paging failure with fixtures. |
| F005 — External search | Explicit Hooktheory search handoff encodes the current query; blank queries cannot launch; failure is explained; returning preserves local state. | Check encoded spaces, apostrophes, and non-ASCII text with a URL-opening test double; perform one real browser handoff. No automatic external search on each keystroke. |
| F006 — Alphabetical All Songs | Correct A–Z, digit, and other-character grouping, counts, sorting, expansion, sticky headings, and song opening. | Compare representative groups against a direct fixture query, expand/collapse groups, and open/back from one song. Include punctuation, digits, and accented titles. |
| F007 — Complexity browse | Ten defined buckets plus Unrated; correct boundary membership/counts; understandable legacy/missing-metadata state. | Test each bucket boundary and unrated metadata in repository tests; spot-check the UI and a filtered count. Read actual bucket definitions rather than assuming thresholds. |
| F008 — Mode browse | Seven canonical modes; aliases normalize correctly; a song can belong to multiple modes when its sections warrant it. | Compare membership/counts to a small known multi-section fixture and verify switching mode groups in the UI. Do not assume counts sum to unique catalog size. |
| F009 — Fuzzy filter/restoration | Approximately 250 ms normalized title/artist filtering; meaningful loading/no-match/error/retry/legacy states; stale responses rejected. Group, expansion, query, and scroll position survive the supported round trip. | Use a misspelling and rapid query replacement, change grouping, open a song, and return. Use deterministic store tests for races; distinguish app-lifetime restoration from disk persistence. |
| F010 — Catalog reading/compatibility | Valid raw/gzip payloads and supported legacy repairs decode; corrupt/unsupported data fails clearly; missing-payload rows are excluded from normal results. | Run payload/compatibility fixtures and a bounded streaming decode pass over the full catalog. Record exact failing slugs and categories; do not dump every payload or load the whole catalog into memory. |
| F011 — Add a TheoryTab Song | Available on the main Library with and without a catalog. Valid URL imports a usable song; invalid/unsupported URL, cancellation, duplicate/reimport, and fetch/parse errors have explicit outcomes. | Use parser/write fixtures for failures and one live import into an isolated store. Verify progress, cancel/retry, refreshed results, and retained existing data. |
| F012 — Download/resync | Upper-right Settings exposes the appropriate download/resync action. A replacement is staged and validated before activation; cancellation/failure retains a usable prior catalog or a clear empty state. | Validate schema/contract/row-floor rules using `contracts/catalog/`; inject corrupt, truncated, incompatible, and cancelled downloads. Exercise each swap/recovery stage against temporary stores, then one real artifact download. |

### Song detail and music theory

| Feature | Expected behavior | Efficient test |
| --- | --- | --- |
| F014 — Navigation/header | Song selection opens Quiz; title/artist identify the right song; explicit Back returns to the originating list/search. Available Info/Chords routes preserve context. | Visit from Library, artist results, All Songs, and playlist using shared flow helpers. Verify restoration and same-song audio continuity. Do not demand the removed Quiz Info button. |
| F015 — Sections | Canonical ordering and one consistent selected section. Choosing a different section starts it at its beginning, paused, even if the prior section was playing. Selecting the same section is a no-op. | Change Verse/Chorus while paused and playing, reopen the menu, and switch rapidly. Assert the selected ID/text, first musical beat/zero elapsed time, paused audio, and rejection of stale loads. |
| F016 — Info overview | Key, BPM, meter, duration, bars/beats, chord counts, and sounded/total melody counts agree with source data, including chord-only sections. | Compare one rich and one sparse payload to the UI/domain result. If the UI is unreachable or absent, report that gap rather than passing on model properties alone. |
| F017 — Progression/source/links | Ordered progression and change lists use onset context; previews work; source metadata and Hooktheory/YouTube links identify the right song. | Verify metadata and URL construction in fixtures, tap one progression preview and each available link, and cover absent/invalid links. Report missing production surfaces explicitly. |
| F018 — Chords inventory | Rests excluded; duplicates handled by the audited rule; key at each chord onset respected; grid remains usable for dense/empty data. | Compare expected unique inventory against fixture output, including a key change; inspect UI text/frames and empty/error states. |
| F019 — Roman/letter display | Roman numerals remain present; the optional letter name is additive and correctly spelled. This control must not add pitch letters to melody cards. | Toggle names on a chromatic/inverted chord, check both labels and restoration, then confirm melody cards still show scale degrees only. |
| F020 — Chord preview/arpeggiation | Finite block or arpeggiated preview; rotary step control spans 30–1,000 ms and resets to 80 ms. Repeated taps replace/cancel prior previews cleanly. | Run boundary/scheduling tests and one repeated-tap UI flow at slow/fast settings. Verify note order, timing, completion, and cancellation independently of continuous Quiz arpeggiation. |
| F021 — Pitch/key/scale engine | Correct frequency/MIDI conversion, scales/modes, transposition, spelling and enharmonic distinctions, including custom/compound cases. | Run existing cross-platform corpus and focused theory tests. Derive expected values from the shared reference/specification, not by calling the function under test twice. |
| F022 — Chord interpretation/voicing | Correct rests, modifiers, inversions, applied/borrowed/custom harmony, tritone substitutions, chord tones, and voicing. | Run the shared chord corpus and focused edge fixtures, then trace one complex real-catalog chord through labels and generated pitches. |
| F023 — Roman renderer | Fitted base numeral, accidentals, suffixes, inversion/applied/borrowed notation and spoken semantics remain correct without clipping. | Run token/layout tests on simple and dense symbols; inspect text geometry and accessibility. Record glyph alignment/legibility as a companion human check; do not stop for it. |
| F024 — Degree renderer | Correct accidental/degree/octave components and spoken labels; fitting handles compact cards and large text. | Run semantic/layout fixtures for altered and multi-character degrees, inspect frames and overflow constraints, and verify spoken labels. Queue perceptual legibility separately. |

### Quiz, transport, and sound

| Feature | Expected behavior | Efficient test |
| --- | --- | --- |
| F025 — Both timelines | Aligned melody/chord timing and fixed playhead; accurate durations, gaps, rests, overlaps, current-event selection, and onset-key context. Smooth rendering does not alter audio timing. | Run geometry/event-selection tests; seek known onsets and loop boundaries in 500 Miles. Inspect display-link timestamps, common projected beat and stopped/inactive scheduling on the simulator. Real-device frame delivery and perceived smoothness remain unverified. |
| F026 — Root-only mode | Root-only playback/cards/seek replace full voicings appropriately; returning restores full mode. Position, tempo, configuration and requested play state survive the switch. | Switch Full/Roots while paused and playing through actual menu taps. Check active roots, interval labels, seek bounds, and output events rather than only the selected label. |
| F027 — App transport/continuity | One app-scoped transport; correct Play/Pause; automatic section looping without an extra voice or stale playhead; same-context navigation preserves position/state. | Cover paused/playing round trips, rapid play/pause, and at least two natural loops. Check transport samples and render-buffer continuity at the loop seam. |
| F028 — Seeking | Tap seeks to a bounded position. Drag/coast pauses output and resumes only if previously requested; gestures in either lane stay synchronized. Root-only and VoiceOver seeking use the same contract. | Start paused and playing; drag left/right, hit both bounds, cancel, tap to stop inertia, and change section/reset during a coast. No stale resume, unexpected jump, or screen navigation; inertia settles within the implemented bound (currently 2.5 s). |
| F029 — Transport controls | Dedicated footer controls stay reachable; Reset stops and returns to the beginning without resetting sound settings; section change follows F015. Floating transport is superseded. | Reset from playing, paused, and after seeking; verify next Play starts at the beginning. Inspect footer bounds and queue human overlap review. Do not fail the app for removed dragging/beat-step controls. |
| F030 — Tempo knob | 0–200%, one-percent steps, tap reset to 100%; zero pauses output. Live changes preserve musical position, requested play intent, phase and arpeggio timing without restart/glitches. | Use deterministic timing/render tests for 0/50/100/200%, reset and changing tempo during a sustained chord. Exercise the knob through UI actions. Verify zero-to-positive transitions from both playing and paused histories. Queue audible smoothness separately. |
| F031 — Transpose | −12…+12 semitones, absolute offset from source, value-tap reset to zero. UI and output change once; position/tempo/play state persist. Musical previews share the transform; captured exact-frequency replay bypasses it. | Priority regression: ordinary taps on +/−/reset while paused and playing, immediately after instrument/section changes. Assert displayed value, accepted configuration, and frequency ratio `2^(n/12)` separately; distinguish silent rejection from undelivered taps. Cover −12/0/+12 and repeated changes without accumulation. |
| F032 — Instruments | All 16 available synthesized choices select correctly; Sawtooth is the default/reset choice. Continuous playback and applicable musical previews use the selection without restarting. | Exercise every selection with a compact renderer/configuration test; use native UI taps on clearly contrasting voices while playing and paused. Verify actual output characteristics and bounded levels, not just menu checkmarks. |
| F033 — Quiz arpeggiation | Knob order is `1/4, 1/3, 1/2, Off, 1, 2, 3, 4` cycles per beat; tap resets Off. Live tempo/transpose/instrument changes maintain chord-relative timing and continuity. | Run all option schedules against a known chord; switch during a sustained chord and across a boundary, then seek/reset/mode-switch. Combine with tempo 50/100/200 and zero; verify slot order and cancellation, not every Cartesian combination. |
| F034 — Balance | One blend: melody gain follows the value, chords follow its complement; midpoint is 50/50. Vertical up favors melody; down favors chords; reset returns midpoint. | Verify midpoint and both true-zero endpoints in renderer tests and through the visible fader. Confirm muted channels remain muted during configuration changes. Check direction and alignment using coordinates; queue visual alignment and audible blend separately. |
| F035 — Cards | Correct current/previous melody, interval, chord/root and chord-tone content. Rests/gaps/unavailable data are explicit; repeated-note collapse and contour positioning follow Android. Melody letters stay hidden; paired melody cards are 44pt versus 88pt single/interval cards. | Seek controlled events instead of waiting through a song. Assert semantic contents and frames, then tap each card type. Include a first note, repeated pitch, rest, chord change, and key change. |
| F036 — Preview arbitration | Single tap previews; double tap sing-back; long press persistent practice. Interval tap plays previous, current, then together. New/context-changing actions cancel stale sequences; no crash or overlapping ownership. | Use one sequence fixture plus UI single/double/long gestures on each relevant card class. Rapidly retap and change section/navigate during playback. Verify exclusive action delivery, note order, instrument/transpose application once, and no stuck preview. |
| F037 — Lock in Major | Uses the section's initial relative-major reference consistently across key label, timelines, degree labels and practice. It does not transpose the source song. Color remains tied to current source mode; locked label has red outline. | Toggle in a non-major section and across an internal key change, paused and playing. Compare all consumers to one reference and verify unchanged source frequencies. Assert color/outline configuration and centered label frames; queue the actual visual judgment. |
| F038 — Native output/cancellation | Finite bounded samples, valid output format, correct fades/cancellation and engine recovery; no stuck notes, invalid-rate crashes or channel-count crashes. | Run existing PCM/synthesis/format, dense onset/seam, rapid replacement and cancellation tests. Recheck card-tap crashes on the simulator. Use finite samples, format contracts and explicit continuity tolerances as evidence; acoustic quality and device OSStatus/route behavior remain pending. |
| F039 — Platform audio | Correct Now Playing title/section/elapsed state and remote play/pause/stop/toggle/seek. Background/interruption/route behavior preserves intent and does not resume against an explicit pause. | Exercise Now Playing data, remote-command routing, interruption/resume intent and route/media-services recovery using existing injectable boundaries and state-machine tests. Verify public integration wiring. Do not pass real lock-screen/background/route behavior based on mocks; queue it for physical review. |

### Microphone and vocal practice

| Feature | Expected behavior | Efficient test |
| --- | --- | --- |
| F040 — Capture/DSP | Android-equivalent analysis, gates, smoothing and dropout behavior; hardware input is converted correctly; stale results are rejected. | Run the synthetic PCM/DSP checklist below, including conversion and buffering where testable. Record configured values and measured algorithm behavior separately. Real capture, microphone preprocessing, acoustic leakage and singing remain companion checks. |
| F041 — Permission/ownership | Permission requested only when recording is needed; allow/deny/retry/error paths are usable. Exactly one microphone owner; stale releases cannot stop a newer owner. Navigation/background/cancel releases resources. | Use isolated simulator permission state only if available without changing user data, plus fake permission/capture providers. Cover allow/deny/cancel, all owner transitions, stale releases and lifecycle cleanup. Repeat long-press start/stop to catch crashes; queue real permission/hardware indicators separately. |
| F042 — Card sing-back | Double tap/named action builds the right target, pauses transport, lets preview settle, and starts guided listening. Dismiss/replacement cancels obsolete work. | Exercise each card's double-tap/named action and validate target pitches/order, transport pause, settling delay, fake listening and cancellation. Do not wait for a human to sing. |
| F043 — Two-note capture/replay | Bottom dock starts collapsed; opening exposes two independent slots. Each manual capture lasts three seconds of wall time, uses the latest valid estimate, and handles silence/cancel/re-record. Replay preserves exact captured frequency. | Use timed synthetic estimates for independent slots, wall-time duration, silence/dropout, re-record, replay and cancellation. Verify exact output frequencies after global transpose changes. Open/close the tool through UI actions using fake capture as needed. |
| F044 — Target pitch feedback | Target/measurement spelling, cents sign/magnitude, and interval direction are correct; no signal is not presented as a successful in-tune result. | Feed below/on/above-target estimates and enharmonic/descending intervals; compare labels, cents and no-signal behavior to numeric references. Human singing is outside this prompt. |
| F045 — Flip-Flop | Alternates first-slot capture for 3 s, second for 3 s, then a 2 s pause; slots remain independent. Cancellation/background stops every pending cycle. | Use a controlled clock for two cycles; cancel during each stage, background the model, and verify no late capture/replay or ownership leak. Queue perceived pacing separately. |
| F046 — Persistent practice | Long press/named action toggles root/melody/chord-tone practice, following the active event. Melody uses fast tracking; rests/no signal are handled; chord-tone index clamps/restores correctly. | Use fake microphone estimates plus controlled transport; start each target, cross events/rests, change tone counts/mode/section and hand ownership to another tool. Exercise long-press UI delivery without real singing. |
| F047 — Live marker/scoring | Fresh eligible samples drive a bounded marker; settled contiguous melody runs get median-based scores or explicit unscored results. Seek/pause/stale samples cannot contaminate another run. | Feed timestamped in/out-of-tune, rest, gap and stale samples through controlled transport. Assert settling, freshness, run IDs, median scoring, no-sample outcomes and discard on discontinuity. Queue physical marker/scoring observations separately. |
| F048 — Tessitura calibration | Three voiced seconds required; final two contribute to the anchor. Silence pauses progress; dropout up to one second preserves the attempt, longer dropout restarts. Permission/cancel/retry are explicit. | Use fake permission, clock and voiced/silent streams around the three-second, final-two-second and one-second dropout boundaries. Verify cancel/retry and resource release; no real voice input required. |
| F049 — Target placement/continuity | Comfortable register placement preserves intervals/contour, including tritone rules; anchor/semitone/octave adjustments and transpose apply correctly once. Source transport is unaffected by calibration. | Run resolver and consumer fixtures around comfortable-window/register/tritone/contour boundaries. Verify semitone/octave/reset, transpose-once, section/song lifetimes and source audio independence. Queue comfortable-register perception separately. |

### Durable user data and accessibility

| Feature | Expected behavior | Efficient test |
| --- | --- | --- |
| F050 — Favorites | Unique membership; consistent stars/counts across views; optimistic changes roll back visibly on write failure; favorites survive relaunch and catalog replacement. | Toggle rapidly from two entry points, inject a write failure, then relaunch and replace an isolated catalog. Compare durable membership with UI. |
| F051 — Playlists | Correct summary counts, newest-five preview, full newest-first contents, opening songs and removal. Missing-catalog song identities remain durable with a usable missing-song state. | Test empty/one/more-than-five entries, remove newest/middle/last, return/relaunch, and replace catalog with one referenced song absent. Swipe removal is valid in playlists, despite Quiz's no-page-swipe rule. |
| F053 — Store separation | Replaceable catalog never overwrites durable favorites/playlists/history; rollback and startup recovery choose a consistent usable catalog. | Hash/count user records before and after successful, failed and interrupted swaps in isolated stores. Cover reopen/upgrade paths and orphaned durable references. |
| F054 — Accessibility/layout | Reachable labeled controls with meaningful values/actions, usable focus order and touch areas, reduced-motion behavior, and supported text/device layouts. Quiz stays one screen with the practice dock reachable. | Inspect accessibility labels/values/actions, focusable elements, target frames and layout constraints. Test supported Dynamic Type/orientation/Reduce Motion settings on the existing iPhone 17 where controllable. Queue VoiceOver experience, legibility and unavailable device coverage; do not await feedback. |


### Additional automated settings/UI checks

- **iOS settings/update link:** assert Settings placement, installed version/build text, TestFlight app ID `6807512572`, URL-opening success/failure paths, and a usable manual fallback. Download/resync must stay in Settings; Add a TheoryTab Song stays on Library. The shortcut does not claim to compare beta versions. An actual account-specific update is companion coverage.
- **Android settings/update link:** inspect/test the added Settings action and intent/fallback for `https://play.google.com/store/apps/details?id=com.acquiring.android`. Reuse existing Android checks only if the toolchain is already available. Record the deferred in-app-update task from `android/README.md`. Do not install an emulator or require a Google account.
- **Frame rate:** verify the 60 Hz default, persisted Maximum choice, shared projected beat, and inactive/paused/Reduce Motion scheduling through timestamps/configuration. Simulator cadence is not proof of iPhone ProMotion smoothness, power or thermal behavior.
- **Knobs:** test rotary bounds, discrete snaps, tap-reset and named precision actions; turns must not scroll or navigate the Quiz page. Inspect hit-area geometry, leaving tactile usability to the companion prompt.
- **Key colors:** verify source-mode mapping: major/ionian `#FF0000`, dorian `#FFB014`, phrygian/phrygian-dominant `#EFE600`, lydian `#00D300`, mixolydian `#4800FF`, minor/aeolian/harmonic-minor `#B800E5`, locrian `#FF00CB`. Locking changes the relative-major label/outline, not the source-mode color or source song pitch.

## Synthetic recording/DSP parity

Compare identical PCM and timestamps through the corresponding Android/iOS contracts and existing tests. Matching constants alone is insufficient; compare outputs and state transitions. This is the automated half of F040–F049, not evidence of physical recording quality.

| Property | Expected baseline |
| --- | --- |
| Analysis format | Mono PCM16-equivalent analysis at 16,000 Hz; native device input correctly converted from its actual sample rate/channel layout. |
| Standard tracking | 2,048-sample window, 512-sample hop (128 ms / 32 ms of analysis audio). |
| Fast melody tracking | 1,024-sample window, 256-sample hop (64 ms / 16 ms). |
| YIN | Threshold 0.15; approximately 65–1,000 Hz search range; match Android's lag selection, refinement and invalid/silence handling. |
| Input gates | Reject RMS below 0.0005, confidence below 0.4, and invalid/nonpositive frequencies. Verify boundaries against current source. |
| Standard smoother | Median window 3; minimum publish frames 2 under Android's algorithm; EMA admission 0.3; reject jumps greater than 6 semitones, resetting after 3 consecutive rejected frames. |
| Fast smoother | Median window 1; minimum publish frames 1; EMA admission 1.0; same jump threshold with 1 rejected frame before reset. |
| Dropout | Short hold may prevent flicker, but no stale estimate should persist beyond the implemented >200 ms dropout/reset boundary. |


Use deterministic in-range/boundary tones, amplitude sweeps around gates, silence, noise, harmonic-rich signals, abrupt changes/octave errors and dropouts below/at/above thresholds. Check valid/no-signal decisions, cents, first publish, smoothing and recovery. Reuse established accuracy tolerances or disclose a justified tolerance before evaluating results.

Exercise supported sample-rate/channel conversion with generated native-format buffers, frame/hop scheduling, conversion state across buffers, stale-result rejection and resource ownership. Compare standard/fast modes without requiring a microphone. Treat unexercisable native capture paths as BLOCKED physical evidence while preserving independent algorithm passes.

## Commands and sequencing

Locate tests in `ios/Packages/AcquiringKit/Tests/`, `ios/AcquiringTests/` and `ios/AcquiringUITests/`. Check the destination and current test names before execution. Reconcile obsolete selectors without weakening behavior assertions.

```sh
git status --short --branch
xcrun simctl list devices available
swift test --package-path ios/Packages/AcquiringKit
xcodebuild -quiet -project ios/Acquiring.xcodeproj -scheme Acquiring -destination 'platform=iOS Simulator,id=55373408-99CC-4EB3-A771-6ACF29E2D96A' -configuration Debug -parallel-testing-enabled NO -test-timeouts-enabled YES -default-test-execution-time-allowance 240 -maximum-test-execution-time-allowance 240 test CODE_SIGNING_ALLOWED=NO
```

Use targeted `-only-testing` smoke selectors first and avoid duplicating already completed coverage in later runs where practical. Add a unique result-bundle path and bounded command timeout. Run optimized audio checks only for a material Debug/Release concern. Full-catalog validation should stream/decode rows with bounded memory, recording failing slugs without dumping all payloads.

Do not invent tests requiring the magnifying glass/puck, obsolete skip/beat-step controls, floating transport placement, database-verification/search-by-slug UI, F013 automatic missing-payload harvesting, F052 custom-playlist creation/deletion UI, or F055 standalone audiation container. They are excluded or superseded. Existing storage tests for a deferred surface may still run, but they do not create a product UI requirement.


## Report and finish without asking questions

Write `docs/ios-autonomous-test-report.md`, preserving any existing report. Include:

- Exact baseline, commands, exit codes, test counts and evidence paths.
- One row for all 52 feature IDs plus settings/UI extras: autonomous result, coverage layer, attempts, elapsed time, actual/expected outcome, and evidence.
- Statuses: **PASS** (only the exercised automated scope), **FAIL** (app assertion/reproducible defect), **FLAKY** (inconsistent outcomes, never silently promoted to pass), **TIMEOUT** (budget exhausted with inconclusive completion), **BLOCKED** (missing environment/dependency/authority), **NOT IMPLEMENTED**, or **NOT RUN**. If an app failure is established before the time limit, retain FAIL rather than hiding it as TIMEOUT.
- Root-cause hypotheses labeled as such, minimal reproductions and proposed fixes. Do not implement production fixes in this testing assignment.
- A companion queue keyed by feature ID for real-device, visual, auditory, login-dependent or unavailable coverage. State which build it needs and whether it is a known failure or simply unverified.
- Final counts, highest-priority unresolved defects, skipped scope and why execution ended.

Do not wait for human approval, send a clarification question, or claim complete platform parity. Complete the feasible work, mark remaining cases accurately and return the report.
