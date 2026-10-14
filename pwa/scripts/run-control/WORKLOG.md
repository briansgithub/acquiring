# T00 run-control worklog

2026-10-14: Started on `codex/pwa-run-control` at
`5f57b59d5f8932a21d4af9fb16c13c3315e5aa5a`; initial worktree clean.
Owned scope: `pwa/scripts/run-control/` only. Runtime model unknown.
Read RUNBOOK.md and T00; coordinator retains task claims in tasks.json.

Implementation decision: command-scoped OS lock, immutable atomic intent/start/result
receipts, Windows kill-on-close job with suspended launch and named-job drain gate.
Recovery inspection never retries a command or infers an exit result.
Next: implement and validate real process contention/interruption in temporary roots.

2026-10-14: Implemented stdlib CLI and README. Intent/start/result are immutable
atomic JSON phases under ignored artifacts; unresolved/corrupt runs fail closed.
Run-ID reuse never reruns commands; status is read-only. Operator acknowledgment
retains unknown outcome and next action without changing task claims.

Validation checkpoint: `python -m unittest discover -s pwa/scripts/run-control -p test_run_control.py -v`
passed 7 real-process/receipt tests in 10.435s on Python 3.13.15 / Windows.
Initial test cycle had one test-only failure: reading a locked Windows byte;
moved content-preservation assertion after lock release and reran successfully.
Added immediate post-kill contention and live-PID/empty-status checks for final run.
Known limits: POSIX cannot portably contain detached descendants; operator
reconciliation is required for every incomplete run. Windows suspended launch
cut can leave an inactive unassigned process requiring manual inspection. No
remote side-effect containment or automatic task completion. Next: final checks,
scoped commit, coordinator integration and task-ledger update.

Final validation: the same unittest command passed all 8 tests in 11.022s on
the final implementation tree. No tests skipped on Windows. Diff/whitespace
review is limited to the four owned source/test/doc files; generated Python
cache stays ignored. Coordinator must rerun this check on the integrated commit.
