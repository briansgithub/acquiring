# Chord DB — modification pass rates

Built: 2026-07-22T16:40:14.397Z | Updated: 2026-07-22T16:40:14.398Z | Sources: 2 songs | Unique chords: 244

- **notesOk (unique):** 100.0% (244/244)
- **romanExact (unique):** 96.3% (235/244)
- **Chords below 99% target:** 0 failing (0.0% of corpus)
- **Buckets below 99%:** 0 / 21

## All buckets (worst first)

| Modification | count | notesOk | romanExact | failing | engine | harness | piano | example |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| applied=no | 242 | 100.0% | 96.3% | 0 | 0 | 0 | 0 |  |
| borrowed=none | 213 | 100.0% | 98.1% | 0 | 0 | 0 | 0 |  |
| inversion=0 | 210 | 100.0% | 95.7% | 0 | 0 | 0 | 0 |  |
| type=7 | 175 | 100.0% | 97.1% | 0 | 0 | 0 | 0 |  |
| type=5 | 59 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=mixolydian | 16 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| inversion=2 | 15 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| inversion=1 | 10 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| inversion=3 | 9 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=harmonicMinor | 8 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=locrian | 5 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| suspensions=2 | 5 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| alterations=b5 | 5 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| type=11 | 5 | 100.0% | 20.0% | 0 | 0 | 0 | 0 |  |
| type=13 | 5 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=b9 | 5 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=#9 | 4 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=minor | 2 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| applied=yes | 2 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| suspensions=4 | 1 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=#5 | 1 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |

## Recommended engine fix order

1. **suspensions** — not applied in `chordInterpreter` (0% notesOk expected)
2. **omits** — not applied in note builder
3. **adds** — extensions missing from generated notes
4. **alterations** — b9/#5/etc. not reflected in PCs
5. **type=13** — 13th chords missing extension notes
6. **borrowed=custom-array** — Roman + notes edge cases

See `_Decode_oracle/DECODE_FIX_LOG.md` for applied fixes and open gaps.
