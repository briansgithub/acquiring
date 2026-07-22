# Morning resume — catalog engine error loop

Generated before overnight run (~2026-07-22).

## Session fixes landed (uncommitted)

- **Fix 040** — Tarkus custom-bor prefix, 4lung b5→°, phdm II△7, viiø7 harness
- **Fix 041** — `chordRootPc` applied target uses parent key scale; `(maj)` denominator tag

## Baseline before overnight

- See `_Debug_testing/overnight_baseline_top_errors.md`
- **151** full-harvest slugs, **8094** compared rows, **64** engine failures, **1302** fetch queued

## Overnight processes

| Process | Purpose |
|---------|---------|
| `_Debug_testing/overnightFetch.ps1` | Waits for current `batchFullFetch`, then `runFetchDaemon --wave-size 20` |
| `_Debug_testing/watchFetchWaves.mjs` | Emits `_Debug_testing/top_errors_<wave-id>.md` per completed wave |
| Log | `sacred_ring_data/catalog/overnight_fetch.log` |

## Morning commands (run in order)

```powershell
cd H:\Desktop\3_sacred_ring

# 1. State
node _Debug_testing/queryTopErrors.mjs --limit 15

# 2. Read wave briefs written overnight
dir _Debug_testing\top_errors_*.md

# 3. Fresh rollup if needed
node _Research_testing/hooktheory_catalog/cli/batchCompareCatalog.js --resync

# 4. Re-prioritize queue
node _Research_testing/hooktheory_catalog/cli/buildFetchQueue.js

# 5. Regression gate (corpus4 had file lock last session)
node _Decode_oracle/buildChordDb.js --corpus _Decode_oracle/corpus4.json --db-dir _Decode_oracle/chord_db_corpus4
```

## First fix target

**Applied add11 duplicate** — `ii7(add11add11)/vi` (celso-machado), ~5 catalog fails. PCs + roman. Compare enrichment likely double-merging `adds:[4]`.

## Pause / stop fetch before engine edits

```powershell
# pause
New-Item -ItemType File -Path sacred_ring_data\catalog\.fetch_pause_for_fix -Force
# resume
Remove-Item sacred_ring_data\catalog\.fetch_pause_for_fix -ErrorAction SilentlyContinue
# hard stop daemon
New-Item -ItemType File -Path sacred_ring_data\catalog\.full_fetch_stop -Force
```

Delete `.full_fetch_stop` before next fetch run.
