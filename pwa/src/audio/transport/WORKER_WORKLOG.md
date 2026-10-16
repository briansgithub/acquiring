# PCM worker checkpoint

2026-10-16: Sol/high, sole worker. Clean sibling clock2a38ff5a inspected; root assigned new codex/pwa-pcm-worker from fb879a5cf99a2c062348a6a8148a61451b47adb4. Guard has no recovery-required runs. Preserve every older branch and ignored artifact. Scope: session/client/module entry, focused tests, index exports only. Root-frozen worker-contracts.ts read-only; no context/preview/clock/timeline/DSP/App/catalog/dependency edits. Implement one outstanding command, strict identity/revision and bounded immutable snapshots; render unchanged256-frame calls (max4096 batch); terminate uncertain work permanently. Validate scoped tests/types using existing primary dependencies; no fixture recapture/browser/full DSP checks. Initial allowance12%/39%. First process probe quoting failed before inspection; corrected literal probe records process state.

2026-10-16 validation checkpoint: final source passed25 focused tests/2files and strict types; no browser/module-worker end-to-end/full-DSP/combined build was run. Existing native-stream.json reused unchanged: first127-frame and following256-frame SINE blocks at1000/48000Hz (four native observations), authority801cf7984171d772afc4406ddb5c79c0cb7fd20a; fixture SHA2563860997b29171066c18c698215aa0b99363f28282a2d40884f9569318f8694e8. Direct unchanged renderer comparisons cover256/257/4096 frames, gain/config changes and successive batches. Other focused cases cover identity1/duplicates, revisions, overlap preflight, alias isolation, zeroBPM/loop/once/seek/reset, exact buffer transfer, cancellation/deadline/worker faults/protocol failures and release reentrancy.

Commands (all through run_control.py --repo sibling run --owner preview_owner --task pcm-worker; Node --cwd pwa):
- pcm-worker-final-tests-20261016-18: node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/vitest/vitest.mjs run --config ../.artifacts/pwa-port/t08-worker-vitest.config.mjs — PASS25 tests,555ms.
- pcm-worker-final-types-20261016-19: node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/typescript/bin/tsc --project ../.artifacts/pwa-port/t08-worker-tsconfig.json — PASS.
- pcm-worker-whitespace-20261016-21: git diff --check — PASS.
Initial type check10 found one implicit callback parameter due Worker/structural-port union; explicit structural port annotation fixed it; retest13 and final19 pass. Initial process command01 quoting failed; literal process03 succeeded (only its guard Python visible). No test failure or discarded work.

Exact tested source SHA256:
- pcm-worker-session.ts a7c343bb9f7e26d5005e919effdd2e800726607923ff50551c59b9895975f090
- pcm-worker-session.test.ts 679eafff9fa04ef852558be3e96493cf513ece4ac8ca987728dd2f8d4f5b3b3d
- pcm-worker-client.ts a321edd92758f62ecfbae3ec903d1e22004ac03ae14ed144770828b295787133
- pcm-worker-client.test.ts 6c3f2586c2b300ad2aab0e810b764ade344d9d1b6f4a9fba77cdcb569a285edf
- pcm-worker.ts 5d167307f87226f54282c13f4ae1eaf2fc7aa17adbbdca91c02ff4fadc13aece
- index.ts b41e67c814823886c01be180a516e4e7bce05648eec3f90106791eb185f2a71d
- frozen worker-contracts.ts d6ee8a6ff785eac4db25d56cbc8775293dc88dde1a03ca74d04690abeae1aaed

Runtime semantics: malformed session envelopes use identity0 only when no valid identity can be echoed and terminate the session; client rejects such replies. Client snapshots structural bounds before posting; renderer-specific frequency/overlap preflight remains inside unchanged renderer constructor (transactional load). Any thrown seek/configure/render failure permanently discards state. Only INVALID_INPUT/NOT_LOADED/STALE_REVISION can be nonfatal remote errors. No retry or drain/reset after uncertain posted commands. Factory creation is lazy; release is permanent even during factory reentrancy. Existing application/preview/clock/timeline/DSP and contracts unchanged. No streaming sink/owner, application wiring, speaker claim or T08 completion. Coordinator owns integration and actual-browser acceptance. Last live allowance25%five-hour/41%weekly. Next: narrow named commit; report exact tip and clean state, then idle.


Staged whitespace check25 caught terminal blank lines in newly added files (unstaged diff --check did not inspect untracked files). Removed only terminal blank lines, retained all source behavior; final check rerun under27/28/29 below.

Final normalized source validation: pcm-worker-final-tests-20261016-27 PASS25tests/2files560ms; pcm-worker-final-types-20261016-28 PASS; pcm-worker-final-staged-check-20261016-30 PASS. Commands identical to18/19 above, staged check git diff --cached --check. Source digests above reflect this exact normalized source; worklog-only receipt appended after those checks. Allowance26%/41%. All seven paths staged; unrelated files untouched.

2026-10-16 bounded root review follow-up on clean dfafbd7ce717dd155b9a8eac01d50757970b8085, same codex/pwa-pcm-worker. Root authorized only three corrections: retain unposted identity on factory-triggered abort, recheck release/pending after caller snapshot reentrancy, and ignore caller array iterators using cached bounded index traversal. Own session/client/tests/worklog only; contracts/entry/index and all earlier exclusions untouched. Guard has zero recovery-required runs; live31%/42%. Plan focused regressions plus scoped tests/types, separate commit preserving dfafbd7c.

2026-10-16 reviewed corrections validated unchanged command forms: pcm-worker-review-tests-20261016-39 ran node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/vitest/vitest.mjs run --config ../.artifacts/pwa-port/t08-worker-vitest.config.mjs (--cwd pwa), PASS29tests/2files644ms. pcm-worker-review-types-20261016-40 ran node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/typescript/bin/tsc --project ../.artifacts/pwa-port/t08-worker-tsconfig.json (--cwd pwa), PASS. No test/type failure. One attempted regression-write PowerShell payload failed parsing before any child/mutation; literal Python payload38 succeeded. Review42 confirms only requested identity/reentrancy/index-copy behavior changes.

Follow-up exact tested SHA256:
- pcm-worker-session.ts a7720013a59e5635d52cf4c4a046c3c785328d0c4c0ca35f463d4e1c3f05c190
- pcm-worker-session.test.ts 227e2ad5984a72c50b480d0e1be9dfb142e70da3bb4c79270617784f5567c8dc
- pcm-worker-client.ts b34f22e098616742dc47c23b439b27f126de92bd7db8a4eb0012e165264560b4
- pcm-worker-client.test.ts d48e88cc59e0c35106117b1a5df0990e025fad81d71c07464870f276db6b685e

Request IDs are consumed at posting, including uncertain throwing posts (terminal); unposted factory aborts keep the next ID. Caller snapshot getters cannot replace pending state or revive release. Copies never consult caller array iterators and retain cached lengths when element getters grow arrays. No contract/entry/index/DSP/fixture/browser/combined checks changed. Scope remains pure protocol/session/client, no sink/App wiring. Last live34%/42%; next separate validated follow-up commit and idle.
