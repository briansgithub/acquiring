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
