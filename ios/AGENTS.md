# Agent Defaults

Follow the least-context, risk-proportional procedure below when working in `ios/`.

## Fast feature iteration

- Reuse previews and add a focused `#Preview` only when it materially speeds the current feature. Use small deterministic fixtures. Routine simulator review uses the exact full-catalog `500 Miles` fixture; add other requested songs only for a specific missing case.
- For anything needing a live app process (navigation, catalog queries, Quiz/library state), boot one simulator and leave it running for the session. Use `Cmd+R` / incremental `xcodebuild build`; do not Clean Build Folder or wipe DerivedData unless something is actually stale — Debug already builds incrementally (only Release uses whole-module optimization; keep it that way).
- Only escalate to the physical iPhone when the simulator genuinely cannot validate the behavior: real microphone/YIN pitch detection, background audio, lock-screen/interruption/route-change handling, or Bluetooth. Everything else belongs in Previews or the simulator.
- For each completed feature, run one incremental build, terminate the stale app process, install, and launch on the warm iPhone 17 simulator. Inspect code and accessibility text; never inspect screenshots. Human review supplies visual/perceptual feedback. Describe what the user should inspect when visual judgment is needed.

## Dependency-based parity workflow

- Work on one feature from groups A–F in `../docs/porting-plan.md`. Read the final Android behavior and existing iOS caller; revisit history only for an ambiguity not resolved by the audit.
- Preserve existing package, catalog, audio, state, and persistence implementations. Complete each feature's visible behavior, errors, and accessibility before review; avoid separate shell/wiring checkpoints.
- Use one implementer per feature: Terra for UI/integration, Sol for audio/timing/microphone/concurrency, Luna for simple isolated changes. Delegate only substantial independent work; avoid routine documentation/reviewer agents.
- Report the actual model, concise change summary, exact checks/results, and a two-to-four-step review script. Update status once at handoff. Stop for human critique; advance when approved or directed onward. Preserve pending older review statuses. Commit only approved, separable changes and preserve unrelated/uncommitted work.

## Testing requires a separate final gate

- During feature iteration, build/install/launch and human review are the default. Use focused diagnostics/regression tests only for a concrete failure or material correctness risk; do not add tests merely to mirror implementation.
- No routine full suites, screenshots, multi-device matrices, broad audits, or phase-boundary test sweeps.
- After A–F implementation, present known gaps and proposed full-test scope, then wait for explicit user approval before full-app testing. Feature approval or a request to proceed with implementation does not authorize that testing.
- Once approved, verify app/package/UI regression, full catalog, clean install/upgrade/offline/recovery, persistence, accessibility/device coverage, and audio/microphone lifecycle. Fix findings and rerun affected checks. TestFlight/release remain separately authorized.

## Real device delivery: TestFlight only

- Direct USB installs (Xcode Run to device, wireless debugging, Apple Configurator, sideloading) do not work on this development Mac: `usbmuxd` rejects the iPhone at the pairing layer (`deviceRequiresMuxConfiguration: kCDCDoNotMatchThisDevice is NULL`), reproduced identically across a clean reboot. This is a structural issue tied to running a root-patched/unsupported macOS install on 2014 hardware, not a transient state — do not re-diagnose it from scratch each session.
- The only path to the physical device is `ios/scripts/deploy-testflight.sh` (archive → local export + `codesign --verify` → upload to App Store Connect). Run it only when the user asks to ship a build; it uploads to a shared external system.
- After a real upload, `ios/.testflight-build-number` is updated — leave that change for the user to commit rather than committing it yourself unless asked.

## Simulator inventory

- Keep exactly two simulators: **iPhone 17** and **iPhone 14 Pro**, both on the single installed runtime (iOS 26.3). Disk headroom on this machine is limited and changes over time — check it before creating devices or installing runtimes, and do not boot more than one simulator at a time during iteration.

## Context

- `../docs/porting-plan.md` is the sole active execution order and review contract. `../docs/feature-parity.md` is the stable capability/status inventory, and `../docs/android-app-analysis.md` is the audited final-Android behavior reference. The historical roadmap is not an execution checklist.
