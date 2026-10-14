# PWA port continuation

Updated: 2026-10-13 (America/New_York)
Runtime model: unknown.

## Authorized work

Audit the Android critical-path history, handoffs, comments and tests; identify each commit's feature changes; produce a dependency-first PWA implementation plan with safe parallelism and unattended resumption. Automatic resumption was explicitly selected by the owner. Do not begin product implementation before this audit/plan is delivered.

## Reference and starting state

Android baseline: 801cf7984171d772afc4406ddb5c79c0cb7fd20a. Primary checkout H:/Desktop/Acquiring/Acquiring began clean on main. Existing recovery worktrees are preserved and are not implementation targets. No application validation has been run during this audit.

The earlier path-simplified log listed 213 entries. Full-history traversal of android/ and contracts/ identifies 262 entries: 108 foundation, 103 revision, 51 aural. Some are merges/imports rather than independent feature additions. Do not equate commit count to feature count.

## Current work

Coordinator branch: codex/pwa-history-plan. Seeded three history JSON ledgers; pending means unreviewed. Each worker must save entries in batches of at most ten, record evidence depth honestly, and commit only its assigned ledger/report. The coordinator owns revision history, final feature inventory, implementation order, and this handoff.

Planned concurrent worktrees: separate sibling audit worktrees/normal branches for foundation and aural. Record their returned paths and branches here before delegation. No deletion or cleanup is authorized by this audit.

## Interruption rules

Never depend on a final save at the rate limit. Before a unit starts, record its owner, dependency, target files, expected validation and next action. Save findings continuously; commit coherent validated batches. If interrupted, inspect Git and active worker/process state before reclaiming a task. Preserve dirty/untracked work; never reset, clean, stash, or replay old recovery snapshots automatically.

At each batch boundary check shared usage. At 70% used, stop new delegation and finish only bounded current work. At 80% used, checkpoint and yield; retain the remaining capacity for recovery and unrelated account work. These are conservative policy thresholds, not a promise that another run cannot consume capacity first. Never buy credits or redeem resets automatically.

## Established product decisions

New pwa/ project in this monorepo; Android current shipping behavior is authoritative. Ignore old web/iOS applications except shared libraries/data/contracts. Responsive Android-like layout; current/previous major Android, iPhone/iPad and desktop browsers. Full offline catalogs after verified download; local guest use plus Supabase cloud sync; email/password and Google sign-in; fresh profiles without Android migration. Cloudflare Pages/R2/Worker delivery; React/TypeScript/Vite; SQLite WASM catalog worker and IndexedDB user data; foreground synthesis/microphone parity. Full offline storage is conditional on available quota. Current source has 13 instruments, foreground pause, and singer-set octave offsets; older parity inventory includes superseded behavior.

## Next action

Complete the three per-commit ledgers from actual diffs/comments/tests, reconcile surviving features, then write the implementation DAG, task ownership rules and recovery/runbook. Set up one same-chat resume heartbeat using this file as its entry point; remain quiet on unchanged/non-actionable state. When the audit and plan are complete, pause the heartbeat until implementation is authorized.

## Active audit assignments

2026-10-13, checkpoint 824fb7d4: clean coordinator and two clean sibling audit worktrees created from the checkpoint. The app worktree tool could not resolve the parent workspace as a repository, so Git created the explicit sibling paths.

- Foundation: H:/Desktop/Acquiring/Acquiring-pwa-audit-foundation; branch codex/pwa-audit-foundation; owns history-foundation.json and findings-foundation.md only.
- Aural: H:/Desktop/Acquiring/Acquiring-pwa-audit-aural; branch codex/pwa-audit-aural; owns history-aural.json and findings-aural.md only.
- Coordinator: H:/Desktop/Acquiring/Acquiring; branch codex/pwa-history-plan; owns revision ledger and final plan/runbook.

Validation before delegation: JSON inventory count/unique IDs passed, git diff --cached --check passed. Risks: default command sandbox currently fails enumerating a BitLocker-locked V: volume; approved unsandboxed commands can access the H: workspace. No app tests required for audit documents. Next: each worker saves and commits batches; coordinator integrates finished report commits without overwriting pending work. Recovery worktrees remain untouched.

Automatic resumption: same-chat hourly heartbeat `resume-acquiring-pwa-audit` created ACTIVE on 2026-10-13. It resumes only this audit/planning scope, respects live account limits, avoids duplicate workers, and pauses when the deliverables are complete. Requires the host/app to be available; scheduling does not bypass rate limits.

## Resume checkpoint 2026-10-14

Live five-hour usage1%, weekly33% at start. Both prior agents are errored/stopped, not active. Their clean documentation branches were inspected and integrated without touching application files: foundation30/108, revision40/103, aural40/51 reviewed. The prior root command to save remaining revision findings was rejected before execution when automatic approval review exhausted its own allowance; none of those attempted writes occurred. Resume sequentially from durable rows. No new workers or worktrees are needed.
