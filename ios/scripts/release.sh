#!/usr/bin/env bash
# One-command TestFlight release for Acquiring.
#
# Asks three things and handles everything else: which testers, what the notes
# say, and one final confirmation. Then it archives, verifies the signature,
# uploads, waits for Apple to finish processing, attaches the notes, and
# releases to the chosen group.
#
# This is the human front door. Agents and CI call deploy-testflight.sh
# directly, which takes the same work as flags and never prompts.
#
# Nothing here submits to App Review. That remains a deliberate manual step in
# App Store Connect; see ../../docs/ios-beta-releases.md.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$IOS_DIR/.." && pwd)"
DEPLOY="$SCRIPT_DIR/deploy-testflight.sh"
ASC="$SCRIPT_DIR/asc_api.py"
BUILD_NUMBER_FILE="$IOS_DIR/.testflight-build-number"
MAX_NOTES_CHARS=350

bold=$'\033[1m'; dim=$'\033[2m'; red=$'\033[31m'; yellow=$'\033[33m'
green=$'\033[32m'; reset=$'\033[0m'
if [[ ! -t 1 ]]; then bold=""; dim=""; red=""; yellow=""; green=""; reset=""; fi

say()  { printf '%s\n' "$*"; }
warn() { printf '%s%s%s\n' "$yellow" "$*" "$reset" >&2; }
die()  { printf '%s%s%s\n' "$red" "$*" "$reset" >&2; exit 1; }

# macOS still ships bash 3.2 at /bin/bash, which has no ${var,,}. Keep every
# construct here 3.2-compatible so the script does not depend on which bash the
# shebang happens to resolve to.
lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

cleanup() { [[ -n "${NOTES_TMP:-}" && -f "${NOTES_TMP:-}" ]] && rm -f "$NOTES_TMP"; }
trap cleanup EXIT

[[ -t 0 ]] || die "release.sh is interactive; it needs a terminal. For scripted runs use deploy-testflight.sh."
[[ -x "$DEPLOY" ]] || die "Cannot find $DEPLOY"

# ---------------------------------------------------------------------------
# Preflight — surface anything that would make this release surprising before
# it takes ten minutes to find out.
# ---------------------------------------------------------------------------

say "${bold}Acquiring — TestFlight release${reset}"
say ""

HAVE_KEY=false
if /usr/bin/env python3 "$ASC" verify >/dev/null 2>&1; then
  HAVE_KEY=true
else
  warn "No working App Store Connect API key."
  warn "The build will still upload, but the notes and any external release"
  warn "would have to be done by hand. See scripts/README-asc-api.md."
  say ""
fi

LAST_BUILD=0
[[ -f "$BUILD_NUMBER_FILE" ]] && LAST_BUILD="$(cat "$BUILD_NUMBER_FILE")"
NEXT_BUILD=$((LAST_BUILD + 1))

BRANCH="$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")"
COMMIT="$(git -C "$REPO_DIR" log -1 --format='%h %s' 2>/dev/null || echo "?")"
DIRTY_COUNT="$(git -C "$REPO_DIR" status --porcelain 2>/dev/null | grep -c . || true)"

say "  build      ${bold}${NEXT_BUILD}${reset}   ${dim}(last released: ${LAST_BUILD})${reset}"
say "  branch     ${BRANCH}"
say "  commit     ${dim}${COMMIT}${reset}"
if [[ "$DIRTY_COUNT" -gt 0 ]]; then
  say "  tree       ${yellow}${DIRTY_COUNT} uncommitted change(s) — these WILL be in the build${reset}"
else
  say "  tree       clean"
fi
say ""

# ---------------------------------------------------------------------------
# 1. Which testers
# ---------------------------------------------------------------------------

say "${bold}1. Who gets this build?${reset}"
say "   ${bold}i${reset})nternal  — the team. Distributes automatically, no review."
say "   ${bold}e${reset})xternal  — outside the team, including anyone with the group's"
say "                public link. May enter beta app review first."
say ""

TRACK=""
while [[ -z "$TRACK" ]]; do
  read -r -p "   internal or external? [i/e] " answer || die "aborted"
  case "$(lower "$answer")" in
    i|internal) TRACK="internal" ;;
    e|external) TRACK="external" ;;
    "") ;;
    *) say "   ${dim}Enter i or e.${reset}" ;;
  esac
done

GROUP_LABEL="Acquiring Internal Testers"
if [[ "$TRACK" == "external" ]]; then
  # Name the actual group and tester count now, so the confirmation later is
  # about real people rather than an abstraction.
  GROUP_LABEL="$(/usr/bin/env python3 "$ASC" groups 2>/dev/null \
    | awk -F'  \\[' '/\[external/ {print $1; exit}')"
  [[ -n "$GROUP_LABEL" ]] || GROUP_LABEL="(the external group)"
fi
say ""

# ---------------------------------------------------------------------------
# 2. What to Test notes
# ---------------------------------------------------------------------------

say "${bold}2. What should testers try?${reset}"
say "   ${dim}One to three short bullets, ${MAX_NOTES_CHARS} characters max.${reset}"
say ""

NOTES_TMP="$(mktemp -t acquiring-notes)"
NOTES=""

read_notes_inline() {
  say "   Type the notes, then press ${bold}Ctrl-D${reset} on a blank line:"
  say ""
  cat > "$NOTES_TMP"
}

read_notes_editor() {
  cat > "$NOTES_TMP" <<EOF

# What to Test — build $NEXT_BUILD → $GROUP_LABEL
#
# One to three short bullets, $MAX_NOTES_CHARS characters max.
# Only user-visible changes, a required check, or a known limitation.
# Lines starting with # are ignored.
EOF
  "${EDITOR}" "$NOTES_TMP"
  # Strip comment lines the way git does, then trim blank edges.
  sed -i.bak '/^#/d' "$NOTES_TMP" && rm -f "$NOTES_TMP.bak"
}

while true; do
  if [[ -n "${EDITOR:-}" ]]; then
    read -r -p "   Open \$EDITOR ($EDITOR)? [Y/n] " use_editor || die "aborted"
    case "$(lower "$use_editor")" in
      n|no) read_notes_inline ;;
      *)    read_notes_editor ;;
    esac
  else
    read_notes_inline
  fi

  NOTES="$(sed -e '/./,$!d' "$NOTES_TMP" | sed -e :a -e '/^\n*$/{$d;N;};/\n$/ba')"
  CHARS="${#NOTES}"

  if [[ -z "$NOTES" ]]; then
    warn "   Notes are empty. Testers see this text, so it should say something."
    say ""
    continue
  fi
  if [[ "$CHARS" -gt "$MAX_NOTES_CHARS" ]]; then
    warn "   $CHARS characters — over the $MAX_NOTES_CHARS limit. Tighten and retry."
    say ""
    continue
  fi
  break
done
say ""

# ---------------------------------------------------------------------------
# 3. Final confirmation
# ---------------------------------------------------------------------------

say "${bold}3. Ready to release${reset}"
say ""
say "   build     ${bold}${NEXT_BUILD}${reset} from ${BRANCH} (${COMMIT})"
say "   testers   ${bold}${GROUP_LABEL}${reset} (${TRACK})"
say "   notes     ${dim}${CHARS}/${MAX_NOTES_CHARS} characters${reset}"
say ""
while IFS= read -r line; do say "     ${line}"; done <<< "$NOTES"
say ""

if [[ "$TRACK" == "internal" ]]; then
  say "   ${dim}Internal distributes automatically once processed, and cannot be recalled.${reset}"
else
  say "   ${yellow}External: reaches people outside the team, including anyone holding${reset}"
  say "   ${yellow}the group's public link. Cannot be recalled once distributed.${reset}"
fi
if [[ "$DIRTY_COUNT" -gt 0 ]]; then
  say "   ${yellow}${DIRTY_COUNT} uncommitted change(s) are included in this build.${reset}"
fi
say ""
say "   ${dim}Nothing here submits to App Review.${reset}"
say ""

read -r -p "   Release build ${NEXT_BUILD}? [y/N] " confirm || die "aborted"
case "$(lower "$confirm")" in
  y|yes) ;;
  *) die "Cancelled. Nothing was built or uploaded." ;;
esac
say ""

# ---------------------------------------------------------------------------
# Go
# ---------------------------------------------------------------------------

DEPLOY_ARGS=(--notes-file "$NOTES_TMP")
[[ "$TRACK" == "external" ]] && DEPLOY_ARGS+=(--external)

LOG="$IOS_DIR/build/release-${NEXT_BUILD}.log"
mkdir -p "$(dirname "$LOG")"

say "${bold}Releasing build ${NEXT_BUILD}...${reset} ${dim}(this takes several minutes)${reset}"
say "${dim}Full log: $LOG${reset}"
say ""

# tee would mask the deploy script's exit status behind its own, and a release
# that reports success on failure is worse than one that fails loudly.
set +e
"$DEPLOY" "${DEPLOY_ARGS[@]}" 2>&1 | tee "$LOG"
STATUS="${PIPESTATUS[0]}"
set -e

say ""
if [[ "$STATUS" -ne 0 ]]; then
  say "${red}${bold}Release failed (exit $STATUS).${reset}"
  say "Nothing was recorded as released. Check $LOG"
  exit "$STATUS"
fi

say "${green}${bold}Build ${NEXT_BUILD} released to ${GROUP_LABEL}.${reset}"
if [[ "$HAVE_KEY" == true ]]; then
  say ""
  /usr/bin/env python3 "$ASC" status --version "$NEXT_BUILD" 2>/dev/null || true
fi
say ""
say "${dim}ios/.testflight-build-number now records ${NEXT_BUILD}; commit it so the${reset}"
say "${dim}next release picks $((NEXT_BUILD + 1)).${reset}"
