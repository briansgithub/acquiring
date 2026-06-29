# Documentation Index

Master map of repo documentation. **Read the linked file when your task matches its scope** — do not guess module behavior from this index alone.

---

## Core project

| Document | Read when… |
|----------|------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | You need the big picture: web-player engine, oracle closed-loop harness, repo/worktree layout, chord interpretation pipeline, and how scraped Hooktheory JSON flows into playback. |
| [TODO.md](./TODO.md) | You need the current prioritized work queue or open feature/fix items. |
| [MEMORY.md](./MEMORY.md) | You need durable project decisions, conventions, or context carried across sessions. |
| [HANDOFF.md](../HANDOFF.md) | **Starting a new session** — current repo state, six-song data set, Song Selector behavior, and the planned data/code modularization task. |
| [BUGS.md](./BUGS.md) | You are fixing a known bug or checking whether an issue is already tracked. |

---

## Research modules (`_Research_testing/`)

| Document | Read when… |
|----------|------------|
| [Hooktheory Song Catalog — USAGE](../_Research_testing/hooktheory_catalog/USAGE.md) | You need to **discover, store, enrich, or query TheoryTab songs** from hooktheory.com: SQLite catalog (`data/hooktheory_catalog.db`), Meilisearch discovery, Puppeteer + public API enrichment, Hooktheory SongMetrics / complexity ratings, the background daemon (`cli/catalogDaemon.js`, PS1 scripts), `cli/update.js` / `cli/status.js`, rate probing, web-player `/api/catalog/*` and **`/api/library`** routes (Song Selector), or programmatic access via `hooktheory_catalog/index.js`. Isolated under `_Research_testing/hooktheory_catalog/` (`lib/`, `cli/`, `web/`, `data/`). **Not** the oracle decode harness — that lives in `_Decode_oracle/`. |
| [Hooktheory Song Catalog — CHEATSHEET](../_Research_testing/hooktheory_catalog/CHEATSHEET.md) | You need a **quick command lookup** (copy-paste examples) for catalog CLI, daemon PS1 scripts, rate probe, and web API triggers — no prose, tables only. |
| [Hooktheory Catalog — DATA_FIELDS](../_Research_testing/hooktheory_catalog/DATA_FIELDS.md) | You need to know **which Hooktheory/API fields are stored in the catalog DB** vs deferred to cache — used vs unused columns, JSON bundles, and intentionally omitted blobs. |

---

## Related paths (no dedicated doc yet)

| Path | One-line scope |
|------|----------------|
| `web-player/` | Browser UI + Tone.js playback; Song Selector + unified `/api/library`; serves cache. See ARCHITECTURE.md. |
| `_Decode_oracle/` | Offline scrape → engine → score oracle loop. See ARCHITECTURE.md + `ORACLE_GUIDE/`. |
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
  → ARCHITECTURE.md + _Decode_oracle/

Task involves playback / UI / audio engine?
  → ARCHITECTURE.md § Web-player (Song Selector Load gate)

Known bug or regression?
  → BUGS.md first
```
