# Chord DB — modification pass rates

Built: 2026-06-27T08:26:30.718Z | Updated: 2026-06-27T08:26:30.718Z | Sources: 33 songs | Unique chords: 1538

- **notesOk (unique):** 97.9% (1506/1538)
- **romanExact (unique):** 94.8% (1458/1538)
- **Chords below 99% target:** 32 failing (2.1% of corpus)
- **Buckets below 99%:** 14 / 36

## Worst buckets (engine fix priority)

### `borrowed=locrian` — 75.0% (3/4)

Failure mix: engine=0, harness=1, piano_noise=0

Example:
```json
{
  "id": "george-gershwin__summertime/Verse/9",
  "truthRoman": "i",
  "engRoman": "V⁷/V",
  "truthPcs": [
    2,
    6,
    9,
    11
  ],
  "engPcs": [
    1,
    5,
    8,
    11
  ],
  "chord": {
    "root": 5,
    "beat": 9,
    "duration": 4,
    "type": 7,
    "inversion": 0,
    "applied": 5,
    "adds": [],
    "omits": [],
    "alterations": [],
    "suspensions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": "locrian",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "harness"
}
```

### `borrowed=custom-array` — 80.0% (12/15)

Failure mix: engine=0, harness=0, piano_noise=3

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
    8,
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

### `alterations=b5` — 80.0% (4/5)

Failure mix: engine=0, harness=0, piano_noise=1

Example:
```json
{
  "id": "thelonious-monk__round-midnight/Verse/26",
  "truthRoman": "V7(b5)/bII(maj)(phr)",
  "engRoman": "V⁷(b5)/ii°",
  "truthPcs": [
    3,
    5,
    9,
    11
  ],
  "engPcs": [
    0,
    4,
    6,
    7,
    10
  ],
  "chord": {
    "root": 2,
    "beat": 26,
    "duration": 3,
    "type": 7,
    "inversion": 0,
    "applied": 5,
    "adds": [],
    "omits": [],
    "alterations": [
      "b5"
    ],
    "suspensions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": "phrygian",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "piano_noise"
}
```

### `borrowed=phrygian` — 83.3% (10/12)

Failure mix: engine=1, harness=0, piano_noise=1

Example:
```json
{
  "id": "george-gershwin__summertime/Chorus/35",
  "truthRoman": "vø7(phr)",
  "engRoman": "vø⁷(b5)(phr)",
  "truthPcs": [
    1,
    4,
    7,
    10
  ],
  "engPcs": [
    2,
    4,
    7,
    10
  ],
  "chord": {
    "root": 5,
    "beat": 35,
    "duration": 2,
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
    "borrowed": "phrygian",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "engine"
}
```

### `borrowed=harmonicMinor` — 83.3% (5/6)

Failure mix: engine=1, harness=0, piano_noise=0

Example:
```json
{
  "id": "thelonious-monk__round-midnight/Verse/1",
  "truthRoman": "i△42(hmin)",
  "engRoman": "i△⁴²(hmin)",
  "truthPcs": [
    2,
    3,
    6,
    10
  ],
  "engPcs": [
    2,
    3,
    6,
    10
  ],
  "chord": {
    "root": 1,
    "beat": 1,
    "duration": 2,
    "type": 7,
    "inversion": 3,
    "applied": 0,
    "adds": [],
    "omits": [],
    "alterations": [],
    "suspensions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": "harmonicMinor",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "engine"
}
```

### `borrowed=minor` — 91.3% (21/23)

Failure mix: engine=0, harness=1, piano_noise=1

Example:
```json
{
  "id": "george-gershwin__summertime/Verse/17",
  "truthRoman": "V7/iv",
  "engRoman": "i⁷(min)",
  "truthPcs": [
    3,
    6,
    9,
    11
  ],
  "engPcs": [
    2,
    6,
    9,
    11
  ],
  "chord": {
    "root": 1,
    "beat": 17,
    "duration": 2,
    "type": 7,
    "inversion": 0,
    "applied": 0,
    "adds": [],
    "omits": [],
    "alterations": [],
    "suspensions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": "minor",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "harness"
}
```

### `inversion=3` — 92.1% (35/38)

Failure mix: engine=1, harness=2, piano_noise=0

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

### `type=7` — 95.4% (474/497)

Failure mix: engine=3, harness=13, piano_noise=7

Example:
```json
{
  "id": "frank-sinatra__fly-me-to-the-moon/Verse/21",
  "truthRoman": "iiø7",
  "engRoman": "iiø⁷(b5)",
  "truthPcs": [
    2,
    5,
    8,
    11
  ],
  "engPcs": [
    2,
    5,
    9,
    11
  ],
  "chord": {
    "root": 2,
    "beat": 21,
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
    "borrowed": null,
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "piano_noise"
}
```

### `applied=yes` — 95.7% (90/94)

Failure mix: engine=0, harness=2, piano_noise=2

Example:
```json
{
  "id": "george-gershwin__summertime/Verse/9",
  "truthRoman": "i",
  "engRoman": "V⁷/V",
  "truthPcs": [
    2,
    6,
    9,
    11
  ],
  "engPcs": [
    1,
    5,
    8,
    11
  ],
  "chord": {
    "root": 5,
    "beat": 9,
    "duration": 4,
    "type": 7,
    "inversion": 0,
    "applied": 5,
    "adds": [],
    "omits": [],
    "alterations": [],
    "suspensions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": "locrian",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "harness"
}
```

### `inversion=1` — 96.0% (97/101)

Failure mix: engine=1, harness=2, piano_noise=1

Example:
```json
{
  "id": "the-beatles__let-it-be/Verse/12",
  "truthRoman": "ii65",
  "engRoman": "ii⁶⁵",
  "truthPcs": [
    0,
    3,
    5,
    9
  ],
  "engPcs": [
    0,
    2,
    5,
    9
  ],
  "chord": {
    "root": 2,
    "beat": 12,
    "duration": 1,
    "type": 7,
    "inversion": 1,
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
  "failureClass": "engine"
}
```

### `inversion=2` — 96.9% (93/96)

Failure mix: engine=0, harness=3, piano_noise=0

Example:
```json
{
  "id": "the-beatles__penny-lane/Verse/3.5",
  "truthRoman": "I",
  "engRoman": "I⁶₄",
  "truthPcs": [
    3,
    6,
    11
  ],
  "engPcs": [
    3,
    6,
    11
  ],
  "chord": {
    "root": 1,
    "beat": 3.5,
    "duration": 0.5,
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
    "borrowed": "",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "harness"
}
```

### `applied=no` — 98.1% (1416/1444)

Failure mix: engine=3, harness=20, piano_noise=5

Example:
```json
{
  "id": "adele__someone-like-you/Verse/1",
  "truthRoman": "I",
  "engRoman": "IV",
  "truthPcs": [
    1,
    4,
    9
  ],
  "engPcs": [
    2,
    6,
    9
  ],
  "chord": {
    "root": 4,
    "beat": 1,
    "duration": 4,
    "type": 5,
    "inversion": 0,
    "applied": 0,
    "adds": [],
    "omits": [],
    "alterations": [],
    "suspensions": [],
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
| borrowed=locrian | 4 | 75.0% | 75.0% | 1 | 0 | 1 | 0 | `george-gershwin__summertime/Verse/9` i→V⁷/V |
| borrowed=custom-array | 15 | 80.0% | 73.3% | 3 | 0 | 0 | 3 | `the-beach-boys__god-only-knows/Verse/29` #iø7(bor)→♯iø⁷(b5)(bor) |
| alterations=b5 | 5 | 80.0% | 80.0% | 1 | 0 | 0 | 1 | `thelonious-monk__round-midnight/Verse/26` V7(b5)/bII(maj)(phr)→V⁷(b5)/ii° |
| borrowed=phrygian | 12 | 83.3% | 83.3% | 2 | 1 | 0 | 1 | `george-gershwin__summertime/Chorus/35` vø7(phr)→vø⁷(b5)(phr) |
| borrowed=harmonicMinor | 6 | 83.3% | 100.0% | 1 | 1 | 0 | 0 | `thelonious-monk__round-midnight/Verse/1` i△42(hmin)→i△⁴²(hmin) |
| borrowed=minor | 23 | 91.3% | 91.3% | 2 | 0 | 1 | 1 | `george-gershwin__summertime/Verse/17` V7/iv→i⁷(min) |
| inversion=3 | 38 | 92.1% | 92.1% | 3 | 1 | 2 | 0 | `the-beatles__penny-lane/Verse/6` vi7→I△⁴² |
| type=7 | 497 | 95.4% | 88.7% | 23 | 3 | 13 | 7 | `frank-sinatra__fly-me-to-the-moon/Verse/21` iiø7→iiø⁷(b5) |
| applied=yes | 94 | 95.7% | 74.5% | 4 | 0 | 2 | 2 | `george-gershwin__summertime/Verse/9` i→V⁷/V |
| inversion=1 | 101 | 96.0% | 98.0% | 4 | 1 | 2 | 1 | `the-beatles__let-it-be/Verse/12` ii65→ii⁶⁵ |
| inversion=2 | 96 | 96.9% | 94.8% | 3 | 0 | 3 | 0 | `the-beatles__penny-lane/Verse/3.5` I→I⁶₄ |
| applied=no | 1444 | 98.1% | 96.1% | 28 | 3 | 20 | 5 | `adele__someone-like-you/Verse/1` I→IV |
| inversion=0 | 1303 | 98.3% | 94.6% | 22 | 1 | 15 | 6 | `adele__someone-like-you/Verse/1` I→IV |
| borrowed=none | 1444 | 98.4% | 95.8% | 23 | 1 | 20 | 2 | `adele__someone-like-you/Verse/1` I→IV |
| type=5 | 906 | 99.0% | 97.8% | 9 | 0 | 9 | 0 | `adele__someone-like-you/Verse/1` I→IV |
| type=9 | 87 | 100.0% | 95.4% | 0 | 0 | 0 | 0 |  |
| suspensions=4 | 31 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| type=13 | 29 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| adds=9 | 24 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| suspensions=2 | 22 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| type=11 | 19 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| adds=4 | 18 | 100.0% | 33.3% | 0 | 0 | 0 | 0 |  |
| borrowed=dorian | 17 | 100.0% | 52.9% | 0 | 0 | 0 | 0 |  |
| adds=6 | 15 | 100.0% | 80.0% | 0 | 0 | 0 | 0 |  |
| omits=3 | 10 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=#5 | 10 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=mixolydian | 7 | 100.0% | 85.7% | 0 | 0 | 0 | 0 |  |
| alterations=b9 | 7 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=lydian | 6 | 100.0% | 83.3% | 0 | 0 | 0 | 0 |  |
| borrowed=major | 4 | 100.0% | 75.0% | 0 | 0 | 0 | 0 |  |
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
