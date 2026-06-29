# 03 — Build the comparison database

The chord DB turns hundreds of scraped songs into a single bucketed regression dataset: every unique chord, its truth pitch classes, the engine's pitch classes, and whether they match. This is what makes comparison *efficient* — you analyze buckets, not songs.

## Build / rebuild

Full rebuild (re-runs the engine and re-compares every chord against the cached scrapes):

```bash
node _Decode_oracle/buildChordDb.js --corpus _Decode_oracle/corpus4.json --db-dir _Decode_oracle/chord_db_corpus4
```

- `--corpus <file>` selects which manifest's scrapes to include.
- `--db-dir <path>` selects the output DB. **Always pass it** so you do not clobber the default `chord_db/` (corpus1).
- `--use-reports` skips re-compare and reuses existing per-song reports (faster, but only valid if reports are current — normally omit it so the engine is actually re-run).

A rebuild against cached scrapes takes ~5–7s for 500 songs (no scraping). This is your main iteration loop after an engine edit.

Incremental add/remove (when you scraped a few more songs and don't want a full rebuild):

```bash
node _Decode_oracle/updateChordDb.js --corpus _Decode_oracle/corpus4.json --db-dir _Decode_oracle/chord_db_corpus4
```

### Slug-resolution gotcha

Corpus entries may carry a legacy short `slug` that differs from `slugForUrl(url)`. The collectors resolve with `e.slug || slugForUrl(e.url)`. If your DB has fewer songs than the manifest, this mismatch is the usual cause — confirm in `chord_db/collectSongs.js` and `updateChordDb.js`.

## DB layout (`chord_db_corpusN/`)

- `chord_db.json` — the full index (meta + all chord entries).
- `byModification/<bucket>.json` — chords sharded by **modification bucket** (e.g. `type=7.json`, `inversion=3.json`, `alterations=b5.json`, `borrowed=locrian.json`). A chord appears in every bucket it qualifies for.
- `SUMMARY.md` — human-readable pass rates per bucket, worst-first, with one example failure each.

Each chord entry includes: `id` (`<slug>/<section>/<beat>`), `chord` (the JSON), `key`, `truthRoman`, `engRoman`, `truthPcs`, `engPcs`, `truthBassPc`/`engBassPc`, `notesOk`, and `failureClass`.

## How a chord is scored (`compare.js`)

Three channels are compared per chord:

1. **Roman** — `romanExact` (canonical strings identical) and `romanCore` (identical after dropping parenthetical tags).
2. **Letter / bass** — root pitch class and bass pitch class parsed from the rendered letter name.
3. **Pitch set** — `pcsExact`: the engine's pitch-class set equals the truth set.

The headline metric:

```text
notesOk = pcsExact && bassInNotes && orderOk
```

- `pcsExact` — engine PC set == truth PC set.
- `bassInNotes` — truth bass PC == engine bass PC, **or** (`pcsExact && romanCore`) as a lenient fallback.
- `orderOk` — the bass note is voiced lowest (inversion correctness), via `checkNoteOrder`.

So a chord can have the right notes but still fail `notesOk` if the **bass/inversion** is wrong, or if the symbol differs enough that the lenient bass fallback doesn't apply. Keep this in mind: not every failure is a missing/extra pitch.

## Failure classes (classify before fixing)

`SUMMARY.md` reports a "Failure mix: engine=… harness=… piano_noise=…" per bucket:

- **engine** — the engine genuinely produced the wrong notes/bass. **This is what you fix.**
- **harness** — alignment/parse issue in the test rig (e.g. SVG row split, count mismatch), or scrape noise like `truthRoman: "undefined"`. Do **not** edit the engine for these.
- **piano_noise** — the piano scrape disagrees with the (correct) letter inference; deferred edge cases.

Only **engine** failures justify a `web-player/lib` change. Confirm the class in `SUMMARY.md` (or via `diffSignature.cjs`, next doc) before touching code.

## Read the summary

```bash
node -e "const fs=require('fs');console.log(fs.readFileSync('_Decode_oracle/chord_db_corpus4/SUMMARY.md','utf8').split('\n').slice(0,40).join('\n'))"
node _Decode_oracle/testModification.js --list   --db-dir _Decode_oracle/chord_db_corpus4   # all buckets + pass rate
node _Decode_oracle/testModification.js --failing --db-dir _Decode_oracle/chord_db_corpus4   # buckets below 99%
```

Now go to [`04_find_and_fix.md`](04_find_and_fix.md) to turn the worst buckets into engine fixes.
