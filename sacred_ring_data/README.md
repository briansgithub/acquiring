# Sacred Ring data bundle (template)

This folder is a **placeholder** in the code repo. Your real data lives here on disk but should **not** be committed to GitHub once modularization is complete.

Copy this entire `sacred_ring_data/` tree to another PC (flash drive), point the app at it, and run the player.

## Expected layout (after modularization)

```
sacred_ring_data/
  catalog/
    hooktheory_catalog.db      # SQLite (+ .db-wal / .db-shm if server was running)
    .meili_auth.json           # optional Meili auth cache
  playback/
    .hooktheory_cache/         # one folder per song — section JSON + _metadata.json
  harvest/
    <slug>/                    # e.g. scott-joplin__maple-leaf-rag/
      scrape.json
      report.json
      summary.md               # oracle outputs
```

## Setup on a new machine

1. Clone the **code** repo (no bulky data).
2. Copy this `sacred_ring_data/` folder next to the repo (or anywhere).
3. Set environment variable before starting the player:

   ```powershell
   $env:SACRED_RING_DATA = "H:\path\to\sacred_ring_data"
   python launch_player.py
   ```

   *(Env var name is provisional — see HANDOFF.md for what the next refactor actually implements.)*

4. Verify Song Selector shows your songs and playback works.

## Current state (pre-modularization)

Until the refactor lands, data is still split:

| What | Where today |
|------|-------------|
| SQLite DB | `_Research_testing/hooktheory_catalog/data/` |
| Playback cache | `<repo>/.hooktheory_cache/` |
| Harvest / oracle per song | `<repo>/_Decode_oracle/out/<slug>/` |

See [HANDOFF.md](../HANDOFF.md) for the six-song working set and migration plan.
