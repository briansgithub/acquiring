# Hooktheory Catalog — Command Cheatsheet

Run from `_Research_testing/hooktheory_catalog/` unless noted. Root shims (`node status.js`) work the same as `cli/*`.

## Keep the catalog current

| Command | What it does |
|---------|----------------|
| `$env:HOOKTHEORY_CATALOG_AUTHORIZED='1'; node cli/sync-catalog.js` | Find + add songs after written Hooktheory authorization; DB only |
| `node cli/sync-catalog.js --publish` | ...and rebuild + upload the Android release asset |
| `node cli/sync-catalog.js --dry-run` | Report what it would do; zero requests |
| `node cli/sync-catalog.js --cdx-max-age-days 7` | Re-pull the archive index if older than 7d (default 30) |
| `node cli/sync-catalog.js --with-artist-sweep` | Add the artist-page channel (~12k requests, ~47 songs — rarely worth it) |
| `.\Sync-Catalog.ps1` (repo root) | Same, from PowerShell (`-Publish`, `-DryRun`, `-CdxMaxAgeDays`) |

Re-running is cheap: already-playable songs and links confirmed dead are
skipped before any request. Dead links are never re-checked. Only one sync runs
at a time; an overlapping invocation exits 0 without doing anything.

Remote sync is gated because Hooktheory's current Terms require express
authorization for scraping/bulk download. `--dry-run` is always allowed. The
environment flag records an authorization you already obtained; it does not
itself grant permission.

## Run it daily / check coverage

| Command | What it does |
|---------|----------------|
| `.\Register-SyncTask.ps1 -ConfirmHooktheoryAuthorization` (repo root) | After written authorization, register a daily 04:00 sync; DB only |
| `.\Register-SyncTask.ps1 -At 02:30` | Same, different time |
| `.\Register-SyncTask.ps1 -Unregister` | Remove the scheduled task |
| `Start-ScheduledTask SacredRingCatalogSync` | Run the scheduled task immediately |
| `node cli/coverage.js` | **"Have we got everything?"** verdict; exit 0 = caught up, 1 = action needed |

Daily costs ~0.16% of Hooktheory's documented budget and caps the window a new
song sits unharvested at 24h. Task log: `sacred_ring_data/catalog/sync-task.log`.

## One-off recovery run (hours, not minutes)

Answers "is there anything we ever missed?" — walks every artist page. For
opening a new channel or after changing discovery logic, not on a schedule.
Run from the repo root (or a worktree; see USAGE.md).

| Command | What it does |
|---------|----------------|
| `.\Start-Recovery.ps1` | Resume the full recovery run, detached |
| `.\Start-Recovery.ps1 -Foreground` | Same, in this window (Ctrl+C stops) |
| `.\Status-Recovery.ps1` | Progress bar, phase counts, log tail |
| `.\Stop-Recovery.ps1` | Halt between items (`-Force` to kill) |

Always resumes; never pass `--fresh` to a restart or it re-walks thousands of
already-visited artists. Re-running Start is safe — it refuses to launch a
second copy, because two orchestrators sharing one catalog corrupt each other
silently. Adds two phases the sync lacks: `alt-lookup` (recheck dead rows) and
`unknown-artists` (find artists we hold no song for).

Budget: 12,144 artists at ~2.4s each; last full sweep yielded 74 songs.

## Status & export

| Command | What it does |
|---------|----------------|
| `node cli/status.js` | DB totals, **last run per discovery channel**, top 10 by complexity |
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

- `lib/cacheSync.js` — `CACHE_ROOT`, `commitProcessedCache` (processed pipeline step only; no cache→DB import)
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

## Catalog purge

| Command | What it does |
|---------|----------------|
| `node cli/purge-catalog.js --yes` | Wipe all catalog song rows (cache/harvest files untouched) |

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
