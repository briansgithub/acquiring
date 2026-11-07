# Repo-side harvest handler (partial T22)

`index.ts` exports `createHarvestHandler(fetcher)`. It has **no default live fetch**, deployment entry/configuration, provider credentials, public route, CORS, cache or rate-limit binding. `npm run build:harvest-worker` creates an ignored ES-module factory bundle in `.artifacts/pwa-port/harvest-worker-bundle/`; it does not deploy anything.

The handler accepts `POST /harvest` with JSON `{ "url": "https://www.hooktheory.com/theorytab/view/artist/song" }`. Success returns one `{song, data, sectionCount}` document. `data` is raw JSON in page tab order (including numeric-like and duplicate-ID map keys); it is not a partially saved catalog. Errors contain `{error: {code, message}}` and no partial document. Statuses: invalid request 400, provider/unsupported extraction 502, no sections 422, byte/section bounds 413, whole-request deadline 504, cancellation 499. No user/catalog storage is imported by this layer.

Source authority is Android `801cf7984171d772afc4406ddb5c79c0cb7fd20a`: `Scraper.kt`, `HarvestService.kt`, `DataExtractor.kt`, `HooktheoryModels.kt`, `SectionOrder.kt`, and `ScraperSectionOrderTest.kt`. The native sources have no diff from the pinned revision.

Implemented source-derived behavior:

- HTML parser selects section tabs in document order; normalized section type deduplicates tabs while shared song IDs remain distinct section types. Fallback container IDs deduplicate by ID and exclude `player`. parse5 is an HTML5 parser, not a regex scraper.
- Fetch each distinct ID once, sequentially; tab labels beat API labels, API labels beat `Section N`. Repeated ID keys use native `id#index-duplicate` collision handling. First API result supplies title and optional artist; URL artist is the fallback.
- Extract object-only chords, arbitrary notes and native metadata/settings fields. Preserve numeric JSON lexemes and API ID text instead of rounding through JavaScript Number. Default empty chords/absent notes follow native serialization. Product `parseSections` consumes the resulting document in tests.
- Fixed page/API origins, GET-only provider calls, no credentials, no redirects, bounded streaming bodies. Supported input paths are ASCII slug segments up to 200 characters (letters/digits/underscore/hyphen). IDs are encoded as one path segment; dot segments/control characters are refused. This URL restriction is a PWA extension, not a claim that native rejects other valid URLs.
- Bounds are explicit PWA extensions: request 4 KiB, page 2 MiB, each API response 4 MiB, aggregate upstream/output 8 MiB, 64 tabs, 20-second whole-request deadline, JSON depth 64/200,000 value nodes, HTML walk depth 256/100,000 elements. Caller abort/deadline never returns a partial success.

## Remaining acceptance

This is a tested request/extraction slice, **not complete T22**. Native inner `jsonData` uses lenient Kotlin JSON; this implementation accepts strict JSON only and refuses unsupported syntax. Native Unicode lowercase titlecasing is not ported; those initial section labels are refused instead of changed incorrectly. parse5 vs Jsoup malformed HTML/text corner cases have only bounded source-derived fixtures, not a full native oracle proof. More permissive native URL forms are also outside this slice.

Local persistence now exists separately as `CatalogWorkerClient.commitHarvest({document, operationId, harvestedAt}, signal?)`. It validates complete ordered sections, derives native alpha/modes and uses the existing guest T06 harvest mutation: record, operation receipt and sequence commit together. Keep operation ID, timestamp and document stable for retry; same-ID conflicting input aborts. A fresh harvest uses a new operation ID. Cancellation before commit rolls back; completed commit wins late cancellation. Cache invalidation follows transaction completion. Catalog slugs including ghost rows retain precedence; catalog.db is never written. No new sync schema or account semantics are added.

Library URL/status/cancel UI and extraction-to-commit handoff, service origin/CORS/cache/rate-limit policy, deployed Worker/provider compatibility and live-service acceptance remain open. Breadth-first next primary gap is T08 trusted-tab stop/explicit-resume proof; avoid polishing T22 before that reassessment.

Tests use only injected responses or a test-only browser module-worker adapter mapping fixed provider URLs to same-origin disposable HTTP fixtures. They do not establish deployed Cloudflare, live Hooktheory, Safari/Pixel, or whole-port parity.
