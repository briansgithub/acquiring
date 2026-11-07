# T22 harvest kernel

2026-11-07T14:40Z Frozen 801cf798 HarvestLedger.kt + HarvestedSong.kt + HarvestService slug only. In-memory ports: record REPLACE, adopt IGNORE, replay skips existing slugs (catalog rating wins), one-time legacy amnesty `legacyHarvestsAdopted`, decline when unrated-with-chords > 500. No Hooktheory fetch, no worker, no catalog-install wiring, no T06 IDB adapter this slice. `harvestSlugFromUrl` is local string kernel. T22-harvest-ledger-unit FIRST PASS with native cases minus Room playlist migration (T06 already owns user schema). Settings Back untouched.
