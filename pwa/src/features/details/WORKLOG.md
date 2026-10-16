# Offline song detail reader

Android authority: 801cf7984171d772afc4406ddb5c79c0cb7fd20a, SongDao.getSongBySlug and existing T02 DataUtils/section-repair ports. Coordinator runtime model unknown, unchanged. This slice adds one exact-slug readonly catalog RPC and a decoder boundary; it does not expose Song Info UI yet.

The RPC uses bound equality and preserves raw slug, artist, title, URL and status. It carries the confirmed source snapshot. A SQL CASE bounds blob materialization before transfer; missing row, missing blob, corrupt type/bytes and oversized payload remain distinct. It reuses the existing active/previous recovery check and closes every readonly SQLite handle. No catalog/user writes or harvest network calls.

Explicit browser limits: 2048 slug characters, 8 MiB compressed payload, 32 MiB inflated UTF-8, 4096 sections and JSON depth128. Gzip is consumed incrementally and cancelled at the decoded cap. Native failed-gzip raw replacement-tolerant UTF-8 fallback remains, but a resource-limit/cancellation failure never falls back. Existing parseSections repair and sectionsInSongOrder provide native semantics. These caps are defined browser extensions, not a claim that all full catalog payloads were newly scanned.

Validation, first actual runs:

- `node node_modules/vitest/vitest.mjs run src/storage/catalog/detail-query.test.ts src/features/details/reader.test.ts src/storage/catalog/library-queries.test.ts`: 9 passed, window8-details-reader-unit-20261016. Covers exact binding, blob type/length, null/empty distinctions, detached input snapshots, gzip/raw sections, malformed identity/JSON, inflate/compressed/depth/section caps and cancellation.
- `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run build`: combined strict types and production build passed, window8-details-reader-build-20261016. Catalog worker changed; shell572df7170fc2.
- `node node_modules/@playwright/test/cli.js test song-details-reader.spec.ts --workers=1 --output .artifacts/pwa-port/song-details/reader-first`: actual Chrome 1 passed in34.0s (case23.5s), window8-details-reader-browser-first-20261016. New opt-in real SQLite fixture, exact case-sensitive slug, gzip/raw section order, missing/corrupt/oversized payload, close/reopen then offline lookup, and all10 user stores/outbox unchanged. Proof attachment retained under that unique ignored output.

Tested source: fb879a5c plus the named reader/catalog/fixture/harness paths committed with this receipt. Existing Library assertions and successful full-data/native/audio-browser proofs were not rerun or weakened. Desktop development test-entry proof does not establish production cold startup for this new reader, physical devices, Safari or a working song screen. Whole T11 remains in progress; next add route/controller/presentation and shared static previews, then transition ranking/source links.
