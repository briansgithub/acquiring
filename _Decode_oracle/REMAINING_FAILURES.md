# Remaining Closed-Loop Corpus Failures

Last updated: 2026-06-27 (after Fix 035)

Harness: `_Decode_oracle/compare.js` → `buildChordDb.js`  
Failure classes: `harness` (alignment / truth-parser), `engine` (note-gen bug), `piano_noise` (piano scrape vs engine PC disagreement on edge cases)

---

## Summary (notesOk)

| Corpus | Chords | notesOk | Failing | eng | harness | piano |
|---|---:|---:|---:|---:|---:|---:|
| 1 (`chord_db`) | 1538 | **99.2%** (1526) | **12** | 0 | 10 | 2 |
| 2 (`chord_db_corpus2`) | 2347 | **100.0%** (2347) | **0** | 0 | 0 | 0 |
| 3 (`chord_db_corpus3`) | 6740 | **99.8%** (6726) | **14** | 0 | 11 | 3 |

**Fix 035 delta vs Fix 034:** c1 −1, c2 −1 (→0), c3 −17

---

## A. Alignment / count mismatch — **DEFERRED** (complex)

These need figured-bass-aware alignment or full timeline→strip mapping, not simple rootPc / leading-skip heuristics.

### Penny Lane Verse (`the-beatles__penny-lane/Verse`) — 10 unique failures

- **Symptom:** 43 rendered vs 46 JSON; pairs drift from beat ~4.5 onward.
- **Root cause:** Hooktheory renders **analyst Roman** on the strip (`vi7`, `ii65`, `I△42`) while JSON stores **figured-bass numerals** (`I△⁴²`, `I⁶₄`, `vi⁷`) for the same sonorities. Counts are close (ratio ≈ 0.93) but positional alignment assigns wrong JSON slots.
- **Defer rationale:** Needs inversion/figured-bass canonicalization in `svgTruth` or a dedicated Penny-Lane pairing mode. Not a one-line engine fix.
- **Example:** `Verse/6` truth `vi7` ↔ eng `I△⁴²` (same key area, different analysis layer).

### Waterloo Sunset Bridge (`the-kinks__waterloo-sunset/Bridge`) — 1 remaining

- **Symptom:** 21 vs 23 JSON; most Bridge mis-pairs fixed by Fix 035 rootPc alignment, but one chord still wrong.
- **Remaining:** `Bridge/41` `iiiø4(add13)2` ↔ `iiiø⁴²(add13)(add13)` — figured-bass + add13 truth parse vs engine duplicate `(add13)`.
- **Defer rationale:** Compound figured-bass token `4(add13)2` in SVG Roman row.

---

## B. Truth-parser / figured notation — **DEFERRED**

No simple regex left after Fix 035; remaining issues are tied to Penny Lane / Waterloo alignment above.

---

## C. Piano noise — **DEFERRED** (engine edge cases)

### God Only Knows `#iø7(bor)` — 2 chords (c1 + c3)

- **IDs:** `the-beach-boys__god-only-knows/Verse/29`, `Bridge/45`
- **Symptom:** truth PCs `[1,4,7,10]` vs eng `[1,4,9,10]` — engine emits **b5** (PC 9) on custom-array half-dim; SVG shows `ø7` without explicit `(b5)`.
- **Defer rationale:** Needs `flattenHalfDimB5` / custom-array ø quality rule in `music.js`, not harness-only.

### Whitney `iø7(loc)` — 1 chord (c3)

- **ID:** `whitney-houston__i-will-always-love-you/Chorus/23.75`
- **Symptom:** truth PCs `[0,3,6,9]` (bb7 / °5) vs eng `[0,3,7,9]` (natural 5).
- **Defer rationale:** Locrian half-dim 7th interval selection in engine; truth expects fully diminished 5th from scale.

---

## Fixed in Fix 035 (no longer failing)

| Song / section | Issue | Fix |
|---|---|---|
| `the-cranberries__zombie/Chorus` | 1 vs 16 repeat-condensed; `VII6`/`D/F#` collapsed to one row | `svgTruth` fill-color row split + `alignByRootPc` |
| `bruno-mars__i-just-might/Intro` | 4 vs 8; index pairing put `ii7` on `I` slots | `alignByRootPc` for ratio &lt; 0.8 |
| `bruno-mars__i-just-might/Chorus` | 9 vs 11; +2 leading JSON chords | Generalized `leadingJsonSkipCount` (skip ≤3) |
| `the-kinks__waterloo-sunset/Bridge` | 21 vs 23 (partial) | `alignByRootPc` recovered most pairs |

---

## Next P0 (when resuming)

1. Penny Lane figured-bass ↔ Roman dual representation mapper
2. Engine: custom-array `ø7` without auto-b5; locrian `iø7` fifth/ seventh quality
3. Waterloo `iiiø4(add13)2` compound figured-bass parse

Rebuild:

```bash
node _Decode_oracle/buildChordDb.js --corpus _Decode_oracle/corpus.json --db-dir _Decode_oracle/chord_db
node _Decode_oracle/buildChordDb.js --corpus _Decode_oracle/corpus2.json --db-dir _Decode_oracle/chord_db_corpus2
node _Decode_oracle/buildChordDb.js --corpus _Decode_oracle/corpus3.json --db-dir _Decode_oracle/chord_db_corpus3
```
