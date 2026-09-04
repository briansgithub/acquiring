# Agent Defaults

Follow the least-context, risk-proportional procedure below when working in `ios/`.

## Dev loop: Previews first, one warm simulator second, device last

- Give every new or materially changed visual component a `#Preview`. Inject a stub `AppEnvironment` with small fixture data rather than the real catalog — previews only recompile the view's dependency slice and stay warm between edits, which is the fastest possible loop on this machine's CPU (2014 quad-core, no Apple Silicon).
- For anything needing a live app process (navigation, catalog queries, Quiz/library state), boot one simulator and leave it running for the session. Use `Cmd+R` / incremental `xcodebuild build`; do not Clean Build Folder or wipe DerivedData unless something is actually stale — Debug already builds incrementally (only Release uses whole-module optimization; keep it that way).
- Only escalate to the physical iPhone when the simulator genuinely cannot validate the behavior: real microphone/YIN pitch detection, background audio, lock-screen/interruption/route-change handling, or Bluetooth. Everything else belongs in Previews or the simulator.
- After implementing each feature or UI change (not just at the end of a batch), rebuild, reinstall, and relaunch the app in the simulator and check it visually (screenshot) before moving on or reporting the change as done. Terminate any previously running instance first — a stale process (especially one launched with `--ui-testing`, which points at a fake catalog URL) can otherwise be mistaken for the new build.

## Atomic parity workflow

- Work on exactly one numbered checkpoint from `../docs/porting-plan.md` at a time. Before editing, inspect both the feature's first Android commit and its final production caller at `android-parity-ios-v1`; tests or declarations without a production caller do not establish parity.
- Reuse the existing package, catalog, audio, and state infrastructure. Add the narrowest focused unit/store test and one focused XCUITest for the checkpoint; do not grow a multi-feature navigation test.
- Close the simulator loop autonomously: build, reinstall, terminate the stale app, relaunch, exercise the interaction, and save the review state with an `XCTAttachment` screenshot.
- Present the checkpoint's final Android behavior, interaction script, screenshots, exact checks/results, and deliberate native-iOS adaptations for human review. Stay on the same checkpoint for critique and do not start the next one until approval. Commit only the approved checkpoint and its focused evidence.

## Real device delivery: TestFlight only

- Direct USB installs (Xcode Run to device, wireless debugging, Apple Configurator, sideloading) do not work on this development Mac: `usbmuxd` rejects the iPhone at the pairing layer (`deviceRequiresMuxConfiguration: kCDCDoNotMatchThisDevice is NULL`), reproduced identically across a clean reboot. This is a structural issue tied to running a root-patched/unsupported macOS install on 2014 hardware, not a transient state — do not re-diagnose it from scratch each session.
- The only path to the physical device is `ios/scripts/deploy-testflight.sh` (archive → local export + `codesign --verify` → upload to App Store Connect). Run it only when the user asks to ship a build; it uploads to a shared external system.
- After a real upload, `ios/.testflight-build-number` is updated — leave that change for the user to commit rather than committing it yourself unless asked.

## Simulator inventory

- Keep exactly two simulators: **iPhone 17** and **iPhone 14 Pro**, both on the single installed runtime (iOS 26.3). Disk headroom on this machine is limited and changes over time — check it before creating devices or installing runtimes, and do not boot more than one simulator at a time during iteration.

## Context

- `../docs/porting-plan.md` is the sole active execution order and review contract. `../docs/feature-parity.md` is the stable capability/status inventory, and `../docs/android-app-analysis.md` is the audited final-Android behavior reference. The historical roadmap is not an execution checklist.
