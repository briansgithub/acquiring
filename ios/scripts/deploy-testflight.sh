#!/usr/bin/env bash
# Archive, verify, and upload the Acquiring iOS app to TestFlight.
#
# This is the only supported way to get new code onto the test iPhone:
# direct USB debug installs (Xcode Run, wireless debugging, Apple
# Configurator, sideloading) are all blocked on this Mac because usbmuxd
# cannot pair with iOS 17+ devices here (see docs/porting-plan.md,
# "Known environment and integration issues"). Every deploy goes through
# this script and Apple's TestFlight processing.
set -euo pipefail

IOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$IOS_DIR/Acquiring.xcodeproj"
SCHEME="Acquiring"
TEAM_ID="XJHRX7Q6U9"

BUILD_DIR="$IOS_DIR/build"
ARCHIVE_PATH="$BUILD_DIR/Acquiring.xcarchive"
LOCAL_EXPORT_DIR="$BUILD_DIR/export-local"
UPLOAD_EXPORT_DIR="$BUILD_DIR/export-upload"
BUILD_NUMBER_FILE="$IOS_DIR/.testflight-build-number"

BUILD_NUMBER=""
SKIP_UPLOAD=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [--build N] [--skip-upload]

  --build N       Use build number N (default: last recorded build + 1)
  --skip-upload   Archive and locally export/verify only; do not upload to
                  App Store Connect and do not advance the recorded build
                  number. Use this to sanity-check a build before shipping it.

Every successful upload records its build number in:
  $BUILD_NUMBER_FILE
Commit that file so the next run picks the correct next number.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)
      BUILD_NUMBER="$2"
      shift 2
      ;;
    --skip-upload)
      SKIP_UPLOAD=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$BUILD_NUMBER" ]]; then
  LAST=0
  if [[ -f "$BUILD_NUMBER_FILE" ]]; then
    LAST="$(cat "$BUILD_NUMBER_FILE")"
  fi
  BUILD_NUMBER=$((LAST + 1))
fi

echo "==> Acquiring iOS — build $BUILD_NUMBER"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "==> Archiving (Release, generic iOS device)"
xcodebuild archive \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE_PATH" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  DEVELOPMENT_TEAM="$TEAM_ID"

echo "==> Exporting a local IPA for verification"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$LOCAL_EXPORT_DIR" \
  -exportOptionsPlist "$IOS_DIR/ExportOptions-Local.plist" \
  -allowProvisioningUpdates

IPA_PATH="$(find "$LOCAL_EXPORT_DIR" -maxdepth 1 -name "*.ipa" | head -1)"
if [[ -z "$IPA_PATH" ]]; then
  echo "error: local export did not produce an .ipa" >&2
  exit 1
fi

echo "==> Verifying code signature"
codesign --verify --deep --strict "$IPA_PATH"
echo "    OK ($(du -h "$IPA_PATH" | cut -f1)): $IPA_PATH"

if [[ "$SKIP_UPLOAD" == true ]]; then
  echo "==> --skip-upload set: stopping here. Build number $BUILD_NUMBER was NOT recorded."
  exit 0
fi

echo "==> Uploading build $BUILD_NUMBER to App Store Connect"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$UPLOAD_EXPORT_DIR" \
  -exportOptionsPlist "$IOS_DIR/ExportOptions-TestFlight.plist" \
  -allowProvisioningUpdates

echo "$BUILD_NUMBER" > "$BUILD_NUMBER_FILE"

cat <<EOF
==> Done. Build $BUILD_NUMBER uploaded.

Apple usually finishes processing in 5-15 minutes. Check:
  App Store Connect -> Acquiring -> TestFlight -> Acquiring Internal Testers

Once it shows as installed, open TestFlight on the iPhone 14 Pro and update.

Recorded build number $BUILD_NUMBER in:
  $BUILD_NUMBER_FILE
Commit that file so the next deploy uses build $((BUILD_NUMBER + 1)).
EOF
