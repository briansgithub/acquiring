# B01a durable singing octave

This slice persists the singer's octave by stable song slug. It is stacked on
B02, branch `ios-port-song-settings`, and leaves the rest of B01's older
navigation/gesture review open. Main documentation is frozen during B02 CI.

## Behavior and evidence

Android authority is `3c887223b2d06b4c3a1010d0f8a23ceaf8977d08`.
`SongOctaveOffset.kt`, its view model and `SingingTargets.kt` define a separate
song-keyed integer with range -2 through +3. The existing Swift clamp and target
resolution remain authoritative consumers; source playback/transposition is
unchanged. `contracts/fixtures/song_octave_offsets.json` pins source hashes and
boundary cases. `contracts/scripts/check_song_octave_offsets.py` checks their
source-derived expectations, not Swift execution.

| Behavior | Implementation | Targeted test |
| --- | --- | --- |
| Missing song defaults to zero without a write | VocalPracticeModel.restoreOctaveOffset | testMissingRowSectionContinuityAndReturn |
| Same-song sections retain offset; another song restores only its row | enterSong | testMissingRowSectionContinuityAndReturn |
| Leaving clears live state without deleting saved offsets | leaveSong | testMissingRowSectionContinuityAndReturn |
| Reads cannot arrive after a switch/edit | Synchronous main-actor store and model | Source review; no asynchronous operation exists |
| Failed saves retain latest values per song and offer retry | pendingOctaveOffsets, retryOctavePersistence, dock message | testFailedWritesKeepLatestOffsetsAcrossSongsAndRetry |
| Read failure exposes zero/default and retry; explicit edit wins | restoreOctaveOffset, setOctaveOffset | testReadFailureRetryAndExplicitEditWins |
| Clamp on read/write and survive store reopen | SwiftDataSongOctaveOffsetStore | testSharedClampCasesAndReopen |

The new SwiftData entity is separate from playback controls, Favorites and the
replaceable catalog. Its transaction context disables autosave and rolls back
only its own failed saves. The application container and existing test container
schemas include it. The Xcode project registers the new source file.

Synchronous operations are intentionally limited to one indexed row per song
entry or octave tap. No task, debounce timer or cross-song load generation is
needed. Pending rows survive song departure within the process; termination
before successful retry can still lose unsaved edits. The dock reports this.

## Checks and limitations

Executed: `python3 contracts/scripts/check_song_octave_offsets.py` passed ten
clamp cases and three pinned native source hashes; `git diff --check` passed.
Four focused `SongOctavePersistenceTests` were added to the existing app test
file. They remain unrun locally. No Swift compiler, simulator or device is
available here. Remote CI results must be attached to the exact PR head.

Schema upgrade from an existing user database and user-perceived storage latency
remain unverified. No reset/delete fallback exists. Existing singing/microphone
review statuses remain pending. This slice does not add retired tessitura,
calibration, chord-tone activation or background playback. No release occurred.

Future review: choose different offsets for two songs, change sections, relaunch,
and confirm each song restores its value while transport pitch is unchanged.
Exercise read/save failures and retry through the focused tests on macOS.

## Remote execution receipt

At head `f3d38c39`, iOS run `44913289042` compiled the app and passed all four
SongOctavePersistenceTests on the iPhone simulator, including disk reopen and
failure retry. B02's environment test crashed with simultaneous read/write
access to quizContinuity in applySongSettings. This branch now computes the
sound configuration before its nested writeback. The existing failing test
covers that path; the correction still needs a fresh CI result. Numerous later
UI failures reported the application was not running. Their individual causes
are not yet established, and iPad coverage remains unverified. PR #57 stays open.

## Full song title

N02 is now included in this branch. Android's PlaybackDestination presents the
full title through ModalBottomSheet and SelectionContainer. The Swift toolbar
opens a sheet with selectable text and a Done button. The existing UI test
now closes the sheet explicitly and checks that the selected section, chord
mode and playing state survive. Text selection itself needs simulator review.

On prior head `98c01ca8`, iPhone run `44940400939` passed the four octave
tests and the B02 test that previously crashed. The same run recorded 23 UI
assertion failures. B02 separately corrected the outdated instrument test.
That revised test passed on #53 at `516d7f26` in run `44955539541`. That
run still recorded 21 UI assertion failures. The title-sheet change needs
fresh CI.

## Title-sheet CI

Head `0fde4662` compiled and passed the iPhone app unit suite and the
`testQuizSongTitleExpansionRetainsModeAndPlayback` UI test in run
`44971869431`. The iPhone UI suite had 21 assertion failures across 16 test
cases. Comparing failed test names with parent #53 run `44955539541`
at `516d7f26` found the same 16 cases. iPad execution remains unverified.
The test confirms dismissal and playback continuity. It does not exercise
copying the selected text.

PWA run `44971869433` failed the existing second-tab catalog retry test at
`library.spec.ts:67`, where searching after ownership retry returned zero
rows instead of six. The same test failed earlier on #54 in run
`44888861727`. Its cause has not been established. PR #57 remains open.
