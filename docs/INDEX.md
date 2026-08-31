# Documentation Index

## Product documentation

| Document | Use it when… |
| --- | --- |
| [Product architecture](./architecture.md) | You need the web, Android, iOS, contract, data, or release boundaries. |
| [Feature parity](./feature-parity.md) | You need the current cross-platform implementation status. |
| [iOS porting plan](./porting-plan.md) | You are implementing the Swift/SwiftUI application. |
| [Web architecture](./web-architecture.md) | You need the detailed web engine, catalog, and oracle design. |

Master map of repo documentation. **Read the linked file when your task matches its scope** — do not guess module behavior from this index alone.

---

## Core project

| Document | Read when… |
|----------|------------|
| [web-architecture.md](./web-architecture.md) | You need the big picture: web engine, oracle closed-loop harness, repo/worktree layout, chord interpretation pipeline, and how scraped Hooktheory JSON flows into playback. |
| [TODO.md](./TODO.md) | You need the current prioritized work queue or open feature/fix items. |
| [MEMORY.md](./MEMORY.md) | You need durable project decisions, conventions, or context carried across sessions. |
| [HANDOFF.md](../HANDOFF.md) | **Starting a new session** — current repo state, Song Selector behavior, catalog/data layout. |
| [BUGS.md](./BUGS.md) | You are fixing a known bug or checking whether an issue is already tracked. |
| [PRONUNCIATION.md](./PRONUNCIATION.md) | You need chord **spoken readings** (analytic/functional/letter), `romanNumeralSpeak.js`, fixtures, or `npm run test:pronunciation`. |
| [ROMAN_NUMERALS.md](./ROMAN_NUMERALS.md) | You need **roman symbol display** (figured-bass stacks, °/ø quality glyphs, HTML + canvas rendering), `romanNumeralCanvas.js`, or `npm run test:roman-symbols`. |

---

## Data & Persistence

| Document | Read when… |
|----------|------------|
| [acquiring_data/README.md](../data/README.md) | You need to understand the **Modular Data Root**, how to move the project via flash drive, or how the catalog/cache directory is structured. |
| [DATA_FIELDS.md](../_Research_testing/hooktheory_catalog/DATA_FIELDS.md) | You need to know the schema of the **`hooktheory_catalog.db`** SQLite database. |
| [USAGE.md](../_Research_testing/hooktheory_catalog/USAGE.md) | You need to use the catalog CLI to discover, enrich, or update the database, run the daily sync, or drive a one-off full recovery run. |

---

## Research modules (`_Research_testing/`)

| Document | Read when… |
|----------|------------|
| [Hooktheory Song Catalog — USAGE](../_Research_testing/hooktheory_catalog/USAGE.md) | You need to **discover, store, enrich, or query TheoryTab songs** from hooktheory.com: SQLite catalog (`data/hooktheory_catalog.db`), Meilisearch discovery, Puppeteer + public API enrichment, Hooktheory SongMetrics / complexity ratings, the background daemon (`cli/catalogDaemon.js`, PS1 scripts), `cli/update.js` / `cli/status.js`, rate probing, web `/api/catalog/*` and **`/api/library`** routes (Song Selector), or programmatic access via `hooktheory_catalog/index.js`. Also covers the **on-demand sync** (`Sync-Catalog.ps1`, authorization gate, daily scheduling) and **one-off recovery runs** (`Start/Status/Stop-Recovery.ps1`, isolated worktrees, and the measured findings behind the artist-page soft-404 and interrupted-phase handling). Isolated under `_Research_testing/hooktheory_catalog/` (`lib/`, `cli/`, `web/`, `data/`). **Not** the oracle decode harness — that lives in `_Decode_oracle/`. |
| [Hooktheory Song Catalog — CHEATSHEET](../_Research_testing/hooktheory_catalog/CHEATSHEET.md) | You need a **quick command lookup** (copy-paste examples) for catalog CLI, sync + recovery-run PS1 scripts, daemon, rate probe, and web API triggers — no prose, tables only. |
| [Hooktheory Catalog — DATA_FIELDS](../_Research_testing/hooktheory_catalog/DATA_FIELDS.md) | You need to know **which Hooktheory/API fields are stored in the catalog DB** vs deferred to cache — used vs unused columns, JSON bundles, and intentionally omitted blobs. |

---

## Related paths (no dedicated doc yet)

| Path | One-line scope |
|------|----------------|
| `web/` | Browser UI + Tone.js playback; Song Selector + unified `/api/library`; serves cache. See web-architecture.md. |
| `_Decode_oracle/` | Offline scrape → engine → score oracle loop. See web-architecture.md + `ORACLE_GUIDE/`. |
| `ORACLE_GUIDE/` | Step-by-step oracle workflow for agents. |
| `lib/extractor/` | Shared chord JSON extraction (used by oracle and catalog enrich). |

---

## Agent quick-routing

```
Task involves modularizing data vs code / gitignore / portable data bundle?
  → HANDOFF.md (repo root)

Task involves catalog / complexity DB / daemon / TheoryTab inventory?
  → _Research_testing/hooktheory_catalog/USAGE.md

Task involves chord correctness / regression / scrape-and-compare?
  → web-architecture.md + _Decode_oracle/

Task involves playback / UI / audio engine?
  → web-architecture.md § Web-player (Song Selector Load gate)

Task involves chord pronunciation / spoken roman readings?
  → PRONUNCIATION.md

Task involves roman numeral display / figured-bass stacking / ° ø glyphs?
  → ROMAN_NUMERALS.md

Known bug or regression?
  → BUGS.md first
```
