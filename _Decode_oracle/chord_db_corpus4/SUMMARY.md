# Chord DB — modification pass rates

Built: 2026-06-29T08:40:12.976Z | Updated: 2026-06-29T08:40:12.977Z | Sources: 500 songs | Unique chords: 14603

- **notesOk (unique):** 98.5% (14391/14603)
- **romanExact (unique):** 92.9% (13564/14603)
- **Chords below 99% target:** 212 failing (1.5% of corpus)
- **Buckets below 99%:** 26 / 51

## Worst buckets (engine fix priority)

### `type=13` — 62.5% (5/8)

Failure mix: engine=3, harness=0, piano_noise=0

Example:
```json
{
  "id": "gwen-stefani__u-started-it/Chorus/5",
  "truthRoman": "v13",
  "engRoman": "v¹³(b9)(b13)",
  "truthPcs": [
    0,
    2,
    4,
    5,
    6,
    7,
    9,
    10
  ],
  "engPcs": [
    0,
    2,
    4,
    5,
    7,
    9,
    10
  ],
  "chord": {
    "root": 5,
    "beat": 5,
    "duration": 4,
    "type": 13,
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
  "failureClass": "engine"
}
```

### `alterations=b5` — 83.1% (49/59)

Failure mix: engine=10, harness=0, piano_noise=0

Example:
```json
{
  "id": "dnd-allstars__1-2-pass-it---dj-premier-remix/Instrumental/2",
  "truthRoman": "V7(b5)sus2/#iii(maj)(maj)",
  "engRoman": "V⁷sus2(b5)/III",
  "truthPcs": [
    1,
    5,
    7,
    9
  ],
  "engPcs": [
    2,
    5,
    7,
    9
  ],
  "chord": {
    "root": 3,
    "beat": 2,
    "duration": 1,
    "type": 7,
    "inversion": 0,
    "applied": 5,
    "adds": [],
    "omits": [],
    "alterations": [
      "b5"
    ],
    "suspensions": [
      2
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

### `omits=5` — 83.3% (189/227)

Failure mix: engine=2, harness=36, piano_noise=0

Example:
```json
{
  "id": "gorillaz__5-4/Chorus/14",
  "truthRoman": "V7(no5)sus2sus4/ii°(maj)",
  "engRoman": "V⁷(no5)sus2sus4/ii°",
  "truthPcs": [
    2,
    3,
    6,
    9
  ],
  "engPcs": [
    2,
    6,
    9
  ],
  "chord": {
    "root": 2,
    "beat": 14,
    "duration": 0.5,
    "type": 7,
    "inversion": 0,
    "applied": 5,
    "adds": [],
    "omits": [
      5
    ],
    "alterations": [],
    "suspensions": [
      2,
      4
    ],
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

### `borrowed=custom-array` — 85.5% (136/159)

Failure mix: engine=13, harness=0, piano_noise=10

Example:
```json
{
  "id": "bill-wurtz__might-quit/Verse/48.5",
  "truthRoman": "bvii6(add9)(bor)",
  "engRoman": "♭vii⁶(add9)(bor)",
  "truthPcs": [
    3,
    5,
    6,
    10
  ],
  "engPcs": [
    2,
    4,
    5,
    9
  ],
  "chord": {
    "root": 7,
    "beat": 48.5,
    "duration": 1,
    "type": 5,
    "inversion": 1,
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
      1,
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

### `alterations=#5` — 88.5% (69/78)

Failure mix: engine=6, harness=1, piano_noise=2

Example:
```json
{
  "id": "deadmau5__suite-03/Intro and Verse/9",
  "truthRoman": "i6(#5)4",
  "engRoman": "i+⁶₄(#5)",
  "truthPcs": [
    4,
    8,
    11
  ],
  "engPcs": [
    4,
    8,
    11
  ],
  "chord": {
    "root": 1,
    "beat": 9,
    "duration": 4,
    "type": 5,
    "inversion": 2,
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

### `suspensions=4` — 88.8% (317/357)

Failure mix: engine=1, harness=39, piano_noise=0

Example:
```json
{
  "id": "gorillaz__5-4/Chorus/15",
  "truthRoman": "ii6(add6)(#5)4sus4(maj)",
  "engRoman": "ii+⁶₄(add6)sus4(#5)(maj)",
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

### `suspensions=2+4` — 91.7% (22/24)

Failure mix: engine=2, harness=0, piano_noise=0

Example:
```json
{
  "id": "gorillaz__5-4/Chorus/14",
  "truthRoman": "V7(no5)sus2sus4/ii°(maj)",
  "engRoman": "V⁷(no5)sus2sus4/ii°",
  "truthPcs": [
    2,
    3,
    6,
    9
  ],
  "engPcs": [
    2,
    6,
    9
  ],
  "chord": {
    "root": 2,
    "beat": 14,
    "duration": 0.5,
    "type": 7,
    "inversion": 0,
    "applied": 5,
    "adds": [],
    "omits": [
      5
    ],
    "alterations": [],
    "suspensions": [
      2,
      4
    ],
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

### `inversion=3` — 92.1% (325/353)

Failure mix: engine=27, harness=1, piano_noise=0

Example:
```json
{
  "id": "chicago__hard-to-say-im-sorry/Chorus/6",
  "truthRoman": "viiø42",
  "engRoman": "viiø⁴²",
  "truthPcs": [
    0,
    3,
    6,
    9
  ],
  "engPcs": [
    1,
    3,
    6,
    9
  ],
  "chord": {
    "root": 7,
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
  "failureClass": "engine"
}
```

### `applied=yes` — 94.2% (551/585)

Failure mix: engine=29, harness=2, piano_noise=3

Example:
```json
{
  "id": "dnd-allstars__1-2-pass-it---dj-premier-remix/Instrumental/2",
  "truthRoman": "V7(b5)sus2/#iii(maj)(maj)",
  "engRoman": "V⁷sus2(b5)/III",
  "truthPcs": [
    1,
    5,
    7,
    9
  ],
  "engPcs": [
    2,
    5,
    7,
    9
  ],
  "chord": {
    "root": 3,
    "beat": 2,
    "duration": 1,
    "type": 7,
    "inversion": 0,
    "applied": 5,
    "adds": [],
    "omits": [],
    "alterations": [
      "b5"
    ],
    "suspensions": [
      2
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

### `adds=6` — 96.2% (101/105)

Failure mix: engine=1, harness=2, piano_noise=1

Example:
```json
{
  "id": "gorillaz__5-4/Chorus/15",
  "truthRoman": "ii6(add6)(#5)4sus4(maj)",
  "engRoman": "ii+⁶₄(add6)sus4(#5)(maj)",
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

### `borrowed=mixolydian` — 96.6% (56/58)

Failure mix: engine=2, harness=0, piano_noise=0

Example:
```json
{
  "id": "grzegorz-turnau__w-prowincjonalnym-malym-miescie/Verse/33",
  "truthRoman": "iiiø65(mix)",
  "engRoman": "iiiø⁶⁵(mix)",
  "truthPcs": [
    2,
    5,
    8,
    11
  ],
  "engPcs": [
    0,
    2,
    5,
    8
  ],
  "chord": {
    "root": 3,
    "beat": 33,
    "duration": 2,
    "type": 7,
    "inversion": 1,
    "applied": 0,
    "adds": [],
    "omits": [],
    "alterations": [],
    "suspensions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": "mixolydian",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "engine"
}
```

### `inversion=2` — 96.8% (596/616)

Failure mix: engine=13, harness=3, piano_noise=4

Example:
```json
{
  "id": "caravan-palace__81-special/Verse/28.75",
  "truthRoman": "bvi43(bor)",
  "engRoman": "♭vi⁴³(bor)",
  "truthPcs": [
    1,
    4,
    8,
    11
  ],
  "engPcs": [
    0,
    3,
    7,
    10
  ],
  "chord": {
    "root": 6,
    "beat": 28.75,
    "duration": 1.25,
    "type": 7,
    "inversion": 2,
    "applied": 0,
    "adds": [],
    "omits": [],
    "alterations": [],
    "suspensions": [],
    "substitutions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": [
      -1,
      1,
      3,
      5,
      6,
      8,
      10
    ],
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "engine"
}
```

## All buckets (worst first)

| Modification | count | notesOk | romanExact | failing | engine | harness | piano | example |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| type=13 | 8 | 62.5% | 37.5% | 3 | 3 | 0 | 0 | `gwen-stefani__u-started-it/Chorus/5` v13→v¹³(b9)(b13) |
| alterations=b5 | 59 | 83.1% | 47.5% | 10 | 10 | 0 | 0 | `dnd-allstars__1-2-pass-it---dj-premier-remix/Instrumental/2` V7(b5)sus2/#iii(maj)(maj)→V⁷sus2(b5)/III |
| omits=5 | 227 | 83.3% | 56.8% | 38 | 2 | 36 | 0 | `gorillaz__5-4/Chorus/14` V7(no5)sus2sus4/ii°(maj)→V⁷(no5)sus2sus4/ii° |
| borrowed=custom-array | 159 | 85.5% | 47.8% | 23 | 13 | 0 | 10 | `bill-wurtz__might-quit/Verse/48.5` bvii6(add9)(bor)→♭vii⁶(add9)(bor) |
| alterations=#5 | 78 | 88.5% | 42.3% | 9 | 6 | 1 | 2 | `deadmau5__suite-03/Intro and Verse/9` i6(#5)4→i+⁶₄(#5) |
| suspensions=4 | 357 | 88.8% | 68.6% | 40 | 1 | 39 | 0 | `gorillaz__5-4/Chorus/15` ii6(add6)(#5)4sus4(maj)→ii+⁶₄(add6)sus4(#5)(maj) |
| suspensions=2+4 | 24 | 91.7% | 91.7% | 2 | 2 | 0 | 0 | `gorillaz__5-4/Chorus/14` V7(no5)sus2sus4/ii°(maj)→V⁷(no5)sus2sus4/ii° |
| inversion=3 | 353 | 92.1% | 90.7% | 28 | 27 | 1 | 0 | `chicago__hard-to-say-im-sorry/Chorus/6` viiø42→viiø⁴² |
| applied=yes | 585 | 94.2% | 64.1% | 34 | 29 | 2 | 3 | `dnd-allstars__1-2-pass-it---dj-premier-remix/Instrumental/2` V7(b5)sus2/#iii(maj)(maj)→V⁷sus2(b5)/III |
| adds=6 | 105 | 96.2% | 70.5% | 4 | 1 | 2 | 1 | `gorillaz__5-4/Chorus/15` ii6(add6)(#5)4sus4(maj)→ii+⁶₄(add6)sus4(#5)(maj) |
| borrowed=mixolydian | 58 | 96.6% | 91.4% | 2 | 2 | 0 | 0 | `grzegorz-turnau__w-prowincjonalnym-malym-miescie/Verse/33` iiiø65(mix)→iiiø⁶⁵(mix) |
| inversion=2 | 616 | 96.8% | 86.9% | 20 | 13 | 3 | 4 | `caravan-palace__81-special/Verse/28.75` bvi43(bor)→♭vi⁴³(bor) |
| borrowed=major | 469 | 97.0% | 87.2% | 14 | 10 | 3 | 1 | `dnd-allstars__1-2-pass-it---dj-premier-remix/Instrumental/2` V7(b5)sus2/#iii(maj)(maj)→V⁷sus2(b5)/III |
| type=9 | 239 | 97.1% | 90.8% | 7 | 5 | 1 | 1 | `david-byrne__marching-through-the-wilderness/Verse/3` I7→i⁹(phr) |
| type=7 | 3046 | 97.6% | 90.5% | 74 | 53 | 16 | 5 | `caravan-palace__81-special/Verse/28.75` bvi43(bor)→♭vi⁴³(bor) |
| omits=3 | 272 | 98.2% | 71.0% | 5 | 2 | 2 | 1 | `emperor__witches-sabbath/Chorus/16` #vii°6(no3)4(maj)→♯vii°⁶₄(no3)(maj) |
| type=11 | 219 | 98.2% | 68.0% | 4 | 4 | 0 | 0 | `gustav-holst__mars---bringer-of-war/Pre-Chorus/39.5` i°11(bor)→iø¹¹(b9)(b11)(bor) |
| suspensions=2 | 274 | 98.2% | 92.0% | 5 | 3 | 2 | 0 | `charli-xcx__5-in-the-morning/Chorus/17` iv(add6)→i(add6)sus2 |
| inversion=1 | 1065 | 98.4% | 95.6% | 17 | 10 | 0 | 7 | `bill-wurtz__might-quit/Verse/48.5` bvii6(add9)(bor)→♭vii⁶(add9)(bor) |
| adds=9 | 268 | 98.5% | 88.1% | 4 | 0 | 0 | 4 | `bill-wurtz__might-quit/Verse/48.5` bvii6(add9)(bor)→♭vii⁶(add9)(bor) |
| borrowed=harmonicMinor | 76 | 98.7% | 76.3% | 1 | 1 | 0 | 0 | `hearts2hearts__baby-steps/Verse/28.5` iiø7(hmin)→iiø⁷(b5)(hmin) |
| borrowed=none | 13110 | 98.7% | 94.3% | 171 | 54 | 106 | 11 | `charli-xcx__5-in-the-morning/Chorus/17` iv(add6)→i(add6)sus2 |
| applied=no | 14018 | 98.7% | 94.1% | 178 | 51 | 108 | 19 | `bill-wurtz__might-quit/Verse/48.5` bvii6(add9)(bor)→♭vii⁶(add9)(bor) |
| omits=3+5 | 160 | 98.8% | 0.0% | 2 | 0 | 1 | 1 | `gregory-porter__musical-genocide/Chorus/17` i7sus2→iv(no3)(no5)sus2 |
| inversion=0 | 12569 | 98.8% | 93.0% | 147 | 30 | 106 | 11 | `charli-xcx__5-in-the-morning/Chorus/17` iv(add6)→i(add6)sus2 |
| type=5 | 11091 | 98.9% | 94.1% | 124 | 15 | 93 | 16 | `bill-wurtz__might-quit/Verse/48.5` bvii6(add9)(bor)→♭vii⁶(add9)(bor) |
| borrowed=phrygian | 130 | 99.2% | 83.1% | 1 | 0 | 1 | 0 | `david-byrne__marching-through-the-wilderness/Verse/3` I7→i⁹(phr) |
| borrowed=minor | 242 | 100.0% | 87.6% | 0 | 0 | 0 | 0 |  |
| borrowed=lydian | 133 | 100.0% | 70.7% | 0 | 0 | 0 | 0 |  |
| borrowed=dorian | 109 | 100.0% | 89.0% | 0 | 0 | 0 | 0 |  |
| borrowed=locrian | 94 | 100.0% | 80.9% | 0 | 0 | 0 | 0 |  |
| adds=4 | 63 | 100.0% | 57.1% | 0 | 0 | 0 | 0 |  |
| omits=5+3 | 62 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| borrowed=phrygianDominant | 23 | 100.0% | 95.7% | 0 | 0 | 0 | 0 |  |
| suspensions=4+2 | 19 | 100.0% | 89.5% | 0 | 0 | 0 | 0 |  |
| alterations=#9 | 11 | 100.0% | 27.3% | 0 | 0 | 0 | 0 |  |
| alterations=b9 | 9 | 100.0% | 66.7% | 0 | 0 | 0 | 0 |  |
| alterations=#5+#9 | 6 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| alterations=3 | 5 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| alterations=b9+b13 | 4 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| alterations=#11+#9 | 4 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| adds=9+6 | 4 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| adds=9+4 | 4 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| adds=4+6 | 3 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| alterations=b9+#5 | 2 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| adds=4+9 | 2 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| alterations=#2+3 | 2 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| alterations=#11 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| alterations=#9+b5+b13 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| adds=6+9 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| adds=6+4 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |

## Recommended engine fix order

1. **suspensions** — not applied in `chordInterpreter` (0% notesOk expected)
2. **omits** — not applied in note builder
3. **adds** — extensions missing from generated notes
4. **alterations** — b9/#5/etc. not reflected in PCs
5. **type=13** — 13th chords missing extension notes
6. **borrowed=custom-array** — Roman + notes edge cases

See `_Decode_oracle/DECODE_FIX_LOG.md` for applied fixes and open gaps.
