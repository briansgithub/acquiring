# iOS TestFlight checkpoints — September 2026

This is historical deployment context moved out of the active iOS porting plan.
It is not an implementation checklist or current parity statement.

## Builds 1 and 2 — September 1

- The App Store Connect agreement, explicit App ID, and private app record were
  created for `com.acquiring.ios` (App Store Connect app ID `6807512572`).
- Xcode created cloud-managed Apple Distribution assets and the App Store
  profile. Build 1 was archived, validated, uploaded, processed, attached to
  `Acquiring Internal Testers`, and installed on an iPhone 14 Pro.
- Version 1.0 (2) was archived from `c38b074a`, including the All Songs grouping
  changes and iPad UI-test scrolling correction later merged to `main` at
  `ac699387`. GitHub Actions run `33573904460` passed before deployment.
- The 6.1 MB IPA passed strict codesign verification, contained the expected
  TestFlight entitlement and privacy manifests, and had matching arm64
  executable/dSYM UUIDs. No public release or external-testing submission was
  made.

## Build 3 — September 2

- Version 1.0 (3) was archived from `38d4dbfe`, incorporating `main` through
  `3b844da3` and the accepted seven-colored-spheres icon. App code and
  dependencies were otherwise unchanged from build 2.
- Local and upload exports succeeded. The 5.1 MB IPA passed strict codesign
  verification, contained the Apple Distribution identity, TestFlight
  entitlement, and both privacy manifests, and had matching executable/dSYM
  UUIDs.
- Apple processed build 3, attached it to the internal tester group, and
  confirmed installation on the iPhone 14 Pro. Physical-device icon and
  functional smoke review remained human evidence gates.

## Build 4 — September 4

- User explicitly requested committing the accumulated work and releasing a
  TestFlight update. Version **1.0 (4)** contains app commit `90396942`: Quiz
  timelines, reset/section continuity, tap and inertial seeking, draggable
  transport placement, and the smooth live-tempo correction. Later parity
  features, including chord arpeggiation, remain unimplemented.
- Apple accepted and processed build 4 (build ID
  `63afdfca-7cd6-49cb-a7d0-bf948abbf3e6`) and attached it to **Acquiring Internal
  Testers**, one tester. Focused `500 Miles` review instructions were saved in
  What to Test. No external-group submission or public App Store release was
  made. Installation and perceptual review on the iPhone remain human steps;
  pending feature reviews and the explicit full-testing gate are unchanged.
- Repaired the deployment script to ad-hoc sign the local archive without a
  development-device profile, prioritize system `rsync`, and verify the signed
  app extracted from the IPA instead of trying to verify the ZIP container.
  The generated `ios/build/` directory is now ignored by Git. Recorded build
  number is 4; the next normal deployment will select 5.
- The repaired archive command produced `ARCHIVE SUCCEEDED`. Editing a script
  comment while it was running interrupted the subsequent shell command, so
  export and upload were resumed directly from the completed archive; the
  entire script was not rerun end-to-end. Both exports below returned exit 0;
  upload reported `Upload succeeded`. The 5.1 MB IPA's extracted app passed
  strict signature verification, with bundle ID `com.acquiring.ios`, version
  1.0, build 4, and Apple Distribution team `XJHRX7Q6U9`.
- Release-only checks ran; no app test suites or screenshot inspection ran.
  `bash -n ios/scripts/deploy-testflight.sh` and scoped `git diff --check` passed.

Exact resumed export/upload and signature-verification commands (all exit 0):

```sh
env PATH=/usr/bin:/bin:/usr/sbin:/sbin xcodebuild -exportArchive -archivePath /Users/brian/Desktop/acquiring/ios/build/Acquiring.xcarchive -exportPath /Users/brian/Desktop/acquiring/ios/build/export-local -exportOptionsPlist /Users/brian/Desktop/acquiring/ios/ExportOptions-Local.plist -allowProvisioningUpdates
codesign --verify --deep --strict /Users/brian/Desktop/acquiring/ios/build/verify.k8gNYY/Payload/Acquiring.app
env PATH=/usr/bin:/bin:/usr/sbin:/sbin xcodebuild -exportArchive -archivePath /Users/brian/Desktop/acquiring/ios/build/Acquiring.xcarchive -exportPath /Users/brian/Desktop/acquiring/ios/build/export-upload -exportOptionsPlist /Users/brian/Desktop/acquiring/ios/ExportOptions-TestFlight.plist -allowProvisioningUpdates
```

## Build 5 — September 4

- User explicitly authorized uploading **1.0 (5)** with the iPhone audio-session
  fix (Sol/high) and the Settings update shortcut. Built from `3fa3bb55` plus
  the uncommitted changes in `AudioSystem.swift` and `LibraryViews.swift`; the
  exact app-source diff is retained in `ios/build/build5-source-changes.patch`.
- `ios/scripts/deploy-testflight.sh --build 5` passed end-to-end (exit 0): Release
  archive, local export, strict signature verification of the extracted app,
  and App Store Connect upload. The 5.1 MB package has bundle ID
  `com.acquiring.ios`, version 1.0, build 5, and Apple Distribution team
  `XJHRX7Q6U9`. No app test suite or screenshot inspection ran.
- Apple completed processing (build ID
  `e536c4ed-3639-4404-a154-f7cea0536c06`) and attached it to **Acquiring Internal
  Testers**, one tester. Saved What to Test notes request an in-place update,
  `500 Miles` playback without the OSStatus -50 alert, chord preview, live
  tempo/zero-pause review, and the Settings → TestFlight shortcut. Physical
  installation/audio confirmation remains the user's review; the full-testing
  gate and pending feature approvals are unchanged.
- No external-testing submission, public release, Git commit, or push was
  performed. The recorded build number is 5; the next default deployment uses
  6. Existing Android changes remain untouched. Build 4 artifacts were
  preserved at `/Users/brian/Desktop/acquiring-testflight-build4.XYLsM2/build`.

## Delivery constraints recorded at the checkpoint

- Direct USB installation was unavailable because the development Mac could
  not establish the required pairing with the iPhone. TestFlight was the only
  working real-device delivery route.
- The developer account used Team `XJHRX7Q6U9`. Exports from the ad-hoc archive
  required an explicit `teamID`, the system `rsync`, and a fresh
  `CURRENT_PROJECT_VERSION`.
- The project already contained an opaque 1024x1024 icon, background-audio and
  microphone usage declarations, export-compliance configuration, and required
  privacy manifests.
- The catalog artifact fetched successfully and passed gzip, SQLite
  `quick_check`, schema/index, and payload validation. The distribution contract
  retained a minimum browse-row floor of 40,609.

For present-day delivery instructions, use `ios/AGENTS.md` and
`ios/scripts/deploy-testflight.sh`. Upload only when the user explicitly asks.
