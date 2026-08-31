# Chord DB — modification pass rates

Built: 2026-07-22T06:31:47.640Z | Updated: 2026-07-22T06:31:47.641Z | Sources: 8 songs | Unique chords: 399

- **notesOk (unique):** 100.0% (399/399)
- **romanExact (unique):** 94.2% (376/399)
- **Chords below 99% target:** 0 failing (0.0% of corpus)
- **Buckets below 99%:** 0 / 23

## All buckets (worst first)

| Modification | count | notesOk | romanExact | failing | engine | harness | piano | example |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| applied=no | 394 | 100.0% | 95.2% | 0 | 0 | 0 | 0 |  |
| borrowed=none | 370 | 100.0% | 95.1% | 0 | 0 | 0 | 0 |  |
| inversion=0 | 330 | 100.0% | 95.8% | 0 | 0 | 0 | 0 |  |
| type=5 | 193 | 100.0% | 97.4% | 0 | 0 | 0 | 0 |  |
| type=7 | 175 | 100.0% | 94.3% | 0 | 0 | 0 | 0 |  |
| inversion=1 | 27 | 100.0% | 85.2% | 0 | 0 | 0 | 0 |  |
| type=11 | 23 | 100.0% | 65.2% | 0 | 0 | 0 | 0 |  |
| inversion=2 | 22 | 100.0% | 77.3% | 0 | 0 | 0 | 0 |  |
| inversion=3 | 20 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=harmonicMinor | 10 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| adds=9 | 8 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=major | 8 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| suspensions=2 | 6 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| borrowed=locrian | 5 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| alterations=b5 | 5 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| type=13 | 5 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=b9 | 5 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| applied=yes | 5 | 100.0% | 20.0% | 0 | 0 | 0 | 0 |  |
| suspensions=4 | 3 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| type=9 | 3 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=dorian | 3 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=minor | 2 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=lydian | 1 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |

## Recommended engine fix order

1. **suspensions** — not applied in `chordInterpreter` (0% notesOk expected)
2. **omits** — not applied in note builder
3. **adds** — extensions missing from generated notes
4. **alterations** — b9/#5/etc. not reflected in PCs
5. **type=13** — 13th chords missing extension notes
6. **borrowed=custom-array** — Roman + notes edge cases

See `_Decode_oracle/DECODE_FIX_LOG.md` for applied fixes and open gaps.
