# Agent Handoff — Sacred Ring (2026-06-29)

**Read this first**, then [Documentation/INDEX.md](Documentation/INDEX.md) for the full doc map. Do **not** linearly read every `.md` under `_Decode_oracle/out/` (thousands of per-song oracle reports).

**Latest commit:** `085c222` — *Refine Song Selector UX, layout, and six-song catalog workflow.*

---

## 1. What the next task is

**Modularize data vs code** so the codebase can go to GitHub without bulky local databases, caches, and harvest artifacts. The data bundle must be **copy-paste portable** (flash drive) and clearly separated from engine, player, and docs.

The user's intended starting prompt is in [§8](#8-suggested-prompt-for-next-agent). This file is the bridge between that prompt and the repo's actual state.

---

## 2. Current system (as of handoff)

### Runtime layout (`web-player/index.html` grid)

| Column (left → right) | Panel | Width |
|----------------------|-------|-------|
| 1 | **Song Selector** | 310px |
| 2 | Controls | 250px |
| 3 | Now Playing (melody + chord indicator) | 210px |
| 4 | Chord ring | `1fr` |
| Top row | Timeline | full width |

Start player: `python launch_player.py` or `node web-player/server.js` (port 3000).

### Song Selector behavior (recent session)

- **Persistent nav** above scrollable body: Sort by, playable dropdown, **Back** (only when song detail is loaded).
- **Light catalog** opens in a **modal** (header button on search view only); not on song detail.
- **Complexity sort:** ascending (low → high); missing ratings sink to bottom.
- **Scroll:** `#sel-body.selector-body` scrolls; header + nav stay fixed.
- **Now Playing:** "Show Melody" checkbox **above** melody card; unchecked = entire melody card hidden (`[hidden]` + `.indicator-card[hidden] { display: none !important }` because `display:flex` was overriding `hidden`).
- **Auto-load:** When all pipeline flags are complete, opening song detail auto-loads into the player. **No Load button** in that case. If already loaded (`loadedCacheKey` in `player.js`), no reload.
- **Load button:** Yellow, only when pipeline **incomplete**; enabled when API `canLoad` (catalogued + metadata + processed).

### Pipeline flags (Song Selector buttons)

| Flag | UI label | Meaning |
|------|----------|---------|
| `catalogued` | catalogued | Row exists in SQLite |
| `harvested` | Fetch | Valid `_Decode_oracle/out/<slug>/scrape.json` |
| `metadata` | metadata | `songs.status = 'enriched'` |
| `processed` | processed | `cache_dir` + `processed_at`; `.hooktheory_cache/` written |
| `tested` | tested | `oracle_tested_at`; oracle `report.json` |

- **Auto-load requires all five.**
- **`canLoad` (API gate)** requires only catalogued + metadata + processed.
- **Fetch** is the only step that opens Hooktheory in a browser (Puppeteer).
- **metadata / processed / tested** are local transforms over `scrape.json`.

### Six-song working set

Cache and DB were pruned to **6 playable, fetch+tested songs**:

| Title | Slug | Cache folder |
|-------|------|--------------|
| Maple Leaf Rag | `scott-joplin__maple-leaf-rag` | `scott-joplin - Maple_Leaf_Rag` |
| Gladiolus Rag | `scott-joplin__gladiolus-rag` | `scott-joplin - Gladiolus_Rag` |
| Bad Romance | `lady-gaga__bad-romance` | `lady-gaga - Bad_Romance` |
| Sweet Child O' Mine | `guns-n-roses__sweet-child-o-mine` | `guns-n-roses - Sweet_Child_O__Mine` |
| Pollyanna | `nintendo__earthbound-zero---pollyanna` | `nintendo - Earthbound_Zero_-_Pollyanna` |
| Bohemian Rhapsody | `queen__bohemian-rhapsody` | `queen - Bohemian_Rhapsody` |

Helper scripts (in `_Research_testing/`):

- `prune_to_six_songs.cjs` — delete other cache dirs + DB rows
- `fetch_test_six_songs.cjs` — wipe DB, fetch+test six songs
- `run_tested_six.cjs` — run tested step on six
- `playable_songs_snapshot.json` — export of 39 formerly-playable songs (reference only)

### Important behavioral change

**`GET /api/library` no longer auto-imports** from `.hooktheory_cache/`. DB rows are created/updated only by explicit catalog, fetch, add-by-URL, light catalog, or manual `cli/backfill-cache.js`. See `lib/library.js` comment and updated USAGE.md.

---

## 3. Where data lives today (coupling problem)

All paths assume **repo root** via `REPO_ROOT` in `_Research_testing/hooktheory_catalog/lib/paths.js`:

```
REPO_ROOT = <repo>/
```

| Data | Current path | Git status |
|------|--------------|------------|
| SQLite catalog | `_Research_testing/hooktheory_catalog/data/hooktheory_catalog.db` | **gitignored** (`data/` in `.gitignore`) |
| Catalog runtime | `data/.meili_auth.json`, daemon logs, etc. | gitignored |
| Playback cache | **`<repo>/.hooktheory_cache/`** | **tracked in git** (~40 JSON files for 6 songs) |
| Harvest artifacts | **`<repo>/_Decode_oracle/out/<slug>/`** | mix: six songs + many legacy dirs; large |
| Oracle regression DBs | `_Decode_oracle/chord_db/`, `chord_db_corpus2/`, etc. | tracked (engine test corpora, not song library) |

### Hardcoded path touchpoints (non-exhaustive — grep before refactor)

| File | What it pins |
|------|----------------|
| `web-player/server.js` | `CACHE_ROOT = ../.hooktheory_cache` |
| `hooktheory_catalog/lib/cacheSync.js` | `CACHE_ROOT` under `REPO_ROOT` |
| `hooktheory_catalog/lib/harvestArtifact.js` | `HARVEST_ROOT = REPO_ROOT/_Decode_oracle/out` |
| `hooktheory_catalog/lib/paths.js` | `DATA_DIR` under catalog module |
| `hooktheory_catalog/lib/oracleSummary.js` | `report.json` under `REPO_ROOT` |
| `extract_hooktheory_data.js` | cache writer (legacy extract path) |

`web-player/catalogApi.js` is a thin re-export of `hooktheory_catalog/web/api.js` — catalog logic is **not** inside `web-player/` but is reached through it.

---

## 4. Proposed modularization (for next agent to plan & execute)

**Goal:** one portable **data root** (flash-drive friendly), code repo without bulky blobs.

### Suggested data root layout

```
<sacred_ring_data>/          # SACRED_RING_DATA env var or sacred_ring_data.config.json
  catalog/
    hooktheory_catalog.db    # + WAL/SHM alongside
    .meili_auth.json
    daemon.log               # optional runtime
  playback/
    .hooktheory_cache/       # section JSON + _metadata.json per song
  harvest/
    <slug>/                  # scrape.json, report.json, oracle markdown
      scrape.json
      report.json
      ...
  README.txt                 # "Copy this folder to SACRED_RING_DATA on another PC"
```

### Code changes (high level)

1. **Single config resolver** — `resolveDataRoot()` used by catalog, server, harvest, oracle runner. Env: `SACRED_RING_DATA` (absolute path). Fallback: `./sacred_ring_data` next to repo for dev.
2. **Move catalog module** out of `_Research_testing/` → e.g. `packages/catalog/` or top-level `catalog/` (it's production, not research).
3. **Update `.gitignore`** — ignore entire data root + stop tracking `.hooktheory_cache/` and per-song `_Decode_oracle/out/*` (keep oracle **code** and **chord_db corpora** policy explicit — user may want corpora in repo or separate).
4. **`git rm --cached`** for already-tracked cache/oracle song outputs before first GitHub push.
5. **Document** copy procedure: clone code → copy data folder → set env → `python launch_player.py`.
6. **Optional:** `data/README.md` template inside repo (not the actual DB) explaining structure.

### What probably stays in the code repo

- `web-player/` engine + UI
- `_Decode_oracle/*.js` harness **code**
- `_Decode_oracle/chord_db*` regression corpora (unless user wants those portable too)
- `Documentation/`, `ORACLE_GUIDE/`
- `_Research_testing/` scripts that are **tools**, not runtime data

### Risks / gotchas

- **`cache_dir` column** stores folder name relative to playback cache root (e.g. `the-beatles - Hey_Jude`), not slug.
- **Player load** matches `GET /api/songs` entries by `artist` field === `cacheKey` (folder name) — see `player.js` `onLoad`.
- **WAL mode:** copy DB only when server/daemon stopped, or copy `.db` + `-wal` + `-shm` together.
- **Path separators:** flash drive may be Windows → use `path.join`, document forward slashes in config.
- **ARCHITECTURE.md §7** still says cache auto-sync and ~19 songs — stale; trust this handoff.

---

## 5. Verification checklist (required by user)

After structural changes, run **at least three** full **Fetch** + **Test** cycles (UI or API) and confirm oracle results:

### Via Song Selector UI

1. `python launch_player.py`
2. Open a song detail page → click **Fetch** (wait for job) → click **tested** (or re-open after pipeline completes for auto-test path).
3. Check oracle error-rate table on song detail + files under harvest dir.

### Via API (server must be running)

```http
POST /api/library/pipeline/harvest?slug=scott-joplin__maple-leaf-rag
GET  /api/library/pipeline/job?id=<jobId>
POST /api/library/pipeline/tested?slug=scott-joplin__maple-leaf-rag
GET  /api/library/pipeline/job?id=<jobId>
GET  /api/library/song?slug=scott-joplin__maple-leaf-rag
```

### CLI closed-loop (no browser UI)

```bash
node _Research_testing/hooktheory_catalog/scripts/pipelineClosedLoopTest.js --tier quick
```

### Accuracy checks

- `report.json` exists under harvest dir for slug
- Song detail shows `oracleSummary` with sensible roman/notes percentages
- `songs.oracle_tested_at` set in DB
- Re-load song in player — chord ring/timeline populate

**Test slugs (pick 3+):** any from the six-song table above; include at least one rag (Scott Joplin) and one with many sections (Bohemian Rhapsody).

Clean up any `_Debug_testing/` scratch scripts when done.

---

## 6. Doc reading order (efficient)

| Order | File | Why |
|-------|------|-----|
| 1 | **This file** | Current state + next task |
| 2 | [Documentation/INDEX.md](Documentation/INDEX.md) | Doc router |
| 3 | [Documentation/ARCHITECTURE.md](Documentation/ARCHITECTURE.md) | Big picture (some UI details stale — see §2 here) |
| 4 | [hooktheory_catalog/USAGE.md](_Research_testing/hooktheory_catalog/USAGE.md) | Catalog DB, API routes, pipeline |
| 5 | [hooktheory_catalog/CHEATSHEET.md](_Research_testing/hooktheory_catalog/CHEATSHEET.md) | Copy-paste commands |
| 6 | [hooktheory_catalog/DATA_FIELDS.md](_Research_testing/hooktheory_catalog/DATA_FIELDS.md) | DB columns |
| 7 | [ORACLE_GUIDE/README.md](ORACLE_GUIDE/README.md) | Oracle workflow (if touching tested step) |

Skip unless needed: `_Decode_oracle/out/**/summary.md`, `DECODE_FIX_LOG.md`, per-corpus SUMMARY files.

---

## 7. Project conventions (do not break)

- Source files **≤ 400 lines** (ask before exceeding 300).
- Debug scripts → `_Debug_testing/`; research/info scripts → `_Research_testing/`.
- **Do not commit** unless user asks.
- NestJS/TS style rules in `.cursor/rules` apply when editing TS (most of this repo is JS).
- User prefers terse, expert-level responses with actual code — see `.cursor/rules/dev-rules.mdc`.

---

## 8. Suggested prompt for next agent

The user's draft is good. Recommended **modifications**:

```
Read HANDOFF.md and Documentation/INDEX.md first, then ARCHITECTURE.md and
hooktheory_catalog/USAGE.md. Do NOT read every .md in the repo (skip
_Decode_oracle/out/**).

Goal: modularize so bulky data is outside the code repo and gitignored,
while remaining copy-paste portable via flash drive (single SACRED_RING_DATA
root with catalog DB, .hooktheory_cache, and harvest/oracle outputs).

Plan before coding. Propose the data directory layout and env/config
mechanism, then implement incrementally.

Current working set: 6 songs (slugs in HANDOFF.md §2). Preserve Song Selector
and pipeline behavior (Fetch, metadata, processed, tested, auto-load).

After changes:
- git rm --cached any previously tracked cache/harvest blobs
- Update .gitignore and document flash-drive copy steps in data/README template
- Run pipelineClosedLoopTest.js --tier quick
- Manually Fetch + Test at least 3 songs; verify report.json and UI oracle table
- Remove temporary test scripts from _Debug_testing/

Do not push to GitHub unless I ask.
```

### Optional additions user may want

- **Name the data folder** explicitly (e.g. `sacred_ring_data/` vs `SacredRingData/`) to avoid bikeshedding.
- Say whether **`_Decode_oracle/chord_db*`** stays in git (regression fixtures) or moves to data bundle.
- Say whether **catalog module** should move from `_Research_testing/` to a top-level package in this same PR.
- Request **Plan mode** first given scope.

### What to drop from original prompt

- "Read **all** .md files" — wasteful; use INDEX + HANDOFF routing instead.

---

## 9. Open issues / known gotchas (not blocking modularization)

- Meili section stubs can store bad `song_id` → light catalog worker may retry forever.
- `promoteCacheMetadata` in cache sync can mark enriched without full metrics (only matters for manual `backfill-cache.js`).
- ARCHITECTURE.md still describes old grid (selector on right), manual-only Load, auto cache sync — update after modularization PR.

---

## 10. Quick commands

```bash
# Player
python launch_player.py

# Catalog status (needs local data/hooktheory_catalog.db)
cd _Research_testing/hooktheory_catalog && node cli/status.js

# Pipeline smoke test
node _Research_testing/hooktheory_catalog/scripts/pipelineClosedLoopTest.js --tier quick

# List cache folders
dir .hooktheory_cache
```
