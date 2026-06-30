# Hooktheory Song Catalog — Usage

Self-contained module at `_Research_testing/hooktheory_catalog/`. Discovers TheoryTab songs from Hooktheory (Meilisearch + legacy URL list + light crawl), stores metadata in SQLite, and enriches each song with Hooktheory SongMetrics, chord/transition stats, and a normalized 0–100 complexity rating. Respects API rate limits and uses conservative pacing for Puppeteer enrichment.

**Dependencies:** root `package.json` (`better-sqlite3`, `puppeteer`). Run commands from repo root or from this directory.

---

## Directory layout

| Path | Purpose |
|------|---------|
| `lib/` | Core logic: DB schema, discovery, enrichment, daemon, rate-limited API client |
| `cli/` | Preferred CLI entrypoints |
| `web/api.js` | HTTP handlers consumed by `web-player/catalogApi.js` |
| `probes/` | One-off endpoint/auth research scripts |
| `scripts/` | Windows PowerShell daemon control |
| `data/` | Runtime artifacts (DB, logs, state, auth caches) — gitignored |
| `index.js` | Programmatic `require()` exports |
| `*.js` (root) | Backward-compat shims delegating to `lib/` / `cli/` |

Repo-level `lib/api/hooktheoryApi.js` and `lib/api/rateLimitPool.js` re-export this module’s API client for the oracle harness.

---

## Quick start

```bash
# From repo root
cd _Research_testing/hooktheory_catalog

# Check catalog state
node cli/status.js

# Quick discover + enrich a few songs (foreground, ~minutes)
node cli/update.js --mode quick --enrich-limit 5

# Export enriched rows
node cli/export.js --format json
```

Web UI: start the player with `python launch_player.py` (or `node web-player/server.js`). The **Song Selector** panel (left column of `index.html`) uses `/api/library`. Catalog admin page: `/catalog.html` via `/api/catalog/*`.

**Data layout note:** bulky runtime data lives in `sacred_ring_data/` (or `SACRED_RING_DATA` env) — see [data/README.md](../../data/README.md). Catalog SQLite is under `catalog/`; playback cache under `playback/.hooktheory_cache/`; harvest artifacts under `harvest/<slug>/`.

---

## CLI reference

All commands also work via root shims (`node status.js`, etc.).

### `cli/status.js`

Print totals (pending / enriched / errors), last discovery run, top songs by complexity.

### `cli/update.js`

Foreground batch update (discover then enrich).

```
node cli/update.js [--mode quick|full] [--enrich-limit N]
                   [--discover-only | --enrich-only]
                   [--pages N] [--meili-pages N]
```

| Flag | Default | Notes |
|------|---------|-------|
| `--mode quick` | quick | `full` sets `--meili-pages` to 400 if unset |
| `--enrich-limit` | 20 | Max songs to enrich per run |
| `--discover-only` | — | Skip enrichment |
| `--enrich-only` | — | Skip discovery |
| `--pages` | 3 | Search-crawl depth (quick modes) |
| `--meili-pages` | 0 | `0` = unlimited Meili pagination in full/daemon |

State written to `data/.update_state.json`.

### `cli/discover.js`

Discovery only.

```
node cli/discover.js [--mode quick|full] [--pages N] [--meili-pages N]
                     [--resume-offset N] [--dry-run]
```

Sources (unless resumed mid-Meili): legacy `_Research_testing/discovered_urls.json`, `/theorytab/recent`, alphabet search crawl, Meilisearch index `theorytabs`.

### `cli/enrich.js`

Enrich pending queue only.

```
node cli/enrich.js [--limit N]
```

Per song: Puppeteer page load → section `songId`s → public API chord JSON → SongMetrics parse → `unique_chords`, `unique_transitions`, `complexity_rating`.

### `cli/catalogDaemon.js`

Long-running discover-then-enrich daemon with checkpoint resume.

```
node cli/catalogDaemon.js [--phase auto|discover|enrich]
                          [--interval-ms MS] [--max-songs N]
                          [--batch-log N] [--skip-legacy]
```

| Phase | Behavior |
|-------|----------|
| `auto` | Discover until Meili exhausted (if not done), then enrich until stop or queue empty |
| `discover` | Meili pagination only; saves `discover_offset` for resume |
| `enrich` | Pending queue only |

Stop gracefully: create `data/.catalog_stop` or run `.\stop-daemon.ps1`. Logs: `data/daemon.log`. State: `data/daemon_state.json`, PID: `data/daemon.pid`.

### `cli/backfill-cache.js` (manual migration only)

One-off: register `.hooktheory_cache/` songs in the catalog DB. **Not** run automatically on library load — normal workflow is catalog → fetch → test.

```
node cli/backfill-cache.js
```

### `cli/export.js`

```
node cli/export.js [--format json|csv]
```

Output: `data/catalog_export.json` or `data/catalog_export.csv`.

### `cli/discoverDiff.js`

```
node cli/discoverDiff.js [--full]
```

Runs discovery and reports new vs existing row counts (JSON stdout).

### `cli/rateProbe.js`

Benchmark public vs Trends API throughput.

```
node cli/rateProbe.js [--endpoint public|trends] [--requests N]
```

Results: `data/rate_probe_results.json`. Trends endpoint needs Hooktheory `activkey` (see `lib/trendsApi.js`).

---

## Windows daemon scripts

From this directory:

```powershell
.\start-daemon.ps1              # phase=auto
.\start-daemon.ps1 --discover-only
.\start-daemon.ps1 --enrich-only
.\stop-daemon.ps1
.\status-daemon.ps1
```

Scripts delegate to `scripts/` and read/write `data/` for PID, stop file, and logs.

---

## Environment variables

| Variable | Default | Effect |
|----------|---------|--------|
| `CATALOG_INTERVAL_MS` | 25000 | Delay between enrich songs (daemon) |
| `CATALOG_JITTER_MS` | 3000 | Random ± jitter on interval |
| `CATALOG_API_UTILIZATION` | 0.8 | Target fraction of advertised API rate |
| `CATALOG_MAX_BACKOFF_MS` | 300000 | Max backoff on 429/5xx |
| `CATALOG_MIN_INTERVAL_MS` | 1000 | Floor between API requests |
| `CATALOG_USER_AGENT` | SacredRingCatalog/1.0 | HTTP User-Agent |
| `CATALOG_BATCH_LOG` | 10 | Daemon progress log frequency |
| `CATALOG_MAX_SONGS` | 0 | Daemon cap (`0` = unlimited) |

---

## Database

- **File:** `data/hooktheory_catalog.db` (WAL mode)
- **Tables:** `songs`, `song_metrics`, `song_stats`, `song_details`, `song_sections`, `discovery_runs`
- **Pipeline columns on `songs`:** `cache_dir`, `processed_at`, `oracle_tested_at` — link catalog rows to `.hooktheory_cache/` and oracle test state
- **Song status:** `pending` → `enriched` | `error` | `dead`
- **Field reference:** [DATA_FIELDS.md](./DATA_FIELDS.md) — which API/HTML fields are stored vs deferred

Legacy DB at module root is copied to `data/` on first `openDb()`; safe to delete root copy after migration.

### Programmatic access

```javascript
const catalog = require('./index'); // or full path from repo root
const db = catalog.openDb();
const { totals } = catalog.getCatalogStatus(db);
const rows = catalog.listSongs(db, { limit: 50, orderBy: 'complexity_rating' });
```

Or require individual `lib/*` modules.

---

## Web-player integration

### Catalog admin (`/catalog.html`)

| Route | Handler |
|-------|---------|
| `GET /api/catalog/status` | DB totals + top songs + update/daemon state |
| `POST /api/catalog/update?mode=quick&enrichLimit=5` | Spawn `cli/update.js` |
| `GET /api/catalog/daemon/status` | Daemon state |
| `POST /api/catalog/daemon/start?phase=auto` | Spawn `cli/catalogDaemon.js` |
| `POST /api/catalog/daemon/stop` | Write `data/.catalog_stop` |
| `GET /api/catalog/songs` | Minimal song list (legacy) |
| `GET /api/catalog/song?slug=` | Song detail (legacy) |

### Unified library (Song Selector)

| Route | Handler |
|-------|---------|
| `GET /api/library` | Catalog + `playable`, `cacheKey`, pipeline `flags` (DB only — no cache auto-import) |
| `GET /api/library/song?slug=` | Detail + `canLoad` / `loadGateMissing` + `oracleSummary` (enriched from `report.json` when needed) |
| `POST /api/library/load?slug=` | Validate gate; return `{ cacheKey }` for `player.js` |
| `POST /api/library/add` | Body `{ url }` — upsert, Fetch harvest, parallel metadata + processed → `{ jobId, slug }` |

### Pipeline actions (Song Selector buttons)

| Route | Handler |
|-------|---------|
| `POST /api/library/pipeline/harvest?slug=` | One browser pass → `scrape.json` + parallel metadata/processed locals |
| `POST /api/library/pipeline/:action?slug=` | Start async job (`harvest`, `metadata`, `processed`, `tested`) → `{ jobId }` |
| `GET /api/library/pipeline/job?id=` | Poll job status + updated `flags` |
| `POST /api/library/pipeline/:action/clear?slug=` | Sync clear for that step only; returns fresh `flags` |

**Fetch** is the only step that opens Hooktheory in a browser. Other steps read `_Decode_oracle/out/<slug>/scrape.json` locally. **metadata** / **processed** / **tested** return 409 if harvest artifact is missing.

Pipeline flags: **catalogued** (row exists), **harvested** (`scrape.json` valid), **metadata** (`status = enriched`), **processed** (`cache_dir` + `processed_at`), **tested** (`oracle_tested_at`). API `canLoad` requires metadata + processed; Song Selector **auto-load** requires all five flags.

`web-player/catalogApi.js` re-exports `hooktheory_catalog/web/api.js`.

---

## Complexity model

Uses Hooktheory’s five SongMetrics (chord complexity, melodic complexity, chord–melody tension, progression novelty, chord–bass melody) with corpus-normalized weighting → `complexity_rating` 0–100. Fallback metrics source noted in `metrics_source` when HTML parse is incomplete.

Chord stats (`unique_chords`, `unique_transitions`) come from public API `jsonData` via shared `lib/extractor/dataExtractor` (bridged in `lib/dataExtractor.js`).

---

## Rate limiting

`lib/api/rateLimitPool.js` reads `X-Rate-Limit-*` response headers per hostname. Public API observed ~20 req/10s; daemon default 25s/song keeps Puppeteer as the bottleneck. Use `cli/rateProbe.js` before changing intervals.

Meilisearch auth is captured once via Puppeteer and cached in `data/.meili_auth.json` (12h TTL).

---

## Probes (`probes/`)

Ad-hoc research scripts — not part of normal operation:

- `probeEndpoints.js` — API surface discovery
- `probeMeili.js`, `probeMeiliAuth.js`, `probeMeiliPagination.js` — Meilisearch behavior
- `dumpMetricsHtml.js` — SongMetrics HTML structure

---

## Light catalog batch (API-only, script-gated)

Respectful bulk ingest without Puppeteer per song:

1. **Discover** via Meilisearch pagination (stores `song_sections.song_id` from index hits).
2. **Light harvest** via `fetchSongData` per section + optional `fetchHtml` for SongMetrics.
3. **Locals** — `runLocalsParallel` writes metadata + `.hooktheory_cache/` (`harvest_mode = light`).

**Does not** populate oracle SVG/piano — use full **Fetch** for `tested`.

### Activation (Song Selector UI)

Open the player → **Song Selector** → **Bulk light catalog**:

| Mode | What it does |
|------|----------------|
| **Database only** | Light-harvest songs already in SQLite (no Meili discover). Default for incremental work. |
| **Discover new + harvest** | Limited Meili pages, then harvest up to the limit. |
| **Full discover + harvest** | All Meili pages + every pending song (confirm dialog). |

Set **Harvest limit** for the first two modes. **Start** spawns a background worker; the panel shows phase, queue, log tail, and pause/resume/cancel.

CLI equivalent: `node cli/lightCatalog.js --harvest-only --limit 50` (db-only) or `--limit 50 --meili-pages 25` or `--all`

### Live progress

Song Selector polls `GET /api/library/catalog/batch/status` every 2s while a job runs. Start via `POST /api/library/catalog/batch/start?mode=db-only&limit=50`.

### Rate limits

- Public API: ~20 req/10s — pooled at 80% utilization (`CATALOG_API_UTILIZATION`).
- Meili: ~200 hits/page; auth cached 12h in `data/.meili_auth.json`.
- Default inter-song delay: `LIGHT_CATALOG_INTERVAL_MS` (default 4000).
- **Trends API** (10 req/10s) is not used for enumeration.

### Delta queue

Only songs with `harvest_mode IS NULL OR != 'light'` and at least one `song_sections` row are harvested.

---

## Typical workflows

**Incremental local update**

```bash
node cli/update.js --mode quick --enrich-limit 10
```

**Full catalog discovery (hours)**

```bash
node cli/catalogDaemon.js --phase discover
# or
.\start-daemon.ps1 --discover-only
```

**Background enrichment (days at default rate)**

```bash
$env:CATALOG_INTERVAL_MS = "25000"
.\start-daemon.ps1 --enrich-only
```

**Resume after stop**

Daemon reads `data/daemon_state.json` (`discover_offset`, `discovery_complete`) and continues Meili from last offset.

---

## What this module does *not* do

- Does not replace the oracle harness (`_Decode_oracle/`) — shares API/extractor only.
- Does not download full Hooktheory catalog instantly — ~76k TheoryTabs exist; discovery is Meili-paginated, enrichment is serial and slow by design.
- Does not scrape when the public API + page metrics suffice.

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `Failed to capture Meilisearch authorization` | Re-run discover; delete stale `data/.meili_auth.json` |
| Daemon won’t stop | `data/.catalog_stop` + `stop-daemon.ps1`; check `data/daemon.pid` |
| 429 storms | Lower `CATALOG_API_UTILIZATION`; run `rateProbe.js` |
| Empty metrics | Song may lack SongMetrics on page; check `status` / `error_message` columns |
| Wrong DB path | Ensure using `openDb()` / `data/` — not a stale root `hooktheory_catalog.db` |
