# PWA implementation continuation

Updated2026-10-14. Coordinator runtime model:unknown. Primary repository H:/Desktop/Acquiring/Acquiring, branch codex/pwa-foundation. Latest validated product source:3dceb355940777161d4046e21c5a743768555668. Inspect Git for current tip/dirty state; this handoff is not process state.

## Scope and state

Owner explicitly requested: “Begin with PWA implementation; assign sub-agents appropriate Codex Models and Thinking Levels.” Implementation is authorized; this supersedes the earlier audit-only scope. No publication, push, history rewrite, credit purchase/reset or destructive cleanup is authorized.

Audit baseline remains801cf7984171d772afc4406ddb5c79c0cb7fd20a. The completed audit675a151f covers262 commits/575 evidence paths and29 ordered packages. Use tasks.json and IMPLEMENTATION_PLAN.md; do not repeat completed history gathering or revive superseded behavior.

- Complete:T00 process/receipt recovery; T01 independent React/TS/Vite PWA shell, manifest, routes, shell cache and CI; T02 Android payload/section/name/metadata compatibility; T06 isolated IndexedDB user records, migrations and atomic replay-safe outbox.
- T03 partial: native pitch/key/scale spelling, written pitch and relative-Ionian helpers accepted fromda1913c. Remaining: chord interpretation/root/tone labels/voicing plus complete shared/source/historic musical output parity. Input corpus validation alone is not musical parity.
- T05 partial: full source packaging, manifest/chunk verification, advisory quota preflight, and tested SQLite initialization-preservation backport. Remaining: actual catalog worker/importer, verified resumable staging, full-file hash/quick_check/metadata validation, tab ownership, active-pointer recovery and full-size browser/mobile proof.
- Other packages remain planned. No playback, microphone, learning, account/sync or full catalog installation is exposed by the current empty Library/Settings shell.

## Validation at this checkpoint

Final safety source3dceb355 passed clean `npm ci` (50packages), `npm run check` (47unit tests,1shared corpus input-contract test, strict TypeScript and production build),6Node SQLite patch regressions,1real Chrome OPFS preservation regression, and7Chrome shell/user-storage browser cases. Exact guarded commands and results are in tasks.json. Remote CI is defined but has not run.

T00 contained `run --cwd` correctioncef0822b passed9 real process/receipt drills in12.101s. Catalog producer954ceb71 passed8 Python fixtures in0.840s, including an actually killed producer resuming without rewriting a verified chunk. No need to repeat unchanged passing checks without a relevant change.

Shell browser cases cover history/bookmarks,320px with200%text, and offline cold reload/deep link. User-storage cases cover10stores across reload, guest/account isolation, separate replaceable-catalog database, mid-write abort, replay before/after acknowledgment, collision/ack rollback, tombstones and other-connection upgrade blocking. This is not the full OPFS catalog swap test. Phone/desktop screenshots were inspected and owned preview processes stopped.

SQLite published3.53.4-build2 ignores upstream3.54 preserveOnInitFailure and deletes its pool on initialization failure. scripts/sqlite-compat backports only the official preservation cleanup branch from immutable upstream40f8f74946173a0c8bcb967a1748396d7d328f55, gated by the exact browser-module SHA256a6d3fe46aa3f924e7686329f97b0564549ef1f787e0c19924179aef7f72bcc01. Vite main/worker plugins are wired, dependency prebundling excluded, and unknown source fails closed. Consumers MUST pass preserveOnInitFailure:true and clearOnInit:false. Node/worker1 entry points are outside the patch. The actual Chrome test preserves all4file hashes, releases3partial handles and recovers a row/quick_check in a third worker while the failed worker is alive. It proves one controlled schedule; arbitrary races/quota/mobile/Safari/full installer safety remain open. Read its README/WORKLOG before using it.

## Large data and recovery

Original archives remain untouched in ignored acquiring_data/aural-catalog-delivery-v3-64cfa299cc74. Full packaging job t05-full-aural-packaging-20261014 completed; do not restart it. Output:.artifacts/pwa-port/aural-chunks-64cfa299cc74. Complete manifest SHA2569c493fd76f6bcda9e1ab44f5889708e6814ac5154a00c94d9a9438ee91c0e591; source snapshot64cfa299cc740dd9a1daf2cefc837bf1db80be9b2caa00626f674ea04b0c2243. Three verified files,237chunks,1,980,387,328raw bytes,780,019,421compressed bytes. Browser manifest contract accepted these actual outputs. Generated chunks/manifests/receipts remain ignored and unpublished.

Run controller:pwa/scripts/run-control/run_control.py. Children default to Git root regardless of invoking shell cwd; use `run --cwd pwa`, or explicit npm `--prefix pwa`. Windows invokes the Node npm CLI, not a bare .cmd through CreateProcess. Root receipt/lock location stays at .artifacts/pwa-port even for contained child cwd. Source mutations/checks use the controller; use own working-tree --repo for a worker. Busy75 exits quietly; incomplete76 requires inspection/reconciliation; duplicate77 never reruns. Inspect saved intent/start/result/process/side effects before retrying. Preserve all dirty or partial files. Windows suspended-child launch gap and POSIX descendant limits remain documented.

An initial unprefixed npm install/ci ran at monorepo root because of the default cwd; tracked root package/lock were unchanged, ignored dependencies were populated and retained. Actual PWA clean install subsequently used its own independent lock. The explicit cwd drill now prevents accidental scope assumptions.

## Worktrees and models

No worker or known preview/install command remains active after this checkpoint; inspect live state on resume. Completed workers are not duplicate-work authorization. Preserve:

- Acquiring-pwa-run-control:codex/pwa-run-control,c48f40c,integrated.
- Acquiring-pwa-ui-shell:codex/pwa-ui-shell,19b495d,integrated.
- Acquiring-pwa-data-compat:currently codex/pwa-sqlite-safety,33b9aec,integrated. Reused this clean checkout for T02 and bounded T03/T05; branches codex/pwa-data-compat3c9862f and codex/pwa-music-theoryda1913c remain preserved.
- Existing audit-foundation/audit-aural worktrees and all .branch-recovery worktrees untouched. No branch/worktree/stash deletion or cleanup.

MODEL_ROUTING.md records actual assignments: GPT-6.1 Sol/high for recovery/data/theory/storage safety; GPT-6 Luna/medium for the bounded header component. At most coordinator plus one worker; only coordinator changes shared contracts/dependencies/lockfile/CI/routing/task claims. Reuse a suitable clean checkout after recording ownership; no silent coordinator-model switch.

## Resume and next bounded work

Last live allowance:70%five-hour/46%weekly. No new slices/workers at70%; finish recoverable checkpoint and yield. At80%or exhaustion save and yield. Read live limits every run/boundary; do not infer resets or redeem credits. Follow RUNBOOK.md. Automation resume-acquiring-pwa-audit is ACTIVE under Resume Acquiring PWA implementation, hourly in this same chat. Keep it active until implementation is complete or remaining work requires owner action; stay quiet on unchanged/non-actionable runs. Do not create a duplicate.

After capacity returns, inspect this handoff, tasks, Git, agents/processes and receipts. Continue T05 actual catalog worker/importer against existing chunks, or the independent remaining T03 chord/voicing lane; record one bounded slice and frozen interfaces before delegation. Full offline catalog, physical Android/iPhone/iPad/Safari, audio/microphone and real OAuth/two-device sync remain future gates. Pause only the affected gate and continue independent authorized work. Do not mark unrun device or provider checks passed.
