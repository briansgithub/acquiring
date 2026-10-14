# T02 data compatibility

2026-10-14. Owner: data_compat worker, requested GPT-6.1 Sol/high; runtime identifier unknown.
Worktree H:/Desktop/Acquiring/Acquiring-pwa-data-compat, branch codex/pwa-data-compat, base bcd59674488d86ca9b8fe7d0e1384194368af386.
Own only pwa/src/domain/data; dependencies, contracts, routes and task records remain coordinator-owned.
Android shipping authority: 801cf7984171d772afc4406ddb5c79c0cb7fd20a; corresponding five source files are unchanged at this worktree base.

Sources: CatalogDisplayName.kt, SectionOrder.kt, HooktheoryDataCompat.kt, HooktheoryModels.kt, DataUtils.kt and MainActivity.kt decodeSongSections consumer.
Native fixture references: CatalogDisplayNameTest, SectionOrderTest, HooktheoryDataCompatTest, KeyChangePlaybackTest. No old web/iOS runtime reused.

Intent: port browser gzip/raw decoding, strict nullable/default model fields, insertion-stable raw section IDs, immutable narrow Piano Man repair, section type dedup/order, limited two-pass entity and Unicode display cleanup, safe IDs and key/tempo metadata.
Next: focused fixtures, strict TypeScript validation, diff review and named-path checkpoint. Source edits use shared coordinator run-control receipts. First source write receipt -01 failed before writing because Windows argument quoting truncated inline source; -02 transported literal content safely and succeeded.
Initial live allowance: 25% five-hour / 39% weekly.

API call shapes:
- decodeSongSections(Uint8Array) -> Promise<Map<string, ExtractedSection>>; decompress(Uint8Array) -> Promise<string>.
- parseSections(jsonText) -> Map<string, ExtractedSection>; invalid JSON/model fields throw, unknown fields are ignored. Parsing applies migration.
- sectionsInSongOrder(ReadonlyMap<string, ExtractedSection>) -> [rawId, originalSection][]; Map preserves integer-like IDs in source order.
- migrateSection(section) -> section; unchanged objects retain identity. migrateSections(map) -> new Map.
- safeSongId/safeNumericId/safeSectionName/safeSongInfo(section) -> string.
- getKeys(section) -> sorted { key: KeyInfo, beat }[]; keyAtBeat(sortedKeys, beat), getKeyAtBeat(section, beat), getParsedKey(section) -> KeyInfo; getBpm(section) -> number.
- displayTitle/displayArtist/formatDisplayName(nullableText), cleanDisplayName(text) operate on display text only.

Limits: gzip requires the browser DecompressionStream; unavailable/failed decompression takes Android raw UTF-8 fallback, which rejects compressed JSON at parsing. No decompression dependency or Node runtime import. Numeric JSON values use JavaScript numbers; current corpus numeric IDs fit the safe-integer range. Unsafe numeric songId/numericId and metadata numericId fail explicitly; string IDs remain unchanged. An arbitrary-precision numeric ID contract is excluded. Tests use node:zlib solely to produce fixture bytes. No browser/device/full-catalog/theory suite is claimed.

Validation2026-10-14:
- Focused fixtures: node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/vitest/vitest.mjs run --root H:/Desktop/Acquiring/Acquiring-pwa-data-compat/pwa --config H:/Desktop/Acquiring/Acquiring/pwa/vite.config.ts src/domain/data: PASS, 5 files / 19 tests. Rerun receipt t02-data-tests-20261014-02 after the fixture typing correction.
- Strict types: node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/typescript/lib/tsc.js --project .artifacts/pwa-port/t02-tsconfig.json: PASS. The ignored local config extends pwa/tsconfig.json with includes restricted to owned data files and paths/types resolving existing primary-checkout dependencies. First check found only fixture-array union inference errors; explicit JsonObject[] table types corrected those. Receipt t02-data-types-20261014-02.
- No worker install or dependency/lock/contract/router changes.
- Recovery: initial fixture command exceeded Windows argument length before controller launch; small batches were used. Shared-controller contention created no run receipt for batches b0..b6; b8 had an explicit Unicode write failure before tests and was fully replaced by c8. Completed source batches c0..c8 and test batches b10/b12 retain immutable receipts under primary .artifacts/pwa-port/runs. Subsequent validation/checkpoint uses this worker worktree controller. All observed failures are reconciled, no command remains running.
- Current allowance at validation boundary: 36% five-hour / 41% weekly.
- Final source review and whitespace/scope checks precede the named-path checkpoint. Coordinator must rerun full integrated checks; no browser/device/full-catalog evidence is claimed here.

Resumption: T02 source and tests are ready for coordinator review/integration; preserve this sibling checkout/branch. No publishing, branch/history rewrite or cleanup performed.
