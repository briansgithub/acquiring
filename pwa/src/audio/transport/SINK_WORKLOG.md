# PCM sink checkpoint

2026-10-16 Sol/high sole worker. Root frozen ddcd7d887ed9d90c0dc5e6d3f415e106256ce160, sink-contracts.ts read-only. Clean sibling cc525d4e and guard0recovery inspected; new codex/pwa-pcm-sink preserves all earlier branches/ignored artifacts. Own only pcm-queue-sink.ts/.test.ts, SINK_WORKLOG.md and index.ts. Implement synchronous bounded AudioBuffer queue, shared owner permission/epoch, exact opaque run identity, selected clock and pure playback-clock. No worker/context/preview/clock/DSP/App/catalog/contracts/deps/task edits. Focused fake/types only if below70%; partial checkpoint explicitly permitted. Live64%/47% at start; no new operation/check at70%, checkpoint by80%.

2026-10-16 CAPACITY CUTOFF PARTIAL, NOT ACCEPTED/VALIDATED: live70%five-hour/48%weekly after narrow type fix07. Source implements the five methods and exports, but only four initial fake groups are saved (target~12 remains incomplete). No fake test has run. No browser/integration/native recapture/DSP/build check run. Initial scoped types06 FAILED: TS2352 fake subscribeInvalidation callback omitted reason; TS2322 AudioTimestamp.contextTime is optional in current DOM types. Fix07 supplied callback reason and explicit missing-clock rejection. Fixes are UNRETESTED at cutoff. No known passing sink check. Do not integrate or mark T08 complete.

Recorded commands:
- pcm-sink-types-20261016-06: python pwa/scripts/run-control/run_control.py --repo H:/Desktop/Acquiring/Acquiring-pwa-data-compat run --run-id pcm-sink-types-20261016-06 --owner preview_owner --task pcm-sink --next-action capacity-checkpoint --cwd pwa -- node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/typescript/bin/tsc --project ../.artifacts/pwa-port/t08-sink-tsconfig.json — FAILED2errors.
- pcm-sink-type-fix-20261016-07 — corrected exactly those errors, unverified.
- Next after renewed capacity: guarded scoped types with new unique run ID and same tsc child; then guarded node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/vitest/vitest.mjs run --config ../.artifacts/pwa-port/t08-sink-vitest.config.mjs (--cwd pwa). Then finish/review missing bounded fake acceptance: queue/frame/resource caps, forged/duplicate/stale/invalid inputs, permission without observer, gap/underrun holds, source/allocation failures, late callbacks/reentrancy and release. At most2fix/retest cycles per failure remains required.

No long-lived worker/server was started. Initial process probe01 found only its Python guard. All launched child commands (including failed tsc06 and fix07) returned. Initial guard had0recovery-required runs; exact final status follows in tool receipt. Four assigned paths only; all earlier branches/ignored artifacts preserved. Save named partial commit preserving ddcd7d88 ancestry and return idle.

Partial source SHA256:
- pcm-queue-sink.ts 6a423fa9b55e1342b1b7d7269954453d5d49c31d1ae6d2506e992bb73c06a95e
- pcm-queue-sink.test.ts 7692939a5c89fdf2045d34f5a067b75b16216be812af901947914615b91169ca
- index.ts d83b70f45f0af834e1d6087b43a3430efbd559c0bbdf8f879f4c7757e1742e92

2026-10-16 capacity resumed5%/50%, same branch/partial4799fba8. Required first retest15 strict typesPASS; initial4fakegroups16PASS. Root authorized bounded missing acceptance and synchronous reentrancy review. Isolate per-run resources and detach before retirement; old allocation/start/stop failures must never flush newer runs. Snapshot known input metadata once and copy PCM before host allocation hooks. No new branch/fixture/dependency/contract changes.

Expanded milestone20 strict typesPASS;21 fakes43/44PASS, one test compared seconds*48000 to integer961 and received961.0000000000001. Corrected assertion compares exact start argument to integerFrame/rate (no production math change). Added last bounded getter/clock/permission/cleanup cases; no fixture/browser/DSP checks. Live13%/51% before21.

2026-10-16 VALIDATED SOURCE CHECKPOINT supersedes the partial/unvalidated status above for this bounded sink source only. Same codex/pwa-pcm-sink, parent4799fba8108caa42af0a7ecbfdce578714ec6cdb preserved. Required saved type fixes first retested15PASS; saved4fakegroups16PASS. Final strict types23PASS and51focused fake tests24PASS778ms; final whitespace28PASS. One expanded test21 failed only exact seconds*48000 equality (961.0000000000001 versus961); assertion now compares the actual start argument directly to integerFrame/rate, no production math relaxed. This was one diagnose/fix/retest cycle and final24 passes.

Exact final commands, each under python pwa/scripts/run-control/run_control.py --repo H:/Desktop/Acquiring/Acquiring-pwa-data-compat run --owner preview_owner --task pcm-sink:
- run-id pcm-sink-final-types-20261016-23, --cwd pwa -- node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/typescript/bin/tsc --project ../.artifacts/pwa-port/t08-sink-tsconfig.json — PASS0.
- run-id pcm-sink-final-fakes-20261016-24, --cwd pwa -- node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/vitest/vitest.mjs run --config ../.artifacts/pwa-port/t08-sink-vitest.config.mjs — PASS51/1file778ms.
- run-id pcm-sink-final-whitespace-20261016-28, git diff --check — PASS0.

Exact tested SHA256:
- pcm-queue-sink.ts 360bc7cd305f65234b8b0df9b3b8fbf2a6e87acd80a0c9cd82e5d5a5aaab21ac
- pcm-queue-sink.test.ts 53a6c91f633646ac99ee99b8137b2cee7d53c95647be334b6c65a07dbf703bcc
- index.ts d83b70f45f0af834e1d6087b43a3430efbd559c0bbdf8f879f4c7757e1742e92 (unchanged from partial)
- frozen sink-contracts.ts 9263903b4e121061146629127722c1e8dad51f284c8b8cb1f804954947b41e05 (unchanged)

Coverage: actual44100/48000 conversion and integer scheduling arguments;80ms priming/20ms lead; explicit short final/sealing; queue horizon and separate512 staged/mapping/live-source caps; malformed metadata/PCM, exact opaque identities and duplicate/stale IDs; one-read known metadata getters and input sample ownership; selected output clock0/fallback, gaps/drain/prune independent of ended events; permission loss with/without callbacks; allocation/channel/source/connect/start/owner/time failures; release and nested replacement via getters/owner/clock/allocation/source/start/stop hooks; late callbacks and old cleanup cannot flush a newer generation. Invalid candidate begins preserve the current run. Begun revisions retain/increase across flush. Reentrant enqueue on the same active run rejects STALE_RUN and never queues; replacement begin is allowed and supersedes the old operation.

Resource notes: packet samples are snapshotted into a bounded <=4096 Float32Array before host allocation callbacks; queue caps are checked before AudioBuffer/source allocation and checked again after host callbacks. Old per-run resources are detached before retirement; uncertain failure discards only its own generation. Selected time never switches/extrapolates/blends. Sources stop/disconnect immediately on flush/release/invalidation; borrower never resumes/closes the application owner. No timer/worker/transport owner/App wiring or completion claim.

No native fixture recapture/DSP/full build/combined/browser checks run by this worker; coordinator owns real-browser acceptance/integration. No context/preview/clock/worker/contracts/catalog/App/dependency/task source touched. Only three paths modified in this resumed commit; index export already preserved in partial. All child commands returned; no persistent worker/server started. Last live15%five-hour/52%weekly. Next: named validated commit, exact tip/clean receipt, then idle.

2026-10-16 root review received just after clean validated ae41f18185a1a5098a8c8ae43748a6168d8913a4 commit. Preserve that checkpoint; bounded follow-up reconciles permission after old-node retirement in begin, because stop/disconnect hooks may invalidate canRender/epoch/state without observer. One-line permission(next) and focused old.stop no-callback denial regression only, then scoped tests/types and separate commit.

Post-retirement follow-up37 strict typesPASS;38 focused fakes52PASS887ms. Commands identical to final23/24 above with unique run IDs pcm-sink-retirement-types-20261016-37 and pcm-sink-retirement-fakes-20261016-38. No failure/fix cycle. Live20%/52%. This supersedes final source/test digests above; contract/index remain unchanged. No browser/combined/DSP checks.
- pcm-queue-sink.ts SHA256 de5ef1ac20a546a750166e712f979837b31810e9cd5dd690a2bc76bb82cfd712
- pcm-queue-sink.test.ts SHA256 6b13dbd57f40bc1e6514b8414cd6de078953579ca227ff7492a7a09dce2be3bf


Root acceptance2026-10-16: exact61793c29 normalmerge5e3bbc38. window9-sink-combined-unit-20261016:143coveringtransporttestsPASS. window9-sink-combined-build-20261016:combinedstrict types/buildPASS,shell4ec181123f24. window9-sink-browser-first-20261016:2actualChromePASS10.4s,44100defaultoutputtimestamp/48000explicitrenderclock, actualsignedPCM snapshot/nonzeroanalyser/integercontiguousschedule/drain, actualsuspendpermission/newgesture/flush/releaseandnewborrowerwithoutcontextclose. Sources5e3bbc38 plus3namedrootbrowserfixtures;uniqueper-testproof.jsonretained. No native/DSP recapture,Appfullstream/physicalhearing/Safari/trustedvisibility acceptance. WholeT08remainsopen.
