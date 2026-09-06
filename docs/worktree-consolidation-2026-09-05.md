# Worktree consolidation — 2026-09-05

Runtime model: unknown.

## Scope and feature decisions

Phase one integrated the completed Library/catalog, Quiz plan, instrument refresh,
and committed keyboard-dismissal branches. Phase two incorporated the completed
Quiz bundle (including its Android and two iOS component branches), its primary
completion record, the original welcome branch ancestry, and the distinct dirty
complexity-score and iOS beta-release-policy changes.

Existing commit ancestry was retained; no rebase or history rewrite was used.
The original welcome branch had already been incorporated into Quiz via a squash,
so its ancestry was recorded with an ours-strategy merge after checking that its
illustrations and prerequisites were present in the newer implementation.

Retained behavior:
- Illustrated Introduction and silent automatic catalog installation.
- Saved default instruments, session instrument changes, Quiz transport controls,
  and the current normalized instrument catalog.
- One global singing dock, cents-only pitch cards, tessitura behavior, independent
  Hooktheory input, current Library layout, and outside-tap keyboard dismissal.
- Optional catalog complexity scores on both platforms, displayed out of 100.
- Exact owner approval of terse What to Test notes before making an iOS beta available.

Superseded copied source was preserved in recovery references rather than replayed
over newer implementations. No release, push, remote-branch deletion, new tests,
full-suite run, simulator reset, or screenshot inspection was performed.
The existing TestFlight build-number record was retained.

## Original dirty worktrees

All names below were sibling directories under /Users/brian/Desktop, except
acquiring, which is the primary checkout. Each complete working-tree snapshot is
available at refs/codex/recovery/2026-09-05-phase-two/<directory-name>.
The original index tree and status are recorded in the snapshot commit message.

| Directory | Disposition of original dirty content |
| --- | --- |
| acquiring | Integrated complexity scores and release policy; retained newer singing/Quiz behavior; preserved original accumulated documentation in the snapshot. |
| acquiring-android-settings.51Zwil | Settings behavior already integrated; retained newer focus, search, compile, instrument, and privacy-link fixes. |
| acquiring-hooktheory-search-button | Retained current search button including reduced-motion support. |
| acquiring-interval-singing-model | Retained integrated singing model and newer catalog/audio implementations. |
| acquiring-interval-singing-ui | Retained integrated global dock, cents-only cards, tessitura, and newer UI behavior. |
| acquiring-ios-catalog-startup | Retained automatic startup installation, persistent Recents, and maintenance guards. |
| acquiring-ios-human-testing | Preserved the unique incomplete hardware report in docs/archive/ios-human-hardware-test-report-2026-09-05.md; two other reports already existed on main. |
| acquiring-ios-launch-ui | Retained newer compact Library, inline All Songs, separate Hooktheory input, and global dock. |
| acquiring-ios-quiz-layout | Retained newer Quiz knobs/transport and global dock instead of older duplicate panels/faders. |
| acquiring-ios-search-keyboard | Retained committed keyboard fix and newer merged Library, audio, singing, and tests. |
| acquiring-silent-catalog-state | Retained newer silent setup with failure-notice persistence after a manual retry. |
| acquiring-volume-android | Retained current normalized instrument set and normalization tests. |
| acquiring-volume-ios | Retained current normalized presets and cached partials; did not reintroduce retired presets. |
| acquiring-welcome-introduction | Retained the illustrated Introduction integrated through Quiz; preserved original baseline files and copied edits. |

The older Android Settings files were modified September 4; the other original
dirty trees had September 5 modifications. Modification times do not establish
original authorship or creation order.

## Recovery

A second set of references,
refs/codex/recovery/2026-09-05-phase-two-stashes/<directory-name>,
preserves the original tracked/index/untracked stash structure used to clean each
checkout. Those new stash entries were removed from the visible stash stack only
after assigning permanent recovery references. The three pre-existing stash
objects were left unchanged:

- 8999d9ebcfb3e7e4109168175caa61a7ecba92f2
- 790136fbbee85e286a80f0146da62270e7cbe414
- 0aa72127a4567eac9b7c229bc115eeb7a6ac3fa2

To inspect an original dirty file, use git show with the recovery reference and
the repository-relative file path. To recover a full snapshot without disturbing
main, create a new worktree/branch from its recovery reference. These are local Git
references, not remote backups.

## Phase-two final integration

The user explicitly chose the new compact interval layout as the final merge
target. Transport is Instrument / Transpose / Reset / Play-Pause on row one,
Full-Root-only / Section on row two; expansion removes row two without resetting
its selections. Transpose options are numeric, with the label above the value.
The tessitura icon menu contains Set and Clear only. Clear preserves Android's
existing calibration-only behavior, retaining recordings and loaded targets.
The user explicitly excluded the proposed +/- stepper and integer.

The compact dial footprint and button spacing were reduced/adjusted to remove
the demonstrated expanded-dock overlap without reducing the center reset target
below 44 points. The late completed FPS-description removal is also included.
The newer Introduction-card edits remain excluded for separate user review.

Additional recovery references:
- refs/codex/recovery/2026-09-05-phase-two-latest/acquiring includes the late FPS-description removal.
- refs/codex/recovery/2026-09-05-phase-two-latest-stashes/acquiring preserves that primary checkout's original index/untracked structure.
- refs/codex/recovery/2026-09-05-phase-two/acquiring-interval-singing-release and the corresponding phase-two-stashes reference preserve the superseded failed layout attempts.

The old layout's initial integration check passed 5 of 6 cases, then its dock
check failed two bounded repair attempts. Those failures are retained as history,
not reported as passes. The user authorized replacing that layout with the new
compact target and validating that behavior. Its instrument/transpose check
passed; its first dock check exposed a remaining 35-point vertical overlap and
minor horizontal overlap. Only the failing dock case was rerun after the compact
dial and spacing correction; passing unrelated checks/builds were not repeated.

Pending separate work includes the intentionally retained Introduction-card review,
Compact recent song searches, and the Quiz information/back-navigation plan.
The earlier return-to-Library keyboard restoration check and physical-device
acceptance remain unresolved/unverified; the outside-tap keyboard pass is not a
claim that the return-navigation case passed. No new complexity-specific tests
were added, as instructed. No push, release, remote-branch removal, full-suite run,
or screenshot inspection was performed.

## Completed cleanup and checks

Phase two was fast-forwarded from the primary checkout after focused validation.
The code-integration milestone is 210466ca. Nineteen sibling worktrees and twenty
local branches were removed using normal git worktree remove and git branch -d,
only after clean-state and main-ancestry checks. The primary checkout is on main.
The only intentionally retained sibling is acquiring-intro-card; its HEAD and
dirty-file signature were verified unchanged. The three original stash IDs above
were verified unchanged after cleanup. No remote refs were changed.

Validation outcomes:
- Agreed Introduction and saved-default/session lifecycle checks: 2 passed.
- Android assembleDebug: passed (77.9 seconds).
- Initial combined iOS run: 5 passed, 1 failed (old expanded-dock layout).
- Two old-layout repair retries failed; those attempts were archived.
- New compact target: instrument/transpose selection passed; dock layout failed.
- Final compact-fit retry: 1 passed, 0 failed, 0 skipped (126.9 seconds).
- Swift source parsing and git diff --check passed.
- The latest built app was installed and launched on the warm iPhone 17.
  Termination reported no existing process; install and launch succeeded.

The five unaffected passing integration cases were:
testIntroductionAppearsOnceAndCanBeReopenedFromSettings,
testInstrumentDefaultSessionAndForegroundPlaybackLifecycle,
testSearchKeyboardDismissesOutsideAndReopensInside,
testBlankSearchKeepsRecentsVisibleWhenKeyboardIsDismissed, and
testMissingCatalogNoticeSurvivesFailedManualRetry.
Their passing results are not a full-app acceptance claim.

Exact final affected-check commands (run before retiring
/Users/brian/Desktop/acquiring-interval-singing-release):

```sh
python3 android/scripts/compact_check.py --name phase-two-compact-final --keep-success-log -- xcodebuild -quiet -project ios/Acquiring.xcodeproj -scheme Acquiring -derivedDataPath /tmp/acquiring-interval-singing-release-build -destination 'platform=iOS Simulator,id=55373408-99CC-4EB3-A771-6ACF29E2D96A' -configuration Debug -parallel-testing-enabled NO -test-timeouts-enabled YES -default-test-execution-time-allowance 180 -only-testing:AcquiringUITests/QuizCoverageTests/testVocalPracticeDockStaysSingleFromLibraryThroughQuizAndOpens -only-testing:AcquiringUITests/AcquiringUITests/testQuizInstrumentAndTransposeMenusApplySelections test CODE_SIGNING_ALLOWED=NO

python3 android/scripts/compact_check.py --name phase-two-compact-fit-retry --keep-success-log -- xcodebuild -quiet -project ios/Acquiring.xcodeproj -scheme Acquiring -derivedDataPath /tmp/acquiring-interval-singing-release-build -destination 'platform=iOS Simulator,id=55373408-99CC-4EB3-A771-6ACF29E2D96A' -configuration Debug -parallel-testing-enabled NO -test-timeouts-enabled YES -default-test-execution-time-allowance 180 -only-testing:AcquiringUITests/QuizCoverageTests/testVocalPracticeDockStaysSingleFromLibraryThroughQuizAndOpens test CODE_SIGNING_ALLOWED=NO
```

Android command (from that checkout's android directory):

```sh
env JAVA_HOME=/Users/brian/.gradle/jdks/eclipse_adoptium-21-x86_64-os_x.2/jdk-21.0.12.1+1/Contents/Home ANDROID_HOME=/Users/brian/Library/Android/sdk python3 scripts/compact_check.py --name phase-two-android-build --keep-success-log -- ./gradlew assembleDebug --console=plain
```

Simulator installation/launch:

```sh
xcrun simctl install 55373408-99CC-4EB3-A771-6ACF29E2D96A /tmp/acquiring-interval-singing-release-build/Build/Products/Debug-iphonesimulator/Acquiring.app
xcrun simctl launch 55373408-99CC-4EB3-A771-6ACF29E2D96A com.acquiring.ios
```

Final passing result bundle:
/tmp/acquiring-interval-singing-release-build/Logs/Test/Test-Acquiring-2026.09.05_22-53-10--0400.xcresult.
The preceding compact run's bundle ends in 22-44-50--0400.xcresult;
it records the menu pass and superseded layout failure.
