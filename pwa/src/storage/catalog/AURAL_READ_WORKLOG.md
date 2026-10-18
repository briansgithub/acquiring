# Aural readonly lookup foundation

Authority Android801cf7984171d772afc4406ddb5c79c0cb7fd20a AuralCatalog73..90 and120..132; exporter catalog-export.mjs17..31/50..57. Coordinator runtime unknown, unchanged. Native schema1..3 capabilities and exact loop version flag retained. Browser rejects malformed metadata/array types, partial8byte pairs and arrays>=2GiB; it never materializes the full array. Suffix lookup binds one rank offset and reads8bytes, signed32LE; empty arrays valid but have no rank. Expected SHA256 snapshot is exact. Aural lookup does not stand for complete native constructor validation (valid songs/contiguous run scan remains separate).

One-command ownership decision: existing catalog worker serializes awaited operations under one exclusive Web Lock; active/previous validated attempts cannot be reimported and no cleanup API exists. Future command resolves immutable active attempt, opens readonly DB and finally closes after decoding/digest awaits; no public persistent lease. Stale snapshots must reject; termination releases ownership/preserves files. Per-request SQL cancellation is not claimed.

2026-10-18T22:43:42.208250+00:00: Root first executed tests15/1file668ms PASS using real node:sqlite SQLite3.50.4/Node24.11.1, including readonly query_only handle, all3schemas, stale-before-array access, exact version flags, missing/duplicate/malformed data and signed/endian/bounds cases. Strict full TypeScript PASS. Guards window21-header-first-tests-cwd-20261018 / window21-header-first-types-20261018, explicit cwd pwa. Initial guard window21-header-first-tests-20261018 launched from default root and failed before tests; corrected launcher only, no source cycles or discarded evidence.

Exact tested SHA256:
- pwa/src/storage/catalog/aural-read-contracts.ts: 02664e55364590a375991a8aba0d26d994e0301b31ea90781d7ecc51fc8e8aae
- pwa/src/storage/catalog/aural-header.ts: 52f6fb3845e8b41f04a682f862ba48289a952d5403d4db577068677feab8c9fe
- pwa/src/storage/catalog/aural-header.test.ts: 7dccf40fab2ee1da983e658b1e755c3a7fc0bb63633140b5e78128f7c088e337

No new native capture, actual WASM/browser/fullcatalog proof, RPC, typed target codec, matching/rank/group/UI or complete T15 acceptance. Original catalogs/profiles/native evidence unchanged. Native target reference proceeds independently in preserved sibling; see tasks.json. Do not repeat accepted query/identity/loop/native or2GB catalog proofs.

## 2026-10-18T22:51:47.456504+00:00 — header worker runtime
auralHeader client/RPC uses existing confirmed active/cold recovery once per immutable active attempt, opens readonly DB for command and closes in finally. Confirmation cache clears on error/ownership release; update activeId triggers new validation.30second timeout terminates entire owner and rejects pending work, preserving files. No persistent lease/per-request SQL abort added.

5client tests/682ms, strict full TypeScript, Vite production build and shell7d81ece23bf8 PASS. Actual Chrome/WASM/OPFS/WebLock/IDB:3tests/19.0s PASS, guard window21-header-browser-permitted-first-20261018, actual session53730 exit0. Tested new-worker offline query, active snapshot/count update, malformed non-BLOB rejection with files/users/outbox unchanged, valid-new-attempt retry and actual second-tab ownership/close. Tiny isolated SQLite fixture only; no old catalog/browser/native capture repeated or full-catalog/device performance claim. Original public sources and App UI unchanged.

Initial sandbox guard window21-header-browser-first-20261018 stalled before any test or output: WinError10013 local sockets, process inspection denied. Elevated inspection verified owned Playwright24284(parent7908/controller29608); only that child stopped, original wrapper/guard exited1. Same reviewed source/tests reran with permitted local networking and NEW output directory;0 product assertion failures/fixes. Preserve initial receipt, never label it passed. Final evidence: pwa/.artifacts/pwa-port/aural-read/header-window21-permitted-first/*/proof.json (3files); paths/hashes/values and tested source SHA256 are in T15.headerRuntimeAssignment.validation.

## 2026-10-18T23:00:54.143370+00:00 — bounded selected run row
Native121..132 lookup foundation adds one exact snapshot-bound request ->header/8byte suffix/one bounded run row. Four request fields captured once before SQL; start bounded by suffix array, end preserved as signedInt (including-99), length0..10000. Legacy SQL selects key_json twice without absent modern source column. Native gzip/JSON stays opaque until independent codec stage; no invented musical or whole-array equality check. SQL CASE guards8MiB per compressed BLOB,64KiB UTF8 per key text,4096Unicode points per metadata field before JS materialization; codec further enforces UTF16/decompression/typed budgets.

FIRST real node:sqlite tests11/797ms and strict full TypeScript PASS, guards window21-target-query-tests-first-20261018 / window21-target-query-types-first-20261018. Actual native reference BLOB bytes preserved in actual SQLite, readonly handle used; stale/invalid/missing/type/legacy/large BLOB preselection and key UTF8 limits verified. Source reviewed; exact SHA256:
- pwa/src/storage/catalog/aural-target-query-contracts.ts: 17a9715bc1d7001b78137c9942581ea1923653fa86463e9a38e5b67ad6c2ce2d
- pwa/src/storage/catalog/aural-target-query.ts: 2183eaf37e7d712724540cc8abfc8bc8eec62943aaad9299770789edfbc5b9de
- pwa/src/storage/catalog/aural-target-query.test.ts: b28216cb67a661094d01dc09e80e5aa7952d18f6da74b7eb54d210dc28e14ac7

No native recapture or actual WASM target/decoder/RPC/rank/group/UI/fullcatalog/device claim. Root contracts/query/source ownership remains disjoint from sole worker pure codec.
