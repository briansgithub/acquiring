# Chord DB — modification pass rates

Built: 2026-06-27T09:32:45.767Z | Updated: 2026-06-27T09:32:45.768Z | Sources: 179 songs | Unique chords: 6740

- **notesOk (unique):** 99.0% (6675/6740)
- **romanExact (unique):** 93.1% (6274/6740)
- **Chords below 99% target:** 65 failing (1.0% of corpus)
- **Buckets below 99%:** 13 / 41

## Worst buckets (engine fix priority)

### `borrowed=custom-array` — 85.0% (17/20)

Failure mix: engine=1, harness=0, piano_noise=2

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

### `alterations=b5` — 90.0% (18/20)

Failure mix: engine=2, harness=0, piano_noise=0

Example:
```json
{
  "id": "simon-and-garfunkel__bridge-over-troubled-water/Intro/11",
  "truthRoman": "iiø6(b5)5/ii",
  "engRoman": "ii⁶⁵(b5)/ii",
  "truthPcs": [
    1,
    4,
    7,
    10
  ],
  "engPcs": [
    1,
    5,
    7,
    10
  ],
  "chord": {
    "root": 2,
    "beat": 11,
    "duration": 1,
    "type": 7,
    "inversion": 1,
    "applied": 2,
    "adds": [],
    "omits": [],
    "alterations": [
      "b5"
    ],
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

### `type=11` — 95.7% (67/70)

Failure mix: engine=0, harness=3, piano_noise=0

Example:
```json
{
  "id": "adele__set-fire-to-the-rain/Outro/10.5",
  "truthRoman": "i6",
  "engRoman": "iiø¹¹(no3)(no5)",
  "truthPcs": [
    2,
    4,
    6,
    9
  ],
  "engPcs": [
    1,
    4,
    5,
    10
  ],
  "chord": {
    "root": 2,
    "beat": 10.5,
    "duration": 1,
    "type": 11,
    "inversion": 0,
    "applied": 0,
    "adds": [],
    "omits": [
      3,
      5
    ],
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

### `inversion=3` — 96.7% (176/182)

Failure mix: engine=0, harness=6, piano_noise=0

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

### `applied=yes` — 96.8% (214/221)

Failure mix: engine=1, harness=6, piano_noise=0

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

### `suspensions=2` — 97.7% (125/128)

Failure mix: engine=0, harness=3, piano_noise=0

Example:
```json
{
  "id": "adele__set-fire-to-the-rain/Outro/25",
  "truthRoman": "iv6sus2",
  "engRoman": "ivsus2",
  "truthPcs": [
    2,
    7,
    9
  ],
  "engPcs": [
    2,
    7,
    9
  ],
  "chord": {
    "root": 4,
    "beat": 25,
    "duration": 1.5,
    "type": 5,
    "inversion": 0,
    "applied": 0,
    "adds": [],
    "omits": [],
    "alterations": [],
    "suspensions": [
      2
    ],
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

### `inversion=1` — 98.1% (413/421)

Failure mix: engine=1, harness=7, piano_noise=0

Example:
```json
{
  "id": "adele__set-fire-to-the-rain/Verse/24.5",
  "truthRoman": "VII",
  "engRoman": "III⁶",
  "truthPcs": [
    0,
    4,
    7
  ],
  "engPcs": [
    0,
    5,
    9
  ],
  "chord": {
    "root": 3,
    "beat": 24.5,
    "duration": 4.5,
    "type": 5,
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
  "failureClass": "harness"
}
```

### `type=7` — 98.7% (1706/1729)

Failure mix: engine=2, harness=18, piano_noise=3

Example:
```json
{
  "id": "bruno-mars__i-just-might/Chorus/3.5",
  "truthRoman": "iii7",
  "engRoman": "ii⁷",
  "truthPcs": [
    0,
    4,
    7,
    9
  ],
  "engPcs": [
    2,
    5,
    7,
    10
  ],
  "chord": {
    "root": 2,
    "beat": 3.5,
    "duration": 0.75,
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
    "borrowed": "",
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

### `inversion=2` — 98.8% (318/322)

Failure mix: engine=0, harness=4, piano_noise=0

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

### `omits=3` — 98.9% (88/89)

Failure mix: engine=0, harness=1, piano_noise=0

Example:
```json
{
  "id": "adele__set-fire-to-the-rain/Outro/18.5",
  "truthRoman": "VII6",
  "engRoman": "i¹¹(no3)",
  "truthPcs": [
    0,
    2,
    4,
    7,
    9
  ],
  "engPcs": [
    0,
    2,
    4,
    7,
    9
  ],
  "chord": {
    "root": 1,
    "beat": 18.5,
    "duration": 1,
    "type": 11,
    "inversion": 0,
    "applied": 0,
    "adds": [],
    "omits": [
      3
    ],
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
| borrowed=custom-array | 20 | 85.0% | 65.0% | 3 | 1 | 0 | 2 | `the-beach-boys__god-only-knows/Verse/29` #iø7(bor)→♯iø⁷(b5)(bor) |
| alterations=b5 | 20 | 90.0% | 60.0% | 2 | 2 | 0 | 0 | `simon-and-garfunkel__bridge-over-troubled-water/Intro/11` iiø6(b5)5/ii→ii⁶⁵(b5)/ii |
| type=11 | 70 | 95.7% | 77.1% | 3 | 0 | 3 | 0 | `adele__set-fire-to-the-rain/Outro/10.5` i6→iiø¹¹(no3)(no5) |
| inversion=3 | 182 | 96.7% | 87.9% | 6 | 0 | 6 | 0 | `the-beatles__penny-lane/Verse/6` vi7→I△⁴² |
| applied=yes | 221 | 96.8% | 71.5% | 7 | 1 | 6 | 0 | `george-gershwin__summertime/Verse/19` iv→V⁷/iv |
| suspensions=2 | 128 | 97.7% | 90.6% | 3 | 0 | 3 | 0 | `adele__set-fire-to-the-rain/Outro/25` iv6sus2→ivsus2 |
| borrowed=locrian | 44 | 97.7% | 75.0% | 1 | 0 | 0 | 1 | `whitney-houston__i-will-always-love-you/Chorus/23.75` iø7(loc)→iø⁷(b5)(loc) |
| inversion=1 | 421 | 98.1% | 95.2% | 8 | 1 | 7 | 0 | `adele__set-fire-to-the-rain/Verse/24.5` VII→III⁶ |
| type=7 | 1729 | 98.7% | 92.9% | 23 | 2 | 18 | 3 | `bruno-mars__i-just-might/Chorus/3.5` iii7→ii⁷ |
| adds=6 | 79 | 98.7% | 53.2% | 1 | 0 | 1 | 0 | `the-kinks__waterloo-sunset/Bridge/41` iiiø4(add13)2→iiiø⁴²(add13)(add13) |
| inversion=2 | 322 | 98.8% | 91.9% | 4 | 0 | 4 | 0 | `the-beatles__penny-lane/Verse/8` ii65→I⁶₄ |
| omits=3 | 89 | 98.9% | 89.9% | 1 | 0 | 1 | 0 | `adele__set-fire-to-the-rain/Outro/18.5` VII6→i¹¹(no3) |
| omits=3+5 | 196 | 99.0% | 0.0% | 2 | 0 | 2 | 0 | `adele__set-fire-to-the-rain/Outro/10.5` i6→iiø¹¹(no3)(no5) |
| borrowed=none | 6287 | 99.0% | 93.6% | 61 | 1 | 60 | 0 | `adele__set-fire-to-the-rain/Verse/1` i→iv |
| applied=no | 6519 | 99.1% | 93.8% | 58 | 1 | 54 | 3 | `adele__set-fire-to-the-rain/Verse/1` i→iv |
| type=5 | 4746 | 99.2% | 93.3% | 39 | 0 | 39 | 0 | `adele__set-fire-to-the-rain/Verse/1` i→iv |
| inversion=0 | 5815 | 99.2% | 93.2% | 47 | 1 | 43 | 3 | `adele__set-fire-to-the-rain/Verse/1` i→iv |
| type=9 | 154 | 100.0% | 94.8% | 0 | 0 | 0 | 0 |  |
| suspensions=4 | 149 | 100.0% | 90.6% | 0 | 0 | 0 | 0 |  |
| adds=9 | 114 | 100.0% | 93.0% | 0 | 0 | 0 | 0 |  |
| adds=4 | 96 | 100.0% | 69.8% | 0 | 0 | 0 | 0 |  |
| borrowed=minor | 90 | 100.0% | 82.2% | 0 | 0 | 0 | 0 |  |
| borrowed=major | 85 | 100.0% | 95.3% | 0 | 0 | 0 | 0 |  |
| borrowed=dorian | 73 | 100.0% | 82.2% | 0 | 0 | 0 | 0 |  |
| omits=5 | 69 | 100.0% | 84.1% | 0 | 0 | 0 | 0 |  |
| borrowed=harmonicMinor | 43 | 100.0% | 88.4% | 0 | 0 | 0 | 0 |  |
| borrowed=mixolydian | 42 | 100.0% | 85.7% | 0 | 0 | 0 | 0 |  |
| type=13 | 41 | 100.0% | 90.2% | 0 | 0 | 0 | 0 |  |
| borrowed=lydian | 25 | 100.0% | 96.0% | 0 | 0 | 0 | 0 |  |
| borrowed=phrygian | 23 | 100.0% | 91.3% | 0 | 0 | 0 | 0 |  |
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
