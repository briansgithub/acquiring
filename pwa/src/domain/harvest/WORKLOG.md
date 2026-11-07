# T22 harvest kernel

2026-11-07T14:40Z Frozen 801cf798 HarvestLedger.kt + HarvestedSong.kt + HarvestService slug only. In-memory ports: record REPLACE, adopt IGNORE, replay skips existing slugs (catalog rating wins), one-time legacy amnesty `legacyHarvestsAdopted`, decline when unrated-with-chords > 500. No Hooktheory fetch, no worker, no catalog-install wiring, no T06 IDB adapter this slice. `harvestSlugFromUrl` is local string kernel. T22-harvest-ledger-unit FIRST PASS with native cases minus Room playlist migration (T06 already owns user schema). Settings Back untouched.

2026-11-07T15:10Z Catalog-swap wiring: adopt-before T05 pointer / replay-after with T06 `harvests` persistence. Immutable catalog.db is never written; OverlayHarvestCatalog + songPayload/songBrowseBySlugs overlay is the PWA restore. Adopt/replay never abort install. Launch-time repair on songs `active()`. Aural skips. All Songs group overlay not this slice. No Hooktheory HTTP. Settings Back untouched.
