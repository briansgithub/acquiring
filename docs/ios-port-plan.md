# Android to iOS port ledger

## Current checkpoint

2026-11-20: Phase 0 complete. Phase 1 complete. Phase 2 starts with B02 settings persistence. Owner thread is `Acquiring: Android To iOS Port`.
Read this file on every resume. Do not repeat completed work.

Brian authorized committing the PWA continuation onto main, then porting Android
changes in a clean worktree with small commits and batch PRs. No iOS toolchain is
available. Node/Python contract checks and source review are procedural evidence,
not evidence of a successful Swift build or device behavior. Preserve earlier
human-review statuses. The current request supersedes the older stop-after-each-
feature workflow in ios/AGENTS.md; it does not authorize TestFlight delivery.

## Phase 0 receipt

- [x] Inspect all dirty tracked content with `git diff --ignore-cr-at-eol`.
  Only `pwa/public/catalog-sources.json` differed beyond CRLF/LF.
- [x] Preserve local catalog and Claude settings under
  `/tmp/acquiring-ios-phase0-local/`, then restore 1,692 tracked paths to HEAD.
  No source feature edits were discarded. No repository-wide EOL policy changed.
- [x] Inspect `pwa/public/dev-catalog/`. It is generated packaged catalog data
  with intent/progress manifests and compressed database chunks. Keep it locally
  and ignore it, along with `.claude/launch.json`.
- [x] Restore portable empty catalog sources. The local change referred to
  `http://127.0.0.1:5180/manifest.json`; shipping it would bind other machines to
  an unavailable development server. Its original bytes are in the backup above.
- [x] Run PWA unit/parity/build checks, Python port-ledger validators and shared
  chord contract tests. Record outcomes before merging.
- [x] Fast-forward main from `3c887223` to the verified PWA continuation tip,
  then push main. Inspect remote state first; do not overwrite remote changes.
- [x] Report phase boundary to Boss with exact commits and exclusions.

Other worktrees are untouched. Do not merge PR #52, `android-bg-media-voice`.
Inventory its voice cap/volume/default-song/background media changes separately.
Leave `fix/android-timeline-scrub` to its existing owner.

## Review and implementation queue

- [x] Audit `docs/pwa-port/`, its implementation history and `contracts/`.
- [x] Inventory Android history against the last iOS change `4d847e27`, including
  earlier gaps against `docs/porting-plan.md` and `docs/feature-parity.md`.
  Do not assume the last iOS commit proves all earlier features are complete.
- [x] For each behavior, trace final Android caller, state/data model, tests and
  contract backward to the smallest change in the existing SwiftUI implementation.
- [x] Record dependency-ordered batches with source commits, iOS files, procedural
  checks and explicit device/build limitations. Reuse shared fixtures and contracts.
- [x] Create `wt new ios-port-... --base main` only after main is updated and clean.
- [ ] Implement batches, update this ledger in each commit and open/link batch PRs.
  Leave them open unless existing CI passes and the changes are contract-verified.

The PWA handoff at `f8b554cc` records remaining rotary controls, in-block splices,
Library reader recovery and other gates. Its earlier Windows browser result was
110 passed / 2 skipped; this is historical evidence, not a fresh run here.

## Supervisor protocol

If blocked on a decision from Brian, write the question to
`~/agents/boss/ios-port.hold` and notify Boss. Remove it when answered.
Create `~/agents/boss/ios-port.done` only when the whole port is finished.

## Fresh verification, 2026-11-20

PWA check passed: 1,291 unit tests, one parity test, typecheck and production build.
SQLite compatibility, shared parity, chord interpretation, audit validator,
Android delta validator and catalog packaging tests passed. Feature-ledger
validation initially failed because the generated Markdown encoded B-flat as
`Bâ™­4` while its JSON source correctly held `B♭4`. Regeneration changed only
that text; the full validator then passed, including all 262 historical rows,
575 evidence references and 50 reproducible patch hashes. No application fix
was necessary. Browser tests and Swift compilation were not run.

Windows Node 24.18 and Windows Git/GitHub CLI supply the existing authenticated
tooling. WSL Git identity now matches the existing Windows repository identity.
Logs: `/tmp/acquiring-ios-phase0-*.log`; background job `604ee75d`.

## Phase 0 completion and next resume

Main was fast-forwarded and pushed to origin at `c58f9fcd`. Cleanup commit
`3de43c69` added ignore rules and this ledger. `c58f9fcd` corrected the generated
flat-symbol encoding and recorded verification. The PWA continuation history is
preserved, not squashed. Other Android branches remain unmerged and untouched.

Read-only worker `Acquiring: iOS Delta Audit`, Astra/high, is auditing history
and existing Swift implementations. Expected outputs are
`/tmp/acquiring-ios-audit.md` and `/tmp/acquiring-ios-commit-inventory.json`.
On resume, inspect its report/status, independently review its proposed batches,
and complete this plan before creating the implementation worktree. Do not
start another audit worker. No Swift changes have been made yet.

## PWA review and reusable evidence

Reviewed the 14 PWA-touching commits between Android `3c887223` and handoff
`f8b554cc`. The sequence established saved song controls (`fe00b790`), native
Sonic fixtures (`653dccba`, verified in `0129c77f`), cue/limiter/splice rendering
(`f7fdd086`), timeline and melody roles (`48f89cad`), exact speech clips and
worker loading (`dbc52498`), voice/caption/root-only controls (`dbd6d703`),
Library layout (`34ca9ffa`), Song continuation (`0f3074e2`), contextual help
(`9e976557`), example shuffle (`a8b04d5f`) and browser evidence (`2ef98ae7`,
`daf11e0b`). This is a useful dependency order, not proof that the PWA is done.

`pwa/tests/parity/corpus-contract.test.ts` checks the shared corpus structure,
unique IDs and valid expected values. It does not execute either native app.
Behavioral native comparisons belong to the unit suites and their captured
fixtures. `pwa/src/audio/synth/fixtures/generate-stream-native.py` pins Android
`3c887223b2d06b4c3a1010d0f8a23ceaf8977d08`, extracts the renderer before its
platform sink, supplies explicit sample rates and seeds random synthesis only
for fixtures. Its cue driver uses the bundled clips. Retain this provenance
when promoting reusable cases into `contracts/fixtures/`; do not invent expected
Swift output by copying the Swift implementation.

Existing iOS `ChordParityTests.swift` already reads `corpus_parity.json` through
`ChordContractFixtures`. Preserve that contract loader and the existing audio,
pitch, timing and historical parity tests. New cross-platform cases should live
under `contracts/` with source authority and expected behavior documented. A
Python/Node check of fixture consistency is procedural evidence only; it cannot
replace execution of the corresponding Swift test.

PWA song settings show the required lifecycle seam: stable song slug, defaults
published on song entry, same-song section changes preserve controls, late reads
cannot replace listener edits, writes serialize, and an absent instrument means
the Settings default. Full/Root mode and selected section are not persisted.
Derive Swift persistence from the final Android settings/sanitizer and existing
iOS storage, rather than copying IndexedDB infrastructure.

Existing `.github/workflows/ios.yml` runs Swift package tests and app tests on
macOS iPhone/iPad simulators for iOS/contracts PR changes. Observe actual CI
results per batch; do not infer availability or success from the workflow file.
The local machine still cannot compile Swift or exercise iOS audio/UI lifecycle.

## Accepted execution order and ledger

The [source audit](ios-port/source-audit.md) and [commit inventory](ios-port/commit-inventory.json)
are frozen evidence at `c58f9fcd`, not continuously updated status. The lead
independently verified all 430 commit IDs against Git and inspected the first
settings integration against Android and AppEnvironment. The audit's old
phase-0 checkbox observation is superseded by this ledger. All 55 historical
capability rows and 262 historical records remain preserved.

The batch IDs below link to detailed source/test/Swift paths and acceptance
procedures in the audit. Execute B02 first, then B01 and B03 before audio work.
B00 pins evidence now; its older import/recovery candidates remain review items
and must be closed by B11 rather than silently treated as newly verified.

| Batch | Dependency | Current status |
| --- | --- | --- |
| B00 contracts and retained history | none | Evidence pinned; legacy import/recovery review remains open |
| B02 durable song playback settings | B00 evidence | PR #53 open; independent source/portable review passed, iOS CI pending |
| B01 octave persistence and older singing/navigation gaps | B00 evidence | Pending |
| B03 melody classification and cue metadata | B00 evidence | In progress, independent Astra/high core-model worker |
| B04 pulses, exact speech clips, Sonic and limiter | B02, B03 | Pending |
| B05 gapless Song continuation and clock metadata | B02, B04 | Pending |
| B06 playback controls, frame clock, captions | B01-B05 | Pending |
| B07 Aural reader, installer, ranking and query | B00 evidence | Package work in progress; app integration remains pending |
| B08 song queues and Library | B02, B05, B07 | Pending |
| B09 Aural learning, evidence and audio ownership | B01, B04, B07 | Pending |
| B10 Aural browsing and practice UI | B06-B09 | Pending |
| B11 remaining coverage and verification disposition | B06, B08, B10 | Pending; preserve separate full-app/release gate |
| P52 B4 ceiling, gain migration, Song default, background media | B02, B04-B06 | Conditional on Brian's pending Android review; do not merge #52 |

Mainline defaults remain Loop, voice volume 0.5 and gain ceiling 1.4.
Foreground-only playback remains authoritative. Explicit section selection
retains the accepted paused-at-start iOS override. Automatic Song continuation
is distinct. Removed tessitura, calibration and unreachable chord-tone monitoring
stay removed. PWA-only auth/service-worker scope is excluded.

Each implementation PR must map behaviors to Swift code and portable contract
checks, state unrun Swift/device checks, preserve historical review statuses,
and update this ledger. Tests of fixture data alone cannot mark Swift behavior
verified. Batch PRs remain open unless actual CI passes and contract evidence
supports the change. The lead owns review and integration; no worker may merge
without reporting those results. No TestFlight or broad final test run is implied.

## Active implementation ownership

B02 owns `/mnt/c/Users/user1/Desktop/Projects/acquiring-ios-port-song-settings`,
branch `ios-port-song-settings`, created clean from `d430fc0c` with `wt new`.
Worker `Acquiring: iOS Song Settings` implements, commits, opens/links its PR and
reports actual CI; the lead independently reviews before any merge. The worker
must leave the PR open. Audit worker `Acquiring: iOS Delta Audit` is complete;
its artifacts are committed and need not be recreated. Resume by reading B02's
report/status, not by starting duplicate work.

## B03 ownership and B00 follow-up, 2026-11-20

`Acquiring: iOS Melody Function` owns branch `ios-port-melody-function` in
`/mnt/c/Users/user1/Desktop/Projects/acquiring-ios-port-melody-function`, created
clean from main `9d49782e`. B03 may proceed alongside B02 because it owns new
AcquiringCore files, focused tests and uniquely named contract fixtures. It must
not edit AudioContracts, AppEnvironment or SongViews. B04/B06 own eventual
renderer/UI wiring. B02 received this boundary by thread message. Both workers
must leave their PRs open for lead review.

A bounded B00 inspection found existing repeated-section support in
`HooktheoryHarvester.harvest`: API responses cache by ID, while repeated tabs
receive distinct section keys. `CatalogCoordinator` already opens a separate
HarvestLedger, replays on startup and restores only missing catalog entries.
These are source findings, not runtime verification. Do not rebuild them.

One remaining compatibility candidate is explicit: Android `DataExtractor`
uses `Json { ignoreUnknownKeys = true; isLenient = true }`, whereas Swift's
nested jsonData extraction uses `JSONDecoder`. Before closing I02, pin an actual
accepted native nonstandard input and compare Swift behavior; do not broadly
relax parsing or claim this is verified from source syntax alone. Existing
catalog tests live in AcquiringCatalogTests.swift, CatalogRecoveryTests.swift
and HarvestLedgerTests.swift. B00 import/recovery review remains open.

## B07 ownership and provider effort

Worker `Acquiring: iOS Aural Catalog` owns the clean main-based branch
`ios-port-aural-catalog` at
`/mnt/c/Users/user1/Desktop/Projects/acquiring-ios-port-aural-catalog`.
It may add only Aural-prefixed catalog package files, focused tests/contracts
and its receipt until shared edits are coordinated. B02 owns app persistence;
B03 owns pure melody types. B07 exposes a usable package service, while app
bootstrap/Settings/UI integration remains explicitly pending. All three workers
must report and leave PRs open for independent review.

Boss diagnosed the medium-effort discrepancy: initial thread creation included
Astra/high, but plain `t3thread send` omitted model options on follow-up turns.
Every future message to a Codex thread must include `-m gpt-6-astra -e high`.
Boss fixed supervisor nudges and this lead's current runtime reports high.
Workers received the correction; queued fan-out messages must be allowed to
deliver normally. Verify actual session turn_context after the next follow-up,
rather than treating stored selection as proof. Earlier medium runtime reports
remain part of the record.

Effort check receipt: latest saved turn_context at 2026-11-20T23:15Z confirms
`gpt-6-astra` / `high` for B02 and B07. The lead's saved context from 23:13:50Z
still records `medium`; the in-turn runtime update alone does not rewrite that
record. Re-check the next lead turn. B03 was in T3 `error` state with correction
message watch `54df1b57` queued for automatic delivery. Do not create a duplicate
worker or bypass the queue. Its implementation status needs confirmation after
that follow-up delivers. B07 correction watch is `e32e9d29`.

## Independent interim review, 2026-11-20

B02 PR https://github.com/briansgithub/acquiring/pull/53 is linked to the lead.
Reviewed head `3f35c404` store/load/write ownership, separate transaction context,
Xcode target registration and AppEnvironment/SongViews integration. Independently
ran `python3 contracts/scripts/check_song_playback_settings.py` and
`git diff --check main...HEAD` in its worktree: eight sanitizer cases, six pinned
hashes and whitespace check passed. Lifecycle cases remain specifications until
Swift tests execute. iOS run `44835917107` is in progress; no merge authorized
by this interim receipt. Worker is recording the actual CI disposition.

B07 commit `7b8b8f1b` received bounded independent source review. Eight hashes
match native `3c887223`; loop cases equal the pinned native fixture. Sent a
mixed-case numeral canonicalization difference and missing identity/grouping
test coverage to its owner. Reader/installer remain in progress.

B03 recovered after its queued follow-up and is running. Latest saved
turn_context records confirm Astra/high for B02 at 23:15:03Z, B03 at 23:15:32Z,
B07 at 23:15:02Z and this lead at 23:18:42Z. Earlier medium turns are not relabeled.
