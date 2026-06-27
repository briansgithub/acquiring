# Agent Work Record — Hooktheory Chord Decode Project

**Audience:** Future Cursor agents continuing reverse-engineering of Hooktheory `.json` chord objects into correct piano voicings and Roman symbols.

**Last updated:** 2026-06-27 (Fix 035 merged)  
**Primary branch:** `main` — Fixes 031–035 on `oracle/chord-db-suspensions-truth` merged 2026-06-27

**Detailed fix-by-fix log:** [`DECODE_FIX_LOG.md`](./DECODE_FIX_LOG.md) — read fixes **in order**; append new numbered fixes there.

---

## 1. Mission

Reverse-engineer Hooktheory TheoryTab chord JSON so the web-player engine produces **the same pitch classes and bass** as Hooktheory’s rendered chord view (SVG letter + optional piano scrape). Target: **≥99% notesOk** on closed-loop oracle corpora.

**Ground truth hierarchy:**
1. Rendered SVG chord labels (authoritative for symbols)
2. Letter-inferred pitch-class sets (`truthNotes.js`)
3. Optional piano DOM scrape when it agrees with letter inference (`pianoNotes.js`)

**Do not** treat incomplete JSON alone as truth — merge SVG letter modifiers when JSON omits `alterations` / `omits` / `ø` / `(b5b9)` etc.

---

## 2. Repository map

| Area | Path | Role |
|------|------|------|
| **Theory engine** | `web-player/lib/music.js` | `chordInterpreter`, applied/borrowed paths, inversions |
| **Symbol builder** | `web-player/lib/jsonToSymbol.js` | Roman + letter from JSON (`buildSuffix`, `buildNumeral`) |
| **Scales** | `web-player/lib/scales.js` | Key + borrowed scale intervals/qualities |
| **Modifier modules** | `web-player/lib/chord{Suspensions,Omits,Adds,Alterations,Extensions,Modifiers,NoteUtils}.js` | Post-triad note pipeline |
| **Oracle harness** | `_Decode_oracle/` | Scrape, compare, report, chord DB |
| **Hooktheory cache (player)** | `.hooktheory_cache/` | Cached sections for web-player (`extract_hooktheory_data.js`) |
| **Hooktheory extract** | `extract_hooktheory_data.js`, `lib/scraper/pageScraper.js` | Download/cache songs for player |
| **Decode scrape** | `_Decode_oracle/scrapeSong.js` | Rich scrape (SVG truth + JSON + screenshots) |

---

## 3. Oracle closed-loop pipeline

```
Hooktheory URL
  → scrapeSong.js (or cached scrape.json)
  → svgTruth.js (parse rendered labels)
  → engineRun.js (dynamic import of music.js)
  → compare.js (truthNotes + enrichChordFromTruth)
  → report.json / attribute_matrix.md
  → buildChordDb.js → chord_db*/ (bucketed regression DB)
  → testModification.js --list / --failing
```

**Key harness files:**
- `compare.js` — alignment, `pcsExact`, `notesOk`, truth-enriched engine run
- `truthNotes.js` + `truthLetterParse.js` — expected PCs from letter/Roman/JSON
- `chordRootPc.js` — slash roots, figured-sixth letters (`G6` = inv-7th bass)
- `engineRun.js` — `_truthEnriched` guard against engine-letter b9 bleed
- `testModification.js` — per-bucket pass rates; `--db-dir` for corpus-specific DBs

---

## 4. Engine modifier pipeline (note generation order)

After triad (+ diatonic 7th / extensions), **before inversion**:

1. `chordSuspensions.js` — sus2/sus4 (sus4 wins); sus7 uses `b7`
2. `chordOmits.js` — omit 3 / 5; dim+omit5 → +6 semitones dim7 tone
3. `chordAlterations.js` — b5, #5, b9, #9, #11, b13, etc.
4. `chordAdds.js` — add2/4/6/9; triad add6 drops 5th
5. `chordExtensions.js` — type 9/11/13 stacks; half-dim `ø`; natural vs #11

Symbols are built separately in `jsonToSymbol.js` via `buildSuffix`.

---

## 5. Hooktheory JSON semantics (critical)

| Field | Meaning |
|-------|---------|
| `root` | Scale degree in active key (or borrowed frame) — **denominator** when `applied > 0` |
| `applied` | Numerator degree for secondary/applied chords (`V7/ii` → `applied=5`, `root=2`) |
| `borrowed` | Mode name, `harmonicMinor`, `phrygianDominant`, or `[0,1,3,...]` semitone array from tonic |
| `type` | 5, 7, 9, 11, 13 |
| `inversion` | 0–3 figured bass |
| `adds` / `omits` / `alterations` / `suspensions` | Modifier arrays (see DECODE_FIX_LOG 007–008, 018–022) |
| `substitutions`, `pedal`, `alternate` | **Not implemented** (always empty in corpora) |

**Applied + borrowed:** Use `resolveAppliedBorrowedChord()` — do not take applied fast-path when `borrowed` is set (Fix 027).

**Borrowed dim7 vs half-dim:** Hooktheory often renders `ø` but voices **dim7 (`bb7`)** for dorian°6, lydian°4, minor°2, phrygian°5, custom-array dim (Fixes 025–027).

---

## 6. Corpora and chord databases

| Corpus | File | Songs (in DB) | Chords | notesOk (last measured) | DB path |
|--------|------|---------------|--------|-------------------------|---------|
| **1** | `corpus.json` | ~33 | ~1538 | ~98.6% corpus1 rebuild | `chord_db/` |
| **2** | `corpus2.json` | 45 | 2169 | **99.45%** | `chord_db_corpus2/` |
| **3** | `corpus3.json` | 179 scraped / 500 manifest | 6740 | **99.04%** | `chord_db_corpus3/` |
| **All** | `corpus_all.json` | 74 entries | — | 97.8% post Fix 024 | `chord_db/` |

**Corpus3** — 500-song manifest, `complexityRank` 1–500, tiers 1–5 (`corpus3/tierMeta.js`). Build: `corpus3/buildCorpus3.js`. Batch scrape: `batchScrapeCorpus.js`. Many URLs still unscrape (~309 pending as of 2026-06-27).

**Rebuild any corpus DB:**
```bash
node _Decode_oracle/buildChordDb.js --corpus _Decode_oracle/corpus2.json --db-dir _Decode_oracle/chord_db_corpus2
node _Decode_oracle/testModification.js --list --db-dir _Decode_oracle/chord_db_corpus2
node _Decode_oracle/testModification.js --failing --db-dir _Decode_oracle/chord_db_corpus2
```

---

## 7. Work completed (session summary)

### 7.1 Parallel modifier fleet (Agents 0–7)

| Agent | Deliverable |
|-------|-------------|
| 0 | `chordModifiers.js` pipeline scaffold |
| 1 | `chordOmits.js` — omits=3/5 buckets |
| 2 | `chordAdds.js` — adds=4/6/9 |
| 3 | `chordAlterations.js` — b5/b9/#5 |
| 4 | `chordExtensions.js` — type=11/13 |
| 5 | `truthNotes` / piano scrape / `chordRootPc` harness |
| 6 | Borrowed-scale voicing (dorian/lydian/minor/phrygian/hmin/locrian/custom) |
| 7 | Full corpus regression + chord DB |

### 7.2 Numbered engine/harness fixes (001–029)

Full detail in [`DECODE_FIX_LOG.md`](./DECODE_FIX_LOG.md). Highlights:

| Fix range | Topic |
|-----------|--------|
| 001–009 | Applied semantics, custom arrays, symbols, types 9/11, harmonic minor key, diatonic 7ths, adds/omits, sus quality, borrowed prefix |
| 010–013 | Borrowed hmin/phdm, double-accidental `appendAccidental`, locrian qualities |
| 014–017 | ESM harness, pcsExact, bb7 modifier, extended truthNotes + piano scrape |
| 018–024 | Suspensions, modifier pipeline (omits/adds/alts/extensions), slash-root harness |
| 025–027 | Borrowed dim7 voicing; applied+borrowed; locrian/custom-array |
| 028–029 | Corpus2/3: figured-sixth letters, applied IV△7, minor 11th, bassPc harness, phdm/#5/hm shells |
| 030–031 | Hooktheory page scraper; note order (`orderOk`), inv=0 pitch voicing, dim7 spread, `Cb` midi |
| 032–035 | Summertime leading-JSON skip; locrian V7 + dimTriad bor; PC-order gate; repeat-condensed SVG fill split; `alignByRootPc`; generalized leading skip |

### 7.3 Infrastructure added

- `--db-dir` on `buildChordDb.js` / `testModification.js` — separate DB per corpus
- `batchScrapeCorpus.js` — batch oracle scrape for large corpora
- `corpus2.json`, `corpus3.json` + `corpus3/buildCorpus3.js` + tier seeds
- `_Research_testing/discover_theorytab_urls.js` — URL discovery for corpus3 pool
- `web-player/lib/package.json` `"type":"module"` for oracle `import()` of engine

### 7.4 Web-player song cache (Fix 030)

**Problem:** `lib/scraper/pageScraper.js` used removed `div.col-md-8` layout → all `extract_hooktheory_data.js` runs failed.

**Fix:** Rewrote `pageScraper.js` to use `a.tb-section-tab` + `tab-{songId}` (same model as `scrapeSong.js`).

**10 popular songs cached** (commit `4d7baf8`):
Adele *Someone Like You*, Beatles *Hey Jude*, Journey *Don't Stop Believin*, Oasis *Wonderwall*, Ed Sheeran *Shape Of You*, Michael Jackson *Billie Jean*, Coldplay *Yellow*, Taylor Swift *Love Story*, Bruno Mars *Just The Way You Are*, John Lennon *Imagine* (Hotel California URL 404).

**Batch helper:** `_Debug_testing/cache_10_popular.cjs`

```bash
node extract_hooktheory_data.js <hooktheory_url>
node _Debug_testing/cache_10_popular.cjs
```

Player library: **16 songs** in `.hooktheory_cache/` (6 original + 10 new).

### 7.5 Closed-loop accuracy (Fix 035, 2026-06-27)

| Corpus | DB dir | Chords | notesOk | Failing | eng | harness | piano |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `chord_db/` | 1538 | **99.2%** | 12 | 0 | 10 | 2 |
| 2 | `chord_db_corpus2/` | 2347 | **100.0%** | **0** | 0 | 0 | 0 |
| 3 | `chord_db_corpus3/` | 6740 | **99.8%** | 14 | 0 | 11 | 3 |

**Deferred failures:** see [`REMAINING_FAILURES.md`](./REMAINING_FAILURES.md) — Penny Lane figured-bass alignment (10), piano noise god-only-knows/whitney (3), Waterloo Bridge/41 (1).

```bash
node _Decode_oracle/buildChordDb.js --corpus _Decode_oracle/corpus2.json --db-dir _Decode_oracle/chord_db_corpus2
node _Decode_oracle/testModification.js --failing --db-dir _Decode_oracle/chord_db_corpus2
```

---

## 8. Git commits (oracle arc)

```
ad45c8f  Strengthen decode oracle with full note truth, chord DB, suspensions fix
025bc89  Add modifier pipeline and lift corpus notesOk to 97.8%
1c01eb3  Fix borrowed dorian/lydian dim7 voicing (Fix 025)
454b032  Fix borrowed locrian/custom-array applied voicing (Fix 027)
e439aec  Fix borrowed minor/phrygian/hmin voicing (Fix 026)
34ca5e3  Add corpus2/3 chord DBs and Fixes 028-029 for 99%+ notesOk  [merged to main]
4d7baf8  Fix Hooktheory page scraper and cache 10 popular songs
```

---

## 9. Known open issues (do not confuse with regressions)

**Authoritative list:** [`REMAINING_FAILURES.md`](./REMAINING_FAILURES.md)

### Harness / alignment (deferred)

- **Penny Lane Verse** — 10 failures: analyst Roman on SVG vs figured-bass JSON (`I△42` / `vi7` dual representation); 43 vs 46 count
- **Waterloo Sunset Bridge/41** — `iiiø4(add13)2` compound figured-bass parse

### Piano noise (deferred engine edge cases)

- **God Only Knows** `#iø7(bor)` — custom-array b5 bleed (2 chords)
- **Whitney** `iø7(loc)` — bb7 vs natural 5 (1 chord)

### Symbol-only (notes OK)

- Token order: `Vsus47` vs `V⁷sus4`, stacked figured-bass digit order in SVG parse
- `(maj)` tag on minor applied targets

### Unimplemented JSON fields

- `substitutions[]`, `pedal`, `alternate` — never populated in corpora

---

## 10. Reverted / do-not-reapply (without re-validation)

See DECODE_FIX_LOG “Attempted / reverted”:
- Force uppercase Roman on all suspended chords
- `joinRoman` column-clustering for figured bass
- DP alignment replacing greedy proportional alignment

---

## 11. Tier-1 regression songs

Always verify after engine changes:

```bash
node _Decode_oracle/compare.js _Decode_oracle/out/the-proclaimers__500-miles/scrape.json
node _Decode_oracle/compare.js _Decode_oracle/out/the-beatles__eleanor-rigby/scrape.json
```

Expect **100% notesOk** on both.

---

## 12. Rules for future agents

1. **Read `DECODE_FIX_LOG.md` before changing `music.js`** — many bugs were field-semantics issues, not arithmetic.
2. **Distinguish engine vs harness failures** — run `--failing`; check `countMatch=false` before “fixing” voicing.
3. **Use `--db-dir`** when testing corpus2/3; don’t overwrite corpus1 `chord_db/` unintentionally.
4. **Enrich from truth** — `compare.js` / `engineRun.js` merge SVG letter mods when JSON is incomplete.
5. **File length** — keep modules ≤400 lines; debug scripts in `_Debug_testing/`, research in `_Research_testing/`.
6. **Log new fixes** — append numbered entry to `DECODE_FIX_LOG.md` + changelog row + update this doc’s accuracy table if corpus-wide numbers change.

---

## 13. Quick command reference

```bash
# Oracle single song
node _Decode_oracle/run.js <url> --no-browser

# Corpus compare + reports
node _Decode_oracle/run.js --corpus _Decode_oracle/corpus3.json --no-browser

# Chord DB
node _Decode_oracle/buildChordDb.js --corpus _Decode_oracle/corpus.json
node _Decode_oracle/testModification.js suspensions=4 --rerun

# Player cache
node extract_hooktheory_data.js https://www.hooktheory.com/theorytab/view/artist/song

# Web player
cd web-player && node server.js   # serves /api/songs from .hooktheory_cache
```
