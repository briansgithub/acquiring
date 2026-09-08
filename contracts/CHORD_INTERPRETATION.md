# Chord interpretation contract and source evidence

The shared fixtures have two separate purposes. `corpus_parity.json`,
`historic_catalog_parity.json`, and the `expected*` fields in
`hooktheory_parity.json` describe the common app contract:
Roman string, letter string, ordered MIDI/notes, resolved harmonic root, and
ordered chord-tone labels. All three implementations must match these
fields for every fixture ID. Generated app output is a parity reference, not an
independent accuracy oracle.

The frozen `truthRoman`, `truthLetter`, and `truthPcs` fields in the 1,824 real-song
cases are the source evidence. `hooktheory_source_review.json` pins their input
and truth fingerprint, excluding generated `expected*` fields. Regenerating
parity expectations therefore cannot redefine source accuracy. Source changes
require a separate reviewed correction with the original values, reason and
provenance; the original captured fields remain intact.

`hooktheory_source_review.json` contains position-based SVG extraction repairs.
It retains captured text fragments, their coordinates, the source object/key
match, rendered row position and capture hash. Figured-bass digits are read from
visual placement, top to bottom. Borrowing tags remain on their numerator or
denominator. The legacy extraction had reordered stacked digits and moved
parentheses after an applied slash.

`hooktheory_source_findings.json` records separately reviewed alignment and
pitch-inference repairs, targeted live GUI observations and unresolved evidence.
Some corrections are direct live observations; others apply a stated rule
corroborated by representative live observations to the independently captured
symbols. These provenance categories are explicit. Most original `truthPcs`
were inferred from source symbols, not recorded keyboard notes. Passing those
assertions is not a claim that every song was individually replayed live.

The supported note contract follows Hooktheory keyboard voicing, using the
apps' existing default octave. Absolute register in a source piano widget is
not compared unless the same instrument/register settings were captured. Tone
roles remain attached through omissions, alterations and inversions: suspended
fourths retain `4`, diminished sevenths retain `bb7`, and extensions retain
`9`, `11` or `13`. A displayed slash bass or upper-structure letter name can
differ from the first sounding tone under a verified Hooktheory convention;
the harmonic root and tone labels must still describe the interpreted notes.

Targeted keyboard checks on 2026-09-08 established that both tones of dual
sus2/sus4 chords sound, suspended ninth voicings omit the fifth, and elevenths
omit the third and implicit fifth while preserving their scale-specific
extensions. The findings file records exact chord IDs, keys, labels and
keyboard notes. Explicit fifth alterations on elevenths have no example in the
original 1,824 cases or four tracked oracle shards. The larger historical
catalog does contain such objects; their individual keyboard treatment has
not been independently rechecked and remains a stated source-rule boundary. One frozen
Lady Gaga bridge pitch list is contradictory and the live section has changed;
that historical field is explicitly unresolved, with its original evidence
fingerprinted. The corresponding minor-scale ii eleventh rule is independently
verified by the live REM example; separate rule-derived pitch and tone-role
assertions check its transposition without relabeling it a historical recapture.

Validation commands:

```text
npm run test:shared-parity
npm run test:historical-accuracy
npm run test:chord-interpretation
node tooling/scripts/sourceAccuracyUnitTest.mjs
node tooling/scripts/chordLetterFormatTest.mjs
node tooling/scripts/sourceAccuracyTest.mjs --json
```

The source checker evaluates every ID and fails on every unexplained assertion
or interpretation exception. Presentation comparison preserves accidentals,
qualities, omissions, repeated additions and applied-side scope. It permits
only documented typography, modifier-group ordering and source extraction
artifacts. Explicit ambiguity fields are reported separately with their reason
and original fingerprint and are never counted as verified fields. New or
changed ambiguities require an evidence-file review; there is no discrepancy
budget or generated allowlist.

`reviewCapturedSource.mjs <harvest-directory> <new-output.json>` produces a new
candidate SVG review and refuses to overwrite an existing review. It does not
import an app interpreter. `sourceCollisionAudit.mjs <oracle-directory> --json`
checks conflicting source outputs for the same complete interpretive object
and key, retaining all optional flags and removing only recording timing.

The `Chord interpretation parity` GitHub workflow checks web, Android and the
Swift package at the same revision and requires all three jobs to succeed.
Source reports are uploaded even on failure. Swift uses macOS CI; it has not
been validated locally on Windows.

Validated commands (implementation checkpoint):

- `npm run test:shared-parity`: 17,554 cases, all six channels exact.
- `npm run test:chord-interpretation`: 22 role/display cases, 36 transposition/inversion cases and quiz pairing checks passed.
- `npm run test:source-accuracy`: 5,471 captured-source assertions and two independent rule assertions passed; the historical capture and rule boundary above remain explicitly reported.
- `npm run test:scale-degrees`: all 11 checks passed, including the negative regression detector.
- `npm run test:roman-symbols`: all rendering checks passed, including 160 diminished/half-diminished samples and all shared cases.
- `npm run test:pronunciation`: unit fixtures and 5,707 corpus readings passed.
- `node tooling/scripts/chordLetterFormatTest.mjs` and `node tooling/_Debug_testing/policyRegression.mjs`: passed.
- `./android/gradlew -p android testDebugUnitTest --tests '*CorpusParityTest' --tests '*HooktheoryRealParityTest' --tests '*ChordRoleContractTest' --tests '*RelativeIonianContextTest' --tests '*ChordInterpreterTest' --tests '*AppliedBorrowedChordTest' --tests '*InversionChordPlaybackTest' --tests '*RomanNumeralTokenizerTest' --tests '*RomanNumeralPainterTest' --tests '*ScaleDegreeRendererTest'`: passed in CI.
- `swift test --package-path ios/Packages/AcquiringKit`: 217 tests passed on macOS, including both shared corpora and the role contract.

The initial combined validation is recorded in [the successful same-revision CI run](https://github.com/briansgithub/acquiring/actions/runs/34195412283).
The old `parity_baseline.json` remains historical data; no active check reads its discrepancy allowances.

For a manual spot check, compare a borrowed applied chord across platforms,
then a suspended or eleventh chord, and finally an inverted chord. Confirm the
Roman and letter displays agree, the note cards retain suspension/extension
roles, and the root target stays the harmonic root as the bass changes. This
check does not require a release or changes to the catalog.

## Historical regression gate — 2026-09-08

The recovered July 25 catalog contains 91,107 occurrences from 1,969 songs,
representing 21,464 complete interpretive inputs and 22,072 input/truth groups.
The new historical parity corpus adds every distinct input to all three native
gates, bringing the combined case count to 39,018. Only recording timing fields
are removed when identifying equal inputs; keys, borrowing arrays and optional
interpretation flags remain part of the identity.

The independent historical accuracy fixture preserves each source field that
matched the raw web decoder at the July 25 `35fd7c24`, July 31 `a60fe900`, or
pre-upgrade `f0c4e8e7` checkpoint. The July 25 comparison added 291 pitch
assertions (610 occurrences) missed by the newer baseline. Passing is based on
individual fields, not an aggregate improvement or discrepancy allowance.
The source fixture, complete input identity, and every reviewed source record
are fingerprinted separately from generated parity expectations.

Historical stored pitches were mostly inferred from labels. The review retains
the original values and distinguishes positioned SVG repairs, capture alignment
repairs, direct live keyboard observations and applications of independently
verified musical rules. `historic_notation_evidence.json` preserves raw fragments
and source hashes. `historic_catalog_review.json` records each correction and
its provenance. Regenerating app parity cannot change these accuracy assertions.

This pass also checked the historical policy, scale-degree, Roman rendering,
pronunciation and note-order suites. The old strict note-order diagnostic already
had failures before this upgrade; the historical audit found no newly failing
IDs at the initial upgrade checkpoint. It is not a claim that every legacy
source-derived bass assertion has been independently replayed. Default smoke
tests and comparisons using truth-enriched chord objects are weaker evidence
than the new raw-object source gate.

New live checks cover Dvorak's omitted-fifth third inversion, Grieg's root-position
half-diminished omission, Junko Shiratsu's flattened suspended second, They Might
Be Giants' dual suspension, and Gentle Giant's borrowed-Lydian eleventh. They
establish the omitted fifth, retained seventh and suspension roles, and the
four-tone eleventh shell. Explicit `halfDim`/`dimTriad` inputs retain their
historical symbol-frame policies; inferred diminished quality no longer silently
grants an explicit half-diminished omission exception.

One additional historical label group remains unresolved: NCT Dream, Chiller,
beats 4/9/14 lie outside the captured rendering, whose labels start at beat 17.
Those three occurrences are reported as an ambiguity, never as verified passes.
The earlier Gaga capture ambiguity and explicit-fifth eleventh boundary remain
disclosed above. No catalog, UI redesign, release or deployment work is included.

Local validation of the historical extension: all 39,018 web/Android parity
cases match on six fields; Android reports 80 tests in 18 suites with no failures
or skips. `npm run test:historical-accuracy` passes 51,774 assertions, with one
separately reported grouped ambiguity. `npm run test:source-accuracy` still
passes 5,471 source assertions and two rule assertions. Chord-role/transposition,
policy, scale-degree, Roman-rendering, pronunciation and letter-format checks
pass. Swift syntax checks passed; final runtime validation uses macOS CI.
