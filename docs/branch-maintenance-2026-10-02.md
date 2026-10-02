# Branch maintenance — 2026-10-02

Runtime model: unknown. Route: one agent, direct Git comparisons and focused native checks.

The owner authorized acting on the branch audit and directed completion of the
Android example-repeat and previous/next toolbar changes before integration.
No store release or catalog publication is included in this branch-maintenance request.

## Starting state

Primary checkout: `codex/android-home-reference` at `0b11ed8b`, clean.
Local and remote `main`: `1c95ef0b`.
Android queue tip `8bd55189` is an ancestor of the current branch.
iOS port tip `6cdd4fa0` is an ancestor of remote Mac integration tip `c6714ab6`.

The following old tips are preserved before any retirement:

| Branch | Tip | Worktree state |
| --- | --- | --- |
| codex/aural-curriculum-audio | fe869220 | Clean; ignored Android files present |
| codex/aural-curriculum-core | 03ba1a0e | Clean; ignored Android files present |
| codex/release-android-beta | 337a17f9 | Clean; merge-only ancestry, no unique code delta |
| codex/release-android-beta-clean | dd417d2f | Clean; older playback rollback, ignored Android files present |
| codex/root-quiz-equal-cards | 3eb1d0b3 | Clean; older iOS card/transport checkpoint |
| codex/chord-parity-android | f0c4e8e7 | Dirty tracked and untracked source/tests; ignored Android files present |
| codex/chord-parity-contract | f0c4e8e7 | Untracked source/contracts/tools; ignored local diagnostics present |
| codex/chord-parity-ios | f0c4e8e7 | Dirty tracked and untracked Swift source/tests; ignored files present |
| codex/parity-historic-android | 328c1106 | Dirty source/fixtures, untracked tests and diagnostics, ignored Android files present |

The four dirty tips already belong to main's ancestry. Their working files do
not: some exactly match current files, others are older intermediate copies.
Keep the complete working directories and original index contents; do not stage
or replay their accumulated changes over current source.

## Recovery and completed disposition

Recovery directory: `H:/Desktop/Acquiring/.branch-recovery/2026-10-02/`.
`before-maintenance.bundle` preserves the pre-integration Git history. Exact tip
references, statuses, original index trees and SHA-256 file fingerprints are
stored alongside it. Ten old worktrees were moved intact into `worktrees/` there
and detached at their original tips. Each move was verified against its saved
tracked, untracked and ignored file contents, index tree, tip and dirty status.
The four dirty worktrees remain dirty; none of their files were discarded or
replayed over newer main files. These working files are local recovery only.

Before retirement, annotated `archive/2026-10-02/<original-branch>` tags were
pushed and their remote peeled tips verified. Local recovery references also
remain under `refs/codex/archive/2026-10-02/`. Fourteen obsolete branch names
were retired locally; eight also existed remotely and were deleted only after
verifying the current server tip. The authoritative exact tips and tag names
are in `retired-branches.json` in the recovery directory.

The retired names are the nine old branches in the table above, plus
`codex/android-home-reference`, `codex/aural-song-queues`,
`codex/aural-corpus-index`, `codex/ios-aural-quiz-port`, and
`feat/fix-046-iv13-scope`. The iOS port worktree was the tenth archived tree;
its committed work remains contained in the retained Mac integration branch.

Kept `codex/midi-theory-analyzer` at `ae20ea51` and
`feat/graphical-progression-matcher` at `5f41a373` as feature backlogs.
The closed Fix 046 branch is superseded by the subsequently merged policy fixes;
preserve its tip before retirement.

## Android integration and validation

Main was fast-forwarded to `de8c2891`, preserving the queue and tonic-button
commits rather than rewriting their ancestry. Quiz example sections now repeat
in both ordered and shuffled queues. Small previous/next controls live in the
transport toolbar, respect queue boundaries and preserve paused playback.
Saved playlists retain automatic progression on completion. The serif tonic
note with hat and tonic chord controls remain in the key-signature header,
immediately left of the lock, in both player modes.

Covering checks:

- From `android/`, `python scripts/compact_check.py --name queue-repeat-controls-final -- .\gradlew.bat :app:testDebugUnitTest --tests com.acquiring.android.SongQueueTest --tests com.acquiring.android.PlaybackEngineTest --tests com.acquiring.android.SongQueueMigrationTest :app:assembleDebug :app:assembleDebugAndroidTest`
  passed: 27 JVM tests, debug build and instrumentation build.
- Replacement installs of `app-debug.apk` and `app-debug-androidTest.apk` onto
  Pixel 7a `3C081JEHN14930`, followed by
  `adb -s 3C081JEHN14930 shell am instrument -w -e class 'com.acquiring.android.PlaybackTransportDockVisibilityUiTest#queueNavigationRemainsAvailableInExpandedDockAndRespectsBoundaries,com.acquiring.android.PlaybackTransportDockVisibilityUiTest#headerMicAndModeMenuMatchIosLabels' com.acquiring.android.test/androidx.test.runner.AndroidJUnitRunner`
  passed both selected device tests. The installed app was launched. Catalog,
  evidence and popularity file sizes/timestamps and first-install time were
  unchanged; the phone still has its existing v1 catalog.
- `git diff --check` and YAML parsing of both changed workflow files passed.
  `6ce8f890` corrects the Android CI setup failure requesting the unavailable
  legacy SDK `tools` package, using `platform-tools` as the existing beta
  workflow already does. Remote execution is separate from these local checks.

## iOS disposition and next action

Kept `codex/ios-aural-mac-validation` at
`c6714ab6aed7068140d42a9d7cfb52409692a850`, unmerged. Its exact-tip
[iOS CI run](https://github.com/briansgithub/acquiring/actions/runs/36643944513)
failed with 16 distinct UI test cases. The exact-tip iOS chord-parity and web
checks passed; the Android run failed at SDK setup before tests. Existing
limited Mac evidence does not override those failures or approve the pending
human reviews in `docs/porting-plan.md`.

[Draft PR #51](https://github.com/briansgithub/acquiring/pull/51) makes the iOS
proposal and blockers reviewable. Swift/Xcode are unavailable in this Windows
session. Next action there is focused diagnosis of the existing UI failures on
the Mac and reconciliation of pending human review before integration; retain
the separate final full-testing approval gate. No release was performed.

The primary checkout is main. Dirty recovery trees must be selectively examined
before any future recovery or removal. No additional feature work is implied
for the two retained backlog branches.
