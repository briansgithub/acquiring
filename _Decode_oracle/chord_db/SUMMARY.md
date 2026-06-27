# Chord DB — modification pass rates

Built: 2026-06-27T08:30:16.269Z | Updated: 2026-06-27T08:30:16.270Z | Sources: 33 songs | Unique chords: 1538

- **notesOk (unique):** 98.6% (1516/1538)
- **romanExact (unique):** 94.8% (1458/1538)
- **Chords below 99% target:** 22 failing (1.4% of corpus)
- **Buckets below 99%:** 7 / 36

## Worst buckets (engine fix priority)

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

### `type=7` — 97.4% (484/497)

Failure mix: engine=1, harness=11, piano_noise=1

Example:
```json
{
  "id": "george-gershwin__summertime/Verse/1",
  "truthRoman": "i",
  "engRoman": "V⁷",
  "truthPcs": [
    2,
    6,
    9,
    11
  ],
  "engPcs": [
    1,
    4,
    6,
    10
  ],
  "chord": {
    "root": 5,
    "beat": 1,
    "duration": 4,
    "type": 7,
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

### `borrowed=none` — 98.5% (1422/1444)

Failure mix: engine=1, harness=20, piano_noise=1

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

### `applied=no` — 98.5% (1423/1444)

Failure mix: engine=1, harness=19, piano_noise=1

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

### `applied=yes` — 98.9% (93/94)

Failure mix: engine=0, harness=1, piano_noise=0

Example:
```json
{
  "id": "george-gershwin__summertime/Verse/19",
  "truthRoman": "iv",
  "engRoman": "V⁷/iv",
  "truthPcs": [
    2,
    4,
    7,
    11
  ],
  "engPcs": [
    3,
    6,
    9,
    11
  ],
  "chord": {
    "root": 4,
    "beat": 19,
    "duration": 2,
    "type": 7,
    "inversion": 0,
    "applied": 5,
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
| inversion=3 | 38 | 94.7% | 92.1% | 2 | 0 | 2 | 0 | `the-beatles__penny-lane/Verse/6` vi7→I△⁴² |
| inversion=1 | 101 | 96.0% | 98.0% | 4 | 1 | 2 | 1 | `the-beatles__let-it-be/Verse/12` ii65→ii⁶⁵ |
| inversion=2 | 96 | 96.9% | 94.8% | 3 | 0 | 3 | 0 | `the-beatles__penny-lane/Verse/3.5` I→I⁶₄ |
| type=7 | 497 | 97.4% | 88.7% | 13 | 1 | 11 | 1 | `george-gershwin__summertime/Verse/1` i→V⁷ |
| borrowed=none | 1444 | 98.5% | 95.8% | 22 | 1 | 20 | 1 | `adele__someone-like-you/Verse/1` I→IV |
| applied=no | 1444 | 98.5% | 96.1% | 21 | 1 | 19 | 1 | `adele__someone-like-you/Verse/1` I→IV |
| applied=yes | 94 | 98.9% | 74.5% | 1 | 0 | 1 | 0 | `george-gershwin__summertime/Verse/19` iv→V⁷/iv |
| inversion=0 | 1303 | 99.0% | 94.6% | 13 | 0 | 13 | 0 | `adele__someone-like-you/Verse/1` I→IV |
| type=5 | 906 | 99.0% | 97.8% | 9 | 0 | 9 | 0 | `adele__someone-like-you/Verse/1` I→IV |
| type=9 | 87 | 100.0% | 95.4% | 0 | 0 | 0 | 0 |  |
| suspensions=4 | 31 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| type=13 | 29 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| adds=9 | 24 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=minor | 23 | 100.0% | 91.3% | 0 | 0 | 0 | 0 |  |
| suspensions=2 | 22 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| type=11 | 19 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| adds=4 | 18 | 100.0% | 33.3% | 0 | 0 | 0 | 0 |  |
| borrowed=dorian | 17 | 100.0% | 52.9% | 0 | 0 | 0 | 0 |  |
| adds=6 | 15 | 100.0% | 80.0% | 0 | 0 | 0 | 0 |  |
| borrowed=custom-array | 15 | 100.0% | 73.3% | 0 | 0 | 0 | 0 |  |
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
