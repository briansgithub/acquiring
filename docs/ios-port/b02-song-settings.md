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

CI disposition and final commit receipt will be appended after PR creation.

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
