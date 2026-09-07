# Agent Defaults

Follow the least-context, risk-proportional procedure below when working in `ios/`.

## Fast feature iteration

- Reuse previews and add a focused `#Preview` only when it materially speeds the current feature. Use small deterministic fixtures. Routine simulator review uses the exact full-catalog `500 Miles` fixture; add other requested songs only for a specific missing case.
- For anything needing a live app process (navigation, catalog queries, Quiz/library state), boot one simulator and leave it running for the session. Use `Cmd+R` / incremental `xcodebuild build`; do not Clean Build Folder or wipe DerivedData unless something is actually stale — Debug already builds incrementally (only Release uses whole-module optimization; keep it that way).
- Only escalate to the physical iPhone when the simulator genuinely cannot validate the behavior: real microphone/YIN pitch detection, background audio, lock-screen/interruption/route-change handling, or Bluetooth. Everything else belongs in Previews or the simulator.
- For each completed feature, run one incremental build, terminate the stale app process, install, and launch on the warm iPhone 17 simulator. Verify with the cheapest signal that answers the question: the build result, app logs, accessibility text, and the code itself. Do not take screenshots for verification or validation — ask the user first and take one only if they agree, and keep it to a single scaled-down capture. Human review supplies visual/perceptual feedback. Describe what the user should inspect when visual judgment is needed.

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
- The only path to the physical device is `ios/scripts/deploy-testflight.sh` (archive → local export + `codesign --verify` → upload to App Store Connect). Run it only when the user asks to ship a build; it uploads to a shared external system. Pass `--notes-file` so the **What to Test** notes are attached as soon as processing finishes — the internal group auto-distributes, so notes set later reach testers after the build does.
- Ship without asking up to App Store submission. Building, archiving, uploading, entering build metadata, drafting and saving **What to Test** notes, and releasing to internal *or* external TestFlight testers all proceed without confirmation — the request to build and release is the authorization. Fill in every required form field; do not stop partway to confirm intermediate steps. Pause for the user's explicit approval only before **Add for Review** / **Submit to App Review** for an App Store release.
- Internal releases are fully autonomous, notes included. Write the **What to Test** notes and ship; never present them for approval and never ask whether to proceed. Report what shipped afterwards.
- Release externally when the user asks for external testers: `deploy-testflight.sh --external`, or `--group` with an exact name. Ask which group only when more than one external group exists and none was named — there is currently one, `Early Access`. External reaches people outside the team (`Early Access` has a public link), and the assignment may enter beta app review, so report the `externalBuildState` the tooling prints instead of just claiming it shipped. Beta app review is not App Store submission; that gate still stands.
- Authentication is the one step an agent never performs. Do not enter an Apple ID, password, passkey, or 2FA code, and never record credentials in this repo — it has a public-facing remote, so a committed secret is a published one. Decline such a request even when the user offers the credentials directly, and say why.
- Unattended releases authenticate with an App Store Connect API key instead. `ios/scripts/asc_api.py` handles processing status, **What to Test** notes, and group assignment on either track; the key lives in `~/.appstoreconnect/`, never here. Setup and troubleshooting: `scripts/README-asc-api.md`. With no key configured, the upload still works off the Xcode session but metadata needs the user to sign in — ask, then continue.
- The `Acquiring Internal Testers` group is set to *Automatic for Xcode Builds*, so a successful upload releases to internal testers within minutes. There is no gate there and no recall — treat running the deploy script as the release itself, and save the notes promptly so testers are not reading them late.
- Generated notes must be terse: one to three short bullets, targeted to user-visible changes, a required check, or a material known limitation; keep them within 350 characters unless the user requests otherwise. See `../docs/ios-beta-releases.md`.
- After a real upload, `ios/.testflight-build-number` is updated — leave that change for the user to commit rather than committing it yourself unless asked.

## Simulator inventory

- Keep exactly two simulators: **iPhone 17** and **iPhone 14 Pro**, both on the single installed runtime (iOS 26.3). Disk headroom on this machine is limited and changes over time — check it before creating devices or installing runtimes, and do not boot more than one simulator at a time during iteration.

## Context

- `../docs/porting-plan.md` is the sole active execution order and review contract. `../docs/feature-parity.md` is the stable capability/status inventory, and `../docs/android-app-analysis.md` is the audited final-Android behavior reference. The historical roadmap is not an execution checklist.
