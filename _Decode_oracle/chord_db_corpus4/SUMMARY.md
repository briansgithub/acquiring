# Chord DB — modification pass rates

Built: 2026-07-22T18:15:39.348Z | Updated: 2026-07-22T18:15:39.349Z | Sources: 75 songs | Unique chords: 2905

- **notesOk (unique):** 97.9% (2845/2905)
- **romanExact (unique):** 93.5% (2715/2905)
- **Chords below 99% target:** 60 failing (2.1% of corpus)
- **Buckets below 99%:** 18 / 43

## Worst buckets (engine fix priority)

### `suspensions=4` — 76.5% (117/153)

Failure mix: engine=0, harness=36, piano_noise=0

Example:
```json
{
  "id": "larc-en-ciel__lies-and-truth/Pre-Chorus and Chorus/37",
  "truthRoman": "iisus4(no5)",
  "engRoman": "iisus4(no5)",
  "truthPcs": [
    3,
    10
  ],
  "engPcs": [
    3,
    4,
    10
  ],
  "chord": {
    "root": 2,
    "beat": 37,
    "duration": 0.75,
    "type": 5,
    "inversion": 0,
    "applied": 0,
    "adds": [],
    "omits": [
      5
    ],
    "alterations": [],
    "suspensions": [
      4
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

### `omits=5` — 82.2% (166/202)

Failure mix: engine=0, harness=36, piano_noise=0

Example:
```json
{
  "id": "larc-en-ciel__lies-and-truth/Pre-Chorus and Chorus/37",
  "truthRoman": "iisus4(no5)",
  "engRoman": "iisus4(no5)",
  "truthPcs": [
    3,
    10
  ],
  "engPcs": [
    3,
    4,
    10
  ],
  "chord": {
    "root": 2,
    "beat": 37,
    "duration": 0.75,
    "type": 5,
    "inversion": 0,
    "applied": 0,
    "adds": [],
    "omits": [
      5
    ],
    "alterations": [],
    "suspensions": [
      4
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

### `alterations=b5` — 84.0% (21/25)

Failure mix: engine=4, harness=0, piano_noise=0

Example:
```json
{
  "id": "gustav-holst__mars---bringer-of-war/Chorus Lead-Out/83",
  "truthRoman": "ii°△4(b5)2(bor)",
  "engRoman": "iiø42(bor)",
  "truthPcs": [
    2,
    5,
    8,
    11
  ],
  "engPcs": [
    2,
    5,
    8,
    11
  ],
  "chord": {
    "root": 2,
    "beat": 83,
    "duration": 1.5,
    "type": 7,
    "inversion": 3,
    "applied": 0,
    "adds": [],
    "omits": [],
    "alterations": [
      "b5"
    ],
    "suspensions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": [
      1,
      2,
      4,
      5,
      7,
      9,
      10
    ],
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "engine"
}
```

### `borrowed=custom-array` — 88.2% (75/85)

Failure mix: engine=8, harness=0, piano_noise=2

Example:
```json
{
  "id": "gustav-holst__mars---bringer-of-war/Pre-Chorus/39.5",
  "truthRoman": "i°11(bor)",
  "engRoman": "iø11(b9b11)(bor)",
  "truthPcs": [
    0,
    1,
    3,
    5,
    6,
    9
  ],
  "engPcs": [
    0,
    2,
    3,
    5,
    7,
    9
  ],
  "chord": {
    "root": 1,
    "beat": 39.5,
    "duration": 0.5,
    "type": 11,
    "inversion": 0,
    "applied": 0,
    "adds": [],
    "omits": [],
    "alterations": [],
    "suspensions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": [
      0,
      1,
      3,
      4,
      6,
      8,
      9
    ],
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "engine"
}
```

### `type=11` — 94.1% (64/68)

Failure mix: engine=4, harness=0, piano_noise=0

Example:
```json
{
  "id": "gustav-holst__mars---bringer-of-war/Pre-Chorus/39.5",
  "truthRoman": "i°11(bor)",
  "engRoman": "iø11(b9b11)(bor)",
  "truthPcs": [
    0,
    1,
    3,
    5,
    6,
    9
  ],
  "engPcs": [
    0,
    2,
    3,
    5,
    7,
    9
  ],
  "chord": {
    "root": 1,
    "beat": 39.5,
    "duration": 0.5,
    "type": 11,
    "inversion": 0,
    "applied": 0,
    "adds": [],
    "omits": [],
    "alterations": [],
    "suspensions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": [
      0,
      1,
      3,
      4,
      6,
      8,
      9
    ],
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "engine"
}
```

### `borrowed=mixolydian` — 94.1% (16/17)

Failure mix: engine=1, harness=0, piano_noise=0

Example:
```json
{
  "id": "mariah-carey__x-girlfriend/Bridge/11",
  "truthRoman": "V+(#5)/#iii°(maj)(mix)",
  "engRoman": "V+(#5)/III(maj)",
  "truthPcs": [
    2,
    4,
    8,
    11
  ],
  "engPcs": [
    3,
    8,
    11
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
    "alterations": [
      "#5"
    ],
    "suspensions": [],
    "substitutions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": "mixolydian",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "engine"
}
```

### `inversion=3` — 95.6% (130/136)

Failure mix: engine=6, harness=0, piano_noise=0

Example:
```json
{
  "id": "gustav-holst__mars---bringer-of-war/Chorus Lead-Out/83",
  "truthRoman": "ii°△4(b5)2(bor)",
  "engRoman": "iiø42(bor)",
  "truthPcs": [
    2,
    5,
    8,
    11
  ],
  "engPcs": [
    2,
    5,
    8,
    11
  ],
  "chord": {
    "root": 2,
    "beat": 83,
    "duration": 1.5,
    "type": 7,
    "inversion": 3,
    "applied": 0,
    "adds": [],
    "omits": [],
    "alterations": [
      "b5"
    ],
    "suspensions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": [
      1,
      2,
      4,
      5,
      7,
      9,
      10
    ],
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "engine"
}
```

### `borrowed=major` — 96.8% (182/188)

Failure mix: engine=5, harness=0, piano_noise=1

Example:
```json
{
  "id": "gustav-holst__mars---bringer-of-war/Chorus Lead-Out/41",
  "truthRoman": "#vii°6(no3)4(maj)",
  "engRoman": "♯vii°64(no3)(maj)",
  "truthPcs": [
    1,
    7
  ],
  "engPcs": [
    2,
    8
  ],
  "chord": {
    "root": 7,
    "beat": 41,
    "duration": 40,
    "type": 5,
    "inversion": 2,
    "applied": 0,
    "adds": [],
    "omits": [
      3
    ],
    "alterations": [],
    "suspensions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": "major",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "piano_noise"
}
```

### `inversion=2` — 97.3% (183/188)

Failure mix: engine=4, harness=0, piano_noise=1

Example:
```json
{
  "id": "gustav-holst__mars---bringer-of-war/Chorus Lead-Out/41",
  "truthRoman": "#vii°6(no3)4(maj)",
  "engRoman": "♯vii°64(no3)(maj)",
  "truthPcs": [
    1,
    7
  ],
  "engPcs": [
    2,
    8
  ],
  "chord": {
    "root": 7,
    "beat": 41,
    "duration": 40,
    "type": 5,
    "inversion": 2,
    "applied": 0,
    "adds": [],
    "omits": [
      3
    ],
    "alterations": [],
    "suspensions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": "major",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "piano_noise"
}
```

### `type=5` — 97.7% (1898/1942)

Failure mix: engine=6, harness=36, piano_noise=2

Example:
```json
{
  "id": "gustav-holst__mars---bringer-of-war/Pre-Chorus/89",
  "truthRoman": "II6",
  "engRoman": "II6",
  "truthPcs": [
    2,
    6,
    9
  ],
  "engPcs": [
    1,
    5,
    8
  ],
  "chord": {
    "root": 2,
    "beat": 89,
    "duration": 1.5,
    "type": 5,
    "inversion": 1,
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
  "failureClass": "piano_noise"
}
```

### `omits=3` — 97.8% (131/134)

Failure mix: engine=2, harness=0, piano_noise=1

Example:
```json
{
  "id": "gustav-holst__mars---bringer-of-war/Chorus Lead-Out/41",
  "truthRoman": "#vii°6(no3)4(maj)",
  "engRoman": "♯vii°64(no3)(maj)",
  "truthPcs": [
    1,
    7
  ],
  "engPcs": [
    2,
    8
  ],
  "chord": {
    "root": 7,
    "beat": 41,
    "duration": 40,
    "type": 5,
    "inversion": 2,
    "applied": 0,
    "adds": [],
    "omits": [
      3
    ],
    "alterations": [],
    "suspensions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": "major",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "piano_noise"
}
```

### `alterations=#5` — 97.8% (45/46)

Failure mix: engine=1, harness=0, piano_noise=0

Example:
```json
{
  "id": "mariah-carey__x-girlfriend/Bridge/11",
  "truthRoman": "V+(#5)/#iii°(maj)(mix)",
  "engRoman": "V+(#5)/III(maj)",
  "truthPcs": [
    2,
    4,
    8,
    11
  ],
  "engPcs": [
    3,
    8,
    11
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
    "alterations": [
      "#5"
    ],
    "suspensions": [],
    "substitutions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": "mixolydian",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "engine"
}
```

## All buckets (worst first)

| Modification | count | notesOk | romanExact | failing | engine | harness | piano | example |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| suspensions=4 | 153 | 76.5% | 93.5% | 36 | 0 | 36 | 0 | `larc-en-ciel__lies-and-truth/Pre-Chorus and Chorus/37` iisus4(no5)→iisus4(no5) |
| omits=5 | 202 | 82.2% | 92.1% | 36 | 0 | 36 | 0 | `larc-en-ciel__lies-and-truth/Pre-Chorus and Chorus/37` iisus4(no5)→iisus4(no5) |
| alterations=b5 | 25 | 84.0% | 56.0% | 4 | 4 | 0 | 0 | `gustav-holst__mars---bringer-of-war/Chorus Lead-Out/83` ii°△4(b5)2(bor)→iiø42(bor) |
| borrowed=custom-array | 85 | 88.2% | 83.5% | 10 | 8 | 0 | 2 | `gustav-holst__mars---bringer-of-war/Pre-Chorus/39.5` i°11(bor)→iø11(b9b11)(bor) |
| type=11 | 68 | 94.1% | 70.6% | 4 | 4 | 0 | 0 | `gustav-holst__mars---bringer-of-war/Pre-Chorus/39.5` i°11(bor)→iø11(b9b11)(bor) |
| borrowed=mixolydian | 17 | 94.1% | 88.2% | 1 | 1 | 0 | 0 | `mariah-carey__x-girlfriend/Bridge/11` V+(#5)/#iii°(maj)(mix)→V+(#5)/III(maj) |
| inversion=3 | 136 | 95.6% | 93.4% | 6 | 6 | 0 | 0 | `gustav-holst__mars---bringer-of-war/Chorus Lead-Out/83` ii°△4(b5)2(bor)→iiø42(bor) |
| borrowed=major | 188 | 96.8% | 81.4% | 6 | 5 | 0 | 1 | `gustav-holst__mars---bringer-of-war/Chorus Lead-Out/41` #vii°6(no3)4(maj)→♯vii°64(no3)(maj) |
| inversion=2 | 188 | 97.3% | 88.3% | 5 | 4 | 0 | 1 | `gustav-holst__mars---bringer-of-war/Chorus Lead-Out/41` #vii°6(no3)4(maj)→♯vii°64(no3)(maj) |
| type=5 | 1942 | 97.7% | 96.1% | 44 | 6 | 36 | 2 | `gustav-holst__mars---bringer-of-war/Pre-Chorus/89` II6→II6 |
| omits=3 | 134 | 97.8% | 82.8% | 3 | 2 | 0 | 1 | `gustav-holst__mars---bringer-of-war/Chorus Lead-Out/41` #vii°6(no3)4(maj)→♯vii°64(no3)(maj) |
| alterations=#5 | 46 | 97.8% | 60.9% | 1 | 1 | 0 | 0 | `mariah-carey__x-girlfriend/Bridge/11` V+(#5)/#iii°(maj)(mix)→V+(#5)/III(maj) |
| applied=yes | 143 | 97.9% | 65.7% | 3 | 3 | 0 | 0 | `kazumi-totaka__9am---animal-crossing-new-horizons/Intro and Verse/12.5` bII11/vi(∆-sub)→V11/vi(maj) |
| applied=no | 2762 | 97.9% | 94.9% | 57 | 17 | 36 | 4 | `gustav-holst__mars---bringer-of-war/Pre-Chorus/39.5` i°11(bor)→iø11(b9b11)(bor) |
| inversion=0 | 2305 | 98.0% | 93.8% | 46 | 8 | 36 | 2 | `gustav-holst__mars---bringer-of-war/Pre-Chorus/39.5` i°11(bor)→iø11(b9b11)(bor) |
| borrowed=none | 2362 | 98.2% | 95.9% | 43 | 6 | 36 | 1 | `gustav-holst__mars---bringer-of-war/Pre-Chorus/89` II6→II6 |
| type=7 | 832 | 98.6% | 91.5% | 12 | 10 | 0 | 2 | `gustav-holst__mars---bringer-of-war/Chorus/49` ivø7(bor)→ivø7(bor) |
| inversion=1 | 276 | 98.9% | 94.2% | 3 | 2 | 0 | 1 | `gustav-holst__mars---bringer-of-war/Pre-Chorus/89` II6→II6 |
| suspensions=2 | 108 | 100.0% | 92.6% | 0 | 0 | 0 | 0 |  |
| adds=9 | 65 | 100.0% | 86.2% | 0 | 0 | 0 | 0 |  |
| type=9 | 60 | 100.0% | 65.0% | 0 | 0 | 0 | 0 |  |
| borrowed=lydian | 52 | 100.0% | 76.9% | 0 | 0 | 0 | 0 |  |
| borrowed=minor | 45 | 100.0% | 93.3% | 0 | 0 | 0 | 0 |  |
| borrowed=locrian | 45 | 100.0% | 88.9% | 0 | 0 | 0 | 0 |  |
| borrowed=phrygian | 44 | 100.0% | 81.8% | 0 | 0 | 0 | 0 |  |
| borrowed=dorian | 39 | 100.0% | 87.2% | 0 | 0 | 0 | 0 |  |
| adds=6 | 25 | 100.0% | 44.0% | 0 | 0 | 0 | 0 |  |
| borrowed=harmonicMinor | 24 | 100.0% | 62.5% | 0 | 0 | 0 | 0 |  |
| omits=3+5 | 20 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| adds=4 | 19 | 100.0% | 52.6% | 0 | 0 | 0 | 0 |  |
| suspensions=4+2 | 12 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| suspensions=2+4 | 10 | 100.0% | 80.0% | 0 | 0 | 0 | 0 |  |
| alterations=#9 | 9 | 100.0% | 22.2% | 0 | 0 | 0 | 0 |  |
| alterations=#5+#9 | 6 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=3 | 5 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=phrygianDominant | 4 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=b9+b13 | 4 | 100.0% | 25.0% | 0 | 0 | 0 | 0 |  |
| alterations=#11+#9 | 4 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| type=13 | 3 | 100.0% | 33.3% | 0 | 0 | 0 | 0 |  |
| alterations=b9 | 3 | 100.0% | 66.7% | 0 | 0 | 0 | 0 |  |
| alterations=#2+3 | 2 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| alterations=#11 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| alterations=b9+#5 | 1 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |

## Recommended engine fix order

1. **suspensions** — not applied in `chordInterpreter` (0% notesOk expected)
2. **omits** — not applied in note builder
3. **adds** — extensions missing from generated notes
4. **alterations** — b9/#5/etc. not reflected in PCs
5. **type=13** — 13th chords missing extension notes
6. **borrowed=custom-array** — Roman + notes edge cases

See `_Decode_oracle/DECODE_FIX_LOG.md` for applied fixes and open gaps.
