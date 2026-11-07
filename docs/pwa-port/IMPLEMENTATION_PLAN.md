# Android-to-PWA implementation plan

Status: implementation authorized and underway; current task evidence and resume instructions are in tasks.json and HANDOFF.md. Updated 2026-11-07.
Android authority: `801cf7984171d772afc4406ddb5c79c0cb7fd20a`. Runtime model: unknown.

2026-11-07 owner sequencing: playback UI, singing tool, note/chord cards first; Aural quiz, T15 song-rank, and progression family trees last. Inside that primary band, Android git lineage is the default sequencer/tie-breaker. Breadth-first is sequencing, not acceptance relaxation: bounded tested slices, then iterate; mark gaps; do not polish one feature before other priority flows. Reuse [LINEAGE_PRIORITY.md](LINEAGE_PRIORITY.md) and the existing 262-entry [HISTORY.md](HISTORY.md); do not repeat the ledger. Pinned Android plus accepted contracts remain authority — skip deleted historical designs (puck, calibration, floating transport, six-family landing, background media). Note/chord cards are already accepted. T15 song-rank (`eligibleRankBits`) is Aural-catalog eligibility only.

## Outcome and boundaries

Build a fourth independent `pwa/` project in this monorepo. Port current Android shipping behavior, Android-like appearance, and all reachable Library, detail, Playback, singing, Aural Quiz, queue, playlist and maintenance flows. Android source/tests/comments take precedence over stale handoffs. Use shared data/contracts; the older web and iOS applications are not implementation references.

Confirmed choices: React/TypeScript/Vite; responsive current/previous major Android Chrome, iPhone/iPad Safari, desktop Chromium/Firefox/Safari; full offline catalogs after verified download; guests plus optional cloud accounts; email/password and Google sign-in; fresh profiles without Android migration. Cloudflare Pages/R2/Worker and Supabase Auth/Postgres/RLS. Foreground audio parity. Production infrastructure/account configuration and physical-device evidence are external prerequisites, not reasons to block independent guest implementation.

## Historical conclusions that change the sequence

The 262-entry full-history ledger includes imports, integration merges, reapplications, tests and platform/release work. Implement surviving capabilities once; do not replay commit chronology. Source paths crossed package/brand/subtree boundaries. The early stray outer-repository interval-tool file is not another product implementation. Whole-file recovery copies are archival and are not approved newer behavior.

| Historical chain | Current target | Avoided work |
| --- | --- | --- |
| 9d149952 -> f89a775c -> current MainActivity/PlaybackController | Audio owned by the visible foreground destination; pause on leaving/inactive; explicit Play resumes | Background service, persistent notification, lock-screen and remote transport controls |
| 4bb64d1f/66e7f37c -> 4e1c91b8 -> 45e7012e | Song-specific singing octave -2..+3, independent of source playback | Comfortable-pitch capture, calibration anchors and old tessitura hints |
| febfadae -> 1c674526 -> de8c2891 | Fixed transport row, beat step, reset, section and queue navigation even with dock expanded | Draggable floating transport and spacer-based alignment hacks |
| 69096194 | Block-chord inventory previews, tone cards and ranked transitions | Old Chords arpeggio-speed UI; transport arpeggiation is retained |
| 2f79ed26 -> ef887fbb -> 34f03405 |13 final instruments, Synth Clarinet fallback, grouped menus and normalized per-voice gain | Retired plucked presets and earlier defaults |
| b6b19077/a11f560b -> 10b2dee3 -> ee37a312 | Catalog-first Aural browser; separate adaptive learning engine | Six-family landing and earlier length-first/default grouping |
| e968a210 -> 8bd55189 -> de8c2891 | Examples queue preview; reversible full-order shuffle; generated sections repeat; explicit next/previous | Immediate autoplay, remainder-only shuffle, generated-example auto-advance |
| 3fef49c6 -> 9ab27cee -> 734ab3f5 -> e968a210 | Durable recents, favorites, harvested overlay, named ordered queue snapshots outside catalog | User records stored inside replaceable product databases |
| 40aa1a37/5b2e44f1 and current AuralSession tests | Credit audible exposure only after output reaches source; uncertain history/capture is supported practice | Awarding mastery on Play press, stale microphone frames or recovered unknown exposure |

## Architecture and interfaces to freeze in T01

Use plain TypeScript contracts at subsystem boundaries, independent of React and browser storage:

- `SongId`/section source identity/revision; canonical decoded section/event/onset-key data; source, sounding and display key contexts; resolved chord root, inversion bass and tone labels. Preserve Android spelling and stable IDs, not UI strings as identifiers.
- `CatalogRepository`: scalar paged song browse/search, song/section resolution, Aural groups/ranked pages/children/example candidates, and manifest/install state. Requests carry IDs and cancellation generations; stale responses cannot update newer screens.
- `AudioController`: one application AudioContext, exclusive transport/preview ownership, monotonic position, play/pause/seek/reset/config commands and actual audible-source acknowledgments. Exact captured frequencies bypass musical transpose. UI refresh never drives audio timing.
- Microphone capture requests mono with browser echo/noise/automatic-gain effects disabled where supported. Resample to Android's16 kHz analysis rate with anti-alias filtering; use actual AudioContext output sample rate for synthesis. Verify actual granted settings and physical behavior rather than assuming browser constraints were honored.
- `PitchFrame`: timestamp, voiced/fresh/held/error state, Hz/MIDI/cents/confidence; only fresh accepted frames may score. One microphone owner, explicit request/cancel/teardown. Acquisition uncertainty is not a musical failure.
- `LearningEvent`: stable event/exercise/source IDs, algorithm/schema version, original assessment inputs, assistance and exposure references, timestamp and causal device sequence. Separate target selection, realized example and evidence reducer. Persist exposure before answer eligibility and retain valid progress when optional session state is corrupt.
- User records: namespaced guest/account data, favorite memberships/tombstones, recents, ordered playlist snapshots, song octave settings, durable harvested-song overlay, preferences and immutable learning events. Active playback, permissions, unfinished response and downloaded catalogs remain device-local.

T01 owns these contracts and fixture adapters; later tasks propose changes through that owner. Port Kotlin integer/hash/PRNG, ordering, float tolerance and seed semantics explicitly; JS number coercion must not change catalog IDs or deterministic selections. Preserve input examples and expected Android outputs before writing consumers.

## Dependency-first work packages

`tasks.json` is the machine-readable dependency graph and continuation queue. Every package is further executed in small vertical slices with a saved intent before editing and an independently reviewable checkpoint after validation. No package may consume a whole five-hour window as an indivisible unit.

| ID | Capability / owned area | Requires | Completion evidence |
| --- | --- | --- | --- |
| T00 | Execution/recovery controls, task claims and checkpoint drill | - | Interrupt/resume a harmless docs task; no lost or duplicated claim |
| T01 | PWA scaffold, route/types/fixture contracts, test/build scripts, minimal CI, manifest and cached/deep-linkable shell | T00 | Clean install, typecheck, test and build; shell opens |
| T02 | Payload compatibility, canonical section order, metadata/display names | T01 | Android-equivalent raw/gzip/duplicate-tab/name fixtures |
| T03 | Pitch/key/scale/chord/spelling/voicing/relative-major theory | T01,T02 | Shared corpus plus source/historic/role fixtures and current Kotlin cases |
| T04 | Roman/scale-degree rendering and accessible musical components | T01,T03 | Geometry/semantic cases for extensions, alterations, rests, narrow/large text |
| T05 | SQLite worker, full catalog download/install/update/recovery | T01,T02 | Full-size mobile install/query/offline cold launch; quota/corruption/second-tab recovery |
| T06 | Local user stores, migrations, outbox, guest/account namespaces | T01 | Restart/migration/failure tests; catalog replacement preserves every user store |
| T07 |13-instrument synth and bounded PCM rendering | T01,T03 | Android audio regressions: finite/clipping/gain/envelope/loop/sample-rate cases |
| T08 | Transport, preview ownership, audio acknowledgments and foreground lifecycle | T02,T07 | Seek/config/loop/cancellation races, silent scrub and explicit-resume cases |
| T09 | Microphone/YIN/smoothing/freshness and exclusive capture lifecycle | T03,T07 | Synthetic pitch/noise/harmonic/dropout cases; actual microphone smoke test |
| T10 | Library/search/artist/All Songs/recents/favorites/playlist views | T02,T05,T06 | Debounce, paging, normalization, grouping, retry, Back/focus restoration and rollback |
| T11 | Song Info/Chords, transitions/source links and previews | T02,T03,T04,T06,T08 | Canonical metadata, block previews, transition ranking and route preservation |
| T12 | Full/root-only Playback, cards, timeline, scrub/knobs/section/home controls | T03,T04,T06,T08 | Current layout/gesture/transport contracts; source/display keys and zero-tempo semantics |
| T13 | Singing dock, two-slot/Flip-Flop, persistent practice, run scoring/octave | T09,T12 | Fresh-only median scoring, rest/dropout/seek/permission cleanup and transpose-once |
| T14 | Pure Aural generator/assessment/evidence/scheduler and saved-session repair | T03,T06 | Deterministic Android cases; supported/independent/transfer rules; corrupt-state recovery |
| T15 | Aural catalog query/ranking/modes/groups/search/loop reduction | T02,T05 | Exact ranks/counts/query membership, recursive children, pagination and cold/warm budgets |
| T16 | Corpus example selection, provenance/familiarity/tempo and actual exposure | T08,T14,T15 | Shared selection fixtures, overlaps, audible-start failure and unreliable-history cases |
| T17 | Current catalog-first Aural browser | T04,T06,T15 | Most songs/default 80%/minimum length2..9999, global-vs-matching counts, grouping and restore |
| T18 | Recognize/Recall/Sing/adaptive practice UI | T04,T09,T14,T16 | Prompt/assistance/retry/tab/resume behavior; UI cannot manufacture mastery |
| T19 | Full example queues, reversible shuffle, saved ordered playlist snapshots | T06,T12,T15 | More-than-one-page membership, section hash/unique-name fallback, missing/ambiguous skip |
| T20 | Aural -> full-song Playback -> original exercise/browser round trip | T12,T17,T18,T19 | Draft/tab/scroll preserved; source exploration stays assisted; repeat/navigation final rules |
| T21 | Introduction, offline help, Settings/default/session sound, diagnostics/reset | T06,T08,T12 | One-shot intro, invalid-default fallback, session/default separation, allow-listed export |
| T22 | Fixed-origin Hooktheory Worker plus durable harvested overlay | T02,T05,T06,T10 | Multi-tab section extraction, bounded fetch, offline overlay and catalog-swap preservation |
| T23 | Supabase email/password/Google auth, verification/reset and isolation | T01,T06 | Guest unaffected; email/reset and installed-PWA OAuth return/account switching |
| T24 | Cloud event/outbox replay, conflicts, guest merge and server RLS | T06,T14,T23 | Duplicate/reordered/offline-two-device/skew/partial-merge/auth-expiry tests |
| T25 | Sync wiring for all durable features | T10,T13,T18,T19,T22,T24 | Saved records converge; no microphone audio, catalog files or unfinished answers uploaded |
| T26 | Final install/update/cache compatibility and browser recovery flows | T05,T08,T21,T23,T25 | Offline launch, deferred update, recovery from process/storage loss and schema mismatch |
| T27 | Full parity matrix, accessibility and physical-device verification | T11,T13,T20,T22,T25,T26 | All current shipping capability rows pass with exact source/build/catalog evidence |
| T28 | Preview/release proposal and operational handoff | T27 | Immutable artifacts/checks, account config, rollback and production approval recorded |

### Scheduling and safe parallelism

2026-10-15 readiness refinement:tasks.json preserves all29packages and their full acceptance. A dependency normally requires the whole task to be complete. An explicit `dependencyGates` entry can instead require the named completed milestone on that dependency for bounded implementation. T05.desktop-catalog-runtime is proven by the product installer and actual full-catalog desktop cold-offline evidence; T10/T15/T22 may depend on that milestone. They still own their unimplemented parameterized browse/query/harvest operations. Physical mobile/quota/hosting checks remain open on T05;T26/T27/T28 retain full acceptance dependencies. This avoids stalling guest Library/Aural development while preserving the release gates.

Current validated foundation:T00/T01/T02/T03/T04/T06. T05desktop runtime and T07oscillator core are integrated. Static PCM6de96d44 and Library pure grouping77ec2a87 are now integrated and validated;workers are idle. Streaming/transport and audio-device checks remain open. Next useful parallel pair after its checkpoint is coordinator T10paged read-only Library query contract/fixture proof plus Sol/high T07stream PCM or T14pure learning. Use Luna/medium only once UI props/data/ownership are frozen. Prefer this thin find/play path over expanding more catalog proof without changed source or a materially different quota experiment.

Start T00/T01 serially. Resolve external service prerequisites then, and proceed with guest work while credentials/device access are unavailable. The first technical gate is the actual full-size catalog and a synthesized/microphone proof on iPhone/iPad and Android; small fixtures alone cannot establish feasibility.

After T01/T02, independent lanes are (a) T03 -> T07 -> T08 -> T12 -> T13, (b) T05 -> T15 -> T17, (c) T06 -> T10 and T23. T04 and T14 follow the theory contracts. T16 joins the learning/audio/catalog lanes. T19/T20 join queues, full Playback and learning state. T24 can progress against frozen records before every feature UI exists; T25 connects final consumers. Accessibility/error states belong in each package, not just T27.

The main integration chain is: semantic theory -> synthesis -> owner/transport -> Playback -> microphone practice/exposure -> practice/round trip. Run the full-size storage gate early alongside theory to expose an architecture blocker before extensive UI work. Then prioritize a thin end-to-end download -> find song -> play -> favorite -> restart offline slice before polishing all screens.

Default to one active implementation agent because all agents share the five-hour allowance. Optional authorized parallel work uses at most coordinator plus one worker, with disjoint paths and a stable contract. Catalog/installer and pure theory/audio or local user/auth work are suitable pairs. Do not simultaneously edit the transport owner, learning reducer or shared UI/router. Only coordinator changes dependency versions/lockfile, shared types, CI and root routing. Worker branches use normal sibling worktrees and tested commits; coordinator integrates one at a time and tests the combined tip. Preserve all old recovery worktrees.

Route labels: [least-cost capable] bounded UI/copy/fixture adapters and documentation; [strong reasoning] theory/DSP, large-data persistence, evidence/sync and integration review. Exact model names/costs are not assumed. Request a known materially better switch only when justified by actual availability.

## Storage, sync and release decisions

- Service-worker cache contains versioned shell/WASM/fonts/help, not a multi-GB precache. SQLite WASM SAHPool runs in one worker with explicit safe ownership across tabs; preserve-on-init-failure is enabled. No SharedArrayBuffer dependency. Another tab waits or cooperatively transfers after DB handles close; never force-steal a suspended owner.
- Stage independently gzip-compressed chunks representing8 MiB raw database bytes, with ordered lengths and SHA256 in a PWA distribution manifest tied to unchanged source snapshot/hash. Do not serve chunk objects with HTTP Content-Encoding:gzip. Verify/decompress incrementally into version-named SQLite databases; no whole-database ArrayBuffer. All three Aural files must validate as one snapshot. Product catalogs and user stores remain separate.
- Activation is recoverable across OPFS and IndexedDB: staging -> validated -> active pointer; verify target presence on launch, retain previous catalog through a successful cold launch, recover from any intermediate state. Budget actual published bytes plus compressed staging and retained old files; Aural alone is 1.98 GB installed. Explain insufficient space, keep old usable data and never label an incomplete install offline-ready. Browser eviction/user deletion remain external limitations.
- R2 hosts immutable chunks/data; Pages hosts shell. Worker handles fixed-origin bounded Hooktheory fetch/parse only, with slug validation, redirect/size/time limits, caching and rate limiting. No browser corpus mining, unbounded fetch proxy or long-running catalog job in a request Worker.
- Supabase user data uses RLS with explicit grants and server-only service credentials. Email/password verification/reset and Google OAuth return to the stable PWA origin. First sign-in merges guest data idempotently and does not erase it before server acknowledgment. Account switching never converts prior cached private data into guest data.
- Learning events deduplicate by stable ID, retain assessment inputs/algorithm version and exposure IDs, and replay in Lamport-clock/device-ID/device-sequence order. Canonicalize future timestamps at first server receipt and never let reducer time move backward; retain canonical values on retries. Apply conservative evidence/familiarity rules on merged history. Server revision is a sync cursor, not a replacement for causal ordering. Preferences/favorite operations use last server-accepted operation with tombstones; an old offline edit may therefore become the latest accepted preference. Never replace cloud progress with a client snapshot.
- PWA shell releases declare supported catalog and user schema versions. Never activate an update mid-playback, install, or incompatible migration. Public release requires exact build/source/catalog provenance, operational authentication/sync/download error reporting, rollback, physical-device acceptance and owner approval. Existing app releases remain independent.

## Acceptance and verification limits

T01 defines `typecheck`, `test:unit`, `test:parity`, `test:browser`, `test:recovery`, and `build` npm scripts under pwa/. Run the smallest covering subset for each slice; run all applicable checks on the integration tip. Use bounded logs and record the exact command/revision/result. Tests translated from Kotlin must assert externally meaningful musical/learning behavior, not mirror new implementation internals.

T27 covers physical Android Chrome and installed iPhone/iPad Safari plus desktop Chrome/Edge, Firefox and Safari: large download/retry/quota, offline cold launch and reinstall recovery, simultaneous tabs, microphone refusal/revocation, audio unlock/interruption, touch/keyboard/large text/reduced motion, long progressions, Google redirect, two-device sync and corrupt/partial state. Passing desktop automation does not establish physical microphone accuracy or mobile storage feasibility. Record unavailable hardware/configuration as an explicit open gate and continue independent tasks; never mark unrun evidence passed.

This audit executed no Android/browser/device behavior tests. Historical passing reports establish only their cited old revisions. Source/diff/comment review and ledger/dependency consistency checks are the evidence delivered here. No PWA feature is marked implemented by this plan.

2026-10-15 T08 sequence refinement after pure DSP completion: implement a single foreground output/preview owner around existing renderStaticSamples first, then a stream sink/audio clock around PlaybackPcmRenderer. Frozen AudioEngine.kt23-25,57-90,251-285 establishes device rate,24ms retirement,invalidate-before-fade and consume-once preparation;PlaybackEngine load/play/pauseForLifecycle/pauseForScrub/seek/reset/config/release establishes command revision and user intent separate from delayed published state. Require actual browser unlock/onset/cancellation/foreground receipts before any runtime milestone;no current audible claim. T14pure learning can proceed independently after local audio contracts freeze,with one worker maximum. T10Settings Back scroll remains an explicit failed gate pending owner permission under the two-cycle rule;it does not block independent audio/learning work.

2026-10-16T02:02Z sequencing refinement:T08static-preview-runtimeisacompletedexplicitmilestone(348unit/input/types/build,8actualChrome13.8s+1unproventrustedtabfixme). T11SongInfo/ChordsneedsstaticpreviewsandcanproceedagainstthismilestonebeforefullstreamingT08. T12Playback/T26releasegatesstillrequirewholeT08. SharedApplicationAudioContextandPreviewOwneralreadyvalidatedmustbereused;Appintegrationandspecificdevicechecksremainrequiredineachconsumingfeature. NextT08boundedpureclockheadhelperthenstreamworker/sink/commandintent;T11data/routecontractcanprogressinparallelwithoneworkermaximum.

2026-10-17T11:35:13.258028+00:00 Explicit T12developmentgate refinement: accepted T08composed-stream-runtime8ee74c09(186units/types/build +4Chrome) permits bounded puresectionmodel and later product Playback development. T08parent/mobile/trustedtab and T26/T27release gates remain open/full. First root slice ports nativePlaybackView melody/baseFloatBPM andPlaybackTiming audible-end only; sourcebounds/newnativeleafcases, no component reimplementation or Android build. One disjointSol/high T14read-onlyproposal. Weekly100override/fivehour70/80 rules remain.
