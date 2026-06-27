# Chord DB — modification pass rates

Built: 2026-06-27T07:39:23.468Z | Updated: 2026-06-27T07:41:00.060Z | Sources: 70 songs | Unique chords: 3378

- **notesOk (unique):** 90.2% (3048/3378)
- **romanExact (unique):** 96.8% (3269/3378)
- **Chords below 99% target:** 330 failing (9.8% of corpus)
- **Buckets below 99%:** 39 / 41

## Worst buckets (engine fix priority)

### `adds=9` — 0.0% (0/56)

Failure mix: engine=49, harness=0, piano_noise=7

Example:
```json
{
  "id": "a-ha__take-on-me/Intro/1",
  "truthRoman": "ii(add9)",
  "engRoman": "ii(add9)",
  "truthPcs": [
    1,
    2,
    6,
    11
  ],
  "engPcs": [
    2,
    6,
    11
  ],
  "chord": {
    "root": 2,
    "beat": 1,
    "duration": 8,
    "type": 5,
    "inversion": 0,
    "applied": 0,
    "adds": [
      9
    ],
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

### `adds=4` — 0.0% (0/40)

Failure mix: engine=29, harness=0, piano_noise=11

Example:
```json
{
  "id": "adele__someone-like-you/Chorus/41",
  "truthRoman": "vi(add4)",
  "engRoman": "vi(add4)",
  "truthPcs": [
    1,
    6,
    9,
    11
  ],
  "engPcs": [
    1,
    6,
    9
  ],
  "chord": {
    "root": 6,
    "beat": 41,
    "duration": 2,
    "type": 5,
    "inversion": 0,
    "applied": 0,
    "adds": [
      4
    ],
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

### `type=13` — 0.0% (0/34)

Failure mix: engine=8, harness=0, piano_noise=26

Example:
```json
{
  "id": "amy-winehouse__back-to-black/Verse/31.5",
  "truthRoman": "VII13(b9)",
  "engRoman": "VII¹³(b9)",
  "truthPcs": [
    0,
    1,
    4,
    5,
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
    10
  ],
  "chord": {
    "root": 7,
    "beat": 31.5,
    "duration": 1,
    "type": 13,
    "inversion": 0,
    "applied": 0,
    "adds": [],
    "omits": [],
    "alterations": [
      "b9"
    ],
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

### `alterations=b5` — 0.0% (0/21)

Failure mix: engine=18, harness=0, piano_noise=3

Example:
```json
{
  "id": "adele__someone-like-you/Pre-Chorus/37",
  "truthRoman": "IV(add6)(b5)",
  "engRoman": "IV(add6)(b5)",
  "truthPcs": [
    2,
    6,
    8
  ],
  "engPcs": [
    2,
    6,
    9
  ],
  "chord": {
    "root": 4,
    "beat": 37,
    "duration": 4,
    "type": 5,
    "inversion": 0,
    "applied": 0,
    "adds": [
      6
    ],
    "omits": [],
    "alterations": [
      "b5"
    ],
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

### `omits=3` — 0.0% (0/17)

Failure mix: engine=12, harness=2, piano_noise=3

Example:
```json
{
  "id": "adele__someone-like-you/Intro/17",
  "truthRoman": "vi(no3)",
  "engRoman": "vi(no3)",
  "truthPcs": [
    1,
    6
  ],
  "engPcs": [
    1,
    6,
    9
  ],
  "chord": {
    "root": 6,
    "beat": 17,
    "duration": 8,
    "type": 5,
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
  "failureClass": "engine"
}
```

### `alterations=#5` — 0.0% (0/15)

Failure mix: engine=8, harness=0, piano_noise=7

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
    5,
    8,
    11
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

### `alterations=b9` — 0.0% (0/12)

Failure mix: engine=6, harness=0, piano_noise=6

Example:
```json
{
  "id": "amy-winehouse__back-to-black/Verse/31.5",
  "truthRoman": "VII13(b9)",
  "engRoman": "VII¹³(b9)",
  "truthPcs": [
    0,
    1,
    4,
    5,
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
    10
  ],
  "chord": {
    "root": 7,
    "beat": 31.5,
    "duration": 1,
    "type": 13,
    "inversion": 0,
    "applied": 0,
    "adds": [],
    "omits": [],
    "alterations": [
      "b9"
    ],
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

### `alterations=#9` — 0.0% (0/4)

Failure mix: engine=4, harness=0, piano_noise=0

Example:
```json
{
  "id": "the-doors__light-my-fire/Verse/12.5",
  "truthRoman": "I6(#9)5(mix)",
  "engRoman": "I⁶⁵(#9)(mix)",
  "truthPcs": [
    0,
    3,
    6,
    8,
    11
  ],
  "engPcs": [
    0,
    3,
    6,
    8
  ],
  "chord": {
    "root": 1,
    "beat": 12.5,
    "duration": 0.5,
    "type": 7,
    "inversion": 1,
    "applied": 0,
    "adds": [],
    "omits": [],
    "alterations": [
      "#9"
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

### `adds=4+9` — 0.0% (0/1)

Failure mix: engine=1, harness=0, piano_noise=0

Example:
```json
{
  "id": "radiohead__karma-police/Chorus/31",
  "truthRoman": "V(add4add9)",
  "engRoman": "V(add4)(add9)",
  "truthPcs": [
    2,
    4,
    6,
    7,
    9
  ],
  "engPcs": [
    2,
    6,
    9
  ],
  "chord": {
    "root": 5,
    "beat": 31,
    "duration": 2,
    "type": 5,
    "inversion": 0,
    "applied": 0,
    "adds": [
      4,
      9
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
  "failureClass": "engine"
}
```

### `adds=6+9` — 0.0% (0/1)

Failure mix: engine=1, harness=0, piano_noise=0

Example:
```json
{
  "id": "the-cranberries__zombie/Intro/13",
  "truthRoman": "VII6(add6add9)",
  "engRoman": "VII⁶(add6)(add9)",
  "truthPcs": [
    2,
    4,
    6,
    9
  ],
  "engPcs": [
    2,
    6,
    9
  ],
  "chord": {
    "root": 7,
    "beat": 13,
    "duration": 4,
    "type": 5,
    "inversion": 1,
    "applied": 0,
    "adds": [
      6,
      9
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
  "failureClass": "engine"
}
```

### `alterations=#11` — 0.0% (0/1)

Failure mix: engine=0, harness=0, piano_noise=1

Example:
```json
{
  "id": "duke-ellington__take-the-a-train/Chorus/9",
  "truthRoman": "V9(#11)/V",
  "engRoman": "V⁹(#11)/V",
  "truthPcs": [
    0,
    2,
    4,
    6,
    8,
    9
  ],
  "engPcs": [
    0,
    2,
    4,
    6,
    9
  ],
  "chord": {
    "root": 5,
    "beat": 9,
    "duration": 8,
    "type": 9,
    "inversion": 0,
    "applied": 5,
    "adds": [],
    "omits": [],
    "alterations": [
      "#11"
    ],
    "suspensions": [],
    "substitutions": [],
    "pedal": null,
    "alternate": "",
    "borrowed": "",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "piano_noise"
}
```

### `alterations=#5+#9` — 0.0% (0/1)

Failure mix: engine=1, harness=0, piano_noise=0

Example:
```json
{
  "id": "miles-davis__blue-in-green/Intro/11",
  "truthRoman": "V+7(#5#9)/v(maj)",
  "engRoman": "V+⁷(#5)(#9)/v",
  "truthPcs": [
    0,
    2,
    4,
    7,
    8
  ],
  "engPcs": [
    2,
    4,
    8,
    11
  ],
  "chord": {
    "root": 5,
    "beat": 11,
    "duration": 2,
    "type": 7,
    "inversion": 0,
    "applied": 5,
    "adds": [],
    "omits": [],
    "alterations": [
      "#5",
      "#9"
    ],
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

## All buckets (worst first)

| Modification | count | notesOk | romanExact | failing | engine | harness | piano | example |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| adds=9 | 56 | 0.0% | 91.1% | 56 | 49 | 0 | 7 | `a-ha__take-on-me/Intro/1` ii(add9)→ii(add9) |
| adds=4 | 40 | 0.0% | 72.5% | 40 | 29 | 0 | 11 | `adele__someone-like-you/Chorus/41` vi(add4)→vi(add4) |
| type=13 | 34 | 0.0% | 100.0% | 34 | 8 | 0 | 26 | `amy-winehouse__back-to-black/Verse/31.5` VII13(b9)→VII¹³(b9) |
| alterations=b5 | 21 | 0.0% | 61.9% | 21 | 18 | 0 | 3 | `adele__someone-like-you/Pre-Chorus/37` IV(add6)(b5)→IV(add6)(b5) |
| omits=3 | 17 | 0.0% | 100.0% | 17 | 12 | 2 | 3 | `adele__someone-like-you/Intro/17` vi(no3)→vi(no3) |
| alterations=#5 | 15 | 0.0% | 80.0% | 15 | 8 | 0 | 7 | `pink-floyd__money/Chorus/8` vii/V(maj)(#5)(maj)→vii+°(#5)/v |
| alterations=b9 | 12 | 0.0% | 100.0% | 12 | 6 | 0 | 6 | `amy-winehouse__back-to-black/Verse/31.5` VII13(b9)→VII¹³(b9) |
| alterations=#9 | 4 | 0.0% | 0.0% | 4 | 4 | 0 | 0 | `the-doors__light-my-fire/Verse/12.5` I6(#9)5(mix)→I⁶⁵(#9)(mix) |
| adds=4+9 | 1 | 0.0% | 0.0% | 1 | 1 | 0 | 0 | `radiohead__karma-police/Chorus/31` V(add4add9)→V(add4)(add9) |
| adds=6+9 | 1 | 0.0% | 0.0% | 1 | 1 | 0 | 0 | `the-cranberries__zombie/Intro/13` VII6(add6add9)→VII⁶(add6)(add9) |
| alterations=#11 | 1 | 0.0% | 100.0% | 1 | 0 | 0 | 1 | `duke-ellington__take-the-a-train/Chorus/9` V9(#11)/V→V⁹(#11)/V |
| alterations=#5+#9 | 1 | 0.0% | 0.0% | 1 | 1 | 0 | 0 | `miles-davis__blue-in-green/Intro/11` V+7(#5#9)/v(maj)→V+⁷(#5)(#9)/v |
| omits=3+5 | 1 | 0.0% | 0.0% | 1 | 1 | 0 | 0 | `rem__losing-my-religion/Intro/15` iiø11(no3no5)→iiø¹¹(no3)(no5) |
| alterations=b5+b9 | 1 | 0.0% | 0.0% | 1 | 0 | 0 | 1 | `thelonious-monk__round-midnight/Verse/29` V7(b5b9)(maj)→V⁷(b5)(b9)(maj) |
| omits=5 | 30 | 6.7% | 96.7% | 28 | 28 | 0 | 0 | `john-legend__all-of-me/Intro and Verse/3` IV(no5)→IV(no5) |
| type=11 | 34 | 29.4% | 97.1% | 24 | 16 | 0 | 8 | `amy-winehouse__back-to-black/Verse/16.5` v11→v¹¹ |
| borrowed=locrian | 10 | 40.0% | 40.0% | 6 | 5 | 1 | 0 | `amy-winehouse__back-to-black/Verse/15.5` bVsus27(b5)(loc)→♭V⁷sus2(b5)(loc) |
| adds=6 | 42 | 59.5% | 59.5% | 17 | 15 | 0 | 2 | `adele__someone-like-you/Pre-Chorus/37` IV(add6)(b5)→IV(add6)(b5) |
| borrowed=dorian | 43 | 74.4% | 97.7% | 11 | 7 | 2 | 2 | `soundgarden__black-hole-sun/Intro/5` i6(add4)(dor)→i⁶(add4)(dor) |
| suspensions=2+4 | 4 | 75.0% | 50.0% | 1 | 0 | 0 | 1 | `frank-sinatra__fly-me-to-the-moon/Verse/53` V7(add13)sus2sus4→V⁷(add13)sus2sus4 |
| borrowed=custom-array | 17 | 76.5% | 82.4% | 4 | 1 | 0 | 3 | `the-beach-boys__god-only-knows/Verse/29` #iø7(bor)→♯iø⁷(bor) |
| borrowed=mixolydian | 36 | 80.6% | 86.1% | 7 | 6 | 0 | 1 | `soundgarden__black-hole-sun/Chorus/29` IV(mix)(add4)→IV(add4)(mix) |
| borrowed=minor | 66 | 81.8% | 86.4% | 12 | 9 | 1 | 2 | `soundgarden__black-hole-sun/Chorus Lead-Out/9` III(min)(add4)→III(add4)(min) |
| borrowed=harmonicMinor | 37 | 83.8% | 89.2% | 6 | 6 | 0 | 0 | `soundgarden__black-hole-sun/Chorus Lead-Out/13` V(hmin)(add4)→V(add4)(hmin) |
| borrowed=major | 26 | 84.6% | 84.6% | 4 | 3 | 0 | 1 | `green-day__boulevard-of-broken-dreams/Outro/11` V/#iii(maj)(maj)→V/III |
| inversion=1 | 209 | 86.1% | 96.7% | 29 | 25 | 2 | 2 | `elton-john__rocket-man/Verse/25` V6(add9)→V⁶(add9) |
| borrowed=phrygian | 15 | 86.7% | 93.3% | 2 | 1 | 0 | 1 | `george-gershwin__summertime/Chorus/35` vø7(phr)→vø⁷(phr) |
| applied=yes | 189 | 86.8% | 79.4% | 25 | 17 | 2 | 6 | `billy-joel__piano-man/Verse/19` V/V(add9)→V(add9)/V |
| type=7 | 1108 | 88.2% | 94.9% | 131 | 87 | 15 | 29 | `amy-winehouse__back-to-black/Verse/15.5` bVsus27(b5)(loc)→♭V⁷sus2(b5)(loc) |
| inversion=3 | 112 | 88.4% | 89.3% | 13 | 10 | 2 | 1 | `elton-john__your-song/Verse/21` vi4(add11)2→vi⁴²(add11) |
| inversion=0 | 2838 | 90.2% | 97.2% | 279 | 179 | 19 | 81 | `a-ha__take-on-me/Intro/1` ii(add9)→ii(add9) |
| type=9 | 112 | 90.2% | 100.0% | 11 | 6 | 0 | 5 | `adele__someone-like-you/Pre-Chorus/29` IV△9(b5)→IV△⁹(b5) |
| applied=no | 3189 | 90.4% | 97.8% | 305 | 203 | 24 | 78 | `a-ha__take-on-me/Intro/1` ii(add9)→ii(add9) |
| borrowed=none | 3108 | 91.1% | 97.6% | 277 | 182 | 22 | 73 | `a-ha__take-on-me/Intro/1` ii(add9)→ii(add9) |
| suspensions=2 | 62 | 91.9% | 91.9% | 5 | 5 | 0 | 0 | `amy-winehouse__back-to-black/Verse/15.5` bVsus27(b5)(loc)→♭V⁷sus2(b5)(loc) |
| borrowed=lydian | 15 | 93.3% | 100.0% | 1 | 0 | 0 | 1 | `elton-john__your-song/Chorus/21` #ivø7(lyd)→♯ivø⁷(lyd) |
| type=5 | 2090 | 93.8% | 97.6% | 130 | 103 | 11 | 16 | `a-ha__take-on-me/Intro/1` ii(add9)→ii(add9) |
| suspensions=4 | 81 | 93.8% | 97.5% | 5 | 5 | 0 | 0 | `earth-wind-and-fire__september/Verse/29` V9(add13)sus4/IV→V⁹(add13)sus4/IV |
| inversion=2 | 219 | 95.9% | 95.0% | 9 | 6 | 3 | 0 | `the-beatles__penny-lane/Verse/3.5` I→I⁶₄ |
| borrowed=phrygianDominant | 5 | 100.0% | 80.0% | 0 | 0 | 0 | 0 |  |
| suspensions=4+2 | 2 | 100.0% | 50.0% | 0 | 0 | 0 | 0 |  |

## Recommended engine fix order

1. **suspensions** — not applied in `chordInterpreter` (0% notesOk expected)
2. **omits** — not applied in note builder
3. **adds** — extensions missing from generated notes
4. **alterations** — b9/#5/etc. not reflected in PCs
5. **type=13** — 13th chords missing extension notes
6. **borrowed=custom-array** — Roman + notes edge cases

See `_Decode_oracle/DECODE_FIX_LOG.md` for applied fixes and open gaps.
