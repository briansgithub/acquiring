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

## Recovery and intended disposition

Recovery directory: `H:/Desktop/Acquiring/.branch-recovery/2026-10-02/`.
Before mutation, save a Git bundle, exact tip references, statuses and worktree
fingerprints there. Local references are not a shared backup.
Archive old worktrees by moving the intact directories to that recovery directory
and detaching at their original tips. This retains ignored and untracked files.
Retire obsolete branch names only after checking the recorded tip and recovery.

Keep MIDI/theory and graphical-progression-matcher branches as feature backlogs.
The closed Fix 046 branch is superseded by the subsequently merged policy fixes;
preserve its tip before retirement.

Android checks must use replacement installs and direct instrumentation without
clearing device data. iOS integration retains its recorded human-review gates;
Mac validation availability will be checked before deciding its final disposition.

Next action: preserve recovery, complete Android queue controls and repeating
examples, run covering checks, then integrate and retire validated redundant branches.
