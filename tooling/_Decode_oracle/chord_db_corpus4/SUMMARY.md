# Chord DB — modification pass rates

Built: 2026-07-22T21:23:01.543Z | Updated: 2026-07-22T21:23:01.544Z | Sources: 76 songs | Unique chords: 2962

- **notesOk (unique):** 99.5% (2947/2962)
- **romanExact (unique):** 93.5% (2768/2962)
- **Chords below 99% target:** 15 failing (0.5% of corpus)
- **Buckets below 99%:** 8 / 43

## Worst buckets (engine fix priority)

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

### `borrowed=custom-array` — 92.9% (79/85)

Failure mix: engine=6, harness=0, piano_noise=0

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
    1,
    3,
    6,
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
    1,
    3,
    6,
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

### `alterations=#5` — 95.7% (45/47)

Failure mix: engine=2, harness=0, piano_noise=0

Example:
```json
{
  "id": "gorillaz__5-4/Chorus/15",
  "truthRoman": "ii6(add6)(#5)4sus4(maj)",
  "engRoman": "ii+6(#5)4sus4(maj)(add6)",
  "truthPcs": [
    2,
    7,
    10,
    11
  ],
  "engPcs": [
    2,
    7,
    10,
    11
  ],
  "chord": {
    "root": 2,
    "beat": 15,
    "duration": 0.5,
    "type": 5,
    "inversion": 2,
    "applied": 0,
    "adds": [
      6
    ],
    "omits": [],
    "alterations": [
      "#5"
    ],
    "suspensions": [
      4
    ],
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

### `adds=6` — 96.2% (25/26)

Failure mix: engine=1, harness=0, piano_noise=0

Example:
```json
{
  "id": "gorillaz__5-4/Chorus/15",
  "truthRoman": "ii6(add6)(#5)4sus4(maj)",
  "engRoman": "ii+6(#5)4sus4(maj)(add6)",
  "truthPcs": [
    2,
    7,
    10,
    11
  ],
  "engPcs": [
    2,
    7,
    10,
    11
  ],
  "chord": {
    "root": 2,
    "beat": 15,
    "duration": 0.5,
    "type": 5,
    "inversion": 2,
    "applied": 0,
    "adds": [
      6
    ],
    "omits": [],
    "alterations": [
      "#5"
    ],
    "suspensions": [
      4
    ],
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

### `applied=yes` — 97.9% (142/145)

Failure mix: engine=3, harness=0, piano_noise=0

Example:
```json
{
  "id": "kazumi-totaka__9am---animal-crossing-new-horizons/Intro and Verse/12.5",
  "truthRoman": "bII11/vi(∆-sub)",
  "engRoman": "V11/vi(maj)",
  "truthPcs": [
    1,
    3,
    4,
    6,
    9,
    11
  ],
  "engPcs": [
    0,
    3,
    5,
    7,
    9,
    10
  ],
  "chord": {
    "root": 6,
    "beat": 12.5,
    "duration": 1.5,
    "type": 11,
    "inversion": 0,
    "applied": 5,
    "adds": [],
    "omits": [],
    "alterations": [],
    "suspensions": [],
    "substitutions": [
      "tri"
    ],
    "pedal": null,
    "alternate": "",
    "borrowed": "",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "engine"
}
```

## All buckets (worst first)

| Modification | count | notesOk | romanExact | failing | engine | harness | piano | example |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| alterations=b5 | 25 | 84.0% | 56.0% | 4 | 4 | 0 | 0 | `gustav-holst__mars---bringer-of-war/Chorus Lead-Out/83` ii°△4(b5)2(bor)→iiø42(bor) |
| borrowed=custom-array | 85 | 92.9% | 83.5% | 6 | 6 | 0 | 0 | `gustav-holst__mars---bringer-of-war/Pre-Chorus/39.5` i°11(bor)→iø11(b9b11)(bor) |
| type=11 | 68 | 94.1% | 70.6% | 4 | 4 | 0 | 0 | `gustav-holst__mars---bringer-of-war/Pre-Chorus/39.5` i°11(bor)→iø11(b9b11)(bor) |
| borrowed=mixolydian | 17 | 94.1% | 88.2% | 1 | 1 | 0 | 0 | `mariah-carey__x-girlfriend/Bridge/11` V+(#5)/#iii°(maj)(mix)→V+(#5)/III(maj) |
| inversion=3 | 136 | 95.6% | 93.4% | 6 | 6 | 0 | 0 | `gustav-holst__mars---bringer-of-war/Chorus Lead-Out/83` ii°△4(b5)2(bor)→iiø42(bor) |
| alterations=#5 | 47 | 95.7% | 59.6% | 2 | 2 | 0 | 0 | `gorillaz__5-4/Chorus/15` ii6(add6)(#5)4sus4(maj)→ii+6(#5)4sus4(maj)(add6) |
| adds=6 | 26 | 96.2% | 42.3% | 1 | 1 | 0 | 0 | `gorillaz__5-4/Chorus/15` ii6(add6)(#5)4sus4(maj)→ii+6(#5)4sus4(maj)(add6) |
| applied=yes | 145 | 97.9% | 64.8% | 3 | 3 | 0 | 0 | `kazumi-totaka__9am---animal-crossing-new-horizons/Intro and Verse/12.5` bII11/vi(∆-sub)→V11/vi(maj) |
| type=7 | 837 | 99.0% | 91.2% | 8 | 8 | 0 | 0 | `gustav-holst__mars---bringer-of-war/Chorus Lead-Out/83` ii°△4(b5)2(bor)→iiø42(bor) |
| inversion=1 | 277 | 99.3% | 94.2% | 2 | 1 | 0 | 1 | `gustav-holst__mars---bringer-of-war/Pre-Chorus/89` II6→II6 |
| suspensions=4 | 154 | 99.4% | 92.9% | 1 | 1 | 0 | 0 | `gorillaz__5-4/Chorus/15` ii6(add6)(#5)4sus4(maj)→ii+6(#5)4sus4(maj)(add6) |
| inversion=2 | 189 | 99.5% | 87.8% | 1 | 1 | 0 | 0 | `gorillaz__5-4/Chorus/15` ii6(add6)(#5)4sus4(maj)→ii+6(#5)4sus4(maj)(add6) |
| borrowed=major | 215 | 99.5% | 83.3% | 1 | 1 | 0 | 0 | `gorillaz__5-4/Chorus/15` ii6(add6)(#5)4sus4(maj)→ii+6(#5)4sus4(maj)(add6) |
| applied=no | 2817 | 99.6% | 94.9% | 12 | 11 | 0 | 1 | `gorillaz__5-4/Chorus/15` ii6(add6)(#5)4sus4(maj)→ii+6(#5)4sus4(maj)(add6) |
| borrowed=none | 2385 | 99.7% | 95.8% | 7 | 6 | 0 | 1 | `gustav-holst__mars---bringer-of-war/Pre-Chorus/89` II6→II6 |
| inversion=0 | 2360 | 99.7% | 93.8% | 6 | 6 | 0 | 0 | `gustav-holst__mars---bringer-of-war/Pre-Chorus/39.5` i°11(bor)→iø11(b9b11)(bor) |
| type=5 | 1994 | 99.8% | 96.1% | 3 | 2 | 0 | 1 | `gorillaz__5-4/Chorus/15` ii6(add6)(#5)4sus4(maj)→ii+6(#5)4sus4(maj)(add6) |
| omits=5 | 205 | 100.0% | 90.7% | 0 | 0 | 0 | 0 |  |
| omits=3 | 134 | 100.0% | 82.8% | 0 | 0 | 0 | 0 |  |
| suspensions=2 | 110 | 100.0% | 92.7% | 0 | 0 | 0 | 0 |  |
| adds=9 | 65 | 100.0% | 86.2% | 0 | 0 | 0 | 0 |  |
| type=9 | 60 | 100.0% | 65.0% | 0 | 0 | 0 | 0 |  |
| borrowed=lydian | 52 | 100.0% | 76.9% | 0 | 0 | 0 | 0 |  |
| borrowed=minor | 45 | 100.0% | 93.3% | 0 | 0 | 0 | 0 |  |
| borrowed=locrian | 45 | 100.0% | 88.9% | 0 | 0 | 0 | 0 |  |
| borrowed=phrygian | 44 | 100.0% | 81.8% | 0 | 0 | 0 | 0 |  |
| borrowed=dorian | 42 | 100.0% | 88.1% | 0 | 0 | 0 | 0 |  |
| borrowed=harmonicMinor | 28 | 100.0% | 64.3% | 0 | 0 | 0 | 0 |  |
| omits=3+5 | 20 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| adds=4 | 19 | 100.0% | 52.6% | 0 | 0 | 0 | 0 |  |
| suspensions=2+4 | 13 | 100.0% | 61.5% | 0 | 0 | 0 | 0 |  |
| suspensions=4+2 | 12 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
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
