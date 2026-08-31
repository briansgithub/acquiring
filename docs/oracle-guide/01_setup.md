# 01 — Setup

## Prerequisites

- **Node.js** (ESM + CommonJS interop; the version that ships current `node` is fine — the harness uses `node` directly, no build step).
- **puppeteer** for scraping Hooktheory (headless Chromium). It is the project's main dependency.

## Install

From the Acquiring repository root:

```bash
npm install
```

This installs `puppeteer` and `xml2js` per the root [`package.json`](../package.json). Puppeteer downloads its own Chromium on install; if that is blocked, set `PUPPETEER_SKIP_DOWNLOAD` and point `PUPPETEER_EXECUTABLE_PATH` at a local Chrome before scraping.

> You only need puppeteer for **scraping** (step 02). Building the DB and fixing the engine (steps 03–05) run against already-scraped `out/<slug>/scrape.json` files and need no browser.

## What lives where

Two separate codebases — keep them straight:

| | Path | You edit it when… |
|---|------|-------------------|
| **Engine (the thing under test)** | `web/lib/` | fixing a chord decode bug |
| **Oracle harness (the test rig)** | `tooling/_Decode_oracle/` | changing how we scrape / compare / score |

The harness imports the engine dynamically (`tooling/_Decode_oracle/engineRun.js` → `web/lib/music.js`), so an engine edit is picked up on the next harness run with no rebuild.

### Engine files (`web/lib/`)

- `music.js` — `chordInterpreter` entry point; triad/seventh construction; applied + borrowed resolution; inversion; scale-degree labelling.
- `scales.js` — scale interval tables, chord qualities, `generateScaleLabels`.
- `jsonToSymbol.js` — builds the Roman numeral + letter name (symbol channel only).
- `chordSuspensions.js`, `chordOmits.js`, `chordAlterations.js`, `chordAdds.js`, `chordExtensions.js`, `chordModifiers.js`, `chordNoteUtils.js`, `chordVoicing.js` — the post-triad note pipeline (order matters; see [`04_find_and_fix.md`](04_find_and_fix.md)).

### Harness files (`tooling/_Decode_oracle/`)

- `scrapeSong.js` / `run.js` / `batchScrapeCorpus.js` — download ground truth.
- `svgTruth.js`, `truthNotes.js`, `truthLetterParse.js`, `chordRootPc.js`, `pianoNotes.js` — parse the rendered label into expected pitch classes.
- `engineRun.js` — runs the engine for one chord/section.
- `compare.js` — aligns truth vs engine and computes `notesOk`.
- `report.js` — per-song markdown reports under `out/<slug>/`.
- `buildChordDb.js` / `updateChordDb.js` / `chord_db/` — the bucketed regression database.
- `testModification.js` — query/re-run one modification bucket.

## Workspace conventions (enforced)

- **Debug/throwaway scripts** and any files they produce → `tooling/_Debug_testing/`.
- **Research/info-gathering scripts** (URL discovery, corpus status) and their outputs → `tooling/_Research_testing/`.
- **Keep every file ≤400 lines.** `music.js` is already large; if a fix would push a file over, encapsulate into a helper module instead. Do not rewrite whole files — make localized edits.
- `tooling/_Debug_testing/` is an ES-module package (`"type": "module"`); name CommonJS helpers there `*.cjs` (e.g. `diffSignature.cjs`).

## Smoke test

Confirm the harness can score an already-scraped song without a browser:

```bash
node tooling/_Decode_oracle/compare.js tooling/_Decode_oracle/out/the-proclaimers__500-miles/scrape.json
```

You should see a per-chord comparison and a high `notesOk`. If that works, you are ready for steps 02–05.
