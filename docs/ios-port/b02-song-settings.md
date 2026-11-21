# B02 durable song playback settings

Authority is Android mainline `3c887223b2d06b4c3a1010d0f8a23ceaf8977d08`.
PR52 is excluded. Loop defaults to true, voice volume to 0.5, and the later
audio work retains the mainline 1.4 gain ceiling. This batch adds no voice gain
renderer, cue controls or Song continuation. Historical review statuses remain
unchanged. Worktree is `acquiring-ios-port-song-settings`, branch
`ios-port-song-settings`, based on `d430fc0c`.

## Contract evidence

`contracts/fixtures/song_playback_settings.json` pins six Android file hashes.
Eight row cases cover defaults, both inclusive boundaries, malformed fields,
nonfinite floats, all-field round trip, nullable instrument and REED_ORGAN.
Eight lifecycle specifications retain the Android regression scenarios plus
pending-return and failed-save retry. The latter are iOS error-policy extensions.

`python3 contracts/scripts/check_song_playback_settings.py` passed. It extracts
bounds, defaults and enum identifiers from the pinned Android source and applies
those constraints to the shared inputs and expectations. This checks the contract
against source, not Kotlin execution or Swift behavior. It does not inspect Swift
strings or claim a second implementation proves the app. No Kotlin compiler was
available, so a compiled cross-platform sanitizer comparison was not run.

## Behavior mapping

| Behavior | Swift implementation | Targeted evidence |
| --- | --- | --- |
| Durable stable slug, all nine control fields | SongPlaybackSettings Codable payload in unique SongPlaybackSettingsRecord; SwiftDataSongPlaybackSettingsStore | Shared row round trips; fresh-context and disk-reopen SwiftData tests, unrun |
| Defaults immediately; same song retains section continuity | Session.enterSong; AppEnvironment.rememberQuizSection | Missing/default/same-song Swift test, unrun |
| Old read and edit wins | Session generation and edited guard | Gated read tests including explicit default edit, unrun |
| Coalesced serial writes without losing prior songs | One writer, retained in-flight head, adjacent waiting-tail replacement | Gated A/B/A test, unrun |
| Pending values win when revisiting before save | enterSong checks pending snapshots | Same A/B/A test and failed-save test, unrun |
| Bad fields reset independently, nullable instrument preserved | SongPlaybackSettings.sanitized | Eight source-derived portable cases passed; shared-fixture Swift test unrun |
| Default-following vs explicit instrument | Android identifier map, including REED_ORGAN to existing oboe; AppEnvironment applies override or savedDefault | AppEnvironment integration Swift test, unrun |
| Read/save failures remain visible | Separate readError/writeError; SongViews message and save retry; failed writes retained | Failure/retry Swift tests, unrun |
| Favorite transactions isolated | Separate ModelContext from existing container, autosave disabled, rollback on failure | Procedural source inspection only |
| Existing controls restored before audio configuration | SongViews.load waits for guarded load, then uses continuity | Procedural caller trace only |
| Full/Root and section stay transient | Existing QuizContinuityState only; row omits both | Procedural schema review |
| Explicit section stays paused at start | Existing selectSection and scheduleSectionLoad restart path unchanged | Procedural diff review only |

The existing instrument service remains responsible for session audio. Settings
still changes the current session immediately. It does not rewrite an existing
per-song instrument override; a later durable load resolves that override again.
A null override follows the latest saved default. Restore notifications do not
persist the view's old sound controls. Mode-only changes cannot create a row.

The new entity shares the existing user container, independent of catalog swaps.
Its JSON payload contains all mainline fields. Invalid numeric/enum fields are
sanitized after decoding; structurally undecodable payloads report a read error
and remain untouched until an explicit edit. A failed save retains pending rows
in memory and reports that they are not durable. Retry drains them in order.
Process termination before a successful save can lose pending edits.

## Required native review

No local Swift compilation, simulator, device, migration or audio runtime checks
ran. Targeted XCTest additions are unrun. The additive SwiftData schema needs a
real upgrade test with an existing Favorites database; no destructive reset or
fallback container is introduced. Verify on macOS with only
`AcquiringTests/SongPlaybackSettingsTests` before broader authorized testing.

1. Change controls, switch sections, visit Song Info, return and restart the app.
   Confirm controls survive and explicit section selection stays paused at start.
2. Set a default instrument, enter a fresh song, choose an override, then revisit
   both songs after changing the default. Confirm default-following vs override.
3. Run gated reads/writes and failure tests. Confirm visible failures, retry and
   preserved pending values when switching A to B to A.
4. Open an older user database and confirm Favorites and new settings coexist.

PR #53 remains open for the lead. See the CI disposition below.

## Implementation receipt

Contract commit `e5317838` pins source and fixtures. Implementation extends the
existing AppEnvironment, instrument session, user container and SongViews callers.
The app target explicitly includes the new source file in its Xcode project.
Targeted tests are in the existing AcquiringTests.swift test seam, including
shared fixture expectations, AppEnvironment integration and disk container reopen.

Procedural review checked main-actor isolation, separate transaction context,
load generation, edit protection, in-flight queue ownership, pending return,
nullable instrument identifiers, mode-only no-write and source-time transport
callers. `git diff --check` passed. SwiftData schema migration, compiler acceptance,
UI error presentation and audio behavior remain unverified.

Runtime initially reported GPT-6-Astra high, briefly reported medium during a
follow-up, then explicitly reported high again. No worker or model handoff was
created. Final work continues under the reported high effort.

## Final CI disposition and handoff

PR: https://github.com/briansgithub/acquiring/pull/53, registered with T3.
Implementation/test head inspected by CI is
`3f35c40453e4b3cc81b63846091445baf2247c1f`. The final receipt commit changes only
documentation; results below belong to that exact earlier head, not a later rerun.

Commits are `e5317838` contracts, `f2491f03` implementation, `442c16ab` targeted
tests, and `3f35c404` integration of main's ledger ownership. The merge preserved
B03/B07 ownership and historical dispositions. No main checkout edits, worker
creation, releases or PR merges occurred.

[iOS run 44835917107](https://github.com/briansgithub/acquiring/actions/runs/44835917107)
completed with failure. Its Swift package parity step passed. The iPhone app build
failed with exit 65 at `AppEnvironment.swift:269`, before app tests executed:
`main actor-isolated default value in a nonisolated context`, on
`displayMaximum: Int = UIScreen.main.maximumFramesPerSecond`.
The runner used Xcode 26.6. The line and enclosing function are unchanged by B02,
present in base `d430fc0c`, and attributed by git blame to `1a494fcc9`.
This establishes a pre-existing source/toolchain incompatibility, not a package
test failure or successful B02 build. No base app build was rerun here, and the
failure may hide further diagnostics. The iPad app-test stage was skipped.

Other actual checks at that head: Android test/release-logic, Web, PWA recovery,
and all three chord interpreters passed. PWA app CI failed with 136 browser tests
passed, two skipped and two failed: `catalog-worker.spec.ts:113` user-store
recovery and `playback.spec.ts:1258` Song continuation/persistence. B02 changes no
PWA code or tests; these failures were inspected, not repaired or independently
reproduced. The push-only external-beta workflow also failed before any jobs;
GitHub CLI reports a likely workflow-file issue. No release was initiated.

The final targeted collection is **11 tests** in
`AcquiringTests/SongPlaybackSettingsTests`, all unrun:

- `testSharedCoalescedTicksExpectation`
- `testEnvironmentKeepsDefaultFollowingAndTransientModeSeparate`
- `testDiskContainerReopenRetainsSettings`
- `testSharedAndroidSanitizerCasesAndRoundTrips`
- `testMissingRowImmediateDefaultsAndSameSongContinuity`
- `testDelayedReadCannotReplaceEditIncludingExplicitDefault`
- `testOldReadCannotReplaceNewSong`
- `testCoalescingKeepsOtherSongsAndPendingReturn`
- `testSaveFailureRetainsEditsAndRetryPersists`
- `testReadFailureDoesNotWriteDefaults`
- `testSwiftDataRoundTripWithFreshContextPreservesAllFields`

Disk reopen tests the new schema only. It does **not** test upgrading an existing
Favorites database to the additive schema. That upgrade, all 11 app tests,
simulator/UI behavior and device/audio behavior remain unverified. The lead owns
resolution of the baseline compiler blocker, native acceptance and merge. B01 can
continue against this stable implementation; B04-B06 still need to integrate the
stored cue, voice-volume and Loop/Song fields with actual behavior.

The lead independently reran the portable contract checker and diff check and
reviewed the store guards, rollback isolation, target registration and callers,
with no blocking source issue found. That review is not Swift runtime acceptance.
Local `turn_context` at `2026-11-20T23:15:03.103Z` explicitly records
`model: gpt-6-astra`, `effort: high`; this is observed session evidence rather than
an inference from stored thread selection.

## Authorized frame-rate compilation prerequisite

After the initial CI receipt, the lead authorized a separate prerequisite fix.
`displayFrameRateRange` is now MainActor-isolated and accepts a nil default;
`UIScreen.main.maximumFramesPerSecond` is evaluated inside its isolated body.
The existing supplied-maximum path and range calculation remain unchanged.
All three call sites were inspected: HostView.apply and didMoveToWindow inherit
UIView's MainActor isolation, and QuizTimelineDisplayModel.configureFrameRate
belongs to an explicitly MainActor class. No caller or test isolation change was
needed. Existing framesPerSecond tests remain pure and unchanged. This repairs
the reported compiler error without changing B06 frame-rate policy or suppressing
concurrency checking. Remote CI for this prerequisite is recorded below when done.

## Second prerequisite CI finding

Run [44865642901](https://github.com/briansgithub/acquiring/actions/runs/44865642901)
actually tested `a976d526929098b93e143fd30682eb51dcdb0d87`. The watcher's message
contained an older hard-coded head label; the GitHub run API is authoritative.
Package tests passed and the actor-default diagnostic disappeared. App compilation
then failed at SongViews.swift:3250/3251/3256 because UIView has no
`preferredFrameRateRange`. These three lines also originated in `1a494fcc9`.
No app tests executed; the iPad stage was skipped again.

The lead authorized a second minimal prerequisite. The host now forwards its
update and window-attachment callbacks to the existing
QuizTimelineDisplayModel.setFrameRatePreference. That MainActor model applies the
range to its sole CADisplayLink. The host keeps a weak owner reference and the
passed preference. No second display link, timer, new preference, global cap or
B06 behavior is introduced. Playback visibility/activity/Reduce Motion gates and
the 60/Maximum calculation remain unchanged. This retains lifecycle reapplication
at the API that actually owns cadence.

Apple's [CADisplayLink documentation](https://developer.apple.com/documentation/quartzcore/cadisplaylink/preferredframeraterange)
describes a best-effort callback timing range. It does not promise a global UIKit
layer refresh cap. Physical cadence still requires native review.

## Exclusivity regression exposed by child CI

Child PR #57 run [44913289042](https://github.com/briansgithub/acquiring/actions/runs/44913289042)
tested exact head `f3d38c39edf1a9c638751292f29f2951ae4c24c0`. The lead reported
successful app compilation and four passing SongOctavePersistenceTests, followed
by a real B02 exclusivity crash in
`testEnvironmentKeepsDefaultFollowingAndTransientModeSeparate`.
The nested quizContinuity writeback in applySongSettings overlapped its getter
while computing chordMode. Later UI failures reporting an app that is not running
cannot be classified as baseline failures without a fresh run after this repair.

Only the AppEnvironment.swift hunk from child commit `0c55fd3b` is adopted here:
construct the QuizSoundConfiguration local, including all reads, before assigning
it through quizContinuity. The B01 receipt from that commit is excluded. The
existing environment XCTest is the regression; fresh CI is required. No new
behavior or weakening of exclusivity checks is introduced.

Direct inspection also confirms B02 run
[44888885288](https://github.com/briansgithub/acquiring/actions/runs/44888885288)
at `38daf1da0ea0d79b4884f5100516c837473a5be2` compiled the app and executed settings
tests. Ten tests logged individual passes, including new-schema disk reopen;
the environment integration test crashed with `Fatal access conflict detected`.
A later suite-passed log after test-runner restart does not override that crash.
This supersedes earlier unrun labels for those exact executions, but establishes
no pass for the complete B02 collection or old-database schema upgrade.

Repair `c47373de` contains only the requested AppEnvironment hunk plus this receipt.
Merge `403c6987` brings main `da752342` and PR #58's PWA test-count repair into B02;
no B01 receipt was copied. Fresh remote validation remains pending. The local
`pr-gate` command is unavailable on PATH; the exact-head GitHub run watcher is
used instead, with explicit thread ownership and Astra/high completion delivery.

## Post-repair native evidence and scoped UI expectation

[iOS run 44940517818](https://github.com/briansgithub/acquiring/actions/runs/44940517818)
at `3f33ecd2ae6938b929425dabf94b142050c1ee87` compiled the app and passed all
11 SongPlaybackSettingsTests, including the environment exclusivity regression.
The AcquiringTests.xctest collection passed. Package tests passed. This is remote
iPhone simulator evidence, not a local build or device result. The iPad stage was
skipped after UI failures, and upgrading an old user database remains untested.

The same run failed the UI instrument lifecycle test at line 581 because it
expected 500 Miles' Sine override to carry into fresh Bad Romance. That assertion
contradicts B02's Android per-song contract. The scoped test repair expects the
saved Flute default for Bad Romance, returns to 500 Miles and asserts Sine, then
checks that Settings still holds Flute. Playback advancement, foreground pause,
retained beat and explicit-resume assertions remain unchanged. Relaunch still
expects Flute because the UI-test app deliberately creates an in-memory SwiftData
database per process; this does not claim durable override relaunch coverage.
The passing disk-reopen unit test supplies new-schema persistence evidence.

Other UI failures in the run remain unresolved, including Library, accessibility,
layout, catalog recovery and singing interactions. They are not classified as
proven baseline failures. This patch changes only the confirmed B02 expectation;
fresh CI is required for the revised UI flow.
