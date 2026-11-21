# B03 melody function receipt

Implementation uses Android authority `3c887223b2d06b4c3a1010d0f8a23ceaf8977d08`.
Status: complete for the scoped pure model, ready for lead integration.
PR https://github.com/briansgithub/acquiring/pull/54 remains open.
Verified code head: `b251c517dcfd2f293079376f2f0a6581a63ba231`.
Remote Swift package proof is recorded below; earlier unrun entries are historical.

Model and effort evidence: this worker's Codex session `turn_context` records
`gpt-6-astra`, `effort: high`, with the assigned worktree path on both recorded
turns. Implementation is ready for independent review; remote package tests now pass.

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

## Source review follow-up

Added 22 unchanged chord-role contract cases, verified against PWA interpretation
and consumed by focused Swift tests to carry actual labels through classification.
The Node checker now verifies unique B03 IDs, exact native timeline projection,
unchanged chord-role cases and SHA-256 hashes for the three frozen Android
source files. `git diff 3c887223 --` for those sources was empty.
The complete focused Node check passes: 21 roles, 8 register sequences, 5 native
timelines, 22 chord-role cases and provenance checks. `git diff --check` passed.

The resumed session `turn_context` at `2026-11-21T04:16:05.689Z` again records
`gpt-6-astra`, `effort: high`. This addresses the lead's effort correction using
runtime evidence. No additional code-review findings were present in this
worker's available messages. All Codex thread messages include explicit model
and effort flags.

PR https://github.com/briansgithub/acquiring/pull/54 is registered with T3.
Merged main's ledger-only updates in `2eb92114` to resolve the concurrent
append conflict. The first mergeable head started iOS run `44865646406`.
A final source review aligned invalid/rest active-note context with Android's
beat-1 fallback key and retained Kotlin's NaN-last onset ordering. Focused Swift
tests now also cover rest key fallback and duplicate note source-index identity.

## CI repair, 2026-11-21

At head `a85db1e859ae2e153763e5e037c966c86c330809`, iOS run
`44865799135` compiled the package and ran 248 tests. All 22 assertion failures
came from B03's six tests. Degree labels such as `5̂` are one Swift grapheme;
`Character.isNumber` rejected the combined digit/hat, producing `Chord tone`,
neutral scale-degree descriptions and missing numeric cues. The fix filters
Unicode decimal scalars, matching Kotlin's character-level digit handling.
The chord-role test helper now removes the combining hat before parsing its
independent label expectations. The literal role and native timeline fixtures
remain unchanged and supply the regression check. This supersedes the earlier
statement that Swift had never executed; local Swift remains unavailable.

The same bug failed the iOS leg of parity run `44865799131`. Android tests,
release-logic, web tests, PWA recovery and web/Android chord parity passed.
PWA run `44865799128` failed only catalog-worker.spec.ts:116, which expects ten
stores and receives eleven. Its Song-mode test passed in this run. No PWA or
app files are modified by B03. Main documentation is frozen per the lead's
latest instruction; subsequent batch status is recorded here.


## Final CI receipt and handoff

At exact code head `b251c517dcfd2f293079376f2f0a6581a63ba231`:

- [iOS run 44888861680](https://github.com/briansgithub/acquiring/actions/runs/44888861680)
  compiled the package. All six `B03MelodyFunctionTests` passed, including the
  frozen roles/registers, native timeline annotations, actual chord labels,
  source/sounding distinction, rest context and duplicate identity. All 248
  package tests passed with zero failures. This is actual remote Swift runtime
  evidence, distinct from the local Node contract checks.
- The same run failed subsequent app compilation at
  `ios/Acquiring/Infrastructure/AppEnvironment.swift:269:9` with
  `main actor-isolated default value in a nonisolated context`. Blame identifies
  unchanged baseline `1a494fcc9`, the `UIScreen.main.maximumFramesPerSecond`
  default argument. No app test ran; iPad tests were skipped. B03 does not own
  that app file and the lead has accepted this as an integration prerequisite.
- [Chord parity run 44888861632](https://github.com/briansgithub/acquiring/actions/runs/44888861632)
  passed web, Android, iOS and the all-three-interpreters gate at the same head.
- [PWA run 44888861727](https://github.com/briansgithub/acquiring/actions/runs/44888861727)
  failed two browser assertions in unchanged PWA files. Catalog-worker line 116
  expected 10 stores and received 11. Library line 67 expected six song buttons
  after second-tab ownership retry/search and received zero after 5 seconds.
  These remain outside B03. The lead reports PR58's store-count fix merged on
  main `da752342`; this branch intentionally does not update that dependency.

No scoped B03 failure remains in the inspected runs. No manual CI rerun, broad
local suite, toolchain installation, app change, merge or release was performed
for this handoff. The final receipt-only commit skips CI as requested, so the
verified code head remains the one above. Local Swift, simulator/device testing,
perceptual UI and speech/audio integration remain unrun. B04 may consume these
pure types; B04/B06 caller wiring in the map above remains pending. Earlier human
review statuses are unchanged. Shared main documentation remains frozen.

Commits: `2b5b9f24` implementation/contracts, `153b9be7` source/chord-role
provenance, `2eb92114` main ledger merge, `a85db1e8` rest/source-order review,
`b251c517` combining-hat digit repair. Worktree:
`/mnt/c/Users/user1/Desktop/Projects/acquiring-ios-port-melody-function`.
Latest saved `turn_context` at `2026-11-21T19:23:14.696Z` records
`gpt-6-astra`, `effort: high`. Final receipt whitespace check passed.
