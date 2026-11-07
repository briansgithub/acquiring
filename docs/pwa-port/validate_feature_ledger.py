#!/usr/bin/env python3
"""Validate source references and render the bounded feature-discovery ledger."""
import argparse
import hashlib
from collections import Counter
import json
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
URL = "https://github.com/briansgithub/acquiring"

def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()

def exists(ref):
    return subprocess.run(["git", "cat-file", "-e", ref], cwd=ROOT, capture_output=True).returncode == 0

def render(data, coverage):
    rows = data["rows"]
    new = [r for r in rows if r["tracking"]["classification"] == "new_current_gap"]
    lines = ["# Bounded Android history / current PWA feature ledger", "",
        f"Native authority: `{data['nativeAuthority']}`. Default frozen PWA inspection: `{data['pwaInspectionHead']}` on `codex/pwa-continuation`; a row's explicit inspectionHead pins its bounded follow-up.", "",
        data["scope"], "", data["newGapMeaning"], "", "## Findings and use", "",
        f"**{len(rows)} behavior groups; {len(new)} newly itemized current-integration gaps.** This is not a count of all app features. Existing task IDs are broad packages; NEW rows do not create acceptance decisions or change their statuses.", "",
        "| New gap | Surviving behavior / current omission | Existing package |", "|---|---|---|"]
    for r in new:
        lines.append(f"| [{r['id']}](#{r['id'].lower()}) | {r['behavior']} | {', '.join(r['tracking']['tasks'])} |")
    for r in rows:
        if r["pwa"].get("inspectionHead"):
            sha=r["pwa"]["inspectionHead"]
            lines += ["", f"**Bounded implementation follow-up:** {r['id']} is **{r['pwa']['status']}** at [{sha[:8]}]({URL}/commit/{sha}). Only that row's PWA references advance. Its scoped test results and remaining gates are below and in HANDOFF; other audit rows keep their original frozen evidence. This does not complete T13 or the port."]
    lines += ["", "## Method, range, coverage and limits", "", data["method"], "",
        "The reused inventory is [HISTORY.md](HISTORY.md) with foundation/revision/Aural JSON and findings. Its 262 commits equal `git log --full-history <authority> -- android contracts`, through the pinned authority, including reachable merge ancestry. The earliest scoped inventory commit is `099cadf943b30f3d6dd57604e6035354754de3a7` (2026-07-28); the end is the pinned authority. All 575 historical object references were rechecked: 572 present directly, three deletion references present in the deleting commit's first parent. Object validation verifies references, not the truth of every old summary.", "",
        "Fresh patch scope: 50 selected commits spanning introduction, behavioral fixes, replacement/deletion and package/monorepo renames. Full first-parent Android/contracts diffs were captured locally; only bounded matching functional excerpts were read, not all patch lines. Merge-resolution/second-parent history is covered by the prior inventory, not freshly reconstructed here. `5f706322` changes shared contracts/tooling rather than native production source. No literal revert subjects were found in the scoped log; deletion/replacement diffs, not that subject search, determine disposition.", "",
        "Surviving source checks use concrete entry points and callers; PWA checks include actual hooks/routes/components and existing test bodies, not only kernels. Source links below are frozen at inspection revisions; historical commit links expose change/deletion diffs. Historical evidence paths may use earlier package names. Detailed fresh patch hashes/scopes and validation receipts are in [FEATURE_AUDIT_COVERAGE.json](FEATURE_AUDIT_COVERAGE.json). Machine source: [feature-ledger.json](feature-ledger.json); renderer/reference check: [validate_feature_ledger.py](validate_feature_ledger.py).", "",
        "**Blind spots:** 111 native production files were enumerated, not all read in full. Selected excerpts can miss later hunks/edge cases. Unselected historical patches, all merge resolutions, resource/layout/theme/accessibility diffs, build/platform/release internals and all Android test bodies were not freshly audited line by line. Library/Song/Playback routes and selected storage/audio entry points were inspected; not every PWA module/test assertion. No browser/device/Android/unit/parity/build tests were rerun in this docs-only audit. Existing tests listed are inspectable acceptance evidence, not fresh pass receipts. External service behavior, physical mic/touch/Pixel/Safari/BFCache and trusted-tab remain unverified. Thus this is breadth coverage, **not an exhaustive unknown-feature guarantee**.", "",
        "## Priority and reconciliation", "",
        "Owner priority remains playback/singing/note/chord cards first, secondary full-port infrastructure next, Aural quiz/T15 song-rank/family trees last; motion polish follows functional work. [HANDOFF.md](HANDOFF.md) is chronological; [LINEAGE_PRIORITY.md](LINEAGE_PRIORITY.md), [tasks.json](tasks.json), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) and [historical roadmap](../ios-android-parity-roadmap.md) contain historical snapshots. That pointer now leads to the iOS-only porting-plan; its execution/review rules and iOS completion claims do not govern this PWA audit. This ledger inspects code at the stated head and supersedes stale *descriptive* claims only: T22 is no longer payload-only (query overlays, handler and atomic persistence landed); 300ms singing exit landed. Their remaining UI/service/parse/device gaps stay open. No task status, original assertion, owner acceptance or sequencing rule is changed.", "",
        "Settings Back strict <3px versus earlier 110px remains DEFERRED, unchanged. The original trusted-tab skip remains open after both unsupported environments failed to hide tabs; no retry or fabricated event proof. SYNTHETIC oscillator, fake/silent capture, emulated touch and physical-device evidence remain distinct. Updates must say status unavailable with no fake Play/SW mapping or build number. No live Hooktheory/deployment/production mutations occurred.", "",
        "The five NEW rows are current integration omissions, despite their introductions already appearing in the old history ledger. Root-only Mic is source-backed; triple-tap and merely surviving ChordTone types are not new requirements. Full-title sheet and local help are separate from displaying a title/global Help. Tape key spelling is separate from captured-slot relative spelling. Rotary/reset behavior is separate from exposing numerical settings. Favorited confirmation already exists and is not a new gap. Current fixed transport does not establish old beat-step buttons as a requirement merely because an earlier plan mentioned them.", "",
        "**Next independent ready primary slice:** N01 actual root-only persistent-monitoring selection/target/gauge with native mode/session/section reset and explicit opt-in/cancellation. S06 Stop/owner handoff now has a separately pinned bounded implementation follow-up. The original audit made no owner tradeoff decision; title/help/tape/reset leaves remain open and Aural stays last.", "", "## Behavior ledger", ""]
    for r in rows:
        n=r["native"]; p=r["pwa"]; t=r["tracking"]
        lines += [f"<a id=\"{r['id'].lower()}\"></a>", "", f"### {r['id']} — {r['domain']}", "", r["behavior"], "",
            f"- Native: **{n['disposition']}**. " + "; ".join(f"[{Path(x).name}]({URL}/blob/{data['nativeAuthority']}/{x})" for x in n["paths"]),
            "- History: " + ", ".join(f"[{s[:8]}]({URL}/commit/{s})" for s in n["history"]) + ". " + n["historicalDelta"],
            f"- PWA: **{p['status']}**. " + p["inspection"],
            "- Current code/tests: " + "; ".join(f"[{Path(x).name}]({URL}/blob/{p.get('inspectionHead',data['pwaInspectionHead'])}/{x})" for x in p["paths"]),
            f"- Tracking: **{t['classification']}**; {', '.join(t['tasks'])}. Priority **{r['priority']}**; dependencies {', '.join(r['dependencies']) or 'none (excluded history)' }.",
            "- Acceptance still required / boundary: " + r["acceptanceRequired"], ""]
    lines += ["## Audit validation", "", "`python docs/pwa-port/validate_feature_ledger.py` verifies frozen source/historical references, task IDs, coverage hashes, enums, NEW count and exact generated-document consistency. This validates audit integrity, not product parity. The older `validate_audit.py` exits1 at its task-graph line70: T11 complete depends on T08 in_progress. RUNBOOK/tasks already allow the T08 static-preview milestone; the old validator does not honor that milestone. T22 also currently uses `in-progress`, outside that validator’s underscore enum (not reached in this run). Neither status nor validator assertion was changed. No acceptance is rewritten to make it green.", ""]
    return "\n".join(lines)

def main():
    parser=argparse.ArgumentParser(); parser.add_argument("--render",action="store_true"); args=parser.parse_args()
    data=json.loads((HERE/"feature-ledger.json").read_text()); coverage=json.loads((HERE/"FEATURE_AUDIT_COVERAGE.json").read_text())
    rows=data["rows"]; assert len({r["id"] for r in rows})==len(rows)
    assert data["nativeAuthority"]==coverage["nativeAuthority"] and data["pwaInspectionHead"]==coverage["pwaInspectionHead"]
    tasks={r["id"] for r in json.loads((HERE/"tasks.json").read_text())["tasks"]}
    refs=set()
    for r in rows:
        assert r["native"]["disposition"] in {"surviving","removed","uncertain"}
        assert r["pwa"]["status"] in {"implemented","partial","missing","unverified"}
        assert r["tracking"]["classification"] in {"known","new_current_gap","removed"}
        assert set(r["tracking"]["tasks"])<=tasks and set(r["dependencies"])<=tasks
        assert r["behavior"] and r["acceptanceRequired"] and r["pwa"]["inspection"]
        refs.update(data["nativeAuthority"]+":"+p for p in r["native"]["paths"])
        inspection=r["pwa"].get("inspectionHead",data["pwaInspectionHead"])
        assert re.fullmatch("[0-9a-f]{40}",inspection)
        refs.update(inspection+":"+p for p in r["pwa"]["paths"])
        for s in r["native"]["history"]:
            assert re.fullmatch("[0-9a-f]{40}",s)
            assert subprocess.run(["git","merge-base","--is-ancestor",s,data["nativeAuthority"]],cwd=ROOT).returncode==0
        for ref in r["native"]["priorEvidence"]:
            if not re.match(r"^[0-9a-f]{8,40}(?:\^1)?:", ref):
                continue
            if not exists(ref):
                sha,path=ref.split(":",1); assert exists(sha+"^1:"+path),ref
    bad=sorted(ref for ref in refs if not exists(ref)); assert not bad,bad
    prior=[r for part in ("foundation","revision","aural") for r in json.loads((HERE/f"history-{part}.json").read_text(encoding="utf-8-sig"))]
    actual=[r["sha"] for r in prior]
    expected=set(git("log","--full-history","--format=%H",data["nativeAuthority"],"--","android","contracts").splitlines())
    assert len(actual)==len(set(actual))==262 and set(actual)==expected
    historical={ref for r in prior for ref in r["evidence"] if re.match(r"^[0-9a-f]{8,40}(?:\^1)?:",ref)}
    direct=0; deleted=0
    for ref in historical:
        if exists(ref): direct+=1
        else:
            sha,path=ref.split(":",1); assert exists(sha+"^1:"+path),ref
            deleted+=1
    assert (len(historical),direct,deleted)==(575,572,3)
    assert len(coverage["freshPatches"])==50
    for patch in coverage["freshPatches"]:
        assert len(patch["sha256"])==64 and patch["bytes"]>0 and patch["inspectedScope"]
        raw=subprocess.check_output(["git","diff",patch["sha"]+"^1",patch["sha"],"--","android","contracts"],cwd=ROOT)
        assert len(raw)==patch["bytes"] and hashlib.sha256(raw).hexdigest()==patch["sha256"],patch["sha"]
    counts=Counter(r["tracking"]["classification"] for r in rows)
    assert counts["new_current_gap"]==5
    output=render(data,coverage); target=HERE/"FEATURE_LEDGER.md"
    if args.render: target.write_text(output,encoding="utf-8")
    assert target.read_text(encoding="utf-8")==output,"Run --render to update generated ledger"
    print(f"PASS: {len(rows)} groups; {len(refs)} frozen source refs; {counts['new_current_gap']} newly itemized gaps; 50 reproducible patch hashes; 262 history rows/575 evidence refs; generated ledger matches")

if __name__=="__main__": main()
