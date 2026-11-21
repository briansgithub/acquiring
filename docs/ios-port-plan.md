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
| B02 durable song playback settings | B00 evidence | In progress, Astra/high worker `Acquiring: iOS Song Settings` |
| B01 octave persistence and older singing/navigation gaps | B00 evidence | Pending |
| B03 melody classification and cue metadata | B00 evidence | In progress, independent Astra/high core-model worker |
| B04 pulses, exact speech clips, Sonic and limiter | B02, B03 | Pending |
| B05 gapless Song continuation and clock metadata | B02, B04 | Pending |
| B06 playback controls, frame clock, captions | B01-B05 | Pending |
| B07 Aural reader, installer, ranking and query | B00 evidence | Pending; separate large subsystem |
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

## B07 package work, 2026-11-20

`ios-port-aural-catalog`, based on `d574a8ad`, owns new Aural-prefixed
AcquiringCatalog sources and dedicated tests/contracts. Initial commit adds
native loop/query/grouping/identity algorithms and pins source hashes at
`3c887223`. See [B07 receipt](ios-port/b07-aural-catalog.md). Reader, installer,
ranking and verification are in progress. Swift tests remain unrun locally.
App integration belongs to a subsequent lead-owned change; B07 app-visible
completion is not claimed. All existing review statuses remain unchanged.

B07 reader/install slice now includes independent GRDB reading, physical
occurrences, ranking/grouping and a real staged gzip/hash installer with
lease-drained generation activation. Lead's mixed-case grouping correction
and captured identity tests are included. Focused executable fixture checks
and PR/CI inspection remain pending; no app-visible completion is claimed.
