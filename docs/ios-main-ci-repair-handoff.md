# iOS main CI repair handoff

## Status

Work on the catalog artist lookup is paused. Do not merge
`codex/fix-ios-artist-history-test` as it stands. The branch contains diagnostic
attempts that have not repaired the failing macOS test.

Baseline: `main` and `origin/main` were at merge commit `48bce084` (PR #45).
The chord interpreter output itself is not the failing assertion. Both failed
macOS runs reported 100% iOS/web agreement for Roman strings, letter names,
pitch classes, MIDI notes, roots, and tone labels across all 1,824 real chord
shapes. The iOS package job fails later because it runs the whole Swift package.

## Reproduced failure

The only Swift package failure reproduced in the relevant jobs is:

```text
CatalogBrowseTests.swift:190
testArtistHistoryUsesStableIdentityAndPreservesDistinctSourceNames
XCTAssertEqual failed: ("nil") is not equal to ("Optional(\"Diddy\")")
```

The failing call is `resolvedArtistName("puff daddy")` for a fixture row whose
slug is `puff-daddy__song` and whose current display artist is `Diddy`.

Main evidence:

- iOS: https://github.com/briansgithub/acquiring/actions/runs/34203921059
- Chord interpretation parity: https://github.com/briansgithub/acquiring/actions/runs/34203921040

Branch evidence through commit `011ec47e`:

- iOS: https://github.com/briansgithub/acquiring/actions/runs/34205621134
- Chord interpretation parity: https://github.com/briansgithub/acquiring/actions/runs/34205621138

In the parity run, web and Android succeeded, iOS failed on the catalog test,
and the aggregate job failed only because the iOS job failed.

## Attempts that did not fix it

The branch is based directly on `48bce084` and currently contains:

- `74c5f44a` — gives each `CatalogBrowseTests` fixture a real UUID directory
  instead of the prior literal `CatalogBrowseTests-(UUID().uuidString)` path.
- `b4a90df7` — computes the input search key once and binds that value for the
  normalized SQL lookups.
- `011ec47e` — replaces the Foundation `CharacterSet` filter with explicit
  alphabetic-or-numeric Unicode scalar properties.
- `58acbd01` — bypasses the SQL legacy-identity comparison and compares slug
  identities in Swift. Its macOS runs were still in progress when this handoff
  was first written and must be checked before drawing a conclusion.

The first three changes compiled on macOS but left the exact same assertion
failing. The fixture isolation change is independently valid, but it did not
cause this failure. No further edits should be built on these assumptions
without evidence from the current run or a separate diagnosis.

## Validation performed

Available local checks on commit `011ec47e`:

- `npm run test:shared-parity` — passed 39,018 shared cases across all six
  contract fields.
- `npm run test:source-accuracy` — passed all 1,824 captured source cases with
  zero Roman, letter, pitch-class, derived-note, or interpretation differences.
- `ANDROID_HOME=C:\Users\user1\AppData\Local\Android\Sdk` followed by
  `android\gradlew.bat -p android testDebugUnitTest --tests
  '*HistoricalCatalogParityTest' --tests '*CorpusParityTest' --tests
  '*HooktheoryRealParityTest' --tests '*ChordRoleContractTest'` — build
  succeeded.
- `git diff --check origin/main...HEAD` — passed.

Swift, Xcode, and iOS simulators are unavailable on the Windows host. Only the
linked macOS GitHub Actions runs are authoritative for Swift compile/test
results. Simulator layout, VoiceOver, safe-area, appearance, and larger-text
review remain unperformed.

## Separate pre-existing Actions problem

`.github/workflows/ios-external-beta.yml` is rejected by GitHub before any job
is created, including on pushes whose changed paths should not match that
workflow. Example: https://github.com/briansgithub/acquiring/actions/runs/34206877897

That workflow failure predates and is unrelated to the catalog lookup and chord
parity failure. It was deliberately not mixed into this repair branch.
