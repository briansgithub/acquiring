# Hooktheory Catalog — Command Cheatsheet

Run from `_Research_testing/hooktheory_catalog/` unless noted. Root shims (`node status.js`) work the same as `cli/*`.

## Status & export

| Command | What it does |
|---------|----------------|
| `node cli/status.js` | Print DB totals, last run, top 10 by complexity |
| `node cli/export.js --format json` | Write all rows → `data/catalog_export.json` |
| `node cli/export.js --format csv` | Write all rows → `data/catalog_export.csv` |
| `node cli/discoverDiff.js` | Quick discover; JSON diff (new vs existing counts) |
| `node cli/discoverDiff.js --full` | Full-mode discover; JSON diff |

## Foreground batch (`cli/update.js`)

| Command | What it does |
|---------|----------------|
| `node cli/update.js` | Quick discover + enrich 20 songs |
| `node cli/update.js --mode quick --enrich-limit 5` | Quick discover + enrich 5 songs |
| `node cli/update.js --mode full --enrich-limit 50` | Fuller Meili crawl (400 pages) + enrich 50 |
| `node cli/update.js --discover-only` | Discover only, no enrichment |
| `node cli/update.js --enrich-only --enrich-limit 100` | Enrich up to 100 pending, no discover |
| `node cli/update.js --meili-pages 0` | Unlimited Meili pages (discover phase) |

## Discover only (`cli/discover.js`)

| Command | What it does |
|---------|----------------|
| `node cli/discover.js` | Quick discover (legacy URLs + recent + search + Meili) |
| `node cli/discover.js --mode full` | Full discover; unlimited Meili pagination |
| `node cli/discover.js --dry-run` | Discover without writing to DB |
| `node cli/discover.js --resume-offset 4000` | Resume Meili from offset 4000 |

## Enrich only (`cli/enrich.js`)

| Command | What it does |
|---------|----------------|
| `node cli/enrich.js` | Enrich up to 10 pending songs (Puppeteer + API) |
| `node cli/enrich.js --limit 1` | Enrich exactly 1 pending song (good smoke test) |
| `node cli/enrich.js --limit 50` | Enrich up to 50 pending songs |

## Daemon — foreground (`cli/catalogDaemon.js`)

| Command | What it does |
|---------|----------------|
| `node cli/catalogDaemon.js --phase auto` | Full run: discover all (Meili) then enrich queue |
| `node cli/catalogDaemon.js --phase discover` | Meili discovery only; checkpoints offset |
| `node cli/catalogDaemon.js --phase enrich` | Enrich pending queue until empty or stopped |
| `node cli/catalogDaemon.js --phase enrich --max-songs 1` | Enrich 1 song then exit |
| `node cli/catalogDaemon.js --phase enrich --interval-ms 30000` | 30s between songs |
| `node cli/catalogDaemon.js --phase auto --skip-legacy` | Skip legacy URL list on discover |

## Daemon — background (PowerShell)

| Command | What it does |
|---------|----------------|
| `.\start-daemon.ps1` | Start background daemon (`phase=auto`) |
| `.\start-daemon.ps1 --discover-only` | Background Meili discovery only |
| `.\start-daemon.ps1 --enrich-only` | Background enrichment only |
| `.\stop-daemon.ps1` | Graceful stop (finishes current song) |
| `.\status-daemon.ps1` | PID, phase, offset + runs `cli/status.js` |

## Rate limiting

| Command | What it does |
|---------|----------------|
| `node cli/rateProbe.js --endpoint public --requests 20` | Benchmark public API; → `data/rate_probe_results.json` |
| `node cli/rateProbe.js --endpoint trends --requests 10` | Benchmark Trends API (needs activkey) |

## Environment (prefix before any command)

| Command | What it does |
|---------|----------------|
| `$env:CATALOG_INTERVAL_MS = "25000"` | 25s between enrich songs (daemon) |
| `$env:CATALOG_INTERVAL_MS = "30000"; .\start-daemon.ps1` | Slower background enrich |
| `$env:CATALOG_MAX_SONGS = "100"` | Daemon stops after 100 enrichments |

## Cache sync (`lib/cacheSync.js`, `lib/library.js`)

- `syncCacheToCatalog(db)` — scan `.hooktheory_cache/`, upsert by URL slug
- `markSongFromCache(db, url, cacheDirName)` — called from `extract_hooktheory_data.js` after each extract
- `listLibrary(db)` / `getLibrarySong(db, slug)` / `resolveLoad(db, slug)` — unified API helpers
- `lib/pipelineFlags.js` — `computeFlags`, `canLoad`, `loadGateMissing` (includes `harvested`)
- `lib/harvest.js` — `harvestSong` (single browser pass → `scrape.json`)
- `lib/harvestArtifact.js` — harvest path helpers, `loadHarvest`, `isHarvested`
- `lib/metadataFromHarvest.js` / `lib/processedFromHarvest.js` — local transforms
- `lib/runLocalsParallel.js` — parallel metadata + processed (+ optional tested worker)
- `lib/pipelineOps.js` — run/clear for `harvest`, `metadata`, `processed`, `tested`
- `lib/pipelineJobs.js` — in-memory async jobs (`startJob`, `startAddJob`)
- `lib/addSongPipeline.js` — `addSongFromUrl` (upsert + harvest)

## Web UI (from repo root)

| Command | What it does |
|---------|----------------|
| `python launch_player.py` | Free port 3000, start server, Ctrl+C / Quit stops |
| `node web-player/server.js` | Start server only |
| `GET /api/library` | Song Selector index (catalog + cache flags) |
| `POST /api/library/add` | Body `{ url }` — upsert + Fetch + parallel locals |
| `POST /api/library/pipeline/harvest?slug=…` | Fetch job (browser + parallel metadata/processed) |
| `POST /api/library/pipeline/metadata?slug=…` | Local enrich from harvest |
| `POST /api/library/pipeline/processed?slug=…` | Local cache write from harvest |
| `POST /api/library/pipeline/tested?slug=…` | Local oracle compare (worker thread) |
| `POST /api/library/pipeline/:action/clear?slug=…` | Hold-to-clear (sync) |
| `POST /api/library/load?slug=…` | Gated load — returns `cacheKey` |
| `GET /api/library/catalog/batch/status` | Light catalog batch progress + log tail |
| `POST /api/library/catalog/batch/start?mode=db-only&limit=50` | Start light catalog (modes: db-only, discover-harvest, full) |
| `POST /api/library/catalog/batch/pause` | Pause light catalog worker |
| `POST /api/library/catalog/batch/resume` | Resume light catalog worker |
| `POST /api/library/catalog/batch/cancel` | Cancel light catalog worker |
| `node cli/lightCatalog.js --harvest-only --limit 50` | CLI: database-only light harvest |
| `node scripts/lightCatalogQueueTest.js` | Queue + harvestOk unit test (no network) |
| `POST /api/catalog/update?mode=quick&enrichLimit=5` | Trigger foreground update via HTTP |
| `POST /api/catalog/daemon/start?phase=auto` | Start daemon via HTTP |
| `POST /api/catalog/daemon/stop` | Write stop file via HTTP |

## Cache backfill

| Command | What it does |
|---------|----------------|
| `node cli/backfill-cache.js` | Upsert all `.hooktheory_cache/` songs into catalog DB |

## Pipeline closed-loop tests

| Command | What it does |
|---------|----------------|
| `node scripts/pipelineClosedLoopTest.js --tier quick` | Local harvest + metadata/processed tests (~seconds) |
| `node scripts/pipelineClosedLoopTest.js --tier full` | Above + tested from harvest worker |
| `node scripts/pipelineClosedLoopTest.js --case local_harvest` | Parallel locals + harvest gate assertions |
| `node scripts/pipelineClosedLoopTest.js --case fresh_url` | Single fixture |
| `node scripts/pipelineClosedLoopTest.js --http` | Add HTTP API spot-check (server on :3000) |

Report: `data/pipeline_closed_loop_report.json`

## Monitor & troubleshoot

| Command | What it does |
|---------|----------------|
| `Get-Content data\daemon.log -Tail 20 -Wait` | Tail daemon log (PowerShell) |
| `type data\daemon_state.json` | Current phase, offset, last slug |
| `type data\.update_state.json` | Last foreground update state |
