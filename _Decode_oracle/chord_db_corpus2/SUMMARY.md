# Chord DB — modification pass rates

Built: 2026-06-27T11:05:11.797Z | Updated: 2026-06-27T11:05:11.798Z | Sources: 50 songs | Unique chords: 2347

- **notesOk (unique):** 100.0% (2347/2347)
- **romanExact (unique):** 96.0% (2254/2347)
- **Chords below 99% target:** 0 failing (0.0% of corpus)
- **Buckets below 99%:** 0 / 39

## All buckets (worst first)

| Modification | count | notesOk | romanExact | failing | engine | harness | piano | example |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| applied=no | 2244 | 100.0% | 97.4% | 0 | 0 | 0 | 0 |  |
| borrowed=none | 2136 | 100.0% | 97.2% | 0 | 0 | 0 | 0 |  |
| inversion=0 | 2029 | 100.0% | 96.5% | 0 | 0 | 0 | 0 |  |
| type=5 | 1601 | 100.0% | 97.5% | 0 | 0 | 0 | 0 |  |
| type=7 | 673 | 100.0% | 93.5% | 0 | 0 | 0 | 0 |  |
| inversion=1 | 122 | 100.0% | 95.1% | 0 | 0 | 0 | 0 |  |
| applied=yes | 103 | 100.0% | 66.0% | 0 | 0 | 0 | 0 |  |
| inversion=2 | 101 | 100.0% | 94.1% | 0 | 0 | 0 | 0 |  |
| inversion=3 | 95 | 100.0% | 90.5% | 0 | 0 | 0 | 0 |  |
| suspensions=4 | 59 | 100.0% | 93.2% | 0 | 0 | 0 | 0 |  |
| suspensions=2 | 53 | 100.0% | 90.6% | 0 | 0 | 0 | 0 |  |
| adds=9 | 48 | 100.0% | 89.6% | 0 | 0 | 0 | 0 |  |
| type=9 | 44 | 100.0% | 93.2% | 0 | 0 | 0 | 0 |  |
| borrowed=minor | 42 | 100.0% | 81.0% | 0 | 0 | 0 | 0 |  |
| borrowed=harmonicMinor | 36 | 100.0% | 88.9% | 0 | 0 | 0 | 0 |  |
| borrowed=dorian | 30 | 100.0% | 83.3% | 0 | 0 | 0 | 0 |  |
| omits=5 | 30 | 100.0% | 96.7% | 0 | 0 | 0 | 0 |  |
| borrowed=mixolydian | 29 | 100.0% | 82.8% | 0 | 0 | 0 | 0 |  |
| adds=6 | 28 | 100.0% | 25.0% | 0 | 0 | 0 | 0 |  |
| type=11 | 24 | 100.0% | 75.0% | 0 | 0 | 0 | 0 |  |
| borrowed=major | 24 | 100.0% | 87.5% | 0 | 0 | 0 | 0 |  |
| adds=4 | 23 | 100.0% | 56.5% | 0 | 0 | 0 | 0 |  |
| borrowed=lydian | 16 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=b5 | 15 | 100.0% | 53.3% | 0 | 0 | 0 | 0 |  |
| omits=3 | 13 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=custom-array | 11 | 100.0% | 90.9% | 0 | 0 | 0 | 0 |  |
| borrowed=locrian | 10 | 100.0% | 40.0% | 0 | 0 | 0 | 0 |  |
| borrowed=phrygian | 8 | 100.0% | 87.5% | 0 | 0 | 0 | 0 |  |
| type=13 | 5 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=b9 | 5 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=#5 | 5 | 100.0% | 40.0% | 0 | 0 | 0 | 0 |  |
| borrowed=phrygianDominant | 5 | 100.0% | 80.0% | 0 | 0 | 0 | 0 |  |
| alterations=#9 | 4 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| suspensions=2+4 | 3 | 100.0% | 33.3% | 0 | 0 | 0 | 0 |  |
| suspensions=4+2 | 2 | 100.0% | 50.0% | 0 | 0 | 0 | 0 |  |
| alterations=#5+#9 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| adds=4+9 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| omits=3+5 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| adds=6+9 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |

## Recommended engine fix order

1. **suspensions** — not applied in `chordInterpreter` (0% notesOk expected)
2. **omits** — not applied in note builder
3. **adds** — extensions missing from generated notes
4. **alterations** — b9/#5/etc. not reflected in PCs
5. **type=13** — 13th chords missing extension notes
6. **borrowed=custom-array** — Roman + notes edge cases

See `_Decode_oracle/DECODE_FIX_LOG.md` for applied fixes and open gaps.
