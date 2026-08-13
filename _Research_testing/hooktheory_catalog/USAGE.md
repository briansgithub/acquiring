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

# Check catalog state, incl. when each discovery channel last ran
node cli/status.js

# Find and add any songs Hooktheory has that we don't  <-- the usual command
node cli/sync-catalog.js

# Export enriched rows
node cli/export.js --format json
```

---

## Keeping the catalog current (`cli/sync-catalog.js`)

The one command to run periodically. Safe to run on demand, as often as you
like — from the repo root, `.\Sync-Catalog.ps1` does the same thing.

```bash
node cli/sync-catalog.js                    # update the database only
node cli/sync-catalog.js --publish          # ...and ship the Android asset
node cli/sync-catalog.js --dry-run          # report only, zero requests
node cli/sync-catalog.js --with-artist-sweep   # add the slow, low-yield channel
node cli/sync-catalog.js --cdx-max-age-days 7  # re-pull the archive index sooner
node cli/sync-catalog.js --resume           # continue an interrupted sync
```

**Why it is cheap to re-run.** Every request-costing step is gated on work not
already done, so a second run immediately after a first does almost nothing:

| Already known | Skipped because |
|---|---|
| Songs we hold playable | `listSongsNeedingLightHarvest` filters `harvest_mode NOT IN ('light','blocked','full')` |
| Links confirmed dead (404) | Same filter excludes `status='dead'`; candidate diffing compares against *every* known slug, dead included |
| Archive index still fresh | `wayback-refresh` re-pulls only past `--cdx-max-age-days` (default 30), and costs hooktheory.com nothing regardless |

Dead links are **never** re-checked — once a URL 404s it stays skipped
permanently. (Measured: 0 of 5,098 dead songs recovered when re-tested.)

**Channels it runs**, in order:

1. `wayback-refresh` — re-pull the Internet Archive CDX index if stale
   (archive.org only, zero hooktheory.com requests)
2. `wayback-ingest` — diff archived TheoryTab URLs against the catalog
3. `meili-refresh` — re-walk Hooktheory's search index; this is what catches
   *newly uploaded* songs
4. `meili-harvest` — drain the light-harvest queue (all channels at once)
5. `verify-final` — reclassify every song into playable / stale / dead buckets

The artist-page sweep is **excluded by default**: measured ~12k requests for
~47 songs, roughly 20× worse per request than Wayback.

Publishing is opt-in so a routine check never pushes a ~62 MB release asset on
its own. With `--publish` it rebuilds via `scripts/drop-dead-rows-and-rebuild.js`
(which drops unloadable rows and validates against the app's own download
check) and uploads to the GitHub release.

Each channel run is recorded in `discovery_runs`; `node cli/status.js` prints
the latest per channel so a channel that has silently stopped finding anything
is distinguishable from one that is simply up to date.

Only one sync runs at a time. A second invocation while one is in flight exits
immediately with code 0 and a message — a skipped overlapping run is correct,
not a failure. A lock left by a crashed run is reclaimed automatically, so one
bad run can never disable the schedule permanently.

### Running it automatically (daily)

```powershell
.\Register-SyncTask.ps1                 # daily at 04:00, database only
.\Register-SyncTask.ps1 -At 02:30       # different time
.\Register-SyncTask.ps1 -Unregister     # remove
Start-ScheduledTask SacredRingCatalogSync   # run it now
```

Registers a Windows Scheduled Task (`SacredRingCatalogSync`) — OS-native, so
there is no resident process to die silently. `-StartWhenAvailable` is set, so a
run missed because the machine was off happens at next boot instead of being
skipped. Output appends to `sacred_ring_data/catalog/sync-task.log`.

**Why daily.** A sync costs ~210 requests (~4 min) — about **0.16%** of
Hooktheory's documented daily budget — so frequency is essentially free, and the
only thing being traded is how long a newly-published song sits unharvested
before it could be deleted upstream. Daily caps that at 24h; at the measured
~15–25 new songs/day it catches each day's batch while it is fresh. Once a song
is harvested the risk is gone permanently, because the chord data is local.

The task does **not** publish. The catalog stays current automatically; shipping
the ~62 MB Android asset stays a deliberate `.\Sync-Catalog.ps1 -Publish`.

### Have we got everything? (`cli/coverage.js`)

```bash
node cli/coverage.js     # exit 0 = caught up, exit 1 = action needed
```

Prints a verdict rather than raw numbers, and is explicit about what it can and
cannot claim:

- **untried backlog** — must be `0`; anything else is a song discovered but
  never attempted
- **row accounting** — `total == harvested + dead + untried`, flagged if it drifts
- **index exhaustion** — whether the last full index walk added nothing
- **archive freshness** — age of the CDX cache vs the staleness threshold
- **staleness alarm** — shouts if no sync has run in >3 days, which is what
  catches a scheduled task that has been quietly failing for weeks

Because it exits non-zero when action is needed, it works directly as a
monitoring check.

**What it cannot tell you:** absolute completeness. Hooktheory publishes no song
total, and their search index has a measured ceiling (~40.3k) that the Internet
Archive channel beat by 1,415 songs. "Caught up" therefore means *complete with
respect to the channels we have*, never *we have every song on the site*.

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

Sources (unless resumed mid-Meili): `/theorytab/recent`, alphabet search crawl, Meilisearch index `theorytabs`. (Legacy `discovered_urls.json` is no longer used for catalog.)

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

### `cli/purge-catalog.js`

Wipe all catalog song rows (requires `--yes`). Does not delete playback cache or harvest artifacts.

```
node cli/purge-catalog.js --yes
```

Legacy `cli/backfill-cache.js` was removed — cache folders never create catalog rows.

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
