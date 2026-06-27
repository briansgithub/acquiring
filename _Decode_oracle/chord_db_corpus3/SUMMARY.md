# Chord DB — modification pass rates

Built: 2026-06-27T11:05:13.142Z | Updated: 2026-06-27T11:05:13.143Z | Sources: 179 songs | Unique chords: 6740

- **notesOk (unique):** 99.8% (6726/6740)
- **romanExact (unique):** 93.8% (6323/6740)
- **Chords below 99% target:** 14 failing (0.2% of corpus)
- **Buckets below 99%:** 4 / 41

## Worst buckets (engine fix priority)

### `borrowed=custom-array` — 90.0% (18/20)

Failure mix: engine=0, harness=0, piano_noise=2

Example:
```json
{
  "id": "the-beach-boys__god-only-knows/Verse/29",
  "truthRoman": "#iø7(bor)",
  "engRoman": "♯iø⁷(b5)(bor)",
  "truthPcs": [
    1,
    4,
    7,
    10
  ],
  "engPcs": [
    1,
    4,
    9,
    10
  ],
  "chord": {
    "root": 1,
    "beat": 29,
    "duration": 4,
    "type": 7,
    "inversion": 0,
    "applied": 0,
    "adds": [],
    "omits": [],
    "alterations": [],
    "suspensions": [],
    "substitutions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": [
      1,
      2,
      4,
      6,
      7,
      9,
      11
    ],
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "piano_noise"
}
```

### `borrowed=locrian` — 97.7% (43/44)

Failure mix: engine=0, harness=0, piano_noise=1

Example:
```json
{
  "id": "whitney-houston__i-will-always-love-you/Chorus/23.75",
  "truthRoman": "iø7(loc)",
  "engRoman": "iø⁷(b5)(loc)",
  "truthPcs": [
    0,
    3,
    6,
    9
  ],
  "engPcs": [
    0,
    3,
    7,
    9
  ],
  "chord": {
    "root": 1,
    "beat": 23.75,
    "duration": 0.25,
    "type": 7,
    "inversion": 0,
    "applied": 0,
    "adds": [],
    "omits": [],
    "alterations": [],
    "suspensions": [],
    "substitutions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": "locrian",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "piano_noise"
}
```

### `inversion=3` — 98.4% (179/182)

Failure mix: engine=0, harness=3, piano_noise=0

Example:
```json
{
  "id": "the-beatles__penny-lane/Verse/6",
  "truthRoman": "vi7",
  "engRoman": "I△⁴²",
  "truthPcs": [
    3,
    6,
    8,
    11
  ],
  "engPcs": [
    3,
    6,
    10,
    11
  ],
  "chord": {
    "root": 1,
    "beat": 6,
    "duration": 1,
    "type": 7,
    "inversion": 3,
    "applied": 0,
    "adds": [],
    "omits": [],
    "alterations": [],
    "suspensions": [],
    "substitutions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": null,
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "harness"
}
```

### `adds=6` — 98.7% (78/79)

Failure mix: engine=0, harness=1, piano_noise=0

Example:
```json
{
  "id": "the-kinks__waterloo-sunset/Bridge/41",
  "truthRoman": "iiiø4(add13)2",
  "engRoman": "iiiø⁴²(add13)(add13)",
  "truthPcs": [
    0,
    3,
    6,
    9
  ],
  "engPcs": [
    0,
    1,
    3,
    6,
    9
  ],
  "chord": {
    "root": 3,
    "beat": 41,
    "duration": 2,
    "type": 7,
    "inversion": 3,
    "applied": 0,
    "adds": [
      6
    ],
    "omits": [],
    "alterations": [],
    "suspensions": [],
    "substitutions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": "",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "harness"
}
```

## All buckets (worst first)

| Modification | count | notesOk | romanExact | failing | engine | harness | piano | example |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| borrowed=custom-array | 20 | 90.0% | 65.0% | 2 | 0 | 0 | 2 | `the-beach-boys__god-only-knows/Verse/29` #iø7(bor)→♯iø⁷(b5)(bor) |
| borrowed=locrian | 44 | 97.7% | 75.0% | 1 | 0 | 0 | 1 | `whitney-houston__i-will-always-love-you/Chorus/23.75` iø7(loc)→iø⁷(b5)(loc) |
| inversion=3 | 182 | 98.4% | 89.6% | 3 | 0 | 3 | 0 | `the-beatles__penny-lane/Verse/6` vi7→I△⁴² |
| adds=6 | 79 | 98.7% | 53.2% | 1 | 0 | 1 | 0 | `the-kinks__waterloo-sunset/Bridge/41` iiiø4(add13)2→iiiø⁴²(add13)(add13) |
| inversion=2 | 323 | 99.4% | 92.6% | 2 | 0 | 2 | 0 | `the-beatles__penny-lane/Verse/8` ii65→I⁶₄ |
| type=7 | 1730 | 99.4% | 93.6% | 10 | 0 | 7 | 3 | `the-beach-boys__god-only-knows/Verse/29` #iø7(bor)→♯iø⁷(b5)(bor) |
| applied=no | 6520 | 99.8% | 94.5% | 14 | 0 | 11 | 3 | `the-beach-boys__god-only-knows/Verse/29` #iø7(bor)→♯iø⁷(b5)(bor) |
| borrowed=none | 6287 | 99.8% | 94.4% | 11 | 0 | 11 | 0 | `the-beatles__penny-lane/Verse/4.5` I△42→I |
| inversion=0 | 5813 | 99.8% | 93.8% | 9 | 0 | 6 | 3 | `the-beach-boys__god-only-knows/Verse/29` #iø7(bor)→♯iø⁷(b5)(bor) |
| type=5 | 4745 | 99.9% | 94.1% | 4 | 0 | 4 | 0 | `the-beatles__penny-lane/Verse/4.5` I△42→I |
| inversion=1 | 422 | 100.0% | 96.9% | 0 | 0 | 0 | 0 |  |
| applied=yes | 220 | 100.0% | 74.1% | 0 | 0 | 0 | 0 |  |
| omits=3+5 | 196 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| type=9 | 154 | 100.0% | 94.8% | 0 | 0 | 0 | 0 |  |
| suspensions=4 | 149 | 100.0% | 91.3% | 0 | 0 | 0 | 0 |  |
| suspensions=2 | 128 | 100.0% | 93.0% | 0 | 0 | 0 | 0 |  |
| adds=9 | 114 | 100.0% | 93.0% | 0 | 0 | 0 | 0 |  |
| adds=4 | 96 | 100.0% | 69.8% | 0 | 0 | 0 | 0 |  |
| borrowed=minor | 90 | 100.0% | 83.3% | 0 | 0 | 0 | 0 |  |
| omits=3 | 89 | 100.0% | 91.0% | 0 | 0 | 0 | 0 |  |
| borrowed=major | 85 | 100.0% | 95.3% | 0 | 0 | 0 | 0 |  |
| borrowed=dorian | 73 | 100.0% | 82.2% | 0 | 0 | 0 | 0 |  |
| type=11 | 70 | 100.0% | 78.6% | 0 | 0 | 0 | 0 |  |
| omits=5 | 69 | 100.0% | 84.1% | 0 | 0 | 0 | 0 |  |
| borrowed=harmonicMinor | 43 | 100.0% | 88.4% | 0 | 0 | 0 | 0 |  |
| borrowed=mixolydian | 42 | 100.0% | 85.7% | 0 | 0 | 0 | 0 |  |
| type=13 | 41 | 100.0% | 90.2% | 0 | 0 | 0 | 0 |  |
| borrowed=lydian | 25 | 100.0% | 96.0% | 0 | 0 | 0 | 0 |  |
| borrowed=phrygian | 23 | 100.0% | 91.3% | 0 | 0 | 0 | 0 |  |
| alterations=b5 | 20 | 100.0% | 60.0% | 0 | 0 | 0 | 0 |  |
| alterations=#5 | 14 | 100.0% | 78.6% | 0 | 0 | 0 | 0 |  |
| alterations=b9 | 12 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=#9 | 9 | 100.0% | 55.6% | 0 | 0 | 0 | 0 |  |
| borrowed=phrygianDominant | 8 | 100.0% | 87.5% | 0 | 0 | 0 | 0 |  |
| suspensions=2+4 | 5 | 100.0% | 40.0% | 0 | 0 | 0 | 0 |  |
| suspensions=4+2 | 2 | 100.0% | 50.0% | 0 | 0 | 0 | 0 |  |
| adds=6+9 | 2 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| alterations=#11 | 1 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=#5+#9 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| adds=4+9 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| alterations=b5+b9 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |

## Recommended engine fix order

1. **suspensions** — not applied in `chordInterpreter` (0% notesOk expected)
2. **omits** — not applied in note builder
3. **adds** — extensions missing from generated notes
4. **alterations** — b9/#5/etc. not reflected in PCs
5. **type=13** — 13th chords missing extension notes
6. **borrowed=custom-array** — Roman + notes edge cases

See `_Decode_oracle/DECODE_FIX_LOG.md` for applied fixes and open gaps.
