# Sacred Ring — portable data bundle

Bulky runtime data lives **outside** the git-tracked codebase in a single portable root (`SACRED_RING_DATA`).

## Layout

```
<sacred_ring_data>/
  catalog/           SQLite DB + daemon state (.meili_auth.json, logs, …)
  playback/
    .hooktheory_cache/   section JSON + _metadata.json per song
  harvest/
    <slug>/          scrape.json, report.json, oracle outputs per song
  README.txt         flash-drive copy notes (generated in real bundle)
```

## Setup on a new machine

1. Clone the Sacred Ring **code** repo from GitHub.
2. Copy the entire `sacred_ring_data` folder from a flash drive (or another PC).
3. Point the app at it — **one** of:
   - Set env: `SACRED_RING_DATA=H:\path\to\sacred_ring_data`
   - Copy `sacred_ring_data.config.json.example` → `sacred_ring_data.config.json` and set `"dataRoot"`.
   - Place the folder at `<repo>/sacred_ring_data/` (default dev layout).
4. Stop any running player/daemon before copying the catalog DB (WAL mode — copy `.db`, `-wal`, `-shm` together).
5. Start: `python launch_player.py`

## What stays in the code repo

- `web-player/` — UI + audio engine
- `_Decode_oracle/*.js` — oracle harness **code**
- `_Decode_oracle/chord_db*` — regression corpora (optional; not in the portable song bundle)
- `Documentation/`, `ORACLE_GUIDE/`

## Flash-drive copy checklist

- [ ] `catalog/hooktheory_catalog.db` (+ `-wal` / `-shm` if present)
- [ ] `catalog/.meili_auth.json` (if using Meili discovery)
- [ ] `playback/.hooktheory_cache/` (all song folders)
- [ ] `harvest/<slug>/` for each song you need (at minimum `scrape.json` + `report.json` for tested songs)
