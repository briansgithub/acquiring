#!/usr/bin/env python3
"""Main-only source guard and explicit, on-demand GitHub beta dispatcher. No secrets."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys

REPO = "briansgithub/acquiring"
ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = "android-beta.yml"


def run(*args, data=None):
    result = subprocess.run(args, cwd=ROOT, input=data, text=True, capture_output=True, check=False)
    if result.returncode:
        raise ValueError(f"{args[0]} command failed (exit {result.returncode}); no release dispatched")
    return result.stdout.strip()


def guard(sha, ref, repository):
    if ref != "refs/heads/main" or repository != REPO:
        raise ValueError("Only this repository's main workflow may release")
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("commit_sha must be a full, lowercase 40-character commit SHA")
    run("git", "cat-file", "-e", sha + "^{commit}")
    run("git", "merge-base", "--is-ancestor", sha, "origin/main")
    if run("git", "rev-parse", "HEAD") != sha:
        raise ValueError("Checked-out source does not match the approved commit")


def dispatch(mode):
    # Deliberately never commit, merge, push, stash, or copy local working files.
    run("git", "fetch", "origin", "main")
    sha = run("git", "rev-parse", "origin/main")
    runs = json.loads(run("gh", "api", f"repos/{REPO}/actions/workflows/{WORKFLOW}/runs?event=workflow_dispatch&per_page=100"))["workflow_runs"]
    if any(r["status"] != "completed" for r in runs):
        raise ValueError("A beta run is active or queued; wait for its result before dispatching")
    # Title identifies the selected source, not the workflow's head commit.
    pattern = re.compile(r"Android beta publish ([0-9a-f]{40})$")
    previous = next((pattern.fullmatch(r["display_title"]).group(1) for r in runs
                     if r["conclusion"] == "success" and pattern.fullmatch(r["display_title"])), None)
    if previous == sha:
        raise ValueError("This main commit already completed a beta release")
    validated = any(r["conclusion"] == "success" and
                    re.fullmatch(r"Android beta validate [0-9a-f]{40}", r["display_title"]) for r in runs)
    if mode == "publish" and not previous and not validated:
        raise ValueError("Run and verify the initial validation-only workflow before the first live pipeline release")
    if previous:
        run("git", "merge-base", "--is-ancestor", previous, sha)
        subjects = run("git", "log", "--format=%s", f"{previous}..{sha}", "--", "android", "contracts").splitlines()
    else:
        subjects = run("git", "log", "-8", "--format=%s", sha, "--", "android", "contracts").splitlines()
    notes = "\n".join("• " + title for title in subjects if not title.startswith("Merge "))
    if not notes:
        notes = "Beta update with the latest tested Android changes."
    notes = notes if len(notes) <= 500 else notes[:499] + "…"
    payload = {"ref": "main", "inputs": {"commit_sha": sha, "release_notes": notes, "mode": mode}}
    run("gh", "api", "--method", "POST", f"repos/{REPO}/actions/workflows/{WORKFLOW}/dispatches", "--input", "-", data=json.dumps(payload))
    print(f"Dispatched {mode} for {sha}.\nRelease notes:\n{notes}\nhttps://github.com/{REPO}/actions/workflows/{WORKFLOW}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("guard", "validate", "publish"))
    args = parser.parse_args()
    try:
        if args.action == "guard":
            guard(os.environ.get("RELEASE_SHA", ""), os.environ.get("GITHUB_REF", ""), os.environ.get("GITHUB_REPOSITORY", ""))
        else:
            dispatch(args.action)
    except (ValueError, KeyError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
