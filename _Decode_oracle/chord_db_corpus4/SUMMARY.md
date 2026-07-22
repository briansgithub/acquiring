# Chord DB — modification pass rates

Built: 2026-07-22T06:28:06.322Z | Updated: 2026-07-22T06:28:06.323Z | Sources: 70 songs | Unique chords: 2467

- **notesOk (unique):** 98.7% (2435/2467)
- **romanExact (unique):** 93.1% (2297/2467)
- **Chords below 99% target:** 32 failing (1.3% of corpus)
- **Buckets below 99%:** 14 / 42

## Worst buckets (engine fix priority)

### `type=13` — 66.7% (2/3)

Failure mix: engine=1, harness=0, piano_noise=0

Example:
```json
{
  "id": "kazumi-totaka__5pm---animal-crossing-new-horizons/Chorus/53.5",
  "truthRoman": "bII13/vi(∆-sub)",
  "engRoman": "V13/vi",
  "truthPcs": [
    0,
    2,
    4,
    5,
    7,
    9,
    11
  ],
  "engPcs": [
    1,
    3,
    5,
    6,
    8,
    10,
    11
  ],
  "chord": {
    "root": 6,
    "beat": 53.5,
    "duration": 2.5,
    "type": 13,
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

### `borrowed=custom-array` — 82.9% (63/76)

Failure mix: engine=9, harness=0, piano_noise=4

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

### `applied=yes` — 91.8% (112/122)

Failure mix: engine=9, harness=0, piano_noise=1

Example:
```json
{
  "id": "georges-bizet__larlesienne-suite-no-2---iv-farandole/Intro/10",
  "truthRoman": "V42/VI(maj)",
  "engRoman": "V42/VI",
  "truthPcs": [
    1,
    4,
    6,
    10
  ],
  "engPcs": [
    0,
    3,
    5,
    9
  ],
  "chord": {
    "root": 6,
    "beat": 10,
    "duration": 1,
    "type": 7,
    "inversion": 3,
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
  "failureClass": "engine"
}
```

### `inversion=3` — 92.8% (116/125)

Failure mix: engine=9, harness=0, piano_noise=0

Example:
```json
{
  "id": "georges-bizet__larlesienne-suite-no-2---iv-farandole/Intro/10",
  "truthRoman": "V42/VI(maj)",
  "engRoman": "V42/VI",
  "truthPcs": [
    1,
    4,
    6,
    10
  ],
  "engPcs": [
    0,
    3,
    5,
    9
  ],
  "chord": {
    "root": 6,
    "beat": 10,
    "duration": 1,
    "type": 7,
    "inversion": 3,
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
  "failureClass": "engine"
}
```

### `type=11` — 93.7% (59/63)

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

### `type=9` — 94.9% (56/59)

Failure mix: engine=3, harness=0, piano_noise=0

Example:
```json
{
  "id": "kazumi-totaka__7am---animal-crossing-new-horizons/Chorus/21",
  "truthRoman": "bII9/I(∆-sub)",
  "engRoman": "V9/I",
  "truthPcs": [
    0,
    2,
    4,
    7,
    10
  ],
  "engPcs": [
    1,
    4,
    6,
    8,
    10
  ],
  "chord": {
    "root": 1,
    "beat": 21,
    "duration": 8,
    "type": 9,
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

### `omits=3` — 95.0% (57/60)

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

### `adds=9` — 95.2% (60/63)

Failure mix: engine=0, harness=0, piano_noise=3

Example:
```json
{
  "id": "gustav-holst__mars---bringer-of-war/Chorus Lead-Out/99",
  "truthRoman": "bI(bor)(add9)",
  "engRoman": "♭I(bor)(add9)",
  "truthPcs": [
    0,
    3,
    8,
    10
  ],
  "engPcs": [
    3,
    8,
    10,
    11
  ],
  "chord": {
    "root": 1,
    "beat": 99,
    "duration": 1.5,
    "type": 5,
    "inversion": 0,
    "applied": 0,
    "adds": [
      9
    ],
    "omits": [],
    "alterations": [],
    "suspensions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": [
      -1,
      2,
      3,
      5,
      6,
      8,
      10
    ],
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "piano_noise"
}
```

### `inversion=2` — 96.4% (159/165)

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

### `borrowed=major` — 96.6% (172/178)

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

### `alterations=#5` — 97.7% (43/44)

Failure mix: engine=0, harness=0, piano_noise=1

Example:
```json
{
  "id": "gooseworx__your-new-home-%28the-amazing-digital-circus-ost%29/Chorus/29",
  "truthRoman": "bII+(#5)/V(∆-sub)",
  "engRoman": "V+(#5)/V",
  "truthPcs": [
    0,
    4,
    8
  ],
  "engPcs": [
    2,
    6,
    10
  ],
  "chord": {
    "root": 5,
    "beat": 29,
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
    "substitutions": [
      "tri"
    ],
    "pedal": null,
    "alternate": "",
    "borrowed": "",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "piano_noise"
}
```

## All buckets (worst first)

| Modification | count | notesOk | romanExact | failing | engine | harness | piano | example |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| type=13 | 3 | 66.7% | 66.7% | 1 | 1 | 0 | 0 | `kazumi-totaka__5pm---animal-crossing-new-horizons/Chorus/53.5` bII13/vi(∆-sub)→V13/vi |
| borrowed=custom-array | 76 | 82.9% | 82.9% | 13 | 9 | 0 | 4 | `gustav-holst__mars---bringer-of-war/Pre-Chorus/39.5` i°11(bor)→iø11(b9b11)(bor) |
| alterations=b5 | 25 | 84.0% | 56.0% | 4 | 4 | 0 | 0 | `gustav-holst__mars---bringer-of-war/Chorus Lead-Out/83` ii°△4(b5)2(bor)→iiø42(bor) |
| applied=yes | 122 | 91.8% | 73.0% | 10 | 9 | 0 | 1 | `georges-bizet__larlesienne-suite-no-2---iv-farandole/Intro/10` V42/VI(maj)→V42/VI |
| inversion=3 | 125 | 92.8% | 86.4% | 9 | 9 | 0 | 0 | `georges-bizet__larlesienne-suite-no-2---iv-farandole/Intro/10` V42/VI(maj)→V42/VI |
| type=11 | 63 | 93.7% | 71.4% | 4 | 4 | 0 | 0 | `gustav-holst__mars---bringer-of-war/Pre-Chorus/39.5` i°11(bor)→iø11(b9b11)(bor) |
| type=9 | 59 | 94.9% | 72.9% | 3 | 3 | 0 | 0 | `kazumi-totaka__7am---animal-crossing-new-horizons/Chorus/21` bII9/I(∆-sub)→V9/I |
| omits=3 | 60 | 95.0% | 61.7% | 3 | 2 | 0 | 1 | `gustav-holst__mars---bringer-of-war/Chorus Lead-Out/41` #vii°6(no3)4(maj)→♯vii°64(no3)(maj) |
| adds=9 | 63 | 95.2% | 85.7% | 3 | 0 | 0 | 3 | `gustav-holst__mars---bringer-of-war/Chorus Lead-Out/99` bI(bor)(add9)→♭I(bor)(add9) |
| inversion=2 | 165 | 96.4% | 85.5% | 6 | 5 | 0 | 1 | `gustav-holst__mars---bringer-of-war/Chorus Lead-Out/41` #vii°6(no3)4(maj)→♯vii°64(no3)(maj) |
| borrowed=major | 178 | 96.6% | 80.3% | 6 | 5 | 0 | 1 | `gustav-holst__mars---bringer-of-war/Chorus Lead-Out/41` #vii°6(no3)4(maj)→♯vii°64(no3)(maj) |
| alterations=#5 | 44 | 97.7% | 63.6% | 1 | 0 | 0 | 1 | `gooseworx__your-new-home-%28the-amazing-digital-circus-ost%29/Chorus/29` bII+(#5)/V(∆-sub)→V+(#5)/V |
| inversion=1 | 254 | 98.0% | 94.5% | 5 | 3 | 0 | 2 | `gustav-holst__mars---bringer-of-war/Pre-Chorus/89` II6→II6 |
| type=7 | 733 | 98.5% | 92.1% | 11 | 11 | 0 | 0 | `georges-bizet__larlesienne-suite-no-2---iv-farandole/Intro/10` V42/VI(maj)→V42/VI |
| applied=no | 2345 | 99.1% | 94.2% | 22 | 16 | 0 | 6 | `gustav-holst__mars---bringer-of-war/Pre-Chorus/39.5` i°11(bor)→iø11(b9b11)(bor) |
| type=5 | 1609 | 99.2% | 95.2% | 13 | 6 | 0 | 7 | `gooseworx__your-new-home-%28the-amazing-digital-circus-ost%29/Chorus/29` bII+(#5)/V(∆-sub)→V+(#5)/V |
| borrowed=none | 1964 | 99.3% | 95.8% | 13 | 11 | 0 | 2 | `georges-bizet__larlesienne-suite-no-2---iv-farandole/Intro/10` V42/VI(maj)→V42/VI |
| inversion=0 | 1923 | 99.4% | 94.0% | 12 | 8 | 0 | 4 | `gooseworx__your-new-home-%28the-amazing-digital-circus-ost%29/Chorus/29` bII+(#5)/V(∆-sub)→V+(#5)/V |
| suspensions=2 | 104 | 100.0% | 92.3% | 0 | 0 | 0 | 0 |  |
| suspensions=4 | 70 | 100.0% | 87.1% | 0 | 0 | 0 | 0 |  |
| borrowed=lydian | 48 | 100.0% | 81.3% | 0 | 0 | 0 | 0 |  |
| borrowed=minor | 45 | 100.0% | 93.3% | 0 | 0 | 0 | 0 |  |
| borrowed=locrian | 44 | 100.0% | 88.6% | 0 | 0 | 0 | 0 |  |
| borrowed=phrygian | 42 | 100.0% | 81.0% | 0 | 0 | 0 | 0 |  |
| borrowed=dorian | 34 | 100.0% | 85.3% | 0 | 0 | 0 | 0 |  |
| omits=5 | 30 | 100.0% | 46.7% | 0 | 0 | 0 | 0 |  |
| adds=6 | 24 | 100.0% | 41.7% | 0 | 0 | 0 | 0 |  |
| borrowed=harmonicMinor | 21 | 100.0% | 61.9% | 0 | 0 | 0 | 0 |  |
| adds=4 | 19 | 100.0% | 52.6% | 0 | 0 | 0 | 0 |  |
| omits=3+5 | 19 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| borrowed=mixolydian | 11 | 100.0% | 90.9% | 0 | 0 | 0 | 0 |  |
| suspensions=2+4 | 10 | 100.0% | 80.0% | 0 | 0 | 0 | 0 |  |
| suspensions=4+2 | 9 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=#9 | 9 | 100.0% | 22.2% | 0 | 0 | 0 | 0 |  |
| alterations=#5+#9 | 6 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=3 | 5 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=phrygianDominant | 4 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=#11+#9 | 4 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=b9 | 2 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=#2+3 | 2 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| alterations=#11 | 1 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=b9+#5 | 1 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |

## Recommended engine fix order

1. **suspensions** — not applied in `chordInterpreter` (0% notesOk expected)
2. **omits** — not applied in note builder
3. **adds** — extensions missing from generated notes
4. **alterations** — b9/#5/etc. not reflected in PCs
5. **type=13** — 13th chords missing extension notes
6. **borrowed=custom-array** — Roman + notes edge cases

See `_Decode_oracle/DECODE_FIX_LOG.md` for applied fixes and open gaps.
