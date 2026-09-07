# iOS beta-release policy

This policy applies to every iOS beta build.

## Where the human gate is

Human confirmation is required at exactly one point: **App Store submission**.
Everything before it proceeds without asking — building, archiving, `codesign`
verification, uploading, drafting and saving the **What to Test** notes, and
releasing to internal *or* external TestFlight testers.

Stop and wait for the release owner's explicit approval before pressing **Add
for Review** or **Submit to App Review** for an App Store release.

Do not ask for confirmation before any earlier step.

## Releasing to testers

A request to build and release is itself the authorization. Do not ask again
once it has been given.

- **Internal — fully autonomous, end to end.** Build, upload, write the **What
  to Test** notes, and release, all without review. Do not show the notes for
  approval, do not ask whether to proceed, and do not pause between steps.
  `Acquiring Internal Testers` is set to *Automatic for Xcode Builds*, so a
  successful upload releases to it within minutes: uploading *is* the internal
  release, and there is no recall.
- **External** — release when the request asks for external testers. Ask which
  group **only** when more than one external group exists and the request did
  not name one; a named group is never ambiguous, and a single group needs no
  question.

Today there is exactly one external group, `Early Access`, so no clarification
is needed. `ios/scripts/asc_api.py` enforces this: `--track external` resolves a
lone external group and refuses to guess between several.

### What external release means

External distribution reaches people outside the team. `Early Access` has a
public link, so anyone holding that URL can install the build.

Adding a build to an external group is also the beta-app-review path. For a
version Apple has already approved the build usually distributes straight away;
otherwise the assignment enters **Waiting for Review**. Either is acceptable
under this policy — but say which happened. `asc_api.py assign` reports the
resulting `externalBuildState` for exactly that reason.

Beta app review is not App Store submission. The App Store gate above still
stands.

## What to Test notes

Terse: one to three short bullets, within 350 characters unless the release
owner asks otherwise. Only user-visible changes, a required check, or a material
known limitation — no internal implementation detail, long test scripts, or
generic feedback requests.

Notes never require approval — write them and ship. Set them *before* releasing
externally: assigning a build to an external group notifies its testers, and the
notes should be in place when that notification arrives.

Style still applies when nobody is reviewing them. Terse notes are the point:
they are what a tester reads before deciding what to try.

## Credentials

Releases authenticate with an App Store Connect API key, never a password. No
agent enters an Apple ID, password, passkey, or 2FA code, and no credential is
ever written into this repository — the remote is public-facing, so a committed
secret is a published one. Setup: `../ios/scripts/README-asc-api.md`.
