# Aural catalog delivery — 2026-10-02

Runtime model: unknown. Route: one agent, focused Android checks and verified
GitHub release assets. The user explicitly authorized publishing the newest
example-song database and exposing default and Settings downloads.

Starting point: main at `9532d999`, clean. Existing dirty recovery worktrees
remain outside this scope. The Pixel has the published schema-v1 bundle.

Plan: prepare a checksummed, compressed full-v3 catalog, matching evidence and
existing full popularity overlay as immutable versioned release assets. Keep
the older v1 release available. Point Android's default download at v3, check
for it automatically when the song catalog is available, and add a dedicated
Settings download/update action with progress and retry feedback. Preserve
saved user data and release catalog readers before replacement. Validate the
bundle, focused downloader/UI checks and builds before publication, then verify
the hosted assets and Pixel installation if the device is available.

Catalog snapshot: `64cfa299cc740dd9a1daf2cefc837bf1db80be9b2caa00626f674ea04b0c2243`.
The generated databases and delivery archives remain ignored under
`acquiring_data/`; this document and the publishing tool are maintained source.
No store release is included.

## Published outcome

Source revision: `c01d433b3b6b15681c4b5bafb1ffc954cdfbf976`.
[Full v3 data release](https://github.com/briansgithub/acquiring/releases/tag/aural-catalog-v3-64cfa299cc74)
is public and identifies that immutable source revision. Its four assets are the
catalog, matching evidence, popularity overlay (gzip), and bundle manifest.
Their total compressed database size is 782,700,084 bytes; installed database
size is 1,980,387,328 bytes. The snapshot contains 17,272,900 sequences.

Android's default URL is the stable
[v3 channel manifest](https://github.com/briansgithub/acquiring/releases/download/v1.0.0-data/aural-catalog-manifest-v3.json).
It points to the versioned assets above. The older v1 manifest and assets were
preserved, so older clients retain their existing download. Future compatible
v3 data updates can replace the channel manifest after validating and publishing
their immutable assets, without changing Android's URL.

The app checks when an existing song catalog is opened and after its initial
download/refresh. Settings exposes **Example songs → Download / update example
songs**, progress, error/retry feedback and a disabled button during a request.
Unchanged verified bundles are reused. Installations are serialized and stage
and validate all files before replacement. Quiz readers release during updates
and reopen afterward; playlists, quiz progress and user preferences are retained.

## Validation

- `node --test tooling/aural-corpus/prepare-delivery.test.mjs` passed its
  round-trip/corruption and existing-file preservation regression.
- `prepareDelivery` ran `inspectBundle` on the full source databases, verifying
  catalog SHA-256, SQLite integrity, catalog/evidence snapshot identity and
  popularity metadata. `verifyDelivery` decompressed all three full assets and
  verified their SHA-256 and byte sizes against the source.
- From `android/`, `python scripts/compact_check.py --name v3-download-settings-final -- .\gradlew.bat :app:testDebugUnitTest --tests com.acquiring.android.AuralCatalogDownloaderTest --tests com.acquiring.android.AuralPreparedResourceTest --tests com.acquiring.android.AuralQuizUiTest :app:assembleDebug :app:assembleDebugAndroidTest`
  passed: 26 tests, debug app and instrumentation builds. Coverage includes v1
  to v3 upgrade eligibility, mixed/corrupt bundles, reader lifecycle, Settings
  progress/retry and existing quiz/settings behavior. `git diff --check` passed.
- GitHub's stored SHA-256 digest and size matched all four uploaded assets,
  including the manifest, before publication. Public GET of the v3 channel
  manifest matched the local verified manifest; public HEAD requests for all
  three gzip assets returned HTTP 200 and the expected content length. Public
  GET confirmed the older manifest still offers schema v1.
- Pixel 7a `3C081JEHN14930` disconnected during preparation. Repeated
  `adb devices -l` checks listed no devices. The updated APK and real in-app
  download have therefore not been installed or device-validated in this task;
  the owner's reconnect request is pending. No app data was cleared.

To reproduce assets, run `node tooling/aural-corpus/prepare-delivery.mjs
<catalog.db.json> <popularity.db> <evidence.db> <new-output-directory>
<release-tag>`, then `verifyDelivery` before uploading. Publish as a draft,
verify server digests, publish the immutable bundle, and only then advance the
channel manifest. Existing output files are deliberately not overwritten.

Next device action: replacement-install the built debug app on the reconnected
Pixel, launch it, confirm the automatic v3 install, compare all three private
checksums with the manifest, and check the Settings retry/control flow without
resetting its user data.

GitHub validation milestone: the exact source revision `c01d433b` passed
[Android CI](https://github.com/briansgithub/acquiring/actions/runs/37053968495),
[chord-parity CI](https://github.com/briansgithub/acquiring/actions/runs/37053968551)
and web CI. Android's full configured unit checks and instrumentation compilation
therefore passed in addition to the focused local checks. The existing unrelated
`ios-external-beta.yml` workflow validation still fails before starting any job;
that workflow was not changed or used to publish these catalog assets.
