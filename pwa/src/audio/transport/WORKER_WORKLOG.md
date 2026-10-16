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
