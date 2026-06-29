# Chord DB — modification pass rates

Built: 2026-06-29T08:40:42.698Z | Updated: 2026-06-29T08:40:42.699Z | Sources: 52 songs | Unique chords: 2451

- **notesOk (unique):** 99.9% (2448/2451)
- **romanExact (unique):** 96.0% (2354/2451)
- **Chords below 99% target:** 3 failing (0.1% of corpus)
- **Buckets below 99%:** 4 / 39

## Worst buckets (engine fix priority)

### `alterations=b5` — 88.9% (16/18)

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

### `borrowed=major` — 93.1% (27/29)

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

### `type=9` — 96.3% (52/54)

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

### `applied=yes` — 98.1% (103/105)

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
| alterations=b5 | 18 | 88.9% | 44.4% | 2 | 2 | 0 | 0 | `stevie-wonder__superstition/Chorus/7` bII9(b5)/V(∆-sub)(maj)→V⁹(b5)/v |
| borrowed=major | 29 | 93.1% | 82.8% | 2 | 1 | 1 | 0 | `stevie-wonder__superstition/Chorus/7` bII9(b5)/V(∆-sub)(maj)→V⁹(b5)/v |
| type=9 | 54 | 96.3% | 90.7% | 2 | 2 | 0 | 0 | `stevie-wonder__superstition/Chorus/7` bII9(b5)/V(∆-sub)(maj)→V⁹(b5)/v |
| applied=yes | 105 | 98.1% | 64.8% | 2 | 2 | 0 | 0 | `stevie-wonder__superstition/Chorus/7` bII9(b5)/V(∆-sub)(maj)→V⁹(b5)/v |
| inversion=0 | 2125 | 99.9% | 96.4% | 3 | 2 | 1 | 0 | `stevie-wonder__superstition/Chorus/7` bII9(b5)/V(∆-sub)(maj)→V⁹(b5)/v |
| type=7 | 714 | 99.9% | 93.7% | 1 | 0 | 1 | 0 | `stevie-wonder__superstition/Chorus Lead-Out/5` bII9(b5)/V(∆-sub)(maj)→V⁷(b5)(maj) |
| borrowed=none | 2229 | 100.0% | 97.3% | 1 | 1 | 0 | 0 | `stevie-wonder__superstition/Chorus/11` bII9(b5)/IV(∆-sub)→V⁹(b5)/IV |
| applied=no | 2346 | 100.0% | 97.4% | 1 | 0 | 1 | 0 | `stevie-wonder__superstition/Chorus Lead-Out/5` bII9(b5)/V(∆-sub)(maj)→V⁷(b5)(maj) |
| type=5 | 1653 | 100.0% | 97.5% | 0 | 0 | 0 | 0 |  |
| inversion=1 | 122 | 100.0% | 95.1% | 0 | 0 | 0 | 0 |  |
| inversion=2 | 105 | 100.0% | 94.3% | 0 | 0 | 0 | 0 |  |
| inversion=3 | 99 | 100.0% | 90.9% | 0 | 0 | 0 | 0 |  |
| suspensions=4 | 59 | 100.0% | 93.2% | 0 | 0 | 0 | 0 |  |
| suspensions=2 | 53 | 100.0% | 90.6% | 0 | 0 | 0 | 0 |  |
| adds=6 | 52 | 100.0% | 59.6% | 0 | 0 | 0 | 0 |  |
| adds=9 | 48 | 100.0% | 89.6% | 0 | 0 | 0 | 0 |  |
| borrowed=minor | 43 | 100.0% | 79.1% | 0 | 0 | 0 | 0 |  |
| borrowed=harmonicMinor | 36 | 100.0% | 88.9% | 0 | 0 | 0 | 0 |  |
| borrowed=dorian | 30 | 100.0% | 83.3% | 0 | 0 | 0 | 0 |  |
| omits=5 | 30 | 100.0% | 96.7% | 0 | 0 | 0 | 0 |  |
| borrowed=mixolydian | 29 | 100.0% | 82.8% | 0 | 0 | 0 | 0 |  |
| type=11 | 25 | 100.0% | 76.0% | 0 | 0 | 0 | 0 |  |
| adds=4 | 23 | 100.0% | 56.5% | 0 | 0 | 0 | 0 |  |
| borrowed=lydian | 18 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=custom-array | 14 | 100.0% | 92.9% | 0 | 0 | 0 | 0 |  |
| omits=3 | 13 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=locrian | 10 | 100.0% | 40.0% | 0 | 0 | 0 | 0 |  |
| borrowed=phrygian | 8 | 100.0% | 87.5% | 0 | 0 | 0 | 0 |  |
| alterations=#5 | 6 | 100.0% | 50.0% | 0 | 0 | 0 | 0 |  |
| type=13 | 5 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| alterations=b9 | 5 | 100.0% | 100.0% | 0 | 0 | 0 | 0 |  |
| borrowed=phrygianDominant | 5 | 100.0% | 80.0% | 0 | 0 | 0 | 0 |  |
| alterations=#9 | 4 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| suspensions=2+4 | 3 | 100.0% | 33.3% | 0 | 0 | 0 | 0 |  |
| suspensions=4+2 | 2 | 100.0% | 50.0% | 0 | 0 | 0 | 0 |  |
| alterations=#5+#9 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| adds=4+9 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| omits=3+5 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |
| adds=6+9 | 1 | 100.0% | 0.0% | 0 | 0 | 0 | 0 |  |

## Recommended engine fix order

1. **suspensions** — not applied in `chordInterpreter` (0% notesOk expected)
2. **omits** — not applied in note builder
3. **adds** — extensions missing from generated notes
4. **alterations** — b9/#5/etc. not reflected in PCs
5. **type=13** — 13th chords missing extension notes
6. **borrowed=custom-array** — Roman + notes edge cases

See `_Decode_oracle/DECODE_FIX_LOG.md` for applied fixes and open gaps.
