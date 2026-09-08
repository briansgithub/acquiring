# Chord interpretation contract and source evidence

The shared fixtures have two separate purposes. `corpus_parity.json` and the
`expected*` fields in `hooktheory_parity.json` describe the common app contract:
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
existing source corpora and remain a stated source-rule boundary. One frozen
Lady Gaga bridge pitch list is contradictory and the live section has changed;
that historical field is explicitly unresolved, with its original evidence
fingerprinted. The corresponding minor-scale ii eleventh rule is independently
verified by the live REM example; separate rule-derived pitch and tone-role
assertions check its transposition without relabeling it a historical recapture.

Validation commands:

```text
npm run test:shared-parity
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
