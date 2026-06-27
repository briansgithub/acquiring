# Chord DB — modification pass rates

Built: 2026-06-27T08:12:05.846Z | Updated: 2026-06-27T08:15:32.753Z | Sources: 70 songs | Unique chords: 3378

- **notesOk (unique):** 97.8% (3303/3378)
- **romanExact (unique):** 94.6% (3196/3378)
- **Chords below 99% target:** 75 failing (2.2% of corpus)
- **Buckets below 99%:** 21 / 41

## Worst buckets (engine fix priority)

### `omits=3+5` — 0.0% (0/1)

Failure mix: engine=1, harness=0, piano_noise=0

Example:
```json
{
  "id": "rem__losing-my-religion/Intro/15",
  "truthRoman": "iiø11(no3no5)",
  "engRoman": "iiø¹¹(no3)(no5)(b5)(b9)(3)(5)",
  "truthPcs": [
    0,
    5,
    8,
    11
  ],
  "engPcs": [
    0,
    5,
    9,
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

### `borrowed=custom-array` — 76.5% (13/17)

Failure mix: engine=1, harness=0, piano_noise=3

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
    3,
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

### `borrowed=dorian` — 79.1% (34/43)

Failure mix: engine=5, harness=2, piano_noise=2

Example:
```json
{
  "id": "the-beatles__penny-lane/Verse/21",
  "truthRoman": "#viø7(dor)",
  "engRoman": "♯viø⁷(b5)(dor)",
  "truthPcs": [
    2,
    5,
    8,
    11
  ],
  "engPcs": [
    1,
    6,
    8,
    11
  ],
  "chord": {
    "root": 6,
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
    "borrowed": "dorian",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "harness"
}
```

### `alterations=#5` — 80.0% (12/15)

Failure mix: engine=3, harness=0, piano_noise=0

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

### `type=11` — 82.4% (28/34)

Failure mix: engine=6, harness=0, piano_noise=0

Example:
```json
{
  "id": "amy-winehouse__back-to-black/Verse/16.5",
  "truthRoman": "v11",
  "engRoman": "v¹¹(b9)",
  "truthPcs": [
    0,
    2,
    4,
    7,
    9,
    10
  ],
  "engPcs": [
    0,
    4,
    7,
    9,
    10
  ],
  "chord": {
    "root": 5,
    "beat": 16.5,
    "duration": 0.5,
    "type": 11,
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
  "failureClass": "engine"
}
```

### `alterations=b5` — 85.7% (18/21)

Failure mix: engine=2, harness=0, piano_noise=1

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

### `borrowed=phrygian` — 86.7% (13/15)

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
    9
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

### `borrowed=major` — 88.5% (23/26)

Failure mix: engine=3, harness=0, piano_noise=0

Example:
```json
{
  "id": "green-day__boulevard-of-broken-dreams/Outro/11",
  "truthRoman": "V/#iii(maj)(maj)",
  "engRoman": "V/III",
  "truthPcs": [
    4,
    8,
    11
  ],
  "engPcs": [
    3,
    7,
    10
  ],
  "chord": {
    "root": 3,
    "beat": 11,
    "duration": 2,
    "type": 5,
    "inversion": 0,
    "applied": 5,
    "adds": [],
    "omits": [],
    "alterations": [],
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

### `borrowed=locrian` — 90.0% (9/10)

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

### `inversion=1` — 90.4% (189/209)

Failure mix: engine=17, harness=2, piano_noise=1

Example:
```json
{
  "id": "carole-king__its-too-late/Chorus/27",
  "truthRoman": "vi65",
  "engRoman": "vi⁶⁵",
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
    "root": 6,
    "beat": 27,
    "duration": 2,
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

### `borrowed=lydian` — 93.3% (14/15)

Failure mix: engine=0, harness=0, piano_noise=1

Example:
```json
{
  "id": "elton-john__your-song/Chorus/21",
  "truthRoman": "#ivø7(lyd)",
  "engRoman": "♯ivø⁷(b5)(lyd)",
  "truthPcs": [
    0,
    3,
    6,
    9
  ],
  "engPcs": [
    0,
    2,
    7,
    9
  ],
  "chord": {
    "root": 4,
    "beat": 21,
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
    "borrowed": "lydian",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "piano_noise"
}
```

### `applied=yes` — 94.2% (178/189)

Failure mix: engine=7, harness=2, piano_noise=2

Example:
```json
{
  "id": "green-day__boulevard-of-broken-dreams/Outro/11",
  "truthRoman": "V/#iii(maj)(maj)",
  "engRoman": "V/III",
  "truthPcs": [
    4,
    8,
    11
  ],
  "engPcs": [
    3,
    7,
    10
  ],
  "chord": {
    "root": 3,
    "beat": 11,
    "duration": 2,
    "type": 5,
    "inversion": 0,
    "applied": 5,
    "adds": [],
    "omits": [],
    "alterations": [],
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

## All buckets (worst first)

| Modification | count | notesOk | romanExact | failing | engine | harness | piano | example |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| omits=3+5 | 1 | 0.0% | 0.0% | 1 | 1 | 0 | 0 | `rem__losing-my-religion/Intro/15` iiø11(no3no5)→iiø¹¹(no3)(no5)(b5)(b9)(3)(5) |
| borrowed=custom-array | 17 | 76.5% | 70.6% | 4 | 1 | 0 | 3 | `the-beach-boys__god-only-knows/Verse/29` #iø7(bor)→♯iø⁷(b5)(bor) |
| borrowed=dorian | 43 | 79.1% | 79.1% | 9 | 5 | 2 | 2 | `the-beatles__penny-lane/Verse/21` #viø7(dor)→♯viø⁷(b5)(dor) |
| alterations=#5 | 15 | 80.0% | 80.0% | 3 | 3 | 0 | 0 | `pink-floyd__money/Chorus/8` vii/V(maj)(#5)(maj)→vii+°(#5)/v |
| type=11 | 34 | 82.4% | 82.4% | 6 | 6 | 0 | 0 | `amy-winehouse__back-to-black/Verse/16.5` v11→v¹¹(b9) |
| alterations=b5 | 21 | 85.7% | 61.9% | 3 | 2 | 0 | 1 | `the-police__every-breath-you-take/Chorus/64.5` vi°△7(b5)(bor)→vi△⁷(b5)(bor) |
| borrowed=phrygian | 15 | 86.7% | 86.7% | 2 | 1 | 0 | 1 | `george-gershwin__summertime/Chorus/35` vø7(phr)→vø⁷(b5)(phr) |
| borrowed=major | 26 | 88.5% | 84.6% | 3 | 3 | 0 | 0 | `green-day__boulevard-of-broken-dreams/Outro/11` V/#iii(maj)(maj)→V/III |
| borrowed=locrian | 10 | 90.0% | 40.0% | 1 | 0 | 1 | 0 | `george-gershwin__summertime/Verse/9` i→V⁷/V |
| inversion=1 | 209 | 90.4% | 96.7% | 20 | 17 | 2 | 1 | `carole-king__its-too-late/Chorus/27` vi65→vi⁶⁵ |
| borrowed=lydian | 15 | 93.3% | 93.3% | 1 | 0 | 0 | 1 | `elton-john__your-song/Chorus/21` #ivø7(lyd)→♯ivø⁷(b5)(lyd) |
| applied=yes | 189 | 94.2% | 76.7% | 11 | 7 | 2 | 2 | `green-day__boulevard-of-broken-dreams/Outro/11` V/#iii(maj)(maj)→V/III |
| type=7 | 1108 | 94.9% | 91.0% | 57 | 32 | 15 | 10 | `carole-king__its-too-late/Chorus/1` IV△7/I→IV△⁷/I |
| adds=6 | 42 | 95.2% | 42.9% | 2 | 2 | 0 | 0 | `radiohead__karma-police/Verse/3` viø7(add13)→viø⁷(add13)(add13)(b5) |
| borrowed=minor | 66 | 95.5% | 83.3% | 3 | 1 | 1 | 1 | `george-gershwin__summertime/Verse/17` V7/iv→i⁷(min) |
| borrowed=harmonicMinor | 37 | 97.3% | 89.2% | 1 | 1 | 0 | 0 | `thelonious-monk__round-midnight/Verse/1` i△42(hmin)→i△⁴²(hmin) |
| inversion=3 | 112 | 97.3% | 89.3% | 3 | 1 | 2 | 0 | `the-beatles__penny-lane/Verse/6` vi7→I△⁴² |
| inversion=2 | 219 | 97.7% | 95.0% | 5 | 2 | 3 | 0 | `the-beatles__penny-lane/Verse/3.5` I→I⁶₄ |
| applied=no | 3189 | 98.0% | 95.7% | 64 | 34 | 22 | 8 | `adele__someone-like-you/Verse/1` I→IV |
| inversion=0 | 2838 | 98.3% | 94.6% | 47 | 21 | 17 | 9 | `adele__someone-like-you/Verse/1` I→IV |
| borrowed=none | 3108 | 98.4% | 95.7% | 51 | 29 | 20 | 2 | `adele__someone-like-you/Verse/1` I→IV |
| type=5 | 2090 | 99.4% | 96.8% | 12 | 3 | 9 | 0 | `adele__someone-like-you/Verse/1` I→IV |
| type=9 | 112 | 100.0% | 92.0% | 0 | 0 | 0 | 0 |  |
| suspensions=4 | 81 | 100.0% | 91.4% | 0 | 0 | 0 | 0 |  |
| suspensions=2 | 62 | 100.0% | 91.9% | 0 | 0 | 0 | 0 |  |
| adds=9 | 56 | 100.0% | 91.1% | 0 | 0 | 0 | 0 |  |
| adds=4 | 40 | 100.0% | 45.0% | 0 | 0 | 0 | 0 |  |
| borrowed=mixolydian | 36 | 100.0% | 83.3% | 0 | 0 | 0 | 0 |  |
| type=13 | 34 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| omits=5 | 30 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| omits=3 | 17 | 100.0% | 88.2% | 0 | 0 | 0 | 0 |  |
| alterations=b9 | 12 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=phrygianDominant | 5 | 100.0% | 80.0% | 0 | 0 | 0 | 0 |  |
| suspensions=2+4 | 4 | 100.0% | 25.0% | 0 | 0 | 0 | 0 |  |
| alterations=#9 | 4 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| suspensions=4+2 | 2 | 100.0% | 50.0% | 0 | 0 | 0 | 0 |  |
| adds=4+9 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| adds=6+9 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| alterations=#11 | 1 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=#5+#9 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| alterations=b5+b9 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |

## Recommended engine fix order

1. **suspensions** — not applied in `chordInterpreter` (0% notesOk expected)
2. **omits** — not applied in note builder
3. **adds** — extensions missing from generated notes
4. **alterations** — b9/#5/etc. not reflected in PCs
5. **type=13** — 13th chords missing extension notes
6. **borrowed=custom-array** — Roman + notes edge cases

See `_Decode_oracle/DECODE_FIX_LOG.md` for applied fixes and open gaps.
