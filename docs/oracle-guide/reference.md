# Reference

Quick lookup for commands, JSON field meanings, scoring terms, scripts, and open issues. For the procedure, use [`README.md`](README.md) → `01`–`05`.

## Command cheat sheet

```bash
# --- ground truth (needs puppeteer) ---
node tooling/_Research_testing/discover_theorytab_search.js                       # grow discovered_urls.json
node tooling/_Decode_oracle/corpus4/buildCorpus4.js --target 500                   # build a unique unprocessed corpus
node tooling/_Decode_oracle/batchScrapeCorpus.js --corpus tooling/_Decode_oracle/corpus4.json
node tooling/_Decode_oracle/run.js <hooktheory-url> --no-browser                   # scrape+compare+report one song
node tooling/_Research_testing/corpus4_status.js                                   # scrape coverage
node tooling/_Research_testing/corpus4_backfill.js                                 # replace dead manifest entries

# --- build / inspect the DB (no browser) ---
node tooling/_Decode_oracle/buildChordDb.js  --corpus tooling/_Decode_oracle/corpus4.json --db-dir tooling/_Decode_oracle/chord_db_corpus4
node tooling/_Decode_oracle/updateChordDb.js --corpus tooling/_Decode_oracle/corpus4.json --db-dir tooling/_Decode_oracle/chord_db_corpus4
node tooling/_Decode_oracle/testModification.js --list    --db-dir tooling/_Decode_oracle/chord_db_corpus4
node tooling/_Decode_oracle/testModification.js --failing --db-dir tooling/_Decode_oracle/chord_db_corpus4
node tooling/_Decode_oracle/testModification.js <bucket> --rerun --db-dir tooling/_Decode_oracle/chord_db_corpus4

# --- catalog error loop (34k songs, SQL) ---
node tooling/_Research_testing/hooktheory_catalog/cli/buildSignatureIndex.js
node tooling/_Research_testing/hooktheory_catalog/cli/buildFetchQueue.js
node tooling/_Research_testing/hooktheory_catalog/cli/runFetchDaemon.js --wave-size 20
node tooling/_Debug_testing/watchFetchWaves.mjs
node tooling/_Research_testing/hooktheory_catalog/cli/batchCompareCatalog.js --wave <wave-id> --resync
node tooling/_Debug_testing/queryTopErrors.mjs --limit 20
node tooling/_Debug_testing/diffSignature.cjs --sql type=7 inv=3

# --- analyze failures ---
node tooling/_Debug_testing/diffSignature.cjs                       # engine-failure signatures summary (chord_db)
node tooling/_Debug_testing/diffSignature.cjs --sql                  # same, from engine_errors SQL table
node tooling/_Debug_testing/diffSignature.cjs type=7 inv=3          # filtered rows: truthPcs vs engPcs
node tooling/_Debug_testing/diffSignature.cjs --db chord_db_corpus2 alt=b5 --all

# --- spot-check / regression ---
node tooling/_Decode_oracle/compare.js tooling/_Decode_oracle/out/<slug>/scrape.json
```

## Hooktheory JSON field semantics (critical)

| Field | Meaning |
|-------|---------|
| `root` | Scale degree (1–7) in the active key/borrowed frame. **When `applied > 0`, `root` is the denominator (tonicization target).** |
| `applied` | Numerator degree for secondary/applied chords. `V7/ii` → `applied=5`, `root=2`. (This numerator/denominator split is reversed from intuition — see Fix 001.) |
| `borrowed` | Mode name (`minor`, `dorian`, `lydian`, `locrian`, `mixolydian`, `phrygian`), `harmonicMinor`, `phrygianDominant`, or a `[0,1,3,…]` array of **absolute semitone offsets from the tonic**. |
| `type` | Chord size: 5 (triad), 7, 9, 11, 13. |
| `inversion` | 0=root, 1/2/3 figured bass (3 only on 7th+ chords). Affects bass/`orderOk`, not the pitch-class set. |
| `alterations` | e.g. `b5`, `#5`, `b9`, `#9`, `#11`, `b13`. |
| `adds` / `omits` | added/removed chord tones (`add6`, `no3`, …). |
| `suspensions` | `[2]`, `[4]`, or `[2,4]`; sus4 wins over sus2; sus7 uses `b7`. |
| `substitutions`, `pedal`, `alternate` | **Not implemented.** `substitutions:["tri"]` (tritone sub) is the common one — treat as a deferral, not a bug. |

Gotchas worth memorizing:
- **Applied + borrowed** go through `resolveAppliedBorrowedChord()`; do not take the applied fast-path when `borrowed` is set (Fix 027).
- **`ø` labelled, dim7 voiced:** Hooktheory often renders `ø` but voices a full diminished 7th (`bb7`) for dorian°6, lydian°4, minor°2, phrygian°5, locrian°1, and custom-array dim chords (Fixes 025–027, 036d).
- **Inversion ≠ pitch class:** `applyInversion` only rotates octaves. A wrong PC is always a construction bug upstream.

## Scoring glossary

| Term | Meaning |
|------|---------|
| `pcsExact` | Engine pitch-class set equals the truth pitch-class set. |
| `bassInNotes` | Truth bass PC == engine bass PC, or (`pcsExact && romanCore`) fallback. |
| `orderOk` | Bass note is voiced lowest (inversion correctness). |
| **`notesOk`** | `pcsExact && bassInNotes && orderOk` — the headline correctness metric. |
| `romanExact` | Canonical Roman strings identical. |
| `romanCore` | Roman strings identical after dropping parenthetical tags. |
| **bucket** | A modification slice of the DB (`type=7`, `inversion=3`, `alterations=b5`, …); a chord is in every bucket it qualifies for. |
| **signature** | The combined property tokens of one chord (`type=7 inv=3 bor=custom alt=b5`); used to dedupe failures to root causes. |
| **failureClass** | `engine` (fix it), `harness` (test-rig artifact), `piano_noise` (deferred). |

## Script index

| Script | Purpose |
|--------|---------|
| `tooling/_Decode_oracle/scrapeSong.js` | Scrape one Hooktheory page → SVG truth + JSON + screenshots. |
| `tooling/_Decode_oracle/run.js` | Orchestrate scrape→compare→report for URL(s) or a corpus. |
| `tooling/_Decode_oracle/batchScrapeCorpus.js` | Scrape all (missing) songs in a corpus manifest. |
| `tooling/_Decode_oracle/svgTruth.js`, `truthNotes.js`, `truthLetterParse.js`, `chordRootPc.js`, `pianoNotes.js` | Parse rendered labels → expected pitch classes/bass. |
| `tooling/_Decode_oracle/engineRun.js` | Run the engine (`web/lib`) for a chord/section. |
| `tooling/_Decode_oracle/compare.js` | Align truth vs engine; compute `notesOk` and channels. |
| `tooling/_Decode_oracle/buildChordDb.js` / `updateChordDb.js` | Build/refresh the bucketed chord DB. |
| `tooling/_Decode_oracle/testModification.js` | Query/re-run one bucket (`--list`, `--failing`, `<bucket> --rerun`). |
| `tooling/_Decode_oracle/corpus4/buildCorpus4.js` | Build a 500-song corpus of unprocessed songs (template for corpusN). |
| `tooling/_Research_testing/discover_theorytab_search.js` / `discover_theorytab_urls.js` | Discover new TheoryTab URLs. |
| `tooling/_Research_testing/corpus4_status.js` / `corpus4_backfill.js` | Track/replace failed scrapes. |
| `tooling/_Debug_testing/diffSignature.cjs` | Dump truth-vs-engine PC diffs per signature. |

## Deep-dive appendices

- [`tooling/_Decode_oracle/DECODE_FIX_LOG.md`](../../tooling/_Decode_oracle/DECODE_FIX_LOG.md) — every numbered fix, in order (symptom → cause → fix). Read before editing `music.js`.
- [`tooling/_Decode_oracle/REMAINING_FAILURES.md`](../../tooling/_Decode_oracle/REMAINING_FAILURES.md) — authoritative deferred/non-engine failure list.
- Per-song reports: `tooling/_Decode_oracle/out/<slug>/{summary,discrepancies,attribute_matrix}.md`; per-corpus `chord_db_corpusN/SUMMARY.md`.
