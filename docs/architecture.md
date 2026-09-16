# Acquiring product architecture

Acquiring is a monorepo containing three independently releasable applications:

- `web/` — JavaScript browser UI, audio engine, and local Node server.
- `android/` — Kotlin and Jetpack Compose application.
- `ios/` — Swift and SwiftUI application.

The applications do not share runtime code. They share contracts and behavioral fixtures under `contracts/`, allowing each platform to use its native UI, persistence, audio, and concurrency frameworks.

## UI terminology

The **Aural Quiz UI** is the adaptive ear-training curriculum. On Android its entry is `AuralQuizScreen.kt`; `AuralCurriculum` remains the learning-domain model. The Library button reads **Aural Quiz · learn by ear**.

The **Playback UI** is the song/section page formerly called Quiz, including both **Full-chord** and **Root-only** modes. Android uses `PlaybackDestination.kt`, `PlaybackView.kt`, and the `Playback*` components/audio types. Naming changes do not change playback behavior or stored preferences. Historical documentation and other-platform source may still use the former Quiz names.

## Shared boundaries

The downloadable catalog is a replaceable, read-mostly SQLite database packaged as gzip. Its schema and validation requirements live in `contracts/catalog/`. Platform-owned records such as playlists and preferences live outside that catalog so an atomic catalog update cannot erase user data.

Music-theory parity is specified by `contracts/fixtures/corpus_parity.json`. Web and Android execute the corpus against their chord engines. The iOS shell only validates that the corpus is bundled and decodable until the Swift chord engine is implemented.

## Data flow

1. Catalog tooling under `tooling/_Research_testing/hooktheory_catalog/` builds the mobile SQLite artifact from harvested data.
2. The exporter applies the canonical catalog schema and produces `catalog.db.gz` as a GitHub release artifact.
3. Mobile clients download to a staging location, validate the contract, and atomically replace the live catalog.
4. User data remains in a separate platform-owned store.

## Releases

Web, Android, and iOS use independent release tags (`web/v…`, `android/v…`, and `ios/v…`). Contract changes run all platform checks even when only one application is being released.
