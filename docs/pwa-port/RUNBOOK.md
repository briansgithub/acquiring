# Unattended execution and interruption recovery

Updated 2026-10-14. Entry point: HANDOFF.md; authority: IMPLEMENTATION_PLAN.md and tasks.json. Scope currently ends at delivering the audit/plan. Product tasks remain planned until the owner authorizes implementation. Runtime model unknown.

## Budget and scheduling

The five-hour limit is an account usage window, not five hours of guaranteed continuous runtime or a fixed token allowance. Read live five-hour and weekly usage at run start, each completed slice, before delegation, and before a large operation. Other chats/workers can consume the same allowance. Do not estimate a budget from elapsed time, infer a reset, buy credits, or redeem reset credits.

- Below 70% used in both windows: choose the earliest unblocked ready package and one bounded slice. Default one active agent. Optional user-authorized parallelism is at most coordinator plus one worker with disjoint files and frozen contracts; never assume separate quota.
- At 70% in either window: start no new slice/worker/expensive check. Save currently gathered findings/edits and bounded in-flight results.
- At 80%, exhaustion, or an applicable unreached recorded reset: checkpoint recoverable state and yield. If the process is cut off before this, the prewritten intent and incremental files are the recovery basis.
- Same-chat hourly heartbeat resumes authorized work only after capacity returns. It must inspect task/agent/process state and avoid duplicate work. Host/app availability is required. No tight polling, looped failed model calls, unsupervised model switching, or assumption that the scheduler bypasses limits.
- The current heartbeat resume-acquiring-pwa-audit pauses once the audit and plan are delivered. Reactivate/update that same heartbeat when implementation is authorized; preserve the user's quiet-on-unchanged notification policy. Notify only on completion, a meaningful failure/blocker, or required human action.

## Package and slice state

Task statuses: planned -> in_progress -> validating -> complete, with blocked for an external prerequisite or diagnosed failure. A cutoff leaves in_progress/validating intact; it is not proof that the task failed, succeeded, or its claim is abandoned.

Coordinator alone writes tasks.json, shared contracts/dependencies/lockfile/CI/root routing and integration commits. Before each slice, persist task ID, owner/run ID, branch/worktree/base, owned files, concrete next action, expected check and any process/side effect identifier. Add a short progress receipt after each meaningful finding/edit/test; save at most ten audit rows or one small implementation behavior at a time. Commit coherent validated checkpoints with named paths. Do not keep long findings only in a worker's chat.

Use these fields in tasks.json: owner, branch, worktree, baseCommit, slice, nextAction, validation[], progress[], blocker. Validation receipts contain exact command, tested source revision or tree, result, and bounded log path when needed. Logs, temporary state and generated databases remain ignored/local. A task complete requires its declared behavioral evidence and dependency completion; code presence or old historical tests do not establish that.

Long operations are distinct slices: started -> process/job ID saved -> inspect completion -> validate outputs -> activate. First record the intended output/version/checksum before launch. Retain identifiers and stdout location so a lost tool response does not cause a duplicate run. A failed test gets at most two diagnose/fix/retest cycles before recording a bounded blocker and continuing unrelated ready tasks.

## Run entry and recovery procedure

1. Read HANDOFF.md and the target task only, then inspect Git status/branch/worktrees, active agents and the named job/process. Read relevant narrower instructions. Preserve all unrelated staged, unstaged, untracked, ignored and recovery data. The reference baseline never advances silently; record/reconcile a deliberate rebase of product authority as a separate decision.
2. Acquire exclusive coordinator ownership before edits/integration. T00 implements an OS-held file lock at ignored `.artifacts/pwa-port/coordinator.lock` (Windows FileShare.None; equivalent file lock on other hosts), opened without truncation/deletion and held by the run controller. A crash releases the OS lock. The lock file is not deleted to steal ownership; an existing live owner makes this run exit quietly. Its durable run metadata is advisory and must be reconciled with Git/process state after a crash.
3. Reconcile saved task claim and actual branch/worktree. A dead worker does not authorize resetting or overwriting its files. Inspect named changes and preserve them; resume that owned slice if understood. If ownership or an external side effect is ambiguous, block that slice and continue an independent ready one.
4. Resume by observed state: no edits -> perform recorded next action; partial edits -> inspect/complete them; check still running -> observe its saved process; check passed -> verify its tested tree then commit; commit response lost -> inspect Git for that checkpoint before retrying. Do not blindly rerun installation, schema migration, upload, merge or deployment.
5. Validate staged/unstaged scope, stage only owned named paths, and verify the staged checkpoint stands alone. Record check results honestly, commit, then update progress/next action. A later receipt may reference the prior commit; do not invent a self-referential commit hash. Dirty work remains reachable through the worktree and known base when a valid checkpoint cannot yet be committed.
6. After an integration, rerun covering checks on the actual combined revision, not just worker tips. Mark completion and select a task whose dependencies are complete. Keep explicit device/account/approval gates blocked without stopping independent implementation. Do not automatically remove branches, worktrees, stashes or recovery files.

## Task-specific recovery rules

| Operation | Saved before starting | Safe recovery |
| --- | --- | --- |
| Source port/UI edit | Owned files, known base, target behavior, exact next edit/test | Inspect partial diff; complete only owned work; no reset/blanket restore |
| Fixture translation | Android source revision and stable case IDs | Resume missing IDs; do not regenerate unrelated expected outputs |
| Full catalog packaging | Source snapshot/hash, output manifest version, chunk plan | Verify completed chunks; regenerate only missing/invalid task-owned outputs |
| Download/install | Manifest/hash, per-chunk status, staging name, prior active version | Recheck bytes and DB validity; resume chunks; recover pointer without destroying old catalog |
| DB migration | Schema version, transaction/journal state, preserved prior data | Inspect committed migration version; retry only idempotent transaction; no destructive recreation |
| Test/build | Command, tested tree, PID/job, bounded output location | Observe live job or inspect exit/evidence; rerun only if result/tree is unknown |
| Guest merge/sync | Account namespace, operation IDs, cursor and outbox | Retry same IDs; server acknowledgment precedes cleanup; no snapshot overwrite |
| Branch integration | Clean/dirty ownership, exact worker commits and expected paths | Inspect merge state and commits; resolve intentionally; no auto-abort/reset |
| Object/release publication | Immutable source/build/data IDs and provider operation ID | Inspect actual remote state before retry; production remains approval-gated |

## Validation of unattended behavior

T00/T26/T27 explicitly simulate cuts after intent, partial file write, check start, check pass, commit, downloaded chunk, validated database, active-pointer switch, sync request before acknowledgment and partial guest merge. Restart must identify the same next action, avoid duplicate credit/side effects, retain valuable dirty work, and recover a usable prior state. Test a suspended tab holding catalog ownership and a second scheduled coordinator as well as a killed process. A clean planned pause alone is insufficient evidence of crash safety.

No runtime controller or PWA is implemented by these documents. Until T00 is built, the audit uses committed ledger batches plus manual Git/agent inspection; hourly resumption is best effort. The configured allowance thresholds cannot protect an operation from an abrupt shared-account cutoff, which is why every slice has prewritten intent and recovery rules.
