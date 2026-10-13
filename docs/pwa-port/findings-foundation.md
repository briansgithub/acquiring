# Android foundation audit

Updated: 2026-10-13 (America/New_York). Runtime model: unknown.
Reference: 801cf7984171d772afc4406ddb5c79c0cb7fd20a.
Owner: foundation worker, branch codex/pwa-audit-foundation; only this report and history-foundation.json.

## Checkpoint and recovery

30 of 108 ledger entries reviewed and saved. Next pending index 30: 9c95f8453 (default balance). Read this report, inspect git status, then resume that index. Changed-file metadata has been inspected through index 39; later entries remain unreviewed. Do not treat pending entries or subjects as feature conclusions.

Checkpoint commits: 854a4bb5 (0–9), afe1e21d (10–19), 3492bdcb (20–29), followed by this checkpoint/reference validation commit.

Stopped because shared 5-hour usage reached 86%, above the HANDOFF 80% checkpoint threshold. No background process or outstanding application operation exists in this worktree. No build/device tests were run; this is a documentation audit.

Validation: JSON parsed; git diff --check passed per batch; git cat-file -e validated all 60 immutable evidence references after correcting deleted-file references to their parent revision. No application behavior has been executed. Only assigned audit documents changed.

## Findings established so far

- 0b7abac8 introduces the actual Android app despite its build-fix subject; 099cadf9 adds only README and ignores.
- 22217c64/8e496fee add/remove a stray outer-repository singing file; aed98be9 is the actual nested Android tool origin. These histories must not be double counted.
- 3fef49c6 moves recents outside replaceable catalog storage. Keep catalogs and user records distinct.
- 5aa4fc87 is substantially chord/inversion/audio/notation work despite its search-history subject. Commit subjects are inadequate feature specifications.
- Section extraction uses source order and actual page-tab identity after 0886615a; repeated API IDs cannot collapse distinct section tabs.
- Sounding chord root, inversion bass, scale degree and spelled interval are different concepts. Preserve explicit semantic types and regression fixtures before composing UI.
- Playback requires independent scheduling progress, seek cancellation and correct content-end handling; do not schedule from recomposition state.
- Current MainActivity pauses controller/stops all audio on inactivity. Later historical background-media behavior must be reconciled with the revision audit.
- Early Quiz means current Playback, not the separately added Aural Quiz. Historical puck/hum calibration and early controls are not baseline parity targets.

## Dependency seams for coordinator

1. Catalog/section normalization and pure theory can be built concurrently once shared fixtures and semantic types are fixed.
2. Notation rendering and catalog browse UI can proceed independently against those stable models.
3. Transport/synthesis must expose explicit scheduling, seek/stop and preview ownership before pitch-tool or playback UI integration.
4. Pitch detection can be ported/tested with synthetic audio independently; target selection depends on theory, microphone ownership and preview/transport contracts.
5. Browser catalog installation and durable user storage need separate ownership from the outset; recents and later favorites must survive asset replacement.

## Evidence and coverage limits

Every reviewed row records all changed paths plus one historical and one immutable current reference. Inspection combines changed-file metadata with bounded functional patch/comment/signature review, plus targeted test additions. Binary artwork is metadata-only; no visual equality claim. Large source patches were searched rather than read exhaustively, and detailed runtime parity still requires baseline fixture/device validation. Deletion entries reference the last file-bearing parent revision; their row SHA identifies the deleting change. Current references identify surviving subsystem implementations, not unchanged survival of obsolete versions.

Remaining: entries 30–107, especially interval spelling, persistent singing, all-song indexing, tessitura replacement, media-service reversal, audio stream ownership, and favorites isolation. Final dependency/regression conclusions require reconciliation with the revision and Aural workers.
