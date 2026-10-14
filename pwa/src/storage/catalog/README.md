# Catalog integrity and installation boundary

`validateManifest` accepts only the checksum-bearing PWA producer schema and exact songs/Aural bundle. Ordered chunk lengths, immutable paths, full-file hashes and source snapshot/schema are explicit. Files at or above2GiB are rejected by this browser build contract. The shipping Aural main file is1,928,265,728 bytes.

`fetchVerifiedChunk` refuses redirects/cookies, HTTP Content-Encoding transformations, wrong byte lengths and compressed/raw checksum mismatches. Fetch and inflate are bounded to one8MiB raw chunk (plus bounded compressed data); no whole-catalog buffer. The manifest directory URL must come from trusted application configuration. Plain HTTP is for local development; deployment uses HTTPS. A later installer persists each verified compressed chunk before importing it, and still checks full-file hashes, SQLite quick_check and source metadata before activation.

`planInstallSpace` budgets new raw files, remaining compressed staging and a safety margin against origin quota minus usage. Retained active files are already counted in usage. Unknown quota produces unknown readiness, never a successful preflight. Estimates are advisory and a later write can still fail; staging must retain the old active snapshot until successful cold launch.

Full SQLite import, OPFS ownership, active-pointer recovery and physical-device storage evidence remain T05. Packaging alone does not make a catalog installed/offline-ready. The pinned3.53 module requires the exact-source-gated upstream preservation backport in scripts/sqlite-compat, installed in both Vite pipelines. Consumers must explicitly pass preserveOnInitFailure:true and clearOnInit:false. The controlled Chrome regression passes; full installer safety remains unproved.


## Dedicated worker checkpoint

`CatalogWorkerClient.open()` acquires one Web Lock in a dedicated worker before SQLite initialization. Other tabs receive BUSY and cannot steal suspended ownership. Both build and runtime require the preservation patch; `clearOnInit` stays false. RPC operations are serialized and every temporary readonly database handle closes before ownership release. `close` is cooperative; abrupt `terminate` preserves OPFS data and rejects pending calls.

`stage(attemptUUID, manifest, trustedBaseURL)` imports a new immutable staging attempt with bounded verified chunks, incremental full-file SHA256, SQLite length/quick_check and native snapshot metadata checks. `inspect` reopens its files locally; duplicate stage attempts fail for outcome inspection. This checkpoint does not activate a bundle, retry a partial attempt, cache compressed downloads or provide an installed/offline-ready state. Journaled resume and active-pointer recovery are the next T05 slice. Unreferenced partial staging files remain preserved.

The real browser fixture producer lives in scripts/catalog/make-browser-fixture.py. Tests serve generated data from ignored artifacts through browser routing; fixture databases are never copied to public assets or a production shell. Incremental hashing uses the pinned@noble/hashes API documented at https://github.com/paulmillr/noble-hashes#usage .
