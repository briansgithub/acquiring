# B03 melody function receipt

Implementation uses Android authority `3c887223b2d06b4c3a1010d0f8a23ceaf8977d08`.
Model and effort evidence: this worker's Codex session `turn_context` records
`gpt-6-astra`, `effort: high`, with the assigned worktree path on both recorded
turns. Implementation is ready for independent review, not Swift runtime proof.

## Behavior and caller map

| Behavior | New Swift function | Remaining wiring |
| --- | --- | --- |
| Actual chord labels, sit/lean/move/outside, key leading-tone and fourth advice | `MelodyFunction.describe` | B06 caption/card consumers |
| Anticipation before suspension/retardation, held over, neighbors, passing, appoggiatura, escape, leading, pedal, color | `MelodyFunction.describe` | B06 active-note selection |
| Staff-step versus chromatic direction; chromatic prefixes | `MelodyFunction.describe` | None inside model |
| Rest breaks adjacent note connection; stable source ordering and duplicate indices | `MelodyCueAnnotation.input` | B06 supplies source note/chord indices |
| Source onset keys for notes and chords; existing chord tone labels | `MelodyCueAnnotation.input`, existing `ChordInterpreter` | B04 retains original section when transforming audio |
| Source role stays distinct from Lock/transpose sounding pitch | `MelodyCueAnnotation.annotate` | B04 supplies transformed event MIDI; B06 applies effective keys to register helper |
| C2...B4 singing fold and octave spelling, direction across rests | `SingingMelodyRegister.singing`, `pitches`, `placeSinging` | B04 melody rendering |
| Preferred C3...B3 speech, repeats/rest direction, last-resort rising B4-to-C5 | `SingingMelodyRegister.spoken`, `placeSpoken` | B04 speech renderer; PR52 strict cap excluded |
| One/two-word cues, octave/tenth aliases, chord-tone filter | `MelodyFunction.spokenCue`, `isSpokenChordTone`, `cardText` | B04 voice selection; B06 text |
| Semantic RGB values; neutral theme token | `MelodyFunctionTone.rgb` | B06 maps neutral to theme and renders colors |
| Onset cues and changed cues under held notes, no duplicate cue at unchanged chord role | `MelodyCueAnnotation.annotate` | B04 maps projection back by event index; B06 captions |

The projection requires chronological events, as Android's timeline builder
provides. Source array indices preserve duplicate value-type identity. It keeps
input event payloads outside AcquiringCore and returns cue metadata without
mutating its inputs. No package registration or app files changed. No UI,
controls, audio clip playback, mode announcement renderer or persistence is
claimed complete.

## Evidence

Android `MelodyFunction.kt`, `SingingMelodyRegister.kt`, their named unit tests,
`PlaybackMelodyFunction.kt` colors, and the existing Swift theory/model/chord
interpreter were read. PWA `melody-function.test.ts` supplies the matching test
translation. Portable `contracts/fixtures/b03-melody-function.json` has unique
B03 IDs. Role/register expectations were transcribed from source tests and
explicit source branches, never from Swift. Retardation, held, escape, leading
and pedal cases cover branches beyond Android's named test examples.

Five timeline cases project the existing native fixture's source section,
melody and expected events. Only layer/onset/sounding MIDI/cue fields are kept.
The original `native-timeline.json` pins the same authority and Kotlin dependency
hashes. The check clears expected cues before calling the PWA annotator.
This exercises borrowed chords, key changes, unusual tonic spelling and held
notes without asserting new audio-renderer behavior.

Executed from the worktree:

```
'/mnt/c/Program Files/nodejs/node.exe' contracts/fixtures/check-b03-melody.cjs
```

Passed 21 role cases, 8 register sequences and 5 native timelines. The checker
uses Node's built-in TypeScript transform and emits no files. Node prints its
experimental-transform warning. An initial attempt to use the installed
TypeScript API failed because TypeScript 7 exposes no `ModuleKind` there; the
final checker needs no dependencies and leaves main untouched.

`B03MelodyFunctionTests` consumes the same portable fixtures and adds rest,
transposed-sounding/source-role separation, caller-selected minor/major keys,
cue aliases and color checks. Swift tests, package build, simulator and device
checks are UNRUN because no iOS/Swift toolchain is available. No toolchains were
installed and no broad suites ran. Actual CI disposition will be recorded at PR
handoff. Prior pending human reviews remain pending.
