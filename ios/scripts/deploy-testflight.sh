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

# Xcode's export uses rsync options unsupported by this Mac's Homebrew rsync.
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

IOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$IOS_DIR/Acquiring.xcodeproj"
SCHEME="Acquiring"
TEAM_ID="XJHRX7Q6U9"

BUILD_DIR="$IOS_DIR/build"
ARCHIVE_PATH="$BUILD_DIR/Acquiring.xcarchive"
LOCAL_EXPORT_DIR="$BUILD_DIR/export-local"
UPLOAD_EXPORT_DIR="$BUILD_DIR/export-upload"
BUILD_NUMBER_FILE="$IOS_DIR/.testflight-build-number"

ASC_SCRIPT="$IOS_DIR/scripts/asc_api.py"
ASC_CONFIG="$HOME/.appstoreconnect/acquiring-asc.json"
ASC_KEY_DIR="$HOME/.appstoreconnect/private_keys"

BUILD_NUMBER=""
SKIP_UPLOAD=false
NOTES=""
NOTES_FILE=""
TRACK=""
GROUP=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [--build N] [--skip-upload] [--notes TEXT | --notes-file PATH]

  --build N          Use build number N (default: last recorded build + 1)
  --skip-upload      Archive and locally export/verify only; do not upload to
                     App Store Connect and do not advance the recorded build
                     number. Use this to sanity-check a build before shipping it.
  --notes TEXT       What to Test notes to attach once the build is processed.
  --notes-file PATH  Read those notes from a file instead.
  --external         Also release to the external tester group once processed.
                     Fails if more than one external group exists — name it with
                     --group instead of guessing which testers get the build.
  --group NAME       Release to this exact group. Overrides --external.

The internal group auto-distributes on upload, so it needs no flag. --external
covers people outside the team, including anyone holding the group's public
link; the script reports whether that assignment entered beta app review.

Authentication:
  Signing and upload use the Xcode-stored session. The post-upload metadata
  steps use an App Store Connect API key ($ASC_CONFIG
  plus AuthKey_<KEYID>.p8 in $ASC_KEY_DIR); without
  one, notes and group assignment must be done by hand in App Store Connect.
  See scripts/README-asc-api.md.

  This script never submits anything for review. Beta app review and App Store
  submission stay manual by design; see ../docs/ios-beta-releases.md.

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
    --notes)
      NOTES="$2"
      shift 2
      ;;
    --notes-file)
      NOTES_FILE="$2"
      shift 2
      ;;
    --external)
      TRACK="external"
      shift
      ;;
    --group)
      GROUP="$2"
      shift 2
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

if [[ -n "$NOTES" && -n "$NOTES_FILE" ]]; then
  echo "error: pass --notes or --notes-file, not both." >&2
  exit 1
fi
if [[ -n "$NOTES_FILE" && ! -f "$NOTES_FILE" ]]; then
  echo "error: notes file not found: $NOTES_FILE" >&2
  exit 1
fi

if [[ -z "$BUILD_NUMBER" ]]; then
  LAST=0
  if [[ -f "$BUILD_NUMBER_FILE" ]]; then
    LAST="$(cat "$BUILD_NUMBER_FILE")"
  fi
  BUILD_NUMBER=$((LAST + 1))
fi

# The API key drives the post-upload metadata steps. Resolve it up front so a
# misconfigured key is reported before spending minutes archiving.
#
# Do NOT pass this key to xcodebuild via -authenticationKeyPath/-ID/-IssuerID.
# Doing so makes xcodebuild authenticate as the key instead of the Xcode-stored
# account, and an App Manager key cannot reach signing certificates, so the
# export dies with "Cloud signing permission error / No signing certificate
# 'iOS Distribution' found". Signing stays on the Xcode session; the key does
# metadata. Granting the key Admin would trade a real privilege increase for a
# capability the session already provides.
HAVE_ASC_KEY=false
if [[ -n "${ASC_KEY_ID:-}" && -n "${ASC_ISSUER_ID:-}" ]]; then
  ASC_RESOLVED_KEY_ID="$ASC_KEY_ID"
  ASC_RESOLVED_ISSUER_ID="$ASC_ISSUER_ID"
elif [[ -f "$ASC_CONFIG" ]]; then
  ASC_RESOLVED_KEY_ID="$(/usr/bin/python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("key_id",""))' "$ASC_CONFIG")"
  ASC_RESOLVED_ISSUER_ID="$(/usr/bin/python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("issuer_id",""))' "$ASC_CONFIG")"
else
  ASC_RESOLVED_KEY_ID=""
  ASC_RESOLVED_ISSUER_ID=""
fi

ASC_KEY_PATH="${ASC_KEY_PATH:-$ASC_KEY_DIR/AuthKey_${ASC_RESOLVED_KEY_ID}.p8}"
if [[ -n "$ASC_RESOLVED_KEY_ID" && -n "$ASC_RESOLVED_ISSUER_ID" && -f "$ASC_KEY_PATH" ]]; then
  HAVE_ASC_KEY=true
fi

echo "==> Acquiring iOS — build $BUILD_NUMBER"
if [[ "$HAVE_ASC_KEY" == true ]]; then
  echo "    signing/upload: Xcode-stored session; metadata: API key $ASC_RESOLVED_KEY_ID"
else
  echo "    auth: Xcode-stored session (no API key configured; notes must be set by hand)"
fi

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "==> Archiving (Release, generic iOS device)"
# No development devices are registered. Ad-hoc sign only this local archive;
# the exports below apply Apple's cloud-managed App Store distribution signature.
xcodebuild archive \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE_PATH" \
  CODE_SIGN_IDENTITY=- \
  AD_HOC_CODE_SIGNING_ALLOWED=YES \
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
# An IPA is a ZIP container; verify its signed app bundle, not the ZIP itself.
VERIFICATION_DIR="$(mktemp -d "$BUILD_DIR/verify.XXXXXX")"
ditto -x -k "$IPA_PATH" "$VERIFICATION_DIR"
codesign --verify --deep --strict "$VERIFICATION_DIR/Payload/Acquiring.app"
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

# The internal group distributes automatically, so the build is already reaching
# testers by now. Attaching the notes is a race against them opening it — wait
# for processing and set the notes immediately rather than leaving it for later.
# External release waits on the same processing, so do both behind one wait.
if [[ -n "$NOTES" || -n "$NOTES_FILE" || -n "$TRACK" || -n "$GROUP" ]]; then
  if [[ "$HAVE_ASC_KEY" != true ]]; then
    echo "warning: post-upload steps need an API key; none configured. Do them by hand." >&2
  else
    echo "==> Waiting for Apple to finish processing build $BUILD_NUMBER"
    if /usr/bin/env python3 "$ASC_SCRIPT" wait --version "$BUILD_NUMBER"; then
      # Notes first: an external group notifies its testers on assignment, and
      # they should have the notes before that notification goes out.
      if [[ -n "$NOTES" || -n "$NOTES_FILE" ]]; then
        echo "==> Setting What to Test notes"
        if [[ -n "$NOTES_FILE" ]]; then
          /usr/bin/env python3 "$ASC_SCRIPT" set-notes --version "$BUILD_NUMBER" --notes-file "$NOTES_FILE"
        else
          /usr/bin/env python3 "$ASC_SCRIPT" set-notes --version "$BUILD_NUMBER" --notes "$NOTES"
        fi
      fi

      if [[ -n "$GROUP" ]]; then
        echo "==> Releasing to group $GROUP"
        /usr/bin/env python3 "$ASC_SCRIPT" assign --version "$BUILD_NUMBER" --group "$GROUP"
      elif [[ -n "$TRACK" ]]; then
        echo "==> Releasing to the $TRACK tester group"
        /usr/bin/env python3 "$ASC_SCRIPT" assign --version "$BUILD_NUMBER" --track "$TRACK"
      fi
    else
      # The build is already uploaded and, for the internal group, already
      # distributing. Exiting non-zero is the only way the caller learns the
      # notes never landed — a warning buried in build output does not carry.
      echo "error: build did not reach a processed state; no notes set, nothing released." >&2
      echo "       The upload itself succeeded. Set the notes once processing finishes:" >&2
      echo "       python3 $ASC_SCRIPT set-notes --version $BUILD_NUMBER --notes-file ..." >&2
      exit 1
    fi
  fi
fi

cat <<EOF
==> Done. Build $BUILD_NUMBER uploaded.

Apple usually finishes processing in 5-15 minutes. Check:
  App Store Connect -> Acquiring -> TestFlight -> Acquiring Internal Testers

Once it shows as installed, open TestFlight on the iPhone 14 Pro and update.

Recorded build number $BUILD_NUMBER in:
  $BUILD_NUMBER_FILE
Commit that file so the next deploy uses build $((BUILD_NUMBER + 1)).
EOF
