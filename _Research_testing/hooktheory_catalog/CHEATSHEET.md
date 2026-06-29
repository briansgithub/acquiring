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

## Web UI (from repo root)

| Command | What it does |
|---------|----------------|
| `node web-player/server.js` | Start server; open `/catalog.html` |
| `POST /api/catalog/update?mode=quick&enrichLimit=5` | Trigger foreground update via HTTP |
| `POST /api/catalog/daemon/start?phase=auto` | Start daemon via HTTP |
| `POST /api/catalog/daemon/stop` | Write stop file via HTTP |

## Monitor & troubleshoot

| Command | What it does |
|---------|----------------|
| `Get-Content data\daemon.log -Tail 20 -Wait` | Tail daemon log (PowerShell) |
| `type data\daemon_state.json` | Current phase, offset, last slug |
| `type data\.update_state.json` | Last foreground update state |
