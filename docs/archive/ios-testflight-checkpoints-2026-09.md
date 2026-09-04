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
