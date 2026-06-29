# Reference

Quick lookup for commands, JSON field meanings, scoring terms, scripts, and open issues. For the procedure, use [`README.md`](README.md) → `01`–`05`.

## Command cheat sheet

```bash
# --- ground truth (needs puppeteer) ---
node _Research_testing/discover_theorytab_search.js                       # grow discovered_urls.json
node _Decode_oracle/corpus4/buildCorpus4.js --target 500                   # build a unique unprocessed corpus
node _Decode_oracle/batchScrapeCorpus.js --corpus _Decode_oracle/corpus4.json
node _Decode_oracle/run.js <hooktheory-url> --no-browser                   # scrape+compare+report one song
node _Research_testing/corpus4_status.js                                   # scrape coverage
node _Research_testing/corpus4_backfill.js                                 # replace dead manifest entries

# --- build / inspect the DB (no browser) ---
node _Decode_oracle/buildChordDb.js  --corpus _Decode_oracle/corpus4.json --db-dir _Decode_oracle/chord_db_corpus4
node _Decode_oracle/updateChordDb.js --corpus _Decode_oracle/corpus4.json --db-dir _Decode_oracle/chord_db_corpus4
node _Decode_oracle/testModification.js --list    --db-dir _Decode_oracle/chord_db_corpus4
node _Decode_oracle/testModification.js --failing --db-dir _Decode_oracle/chord_db_corpus4
node _Decode_oracle/testModification.js <bucket> --rerun --db-dir _Decode_oracle/chord_db_corpus4

# --- analyze failures ---
node _Debug_testing/diffSignature.cjs                       # engine-failure signatures summary
node _Debug_testing/diffSignature.cjs type=7 inv=3          # filtered rows: truthPcs vs engPcs
node _Debug_testing/diffSignature.cjs --db chord_db_corpus2 alt=b5 --all

# --- spot-check / regression ---
node _Decode_oracle/compare.js _Decode_oracle/out/<slug>/scrape.json
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
| `_Decode_oracle/scrapeSong.js` | Scrape one Hooktheory page → SVG truth + JSON + screenshots. |
| `_Decode_oracle/run.js` | Orchestrate scrape→compare→report for URL(s) or a corpus. |
| `_Decode_oracle/batchScrapeCorpus.js` | Scrape all (missing) songs in a corpus manifest. |
| `_Decode_oracle/svgTruth.js`, `truthNotes.js`, `truthLetterParse.js`, `chordRootPc.js`, `pianoNotes.js` | Parse rendered labels → expected pitch classes/bass. |
| `_Decode_oracle/engineRun.js` | Run the engine (`web-player/lib`) for a chord/section. |
| `_Decode_oracle/compare.js` | Align truth vs engine; compute `notesOk` and channels. |
| `_Decode_oracle/buildChordDb.js` / `updateChordDb.js` | Build/refresh the bucketed chord DB. |
| `_Decode_oracle/testModification.js` | Query/re-run one bucket (`--list`, `--failing`, `<bucket> --rerun`). |
| `_Decode_oracle/corpus4/buildCorpus4.js` | Build a 500-song corpus of unprocessed songs (template for corpusN). |
| `_Research_testing/discover_theorytab_search.js` / `discover_theorytab_urls.js` | Discover new TheoryTab URLs. |
| `_Research_testing/corpus4_status.js` / `corpus4_backfill.js` | Track/replace failed scrapes. |
| `_Debug_testing/diffSignature.cjs` | Dump truth-vs-engine PC diffs per signature. |

## Deep-dive appendices

- [`_Decode_oracle/DECODE_FIX_LOG.md`](../_Decode_oracle/DECODE_FIX_LOG.md) — every numbered fix, in order (symptom → cause → fix). Read before editing `music.js`.
- [`_Decode_oracle/REMAINING_FAILURES.md`](../_Decode_oracle/REMAINING_FAILURES.md) — authoritative deferred/non-engine failure list.
- Per-song reports: `_Decode_oracle/out/<slug>/{summary,discrepancies,attribute_matrix}.md`; per-corpus `chord_db_corpusN/SUMMARY.md`.
