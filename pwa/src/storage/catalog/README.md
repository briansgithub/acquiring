# Catalog integrity and installation boundary

`validateManifest` accepts only the checksum-bearing PWA producer schema and exact songs/Aural bundle. Ordered chunk lengths, immutable paths, full-file hashes and source snapshot/schema are explicit. Files at or above2GiB are rejected by this browser build contract. The shipping Aural main file is1,928,265,728 bytes.

`fetchVerifiedChunk` refuses redirects/cookies, HTTP Content-Encoding transformations, wrong byte lengths and compressed/raw checksum mismatches. Fetch and inflate are bounded to one8MiB raw chunk (plus bounded compressed data); no whole-catalog buffer. The manifest directory URL must come from trusted application configuration. Plain HTTP is for local development; deployment uses HTTPS. A later installer persists each verified compressed chunk before importing it, and still checks full-file hashes, SQLite quick_check and source metadata before activation.

`planInstallSpace` budgets new raw files, remaining compressed staging and a safety margin against origin quota minus usage. Retained active files are already counted in usage. Unknown quota produces unknown readiness, never a successful preflight. Estimates are advisory and a later write can still fail; staging must retain the old active snapshot until successful cold launch.

Full SQLite import, OPFS ownership, active-pointer recovery and physical-device storage evidence remain T05. Packaging alone does not make a catalog installed/offline-ready. The pinned3.53 module requires the exact-source-gated upstream preservation backport in scripts/sqlite-compat, installed in both Vite pipelines. Consumers must explicitly pass preserveOnInitFailure:true and clearOnInit:false. The controlled Chrome regression passes; full installer safety remains unproved.
