# Acquiring — portable data bundle

Bulky runtime data lives **outside** the git-tracked codebase in a single portable root (`ACQUIRING_DATA`).

## Layout

```
<acquiring_data>/
  catalog/           SQLite DB + daemon state (.meili_auth.json, logs, …)
  playback/
    .hooktheory_cache/   section JSON + _metadata.json per song
  harvest/
    <slug>/          scrape.json, report.json, oracle outputs per song
  README.txt         flash-drive copy notes (generated in real bundle)
```

## Setup on a new machine

1. Clone the Acquiring **code** repo from GitHub.
2. Copy the entire `acquiring_data` folder from a flash drive (or another PC).
3. Point the app at it — **one** of:
   - Set env: `ACQUIRING_DATA=H:\path\to\acquiring_data`
   - Copy `acquiring_data.config.json.example` → `acquiring_data.config.json` and set `"dataRoot"`.
   - Place the folder at `<repo>/acquiring_data/` (default dev layout).
4. Stop any running player/daemon before copying the catalog DB (WAL mode — copy `.db`, `-wal`, `-shm` together).
5. Start: `python tooling/commands/launch_player.py`

## What stays in the code repo

- `web/` — UI + audio engine
- `tooling/_Decode_oracle/*.js` — oracle harness **code**
- `tooling/_Decode_oracle/chord_db*` — regression corpora (optional; not in the portable song bundle)
- `docs/`, `docs/oracle-guide/`

## Flash-drive copy checklist

- [ ] `catalog/hooktheory_catalog.db` (+ `-wal` / `-shm` if present)
- [ ] `catalog/.meili_auth.json` (if using Meili discovery)
- [ ] `playback/.hooktheory_cache/` (all song folders)
- [ ] `harvest/<slug>/` for each song you need (at minimum `scrape.json` + `report.json` for tested songs)
