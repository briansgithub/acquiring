#!/usr/bin/env bash
# One-command build-and-run of Acquiring on the iPhone simulator.
#
# Boots the target simulator if needed, builds Debug incrementally, terminates
# any stale copy of the app, installs, and launches. Defaults match the
# iteration loop in ../AGENTS.md: iPhone 17, warm simulator, no clean build.
#
#   ./run-sim.sh                 build and launch on iPhone 17
#   ./run-sim.sh -d "iPhone 14 Pro"
#   ./run-sim.sh --logs          launch and stream the app's log output
#   ./run-sim.sh --clean         wipe this script's derived data first
#   ./run-sim.sh --build-only    build without installing or launching
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT="$IOS_DIR/Acquiring.xcodeproj"
SCHEME="Acquiring"
CONFIGURATION="Debug"
BUNDLE_ID="com.acquiring.ios"
DERIVED_DATA="$IOS_DIR/build/DerivedData-sim"

DEVICE="iPhone 17"
CLEAN=0
BUILD_ONLY=0
STREAM_LOGS=0

bold=$'\033[1m'; dim=$'\033[2m'; red=$'\033[31m'; green=$'\033[32m'; reset=$'\033[0m'
if [[ ! -t 1 ]]; then bold=""; dim=""; red=""; green=""; reset=""; fi

say()  { printf '%s\n' "$*"; }
step() { printf '%s==>%s %s\n' "$bold" "$reset" "$*"; }
die()  { printf '%s%s%s\n' "$red" "$*" "$reset" >&2; exit 1; }

usage() {
  # Print the header comment block: every comment line after the shebang, up
  # to the first line of actual code.
  sed -n '2,/^[^#]/p' "${BASH_SOURCE[0]}" | sed -n 's/^#\{1,\} \{0,1\}//p'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--device) [[ $# -ge 2 ]] || die "--device needs a simulator name or UDID"; DEVICE="$2"; shift 2 ;;
    --clean) CLEAN=1; shift ;;
    --build-only) BUILD_ONLY=1; shift ;;
    --logs) STREAM_LOGS=1; shift ;;
    -h|--help) usage 0 ;;
    *) printf '%sunknown option: %s%s\n' "$red" "$1" "$reset" >&2; usage 1 ;;
  esac
done

command -v xcrun >/dev/null 2>&1 || die "xcrun not found. Install Xcode and run: xcode-select --install"
[[ -d "$PROJECT" ]] || die "Project not found at $PROJECT"

# --- Resolve the simulator ------------------------------------------------
# simctl accepts a UDID directly; a name has to be looked up among available
# devices. Prefer an already-booted match so iteration reuses the warm one.
resolve_udid() {
  xcrun simctl list devices available -j | /usr/bin/python3 -c '
import json, sys
want = sys.argv[1]
devices = [d for runtime in json.load(sys.stdin)["devices"].values() for d in runtime]
exact = [d for d in devices if d["udid"] == want]
named = [d for d in devices if d["name"] == want]
for pool in (exact, named):
    booted = [d for d in pool if d["state"] == "Booted"]
    if booted: print(booted[0]["udid"]); sys.exit(0)
    if pool: print(pool[0]["udid"]); sys.exit(0)
' "$1"
}

UDID="$(resolve_udid "$DEVICE" || true)"
if [[ -z "$UDID" ]]; then
  say "${red}No available simulator named \"$DEVICE\".${reset} Available devices:" >&2
  xcrun simctl list devices available | sed -n '/^--/,$p' >&2
  exit 1
fi

STATE="$(xcrun simctl list devices -j | /usr/bin/python3 -c '
import json, sys
udid = sys.argv[1]
for runtime in json.load(sys.stdin)["devices"].values():
    for d in runtime:
        if d["udid"] == udid: print(d["state"]); sys.exit(0)
print("Unknown")
' "$UDID")"

if [[ "$STATE" != "Booted" ]]; then
  step "Booting $DEVICE"
  xcrun simctl boot "$UDID"
  xcrun simctl bootstatus "$UDID" -b >/dev/null
else
  say "${dim}Reusing booted simulator $DEVICE${reset}"
fi

# Bring Simulator.app forward so the run is visible without stealing focus
# mid-build.
open -a Simulator --args -CurrentDeviceUDID "$UDID" >/dev/null 2>&1 || true

# --- Build ----------------------------------------------------------------
if [[ $CLEAN -eq 1 ]]; then
  step "Removing $DERIVED_DATA"
  rm -rf "$DERIVED_DATA"
fi

step "Building $SCHEME ($CONFIGURATION) for $DEVICE"
BUILD_LOG="$(mktemp -t acquiring-sim-build)"
trap 'rm -f "$BUILD_LOG"' EXIT
set +e
xcodebuild build \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration "$CONFIGURATION" \
  -destination "id=$UDID" \
  -derivedDataPath "$DERIVED_DATA" \
  CODE_SIGNING_ALLOWED=NO \
  2>&1 | tee "$BUILD_LOG" | grep -E '^(.*(error|warning):|\*\* )' || true
BUILD_STATUS=${PIPESTATUS[0]}
set -e
if [[ $BUILD_STATUS -ne 0 ]]; then
  say ""
  say "${red}Build failed.${reset} Last lines of the full log:"
  tail -40 "$BUILD_LOG" >&2
  exit "$BUILD_STATUS"
fi

APP="$DERIVED_DATA/Build/Products/$CONFIGURATION-iphonesimulator/$SCHEME.app"
[[ -d "$APP" ]] || die "Build succeeded but no app bundle at $APP"

if [[ $BUILD_ONLY -eq 1 ]]; then
  say "${green}Built${reset} $APP"
  exit 0
fi

# --- Install and launch ---------------------------------------------------
# Terminating first avoids launching a second copy over a stale process that is
# still holding audio or catalog state.
xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true

step "Installing"
xcrun simctl install "$UDID" "$APP"

step "Launching $BUNDLE_ID"
if [[ $STREAM_LOGS -eq 1 ]]; then
  say "${dim}Streaming app logs; Ctrl-C to stop (the app keeps running).${reset}"
  xcrun simctl launch --console-pty "$UDID" "$BUNDLE_ID"
else
  PID="$(xcrun simctl launch "$UDID" "$BUNDLE_ID" | awk '{print $NF}')"
  say "${green}Running${reset} on $DEVICE (pid $PID)"
  say "${dim}Logs: xcrun simctl spawn $UDID log stream --predicate 'process == \"$SCHEME\"'${reset}"
fi
