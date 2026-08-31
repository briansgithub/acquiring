# Acquiring product architecture

Acquiring is a monorepo containing three independently releasable applications:

- `web/` — JavaScript browser UI, audio engine, and local Node server.
- `android/` — Kotlin and Jetpack Compose application.
- `ios/` — Swift and SwiftUI application.

The applications do not share runtime code. They share contracts and behavioral fixtures under `contracts/`, allowing each platform to use its native UI, persistence, audio, and concurrency frameworks.

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
