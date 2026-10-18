# Aural readonly lookup foundation

Authority Android801cf7984171d772afc4406ddb5c79c0cb7fd20a AuralCatalog73..90 and120..132; exporter catalog-export.mjs17..31/50..57. Coordinator runtime unknown, unchanged. Native schema1..3 capabilities and exact loop version flag retained. Browser rejects malformed metadata/array types, partial8byte pairs and arrays>=2GiB; it never materializes the full array. Suffix lookup binds one rank offset and reads8bytes, signed32LE; empty arrays valid but have no rank. Expected SHA256 snapshot is exact. Aural lookup does not stand for complete native constructor validation (valid songs/contiguous run scan remains separate).

One-command ownership decision: existing catalog worker serializes awaited operations under one exclusive Web Lock; active/previous validated attempts cannot be reimported and no cleanup API exists. Future command resolves immutable active attempt, opens readonly DB and finally closes after decoding/digest awaits; no public persistent lease. Stale snapshots must reject; termination releases ownership/preserves files. Per-request SQL cancellation is not claimed.

2026-10-18T22:43:42.208250+00:00: Root first executed tests15/1file668ms PASS using real node:sqlite SQLite3.50.4/Node24.11.1, including readonly query_only handle, all3schemas, stale-before-array access, exact version flags, missing/duplicate/malformed data and signed/endian/bounds cases. Strict full TypeScript PASS. Guards window21-header-first-tests-cwd-20261018 / window21-header-first-types-20261018, explicit cwd pwa. Initial guard window21-header-first-tests-20261018 launched from default root and failed before tests; corrected launcher only, no source cycles or discarded evidence.

Exact tested SHA256:
- pwa/src/storage/catalog/aural-read-contracts.ts: 02664e55364590a375991a8aba0d26d994e0301b31ea90781d7ecc51fc8e8aae
- pwa/src/storage/catalog/aural-header.ts: 52f6fb3845e8b41f04a682f862ba48289a952d5403d4db577068677feab8c9fe
- pwa/src/storage/catalog/aural-header.test.ts: 7dccf40fab2ee1da983e658b1e755c3a7fc0bb63633140b5e78128f7c088e337

No new native capture, actual WASM/browser/fullcatalog proof, RPC, typed target codec, matching/rank/group/UI or complete T15 acceptance. Original catalogs/profiles/native evidence unchanged. Native target reference proceeds independently in preserved sibling; see tasks.json. Do not repeat accepted query/identity/loop/native or2GB catalog proofs.
