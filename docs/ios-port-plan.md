# Android to iOS port ledger

## Current checkpoint

2026-11-20: Phase 0 in progress. Owner thread is `Acquiring: Android To iOS Port`.
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
- [ ] Run PWA unit/parity/build checks, Python port-ledger validators and shared
  chord contract tests. Record outcomes before merging.
- [ ] Fast-forward main from `3c887223` to the verified PWA continuation tip,
  then push main. Inspect remote state first; do not overwrite remote changes.
- [ ] Report phase boundary to Boss with exact commits and exclusions.

Other worktrees are untouched. Do not merge PR #52, `android-bg-media-voice`.
Inventory its voice cap/volume/default-song/background media changes separately.
Leave `fix/android-timeline-scrub` to its existing owner.

## Review and implementation queue

- [ ] Audit `docs/pwa-port/`, its implementation history and `contracts/`.
- [ ] Inventory Android history against the last iOS change `4d847e27`, including
  earlier gaps against `docs/porting-plan.md` and `docs/feature-parity.md`.
  Do not assume the last iOS commit proves all earlier features are complete.
- [ ] For each behavior, trace final Android caller, state/data model, tests and
  contract backward to the smallest change in the existing SwiftUI implementation.
- [ ] Record dependency-ordered batches with source commits, iOS files, procedural
  checks and explicit device/build limitations. Reuse shared fixtures and contracts.
- [ ] Create `wt new ios-port-... --base main` only after main is updated and clean.
- [ ] Implement batches, update this ledger in each commit and open/link batch PRs.
  Leave them open unless existing CI passes and the changes are contract-verified.

The PWA handoff at `f8b554cc` records remaining rotary controls, in-block splices,
Library reader recovery and other gates. Its earlier Windows browser result was
110 passed / 2 skipped; this is historical evidence, not a fresh run here.

## Supervisor protocol

If blocked on a decision from Brian, write the question to
`~/agents/boss/ios-port.hold` and notify Boss. Remove it when answered.
Create `~/agents/boss/ios-port.done` only when the whole port is finished.
