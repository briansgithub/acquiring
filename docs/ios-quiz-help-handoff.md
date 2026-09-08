# iOS quiz help — Mac handoff

## Status and authorization

Implementation is on `codex/ios-quiz-help`, created from `main`. The user asked to
publish this branch and hand it to the Mac agent for the remaining build and
simulator work. The Mac continuation built and launched the app on iPhone 17. Three focused
methods passed; the dismissal method passed its core touch/state checks but
failed additional accessibility assertions. VoiceOver work is deferred by the
user. See the exact Mac results below; there was no final all-green test rerun.

Actual implementation agents: GPT-5.6 Terra / medium for the two UI parts;
primary integration/review runtime identifier unavailable. No release, full-app
test suite, or screenshots are authorized. Preserve pending reviews elsewhere.

## Implemented behavior

- The upper-right `?` presents contextual hints, expands the Interval Singing
  Tool without starting microphone capture, and leaves the tool expanded after
  dismissal. Any tap is consumed by help; no underlying control should activate.
- Full quiz hints: note/interval/chord-tone group, large chord symbol, major lock.
  Root-only omits the large chord hint. No dial or timeline hints.
- Singing hints: tessitura, both pitch cards as one group, and interval card.
  Copy follows Flip-Flop, capture/listening, and presence of two captured notes.
- Scene-wide overlay supports anchored bubbles and a scrollable fallback with
  numbered markers. It requests focus back to `?` on dismissal; native VoiceOver isolation/focus
  remains deferred after the Mac checks below. It closes on route/app inactivity.
- The dock's persistent-detail preference is restored after help closes.
  `expandForHelp()` cancels delayed collapse cleanup without clearing targets.
- Settings now opens Help, containing only scale degrees/hats, interval notation,
  Roman symbols/modifiers, modes/borrowing/major lock, and tessitura. Native,
  silent diagrams use the existing notation renderers. First-launch Introduction
  and its completion key remain intact.

Main new sources: `ios/Acquiring/Features/QuizHelpOverlay.swift` and `HelpViews.swift`.
Both are registered in the app target. Integration is in LibraryViews, SongViews,
QuizCards, VocalPracticeViews, and VocalPracticeModel.

## Local checks completed

- `git diff --check`: passed.
- Swift tree-sitter syntax parsing: all seven changed/new app Swift sources passed.
- Focused syntax parsing of the four added/updated test methods: passed.
- OpenStep project parsing and checks that both new files belong to the Features
  group and app Sources phase: passed.

The temporary Windows parser scripts lived under
`%TEMP%/acquiring-quiz-help-checks/`. A whole-file parser pass on the large test
files exited before completion; the four edited methods were then parsed in
isolation. **No XCTest method was executed.** The Mac compiler and focused tests
below remain the required verification.

## Resume on the Mac

Fetch `origin`, then use `codex/ios-quiz-help` in a clean checkout or isolated
worktree. Preserve existing Mac work. Read `ios/AGENTS.md` and use the current
warm iPhone 17 simulator; do not clean DerivedData.

From the repository root, run:

```sh
bash ios/scripts/run-sim.sh

xcodebuild -quiet \
  -project ios/Acquiring.xcodeproj -scheme Acquiring -configuration Debug \
  -derivedDataPath ios/build/DerivedData-sim \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -parallel-testing-enabled NO \
  -only-testing:AcquiringTests/AcquiringTests/testOpeningHelpDuringCollapsePreservesSingBackTargets \
  -only-testing:AcquiringUITests/AcquiringUITests/testIntroductionAppearsOnceAndSettingsOpensNotationHelp \
  -only-testing:AcquiringUITests/QuizCoverageTests/testQuizHelpExpandsDockAndConsumesDismissalTapsInBothModes \
  -only-testing:AcquiringUITests/QuizCoverageTests/testQuizHelpDismissalDoesNotPausePlayback \
  test CODE_SIGNING_ALLOWED=NO
```

Fix compile errors or focused failures, rerun only affected checks, and commit
and push coherent fixes to this branch. Stop after two diagnose/fix/retest cycles
of the same failure and report before expanding the investigation.

## Review priorities

1. Open the full-catalog **500 Miles** quiz in Full and Root-only. Tap `?` from a
   collapsed dock; check the expected six/five hint groups and readable labels.
   Tap the lock, pitch card, dock collapse, navigation Back, and `?` locations
   while help is up. Each tap must only dismiss help; the dock stays expanded.
   Check that playback continues and opening help alone requests no microphone.
2. Check the scrollable fallback, numbered markers, safe-area placement, and
   VoiceOver dismissal/focus. Use larger text and light/dark appearances on the
   same simulator. Confirm the original three equal-width singing cards remain.
   Preference propagation across NavigationStack and tap interception over native
   navigation are important runtime checks that Windows could not validate.
3. With an existing practice session, verify targets/recordings/calibration survive
   opening help. Check hint variants for Flip-Flop, capture/listening, and a captured
   interval, plus restoration of an open persistent-details subview. Avoid new
   audio-engine work or physical-device testing for this UI feature.
4. Open Settings → Help and every topic. Human visual review should check hats,
   figured-bass stacks, borrowed tags, long compound chord examples, nine mode
   patterns, and the octave diagram. Confirm first-launch Introduction stays brief.
   Keep the guide limited to card notation/tessitura; do not add a pitch-feedback,
   card-layout, rhythm, or general-controls lesson.

Report exact build/test results and remaining human-review items. Update this
handoff and the linked status in `docs/porting-plan.md` once at completion.


## Mac continuation — 2026-09-08; VoiceOver deferred

Fetched origin and resumed exactly `2bde994cf85dfd0516b2cdaef5d6226f25447e71`
in the new worktree `/Users/brian/Desktop/acquiring-ios-quiz-help`, tracking
`origin/codex/ios-quiz-help`. The original `/Users/brian/Desktop/acquiring`
checkout remains on `main` at `21bb41d4`; no original working files were changed.
Continuation runtime model identifier: unavailable. No additional agents used.

### Retained fixes

- Explicit accessibility containers keep `help.overlay` from replacing the
  dismiss button's `help.dismiss` identifier or leaking modal traits into children.
- The shared seek/play/chord-step bar now reserves space above the auxiliary
  controls and singing dock. Previously Play overlapped the bottom controls and
  tapping it did not start playback. A dashboard-only scrolling fallback keeps
  fixed-size cards/knobs reachable when available height is insufficient.
- The playback test checks Play's geometry above the auxiliary controls and
  stops immediately if playback never starts, avoiding misleading later failures.

### Exact validation and limits

Xcode 26.3 (17C529), warm iPhone 17
`55373408-99CC-4EB3-A771-6ACF29E2D96A`, iOS 26.3.1 / 23D8133 (runtime labeled
26.3), x86_64. No simulator or DerivedData was cleaned. The specified worktree
DerivedData directory had no existing cache, so the first build compiled it.

- `bash ios/scripts/run-sim.sh`: initial build/install/launch passed (exit 0).
- Delivery `bash ios/scripts/run-sim.sh`: build/install/launch passed (exit 0),
  after reverting the accessibility experiments. Log:
  `/tmp/acquiring-ios-quiz-help-build-delivery.log`.
- Existing warnings remain: asynchronous alternative at `AudioSystem.swift:269`,
  actor isolation at `QuizPitchGauge.swift:130–131`, and skipped AppIntents metadata.
- `git diff --check -- ios/Acquiring/Features/QuizHelpOverlay.swift ios/Acquiring/Features/SongViews.swift ios/AcquiringUITests/QuizCoverageTests.swift docs/ios-quiz-help-handoff.md docs/porting-plan.md`: passed.

The first test invocation was exactly the four-method `xcodebuild` command in
“Resume on the Mac” above, with these additional options before `-only-testing`:
`-collect-test-diagnostics never -resultBundlePath /tmp/acquiring-ios-quiz-help-focused-1.xcresult`.
The local scheme temporarily used `systemAttachmentLifetime="keepNever"` for
all test runs; the original scheme was restored and is not part of the commit.

| Method | Result |
| --- | --- |
| `testOpeningHelpDuringCollapsePreservesSingBackTargets` | Passed, 0.548 s, run 1. Targets survive the delayed cleanup deadline; expansion starts no manual recording/listening. |
| `testIntroductionAppearsOnceAndSettingsOpensNotationHelp` | Passed, 95.529 s, run 1. Introduction remains completed after relaunch; all five Settings Help topics open and return. |
| `testQuizHelpDismissalDoesNotPausePlayback` | Failed before Help in run 1; passed in run 2, 29.932 s, after the layout/identifier fixes. |
| `testQuizHelpExpandsDockAndConsumesDismissalTapsInBothModes` | Run 1 failed at the missing dismiss identifier. Run 2, 95.985 s: every original touch/state assertion passed in Full and Root-only, but two added accessibility-absence assertions failed in each mode. Overall XCTest result remained failed. |

Run 2 used the same command/options, retained only the two `QuizCoverageTests`
`-only-testing` selectors, and used result path
`/tmp/acquiring-ios-quiz-help-focused-2.xcresult` (exit 65: 1 pass, 1 failure).
Run 3 retained only `testQuizHelpExpandsDockAndConsumesDismissalTapsInBothModes`
and used `/tmp/acquiring-ios-quiz-help-focused-3.xcresult` (exit 65, 101.602 s).
Run 4 used that same single selector and
`/tmp/acquiring-ios-quiz-help-focused-4.xcresult` (exit 65, 96.362 s).
Corresponding command logs are `/tmp/acquiring-ios-quiz-help-focused-{1,2,3,4}.log`.
Results were read with `xcrun xcresulttool get test-results tests --path <result-path> --compact`.

The `500 Miles, by the-proclaimers` catalog-derived fixture exercised six/five
hint groups, expansion without starting capture, and dismissal taps over lock,
pitch card, collapse, `?`, and native Back. Core assertions verified unchanged
lock/pitch/dock state and route after these taps. Playback remained active after
Help dismissal. This does not establish microphone accuracy or preservation of
real captured audio/calibration in a live session.

### Deferred issue and next human review

After two repair cycles, the user authorized a focused continuation, then limited
further work to one or two minutes and explicitly deprioritized VoiceOver.
The final run finished as that limit expired. Stop here; do not resume VoiceOver
work without a new request.

The native quiz/Back elements remained discoverable to XCTest behind Help.
Setting the navigation container's accessibility-hidden state did not remove
them (run 3). Hiding hosted destinations and the native bar separately also
interfered with dismissal/state checks (run 4). Both experiments were reverted.
The added accessibility-absence assertions were removed in favor of this explicit
deferred item; the retained code matches the working run-2 implementation.
**No all-green focused test rerun occurred after that deferral.** Actual VoiceOver
navigation, escape, and focus restoration still require review; XCTest element
existence alone does not establish assistive-technology focus behavior.

Human review, without screenshots:

1. In 500 Miles Full and Root-only, open Help from a collapsed dock. Inspect
   six/five readable hints, numbering, safe areas, three equal-width singing
   cards, and the scrolling fallback. Check larger text and light/dark appearance.
2. Check the anchored transport and dashboard scrolling with the dock open;
   timeline/knob gestures must remain usable. Confirm the new placement visually.
3. With an existing practice session, review captured notes/calibration,
   Flip-Flop/listening/captured-interval hint variants, and restoration of an open
   persistent-details subview. These live-session cases were not exercised.
4. In Settings → Help, inspect hats, figured-bass stacks, borrowing tags,
   long compound chord examples, nine mode patterns, and the octave diagram.
   VoiceOver review is optional/deferred per the user's latest direction.

No screenshots, full-app suite, physical-device work, or TestFlight release.
Earlier unrelated pending reviews remain unchanged.

## Merged and cleaned up — 2026-09-08

Merged into `main` as `4b5a94a2`, preserving both the display-name and quiz-help
status notes in `docs/porting-plan.md`. From the primary checkout,
`bash ios/scripts/run-sim.sh` passed (exit 0): merged Debug build, install, and
launch on the warm iPhone 17. Log: `/tmp/acquiring-quiz-help-merge-build.log`.
Existing warnings remain; no additional XCTest or VoiceOver investigation was run.
The clean task worktree and local branch were removed after verifying merge
reachability. The primary checkout is now the continuation location; retain this
handoff and the deferred review items above. The remote task branch is removed
only after successfully pushing `main`.
