# iOS quiz help — Mac handoff

## Status and authorization

Implementation is on `codex/ios-quiz-help`, created from `main`. The user asked to
publish this branch and hand it to the Mac agent for the remaining build and
simulator work. Code has **not been compiled or run in Xcode**. Source inspection
and syntax parsing on Windows do not establish runtime correctness.

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
- Scene-wide overlay uses compact translucent bubbles with a thin leader to every
  individual card sharing a description. It hides underlying accessibility elements while active and
  requests focus back to `?` on dismissal. It closes on route/app inactivity.
- The dock's persistent-detail preference is restored after help closes.
  `expandForHelp()` cancels delayed collapse cleanup without clearing targets.
- Settings now opens Help, containing only scale degrees/hats, interval notation,
  Roman symbols/modifiers, modes/borrowing/major lock, and tessitura. Native,
  silent diagrams use the existing notation renderers. First-launch Introduction
  and its completion key remain intact.
- Follow-up: adding a song to Favorites shows a non-interactive "Favorited"
  material bubble for two seconds after persistence succeeds. Removing a favorite
  or a failed save shows no success bubble. It appears above the Quiz star and
  below the Song Detail toolbar star; verify neither placement is clipped.

Main new sources: `ios/Acquiring/Features/QuizHelpOverlay.swift` and `HelpViews.swift`.
Both are registered in the app target. Integration is in LibraryViews, SongViews,
QuizCards, VocalPracticeViews, and VocalPracticeModel.

## Local checks completed

- `git diff --check`: passed.
- Swift tree-sitter syntax parsing: all eight changed/new app Swift sources passed.
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
   Add/remove a favorite in Quiz and Song Detail: check the brief confirmation,
   its placement, and that playback and other controls remain usable.
2. Check compact bubble placement, leaders to every applicable card, safe areas, and
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

## September 8: compact tooltip revision

User requested concise text, separate chat-style bubbles, and one shared description
with lines to every relevant card. The large fallback panel and numbered badges are
removed. Placement scores nearby whitespace to minimize card coverage and prevents
bubble overlap. On constrained layouts, individual bubbles can scroll; VoiceOver
reads the complete hint. A small accessible close button replaces the visible
dismissal sentence. Any tap still dismisses without performing the underlying action.
The interval hint now reads "Calculated interval" in both recording states.

Windows validation: `check_sources.py` (in the temporary acquiring-quiz-help-checks
directory) passed syntax parsing for QuizHelpOverlay.swift and QuizCards.swift and
Xcode project registration checks; `git diff --check` passed. No Swift type-check,
simulator run, or screenshots were performed. Runtime model: unknown.
On Mac, run `bash ios/scripts/run-sim.sh`, then review 500 Miles in both modes at
normal and larger text sizes. Check that each note/chord-tone/interval card and both
singing pitch cards have a leader, bubbles minimize label coverage, the concise
text is readable, and dismissal still preserves playback/practice state.
