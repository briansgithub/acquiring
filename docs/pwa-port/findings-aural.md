# Aural history audit

Baseline: Android `801cf7984171d772afc4406ddb5c79c0cb7fd20a`. Runtime model: unknown.
Owner: `codex/pwa-audit-aural`; assigned files are this report and `history-aural.json` only. Documentation audit only; no application implementation or build.

## Checkpoint

2026-10-13: first 10 of 51 ledger rows reviewed. Evidence depth: actual metadata/stats, focused patches and current documentation/test assertions. Merge parents and first-parent deltas inspected separately. Next: rows 11–20, then later catalog replacement and current source reconciliation. Historical test claims are not fresh passes.

## Findings already established

- Keep learning target → example provider → realized prompt separate. Catalog ranking must not enter the learning scheduler.
- Named progression practice reveals its identity and remains supported even after guidance fades; Recognize/Recall/Sing presentation groups retain separate underlying evidence skills.
- The original six-family landing is historical. Current catalog documentation explicitly supersedes it.
- Reuse published corpus/index artifacts and shared deterministic selector fixtures; do not rebuild mining/indexes in the browser.
- Current catalog documentation also supersedes immediate example autoplay, remainder-only shuffle and example auto-advance: Examples opens a preview, shuffle restores baseline order when off, and selected example sections repeat.

2026-10-13 checkpoint: 20/51 reviewed. Exposure requires actual audio progress past the source start, not pressing Play. Unreliable recovered exposure history conservatively disables independent corpus credit. Next: native tests, catalog replacement and song round-trip (rows 21-30).

2026-10-13 checkpoint: 30/51 reviewed. Catalog compact suffix/index representation and existing immutable databases are prerequisites for the browser query worker. Source round-trip is assisted and preserves draft, tab and browse state. Next: rows 31-40, then final browsing/queue/delivery changes.

2026-10-13 checkpoint: 40/51 reviewed. Ordinary full-song Playback is the sole source player; compact fallback removed. Relative-major analysis identity must retain original sounding key provenance. Next: rows 41-51 and final current-source/tests dependency reconciliation.

## Rate-limit boundary — 2026-10-13

Paused new review when coordinator reported shared five-hour usage at 86%. Reviewed 40/51 entries; rows 41–51 remain pending. Metadata/stat inspection of those final eleven commits is complete, but their source/test patches still require review. First pending commit: `4c7ddd56b8a86f4a08496e07963b4e6df10c08ca` (flexible grouping and mode controls). Do not mark metadata-only rows reviewed.

Next bounded batch: review rows 41–50, save/commit, then row 51 (`c01d433b`) plus current-source reconciliation. Current documentation already inspected: `docs/aural-curriculum.md`, the beginning/history of `docs/aural-catalog.md`, `docs/aural-corpus-offline.md`, `docs/aural-catalog-publishing.md`, and original `android/docs/aural-corpus.md` patch. One combined current-doc read was output-truncated; do not claim exhaustive reading. Focus remaining document reads on current browsing controls/grouping/mode/search/popularity and final current source, rather than rereading obsolete narrative. Current-source citations and final dependency/parallel-seam report are incomplete.

Validation so far: JSON parse during each batch; `git diff --check -- docs/pwa-port` passed at each batch; review and stage limited to the two assigned files. No Android, browser, Node or device tests were executed. Historical validation in docs is evidence of earlier checkpoints only.

Provisional implementation seams: pure music/learning engine can run in parallel with read-only catalog query worker after source/token/provenance contracts freeze. Audio acknowledgment and uncertain-capture contracts must precede independent-evidence integration. Full Playback and song resolution must precede source round-trip and queue integration. Final browsing UI should follow current catalog query semantics, not the original historical feature order. Queue persistence belongs to user data, separate from replaceable catalog databases.
