# Chord DB — modification pass rates

Built: 2026-06-27T11:05:10.946Z | Updated: 2026-06-27T11:05:10.947Z | Sources: 33 songs | Unique chords: 1538

- **notesOk (unique):** 99.2% (1526/1538)
- **romanExact (unique):** 95.3% (1466/1538)
- **Chords below 99% target:** 12 failing (0.8% of corpus)
- **Buckets below 99%:** 4 / 36

## Worst buckets (engine fix priority)

### `borrowed=custom-array` — 86.7% (13/15)

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

### `inversion=3` — 94.7% (36/38)

Failure mix: engine=0, harness=2, piano_noise=0

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

### `inversion=2` — 97.9% (94/96)

Failure mix: engine=0, harness=2, piano_noise=0

Example:
```json
{
  "id": "the-beatles__penny-lane/Verse/8",
  "truthRoman": "ii65",
  "engRoman": "I⁶₄",
  "truthPcs": [
    4,
    8,
    11
  ],
  "engPcs": [
    3,
    6,
    11
  ],
  "chord": {
    "root": 1,
    "beat": 8,
    "duration": 1,
    "type": 5,
    "inversion": 2,
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

### `type=7` — 98.4% (488/496)

Failure mix: engine=0, harness=6, piano_noise=2

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

## All buckets (worst first)

| Modification | count | notesOk | romanExact | failing | engine | harness | piano | example |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| borrowed=custom-array | 15 | 86.7% | 73.3% | 2 | 0 | 0 | 2 | `the-beach-boys__god-only-knows/Verse/29` #iø7(bor)→♯iø⁷(b5)(bor) |
| inversion=3 | 38 | 94.7% | 92.1% | 2 | 0 | 2 | 0 | `the-beatles__penny-lane/Verse/6` vi7→I△⁴² |
| inversion=2 | 96 | 97.9% | 94.8% | 2 | 0 | 2 | 0 | `the-beatles__penny-lane/Verse/8` ii65→I⁶₄ |
| type=7 | 496 | 98.4% | 89.5% | 8 | 0 | 6 | 2 | `the-beach-boys__god-only-knows/Verse/29` #iø7(bor)→♯iø⁷(b5)(bor) |
| applied=no | 1444 | 99.2% | 96.6% | 12 | 0 | 10 | 2 | `the-beach-boys__god-only-knows/Verse/29` #iø7(bor)→♯iø⁷(b5)(bor) |
| borrowed=none | 1444 | 99.3% | 96.3% | 10 | 0 | 10 | 0 | `the-beatles__penny-lane/Verse/4.5` I△42→I |
| inversion=0 | 1302 | 99.4% | 95.2% | 8 | 0 | 6 | 2 | `the-beach-boys__god-only-knows/Verse/29` #iø7(bor)→♯iø⁷(b5)(bor) |
| type=5 | 907 | 99.6% | 98.2% | 4 | 0 | 4 | 0 | `the-beatles__penny-lane/Verse/4.5` I△42→I |
| inversion=1 | 102 | 100.0% | 98.0% | 0 | 0 | 0 | 0 |  |
| applied=yes | 94 | 100.0% | 75.5% | 0 | 0 | 0 | 0 |  |
| type=9 | 87 | 100.0% | 95.4% | 0 | 0 | 0 | 0 |  |
| suspensions=4 | 31 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| type=13 | 29 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| adds=9 | 24 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=minor | 23 | 100.0% | 95.7% | 0 | 0 | 0 | 0 |  |
| suspensions=2 | 22 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| type=11 | 19 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| adds=4 | 18 | 100.0% | 33.3% | 0 | 0 | 0 | 0 |  |
| borrowed=dorian | 17 | 100.0% | 52.9% | 0 | 0 | 0 | 0 |  |
| adds=6 | 15 | 100.0% | 80.0% | 0 | 0 | 0 | 0 |  |
| borrowed=phrygian | 12 | 100.0% | 83.3% | 0 | 0 | 0 | 0 |  |
| omits=3 | 10 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=#5 | 10 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=mixolydian | 7 | 100.0% | 85.7% | 0 | 0 | 0 | 0 |  |
| alterations=b9 | 7 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=lydian | 6 | 100.0% | 83.3% | 0 | 0 | 0 | 0 |  |
| borrowed=harmonicMinor | 6 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=b5 | 5 | 100.0% | 80.0% | 0 | 0 | 0 | 0 |  |
| borrowed=major | 4 | 100.0% | 75.0% | 0 | 0 | 0 | 0 |  |
| borrowed=locrian | 4 | 100.0% | 75.0% | 0 | 0 | 0 | 0 |  |
| suspensions=2+4 | 2 | 100.0% | 50.0% | 0 | 0 | 0 | 0 |  |
| omits=5 | 2 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| suspensions=4+2 | 2 | 100.0% | 50.0% | 0 | 0 | 0 | 0 |  |
| alterations=#11 | 1 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| adds=6+9 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| alterations=b5+b9 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |

## Recommended engine fix order

1. **suspensions** — not applied in `chordInterpreter` (0% notesOk expected)
2. **omits** — not applied in note builder
3. **adds** — extensions missing from generated notes
4. **alterations** — b9/#5/etc. not reflected in PCs
5. **type=13** — 13th chords missing extension notes
6. **borrowed=custom-array** — Roman + notes edge cases

See `_Decode_oracle/DECODE_FIX_LOG.md` for applied fixes and open gaps.
