# Chord DB — modification pass rates

Built: 2026-06-29T08:40:44.410Z | Updated: 2026-06-29T08:40:44.411Z | Sources: 195 songs | Unique chords: 7416

- **notesOk (unique):** 99.6% (7386/7416)
- **romanExact (unique):** 94.0% (6970/7416)
- **Chords below 99% target:** 30 failing (0.4% of corpus)
- **Buckets below 99%:** 5 / 41

## Worst buckets (engine fix priority)

### `alterations=b5` — 91.3% (21/23)

Failure mix: engine=2, harness=0, piano_noise=0

Example:
```json
{
  "id": "stevie-wonder__superstition/Chorus/7",
  "truthRoman": "bII9(b5)/V(∆-sub)(maj)",
  "engRoman": "V⁹(b5)/v",
  "truthPcs": [
    1,
    3,
    5,
    9,
    11
  ],
  "engPcs": [
    3,
    5,
    7,
    9,
    11
  ],
  "chord": {
    "root": 5,
    "beat": 7,
    "duration": 2,
    "type": 9,
    "inversion": 0,
    "applied": 5,
    "adds": [],
    "omits": [],
    "alterations": [
      "b5"
    ],
    "suspensions": [],
    "substitutions": [
      "tri"
    ],
    "pedal": null,
    "alternate": "",
    "borrowed": "major",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "engine"
}
```

### `borrowed=custom-array` — 91.7% (22/24)

Failure mix: engine=0, harness=0, piano_noise=2

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

### `borrowed=major` — 97.8% (88/90)

Failure mix: engine=1, harness=1, piano_noise=0

Example:
```json
{
  "id": "stevie-wonder__superstition/Chorus/7",
  "truthRoman": "bII9(b5)/V(∆-sub)(maj)",
  "engRoman": "V⁹(b5)/v",
  "truthPcs": [
    1,
    3,
    5,
    9,
    11
  ],
  "engPcs": [
    3,
    5,
    7,
    9,
    11
  ],
  "chord": {
    "root": 5,
    "beat": 7,
    "duration": 2,
    "type": 9,
    "inversion": 0,
    "applied": 5,
    "adds": [],
    "omits": [],
    "alterations": [
      "b5"
    ],
    "suspensions": [],
    "substitutions": [
      "tri"
    ],
    "pedal": null,
    "alternate": "",
    "borrowed": "major",
    "isRest": false,
    "recordingEndBeat": null
  },
  "failureClass": "engine"
}
```

### `inversion=3` — 98.6% (215/218)

Failure mix: engine=0, harness=3, piano_noise=0

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

### `type=9` — 98.8% (165/167)

Failure mix: engine=2, harness=0, piano_noise=0

Example:
```json
{
  "id": "stevie-wonder__superstition/Chorus/7",
  "truthRoman": "bII9(b5)/V(∆-sub)(maj)",
  "engRoman": "V⁹(b5)/v",
  "truthPcs": [
    1,
    3,
    5,
    9,
    11
  ],
  "engPcs": [
    3,
    5,
    7,
    9,
    11
  ],
  "chord": {
    "root": 5,
    "beat": 7,
    "duration": 2,
    "type": 9,
    "inversion": 0,
    "applied": 5,
    "adds": [],
    "omits": [],
    "alterations": [
      "b5"
    ],
    "suspensions": [],
    "substitutions": [
      "tri"
    ],
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
| alterations=b5 | 23 | 91.3% | 52.2% | 2 | 2 | 0 | 0 | `stevie-wonder__superstition/Chorus/7` bII9(b5)/V(∆-sub)(maj)→V⁹(b5)/v |
| borrowed=custom-array | 24 | 91.7% | 70.8% | 2 | 0 | 0 | 2 | `the-beach-boys__god-only-knows/Verse/29` #iø7(bor)→♯iø⁷(b5)(bor) |
| borrowed=major | 90 | 97.8% | 93.3% | 2 | 1 | 1 | 0 | `stevie-wonder__superstition/Chorus/7` bII9(b5)/V(∆-sub)(maj)→V⁹(b5)/v |
| inversion=3 | 218 | 98.6% | 91.3% | 3 | 0 | 3 | 0 | `the-beatles__penny-lane/Verse/6` vi7→I△⁴² |
| type=9 | 167 | 98.8% | 94.0% | 2 | 2 | 0 | 0 | `stevie-wonder__superstition/Chorus/7` bII9(b5)/V(∆-sub)(maj)→V⁹(b5)/v |
| adds=6 | 105 | 99.0% | 64.8% | 1 | 0 | 1 | 0 | `the-kinks__waterloo-sunset/Bridge/41` iiiø4(add13)2→iiiø⁴²(add13)(add13) |
| applied=yes | 229 | 99.1% | 74.2% | 2 | 2 | 0 | 0 | `stevie-wonder__superstition/Chorus/7` bII9(b5)/V(∆-sub)(maj)→V⁹(b5)/v |
| type=7 | 1965 | 99.3% | 94.1% | 14 | 0 | 12 | 2 | `faith-evans__love-like-this/Chorus/6.5` i→IV⁷ |
| inversion=2 | 351 | 99.4% | 91.7% | 2 | 0 | 2 | 0 | `the-beatles__penny-lane/Verse/8` ii65→I⁶₄ |
| inversion=0 | 6393 | 99.6% | 94.0% | 25 | 2 | 21 | 2 | `faith-evans__love-like-this/Chorus/6.5` i→IV⁷ |
| applied=no | 7187 | 99.6% | 94.6% | 28 | 0 | 26 | 2 | `faith-evans__love-like-this/Chorus/6.5` i→IV⁷ |
| borrowed=none | 6936 | 99.6% | 94.6% | 26 | 1 | 25 | 0 | `faith-evans__love-like-this/Chorus/6.5` i→IV⁷ |
| type=5 | 5154 | 99.7% | 94.2% | 14 | 0 | 14 | 0 | `faith-evans__love-like-this/Chorus/9` IV7→i |
| inversion=1 | 454 | 100.0% | 97.1% | 0 | 0 | 0 | 0 |  |
| omits=3+5 | 196 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| suspensions=4 | 162 | 100.0% | 91.4% | 0 | 0 | 0 | 0 |  |
| suspensions=2 | 129 | 100.0% | 92.2% | 0 | 0 | 0 | 0 |  |
| adds=9 | 121 | 100.0% | 92.6% | 0 | 0 | 0 | 0 |  |
| adds=4 | 101 | 100.0% | 71.3% | 0 | 0 | 0 | 0 |  |
| omits=3 | 96 | 100.0% | 91.7% | 0 | 0 | 0 | 0 |  |
| borrowed=minor | 95 | 100.0% | 83.2% | 0 | 0 | 0 | 0 |  |
| type=11 | 89 | 100.0% | 78.7% | 0 | 0 | 0 | 0 |  |
| borrowed=dorian | 77 | 100.0% | 83.1% | 0 | 0 | 0 | 0 |  |
| omits=5 | 69 | 100.0% | 84.1% | 0 | 0 | 0 | 0 |  |
| borrowed=harmonicMinor | 48 | 100.0% | 89.6% | 0 | 0 | 0 | 0 |  |
| borrowed=locrian | 45 | 100.0% | 75.6% | 0 | 0 | 0 | 0 |  |
| borrowed=mixolydian | 43 | 100.0% | 86.0% | 0 | 0 | 0 | 0 |  |
| type=13 | 41 | 100.0% | 90.2% | 0 | 0 | 0 | 0 |  |
| borrowed=lydian | 27 | 100.0% | 96.3% | 0 | 0 | 0 | 0 |  |
| borrowed=phrygian | 23 | 100.0% | 91.3% | 0 | 0 | 0 | 0 |  |
| alterations=#5 | 15 | 100.0% | 80.0% | 0 | 0 | 0 | 0 |  |
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
