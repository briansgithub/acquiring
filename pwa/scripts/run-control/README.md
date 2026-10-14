# PWA command run control

Python 3.10+ standard library only. Run one bounded command under exclusive
coordinator ownership. This is a command wrapper, not a scheduler or daemon.
Task claims remain in `docs/pwa-port/tasks.json` across commands; only the
coordinator edits that file. These tools do not claim tasks, commit, retry,
discard files, or complete tasks automatically.

From the repository root (substitute the actual operator and a fresh run ID):

```powershell
python pwa/scripts/run-control/run_control.py run --run-id T00-docs-001 --owner coordinator --task T00 --next-action "Inspect docs changes and record validation" -- python -c "from pathlib import Path; Path('.artifacts/pwa-port/drill.txt').write_text('harmless docs drill')"
python pwa/scripts/run-control/run_control.py status
```

`--repo PATH` precedes the subcommand and must name an existing Git working-tree
root. It controls artifact/lock location; the child defaults to this root regardless of the invoking shell directory. `run --cwd pwa` explicitly selects a contained child directory and records it, while keeping the same repository lock. Escaping the working tree is rejected. Always
use the **same coordinator root** for scheduled invocations. Linked worktrees
have different root directories and therefore different locks; a command can
explicitly target another worktree (for example `git -C ...`) while retaining
the coordinator root. No shell is used. Explicitly invoke a shell when required.
Windows `.cmd`/`.bat` files (including `npm.cmd`) require an explicit command
interpreter, or invoke `node` with the actual `npm-cli.js` path directly. The
wrapper never builds a shell command from arguments automatically.
Child output inherits the wrapper's streams; redirect at the caller when a
bounded output log is needed. Receipts preserve the full argument list, so
never pass credentials or other secrets in command arguments or receipt text.

## Exclusion and subprocess safety

The ignored `.artifacts/pwa-port/coordinator.lock` is opened with create/read/
write, **without truncating, replacing or deleting it**. Windows holds a
nonblocking `msvcrt` exclusive byte-range lock; POSIX holds `flock(LOCK_EX)`.
Existing lock-file contents are advisory, never ownership evidence. Nothing
deletes a stale lock. Expected contention returns **75 without output**, before
creating any run receipt. The OS owns lock lifetime.

On Windows, each command also has a named Job Object scoped by the normalized
coordinator root. The child starts suspended, is assigned to a job with
`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, then resumes. Failure to assign fails
closed before the command executes. Descendants cannot request job breakaway.
Controller death closes the job handle and Windows terminates its process tree.
A later controller refuses an already-existing named job, including the interval
between lock release and the last terminated child draining. Normal child exit
also terminates leftover descendants and waits for the job to empty before
publishing its result. Consequently this wrapper is unsuitable for launching
persistent background services. Nested host job restrictions may prevent launch;
that is a recorded launch failure, never a fallback to uncontained execution.
A kill during the small suspended-create/assign interval can leave an unassigned
suspended child. It has executed no command code, but process reconciliation may
need to terminate it manually; an intent-only run still blocks all new work.

On POSIX, the command starts in a new process group and inherits the lock file
descriptor. Normal completion/handled interruption kills remaining group members.
If the controller is killed, a child retaining the inherited descriptor continues
holding the lock until exit. POSIX has no portable stdlib kill-on-parent-death
process-tree primitive: a command can close inherited descriptors, detach, or
create surviving grandchildren. Therefore **every incomplete prior run blocks
new commands even when the OS lock is free**. An operator must establish that
all descendants/side effects stopped before acknowledging; checking the recorded
PID alone is insufficient. Windows is the tested process-tree containment path.
This wrapper cannot contain work submitted to another host/service, a preexisting
daemon, or privileged processes that escape normal OS process ownership.

## Receipts and recovery

Each fresh run ID gets its own ignored directory:
`.artifacts/pwa-port/runs/<run-id>/`. JSON phases are published once:

1. `intent.json` precedes child launch, with owner, task, run ID, exact command,
   working directory, controller PID, base Git commit and concrete next action.
2. `start.json` adds the child PID. A cut between child creation and publication
   leaves intent only; it does **not** prove the command never ran.
3. `result.json` records the observed direct-child exit after tree cleanup.
   Zero means the command exited zero; task behavior/outputs still need checking.
   The base commit does not identify uncommitted source: save Git/diff and tested
   tree evidence in the task ledger when that matters.

Each phase writes a uniquely named temporary file, flushes and fsyncs it, then
atomically replaces its final destination. POSIX additionally fsyncs the parent
directory. Incomplete `.tmp` files stay available for investigation. A valid
published result takes precedence over leftover temporary files; an incomplete
run or malformed published phase fails closed. Filesystem/OS storage durability
still bounds recovery after power loss; this is not a transactional filesystem.
Do not manually replace/delete receipts to clear ownership.

`status` only reads receipts and reports observed process liveness, partial
files, saved next actions and unknown outcomes. It never acquires a lock, writes
artifacts, retries work, or turns a missing exit result into success. A PID may
be reused, and observations can race; reconcile with actual Git/process/output
state. Status is advisory, not a second coordinator lock. Repeating a completed
run ID returns **77** and never repeats the command, even when its tool response
was lost.

An incomplete prior run returns **76** for a new command. Preserve the receipt
and partial user work; inspect the named processes, descendants, Git changes and
any remote side effect before proceeding. When they are reconciled and stopped:

```powershell
python pwa/scripts/run-control/run_control.py acknowledge --run-id T00-docs-001 --owner coordinator --confirmed-stopped --evidence "Inspected the docs edit and process tree; no live work or remote effects" --next-action "Finish and validate the preserved docs edit"
```

Acknowledgment acquires the same lock and Windows job gate, refuses recorded
live/unknown processes, and writes `acknowledgment.json`. It records **unknown
result reconciled by an operator**, never success, and never releases a task
claim. Repeating acknowledgment is idempotent. A new deliberate command uses a
new run ID. Corrupt/missing intent or malformed final JSON needs manual evidence
repair; acknowledgment refuses to conceal it. Errors return **78**; command
failure otherwise propagates its exit code (large/negative OS codes map to 1,
with original in the receipt). A child's exit can equal a reserved controller
code; inspect its result receipt to distinguish the two.

## Checks

```powershell
python -m unittest discover -s pwa/scripts/run-control -p test_run_control.py -v
```

Tests create and remove only dedicated temporary Git roots. They cover real
subprocess contention, lock-file preservation, killed controllers, Windows
grandchild termination, reacquisition after explicit reconciliation, valuable
partial docs preservation, intent-only recovery, atomic-write cutoff, corrupt
receipts, command/launch failures, repeated status and lost-response idempotency.
The Windows process-tree test is skipped on POSIX; POSIX behavior has not been
validated on this Windows host. No network, installs or user work cleanup.
