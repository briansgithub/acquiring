# Chord DB — modification pass rates

Built: 2026-06-27T09:04:05.787Z | Updated: 2026-06-27T09:04:05.788Z | Sources: 45 songs | Unique chords: 2169

- **notesOk (unique):** 99.4% (2157/2169)
- **romanExact (unique):** 95.4% (2069/2169)
- **Chords below 99% target:** 12 failing (0.6% of corpus)
- **Buckets below 99%:** 10 / 39

## Worst buckets (engine fix priority)

### `omits=3+5` — 0.0% (0/1)

Failure mix: engine=1, harness=0, piano_noise=0

Example:
```json
{
  "id": "rem__losing-my-religion/Intro/15",
  "truthRoman": "iiø11(no3no5)",
  "engRoman": "iiø¹¹(no3)(no5)(b5)(b9)",
  "truthPcs": [
    0,
    5,
    8,
    11
  ],
  "engPcs": [
    5,
    8,
    11
  ],
  "chord": {
    "root": 2,
    "beat": 15,
    "duration": 2,
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
  "failureClass": "engine"
}
```

### `alterations=#5` — 60.0% (3/5)

Failure mix: engine=2, harness=0, piano_noise=0

Example:
```json
{
  "id": "carole-king__its-too-late/Chorus/31",
  "truthRoman": "vii7(#5)",
  "engRoman": "vii+ø⁷(#5)",
  "truthPcs": [
    0,
    2,
    4,
    7
  ],
  "engPcs": [
    2,
    4,
    7,
    11
  ],
  "chord": {
    "root": 7,
    "beat": 31,
    "duration": 2,
    "type": 7,
    "inversion": 0,
    "applied": 0,
    "adds": [],
    "omits": [],
    "alterations": [
      "#5"
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

### `alterations=b5` — 86.7% (13/15)

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

### `borrowed=custom-array` — 90.9% (10/11)

Failure mix: engine=1, harness=0, piano_noise=0

Example:
```json
{
  "id": "the-police__every-breath-you-take/Chorus/64.5",
  "truthRoman": "vi°△7(b5)(bor)",
  "engRoman": "vi△⁷(b5)(bor)",
  "truthPcs": [
    2,
    5,
    8,
    11
  ],
  "engPcs": [
    4,
    5,
    8,
    11
  ],
  "chord": {
    "root": 6,
    "beat": 64.5,
    "duration": 0.5,
    "type": 7,
    "inversion": 0,
    "applied": 0,
    "adds": [],
    "omits": [],
    "alterations": [
      "b5"
    ],
    "suspensions": [],
    "substitutions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": [
      0,
      2,
      4,
      5,
      8,
      9,
      11
    ],
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "engine"
}
```

### `type=11` — 94.4% (17/18)

Failure mix: engine=1, harness=0, piano_noise=0

Example:
```json
{
  "id": "rem__losing-my-religion/Intro/15",
  "truthRoman": "iiø11(no3no5)",
  "engRoman": "iiø¹¹(no3)(no5)(b5)(b9)",
  "truthPcs": [
    0,
    5,
    8,
    11
  ],
  "engPcs": [
    5,
    8,
    11
  ],
  "chord": {
    "root": 2,
    "beat": 15,
    "duration": 2,
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
  "failureClass": "engine"
}
```

### `borrowed=major` — 95.8% (23/24)

Failure mix: engine=1, harness=0, piano_noise=0

Example:
```json
{
  "id": "pink-floyd__money/Chorus/8",
  "truthRoman": "vii/V(maj)(#5)(maj)",
  "engRoman": "vii+°(#5)/v",
  "truthPcs": [
    1,
    5,
    8
  ],
  "engPcs": [
    0,
    5,
    8
  ],
  "chord": {
    "root": 5,
    "beat": 8,
    "duration": 1,
    "type": 5,
    "inversion": 0,
    "applied": 7,
    "adds": [],
    "omits": [],
    "alterations": [
      "#5"
    ],
    "suspensions": [],
    "substitutions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": "major",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "engine"
}
```

### `applied=yes` — 97.1% (100/103)

Failure mix: engine=2, harness=1, piano_noise=0

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

### `borrowed=minor` — 97.6% (41/42)

Failure mix: engine=1, harness=0, piano_noise=0

Example:
```json
{
  "id": "amy-winehouse__back-to-black/Instrumental/7.5",
  "truthRoman": "i42(min)",
  "engRoman": "i⁴²(min)",
  "truthPcs": [
    0,
    2,
    5,
    9
  ],
  "engPcs": [
    0,
    2,
    6,
    9
  ],
  "chord": {
    "root": 1,
    "beat": 7.5,
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
    "borrowed": "minor",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "engine"
}
```

### `type=7` — 98.9% (648/655)

Failure mix: engine=4, harness=3, piano_noise=0

Example:
```json
{
  "id": "amy-winehouse__back-to-black/Instrumental/7.5",
  "truthRoman": "i42(min)",
  "engRoman": "i⁴²(min)",
  "truthPcs": [
    0,
    2,
    5,
    9
  ],
  "engPcs": [
    0,
    2,
    6,
    9
  ],
  "chord": {
    "root": 1,
    "beat": 7.5,
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
    "borrowed": "minor",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "engine"
}
```

### `inversion=3` — 98.9% (94/95)

Failure mix: engine=1, harness=0, piano_noise=0

Example:
```json
{
  "id": "amy-winehouse__back-to-black/Instrumental/7.5",
  "truthRoman": "i42(min)",
  "engRoman": "i⁴²(min)",
  "truthPcs": [
    0,
    2,
    5,
    9
  ],
  "engPcs": [
    0,
    2,
    6,
    9
  ],
  "chord": {
    "root": 1,
    "beat": 7.5,
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
    "borrowed": "minor",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "engine"
}
```

## All buckets (worst first)

| Modification | count | notesOk | romanExact | failing | engine | harness | piano | example |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| omits=3+5 | 1 | 0.0% | 0.0% | 1 | 1 | 0 | 0 | `rem__losing-my-religion/Intro/15` iiø11(no3no5)→iiø¹¹(no3)(no5)(b5)(b9) |
| alterations=#5 | 5 | 60.0% | 40.0% | 2 | 2 | 0 | 0 | `carole-king__its-too-late/Chorus/31` vii7(#5)→vii+ø⁷(#5) |
| alterations=b5 | 15 | 86.7% | 53.3% | 2 | 2 | 0 | 0 | `simon-and-garfunkel__bridge-over-troubled-water/Intro/11` iiø6(b5)5/ii→ii⁶⁵(b5)/ii |
| borrowed=custom-array | 11 | 90.9% | 90.9% | 1 | 1 | 0 | 0 | `the-police__every-breath-you-take/Chorus/64.5` vi°△7(b5)(bor)→vi△⁷(b5)(bor) |
| type=11 | 18 | 94.4% | 66.7% | 1 | 1 | 0 | 0 | `rem__losing-my-religion/Intro/15` iiø11(no3no5)→iiø¹¹(no3)(no5)(b5)(b9) |
| borrowed=major | 24 | 95.8% | 87.5% | 1 | 1 | 0 | 0 | `pink-floyd__money/Chorus/8` vii/V(maj)(#5)(maj)→vii+°(#5)/v |
| applied=yes | 103 | 97.1% | 65.0% | 3 | 2 | 1 | 0 | `george-gershwin__summertime/Verse/19` iv→V⁷/iv |
| borrowed=minor | 42 | 97.6% | 78.6% | 1 | 1 | 0 | 0 | `amy-winehouse__back-to-black/Instrumental/7.5` i42(min)→i⁴²(min) |
| type=7 | 655 | 98.9% | 92.7% | 7 | 4 | 3 | 0 | `amy-winehouse__back-to-black/Instrumental/7.5` i42(min)→i⁴²(min) |
| inversion=3 | 95 | 98.9% | 90.5% | 1 | 1 | 0 | 0 | `amy-winehouse__back-to-black/Instrumental/7.5` i42(min)→i⁴²(min) |
| inversion=1 | 115 | 99.1% | 94.8% | 1 | 1 | 0 | 0 | `simon-and-garfunkel__bridge-over-troubled-water/Intro/11` iiø6(b5)5/ii→ii⁶⁵(b5)/ii |
| inversion=0 | 1859 | 99.5% | 95.8% | 10 | 4 | 6 | 0 | `carole-king__its-too-late/Chorus/31` vii7(#5)→vii+ø⁷(#5) |
| borrowed=none | 1960 | 99.5% | 96.7% | 9 | 3 | 6 | 0 | `carole-king__its-too-late/Chorus/31` vii7(#5)→vii+ø⁷(#5) |
| applied=no | 2066 | 99.6% | 96.9% | 9 | 4 | 5 | 0 | `amy-winehouse__back-to-black/Instrumental/7.5` i42(min)→i⁴²(min) |
| type=5 | 1450 | 99.7% | 97.0% | 4 | 1 | 3 | 0 | `george-gershwin__summertime/Verse/5` V7/bV(loc)→i |
| inversion=2 | 100 | 100.0% | 94.0% | 0 | 0 | 0 | 0 |  |
| suspensions=2 | 51 | 100.0% | 90.2% | 0 | 0 | 0 | 0 |  |
| suspensions=4 | 51 | 100.0% | 92.2% | 0 | 0 | 0 | 0 |  |
| adds=9 | 48 | 100.0% | 89.6% | 0 | 0 | 0 | 0 |  |
| type=9 | 41 | 100.0% | 92.7% | 0 | 0 | 0 | 0 |  |
| borrowed=harmonicMinor | 36 | 100.0% | 88.9% | 0 | 0 | 0 | 0 |  |
| borrowed=dorian | 30 | 100.0% | 83.3% | 0 | 0 | 0 | 0 |  |
| omits=5 | 30 | 100.0% | 96.7% | 0 | 0 | 0 | 0 |  |
| borrowed=mixolydian | 29 | 100.0% | 82.8% | 0 | 0 | 0 | 0 |  |
| adds=6 | 28 | 100.0% | 25.0% | 0 | 0 | 0 | 0 |  |
| adds=4 | 23 | 100.0% | 56.5% | 0 | 0 | 0 | 0 |  |
| borrowed=lydian | 14 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| omits=3 | 11 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=locrian | 10 | 100.0% | 40.0% | 0 | 0 | 0 | 0 |  |
| borrowed=phrygian | 8 | 100.0% | 87.5% | 0 | 0 | 0 | 0 |  |
| type=13 | 5 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=b9 | 5 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=phrygianDominant | 5 | 100.0% | 80.0% | 0 | 0 | 0 | 0 |  |
| alterations=#9 | 4 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| suspensions=2+4 | 3 | 100.0% | 33.3% | 0 | 0 | 0 | 0 |  |
| suspensions=4+2 | 2 | 100.0% | 50.0% | 0 | 0 | 0 | 0 |  |
| alterations=#5+#9 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| adds=4+9 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| adds=6+9 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |

## Recommended engine fix order

1. **suspensions** — not applied in `chordInterpreter` (0% notesOk expected)
2. **omits** — not applied in note builder
3. **adds** — extensions missing from generated notes
4. **alterations** — b9/#5/etc. not reflected in PCs
5. **type=13** — 13th chords missing extension notes
6. **borrowed=custom-array** — Roman + notes edge cases

See `_Decode_oracle/DECODE_FIX_LOG.md` for applied fixes and open gaps.
