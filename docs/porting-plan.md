# Android-to-iOS parity migration plan

This is the execution plan for the native iOS port. Android behavior at the annotated `android-parity-ios-v1` tag is the product baseline; stable capability IDs and current implementation status live in [feature-parity.md](feature-parity.md), and the audited Android behavior lives in [android-app-analysis.md](android-app-analysis.md).

## Scope and release contract

- iOS v1 targets the **52 observable shipping capabilities** among F001–F055. F013 (dormant missing-payload fallback), F052 (backend-only custom-playlist management), and F055 (unused audiation container) are explicitly **Deferred**.
- The deployment target is iOS 17 or later on iPhone and iPad, in portrait and landscape.
- The first release remains English-only and dark. Dynamic Type, VoiceOver actions, reduced-motion behavior, adaptive layouts, and background audio are release requirements.
- Runtime source is native to each platform. The shared catalog contract, parity corpus, fixtures, and observable Android behavior—not line-by-line Kotlin translation—define parity.
- Audio parity is behavioral and perceptual: pitch, onset, duration, envelopes, controls, cancellation, scoring utility, and state transitions must match. PCM bytes need not be identical.

## Reference lock and change control

The audited Android/docs state is committed at `d7620518` and pinned by the annotated tag `android-parity-ios-v1`. Android remains authoritative for this port. Every later Android change must be classified against an existing parity ID, assigned a new appended ID, or explicitly rejected from iOS v1 scope; it must not silently enlarge the target.

## Architecture decisions

| Concern | iOS decision |
| --- | --- |
| Runtime organization | Local package `AcquiringKit` with `AcquiringCore`, `AcquiringCatalog`, and `AcquiringAudio`; SwiftUI features, SwiftData, navigation, and composition remain in the app target. |
| Language/concurrency | Swift 6 language mode, strict concurrency, `@MainActor @Observable` feature stores, actors for mutable subsystem ownership, and `Sendable` domain values. |
| Dependency ownership | One injected `AppEnvironment`; SwiftUI views do not open GRDB, SwiftData, URLSession, or AVAudioEngine directly. |
| Navigation | Explicit Library, Artist, All Songs, Playlist, Song Detail, and Quiz routes. Opening a song pushes detail then Quiz so Back is Quiz → Info → original parent. |
| Catalog | GRDB.swift over the replaceable schema-v3 SQLite artifact in Application Support, excluded from backup. The 40,609 rows are not imported into SwiftData. |
| Catalog replacement | Stream download to a temporary archive, inflate gzip with zlib when needed, repair compatible v1/v2 staging candidates, validate contract/quick-check/row floor/payloads, close the live pool only for swap, preserve a backup, and reopen or recover. |
| Maintenance | Read-oriented repository plus a separate service for full install and visible single-song harvest. Accept gzip and raw JSON payloads. |
| User data | SwiftData schema v1 with string playlist IDs, built-in `favorites`, cascade entries, deterministic membership keys, and loose catalog-slug references. No custom playlist management UI in v1. |
| Theory/rendering | Port and test pure music rules first. Render notation with SwiftUI Canvas/Core Graphics/Core Text and preserve parsed meaning, fitting, and accessibility rather than Android font pixels. |
| Audio | One app-scoped owner of AVAudioSession and AVAudioEngine. Pure PCM renderers feed source nodes; render callbacks allocate nothing and never await. Preview and looping transport remain isolated. |
| Microphone | Input-node tap converted to mono 16 kHz; retain YIN, RMS/confidence gates, smoothing, scoring, tessitura rules, and exclusive ownership. FFT substitution is not parity. |
| Platform media | Audio background mode, Now Playing, remote commands, interruptions, and route-change handling. iOS has no Android notification-permission equivalent. |
| Observability | Privacy-safe Logger categories and signposts for catalog installation, audio underruns, routes/interruptions, and microphone initialization. No analytics or third-party crash SDK. |

Package versions are exact and recorded in `Package.resolved`: GRDB.swift 7.11.1 and SwiftSoup 2.9.6.

## Interfaces and data contracts

`CatalogRepository` returns `Sendable` values and covers status/count, song lookup, paged title and artist suggestions, title search, artist results, browse metadata/counts/rows, recent-slug resolution, and decoded song sections. `CatalogMaintenanceService` exposes install and harvest as `AsyncThrowingStream<CatalogProgress, Error>` with connecting, downloading, preparing, validating, installing, and completed stages.

`CatalogCoordinator` owns the GRDB pool and catalog lifecycle. Reads continue during download and validation and pause only for close/swap/reopen. `CatalogConfiguration` injects the distribution URL and bundled `contracts/catalog/contract.json`. Downloaded candidates must satisfy schema 3, required tables/columns/indexes, `PRAGMA quick_check`, at least 40,609 browse rows, and non-null payloads for every browse row. A local empty schema-v3 database is valid only as a pre-install/manual-harvest bootstrap and is exempt from the distribution row floor.

SwiftData schema v1 contains:

- `PlaylistRecord(id: String, name: String, isBuiltIn: Bool, createdAt: Date)`
- `PlaylistEntryRecord(uniqueKey: String, playlistID: String, slug: String, addedAt: Date)`

`UserLibraryStore` ensures Favorites, queries membership and summaries, toggles membership with recoverable UI state, returns newest-first slugs, and removes entries. Entries cascade when a non-built-in playlist is deleted. There is no object relationship to catalog rows. `HistoryStore` uses namespaced UserDefaults arrays with ten-item, most-recent-first semantics and Android-equivalent artist canonicalization.

`PreviewAudio`, `QuizTransport`, and `PitchSource` are app-scoped protocols. Transport and pitch observations use AsyncStream, and the subsystem owner serializes commands. All feature stores use explicit idle, loading, content, empty, and failure states and typed subsystem errors.

## Seven implementation milestones

| Milestone | Outcome | Exit evidence |
| --- | --- | --- |
| 1. Reference lock and foundation | Baseline tag, local package, Swift 6, pinned dependencies, DI, typed errors, shared fixture loaders | CI builds every target and the shared fixtures execute in Swift |
| 2. Catalog integrity and core domain | Bootstrap/query/install/harvest plus theory, chord, interval, timing, and tessitura rules | Corpus passes; damaged candidates never replace live data; real catalog meets contract and performance budgets |
| 3. Library and navigation vertical slice | Library, search, recents, Artist, All Songs, playlists, explicit routes, state restoration | Every discovery path opens Quiz first and returns through Info to its exact parent on iPhone and iPad |
| 4. Song details, theory UI, and previews | Sections, Info, Chords, links, notation, and finite preview synthesis | Complex chords render semantically; cancellation/fades and representative real-song metadata match |
| 5. Quiz transport and background audio | Pure loop renderer, Full/Simple modes, controls/cards/scrub, Now Playing/remotes/interruptions/routes | DSP/timing tests pass and physical-device background, lock-screen, interruption, and headphone scenarios pass |
| 6. Microphone and vocal practice | YIN pipeline, sing-back, intervals, target listening, Flip-Flop, persistent scoring, tessitura | Recorded PCM fixtures and the physical device/route matrix pass; simulator-only evidence is insufficient |
| 7. User data, accessibility, and release hardening | Favorites/playlist browse/remove, durability, Dynamic Type, VoiceOver, reduced motion, adaptive layouts | All 52 in-scope IDs meet implementation, automated test, device, failure-state, and accessibility gates |

Once foundation interfaces are stable, catalog/Library, theory/rendering, and the pure audio renderer can be developed independently. A single integrator owns `AppEnvironment`, navigation, audio-session policy, and parity status so the app does not acquire competing lifecycle models.

## Testing, acceptance, and rollout

- Port platform-neutral Android tests before or with implementation: theory corpus, enharmonics, voicing, section order, timing, intervals, scoring, tessitura, deterministic audio pitch/onset/fades/clipping/loop seams/cancellation/gain, and prerecorded microphone pitch/silence/noise/octave/dropout fixtures.
- Use miniature catalogs for ordering, 20-row pagination, fuzzy matching, v1/v2 repair, missing payloads, malformed JSON, corrupt gzip, missing indexes, quick-check failure, insufficient row count, interrupted swap, and backup recovery.
- Test SwiftData uniqueness, rollback, cascade, missing slugs, and persistence across catalog replacement.
- Use XCUITest for discovery → Quiz → Info → parent, state restoration, maintenance errors, permission denial, microphone cancellation, and explicit accessibility actions on an iPhone and iPad simulator.
- Require signed physical checks on a small iPhone, current standard iPhone, and iPad, including speaker/mic, available headphones and Bluetooth, screen lock, backgrounding, interruptions, and remote commands.
- A feature becomes **Complete** only after implementation, automated tests, required physical evidence, empty/error paths, and accessibility behavior pass. Ship milestone builds via TestFlight; public parity waits for all 52 in-scope IDs.
- Before release, run clean-install/full-catalog, prior-TestFlight upgrade, airplane-mode launch, interrupted-download recovery, background transport soak, and microphone privacy review. Monitor Organizer crashes/hangs and privacy-safe OSLog diagnostics after release.

## Current implementation checkpoint

The reference lock, package boundaries, exact dependencies, schema-v3 bootstrap, GRDB repository, staged installer/validator, visible harvest service, core theory corpus, Android-equivalent chord inversion/applied/borrowed voicing, duration-aware Quiz active-event and interval derivation, singing-target/tessitura session rules, relative-Ionian fixed-context rules and Quiz toggle, native fitting Roman/scale-degree Canvas renderers, bounded sample-tested waveform/preview/loop renderers, progress/play-state-preserving transport reconfiguration, SwiftData user schema, history, explicit route graph, initial Library/All Songs/detail/Quiz views, app-scoped audio session, remote commands, production-wired standard/fast mono-16-kHz YIN plus smoothing paths, and the portable persistent-melody run-scoring rules now exist. The package passes 112 tests and the full Swift 6 app builds, but the parity checklist intentionally leaves most capabilities Partial until their full UI semantics and device gates pass.

## Barebones iPhone checkpoint and deferred backlog

The immediate product target is now a minimal on-device smoke build, not full feature parity. Because the test iPhone is electrically visible over USB but is not available to Xcode's device services, TestFlight is the selected internet-delivery path. Work resumes on the parity milestones after the current app is installed, launched, and exercised on that iPhone. The checkpoint status is:

1. **Complete:** the account holder accepted the first-use App Store Connect agreement.
2. **Complete:** the explicit App ID and private App Store Connect record use bundle ID `com.acquiring.ios`; the App Store Connect app ID is `6807512572`.
3. **Complete:** Xcode created cloud-managed Apple Distribution assets and the App Store profile, build 1 was archived and validated, and the signed package was uploaded successfully. Apple finished processing version 1.0 build 1 on September 1, 2026. The automatically distributed `Acquiring Internal Testers` group has one build and the account holder is Invited; tester-facing smoke instructions are saved.
4. **Pending device action:** accept the invitation and install Acquiring in TestFlight on the iPhone, then smoke-test launch, adaptive layout, Library empty state, catalog action entry points, basic navigation, background/foreground transitions, and a clean relaunch. Audio and microphone approval remain separate device gates.
5. **Optional later:** if USB pairing becomes available, register the device and add direct Debug installation and debugger evidence without making it a prerequisite for the internet-delivered smoke build.

Deferred feature work and known gaps are intentionally retained here:

- Catalog/Library (F002–F012): finish 20-row UI paging, fuzzy equivalence, focus-specific recents, legacy warnings, list restoration, v2/failed-swap fixtures, and real full-catalog performance/recovery evidence.
- Song/theory UI (F014–F024): finish every-origin Back restoration, representative section fixtures, complete source metadata, adaptive chord grid, renderer snapshots, and device visual acceptance.
- Quiz/transport (F025–F039): add the complete melody/key timeline, tap and inertial scrubbing, draggable/reset controls, zero-tempo policy, remaining card layout semantics, gain smoothing, and physical background/interruption/headphone/Bluetooth tests.
- Microphone/vocal practice (F040–F049): add prerecorded capture fixtures and device permission/ownership tests; implement Flip-Flop (F045); make persistent targets follow root, melody, and chord-tone changes (F046); connect the tested melody marker/run scorer to the live timeline (F047); and finish tessitura presentation/continuity integration.
- User data/platform (F050–F054): verify optimistic rollback, playlist restoration, survival across catalog replacement, VoiceOver custom actions, Dynamic Type, reduced motion, iPhone/iPad layouts, and the complete physical-device matrix.
- Deferred by product decision: F013, F052, and F055 remain out of iOS v1.

Known environment and integration issues at this checkpoint:

- macOS sees the connected iPhone on USB, but `devicectl`, `xcdevice`, and Xcode destinations do not expose it. Wi-Fi debugging also requires an initial device pairing, so TestFlight—not remote Xcode debugging—is the viable internet path.
- The Apple portal confirms an active Individual Apple Developer Program membership through September 2027, and the project is bound to Team `XJHRX7Q6U9`. The local keychain has valid Apple Development identities, while Xcode successfully uses a cloud-managed Apple Distribution certificate and the App Store profile `iOS Team Store Provisioning Profile: com.acquiring.ios` for TestFlight exports.
- The Team has no registered devices. Automatic development signing therefore cannot create an iOS App Development profile, but TestFlight distribution succeeds without a registered device. The current no-device archive path builds arm64 unsigned, stages an ad-hoc archive, and lets Xcode apply the cloud-managed App Store signature during export; exports must use the system tool path to avoid the incompatible Homebrew `rsync` option handling found on this host.
- App Store Connect Terms are accepted. The private Acquiring app record and explicit App ID exist for `com.acquiring.ios`, and build 1 uploaded and processed successfully on September 1, 2026. It is attached to the automatically distributed internal group, the account holder is Invited, and no public submission or release has occurred.
- A 1024×1024 opaque App Store icon, explicit background-audio plist entry, microphone purpose text, export-compliance declaration, local-only required-reason privacy manifest, and automatic TestFlight export options are configured. The exported 6 MB IPA passes strict signature verification, contains an Apple Distribution signature and TestFlight entitlement, includes both app and GRDB privacy manifests, and targets iPhone/iPad arm64 on iOS 17 or later.
- After terminating two stale hour-old `simctl` operations and rebooting the runtime, the app installs and launches on an iPhone 17 simulator. The first-launch Library empty state was visually verified. The standalone package passes all 112 tests, while Xcode-hosted unit/UI test sessions still stall waiting for simulator test workers to materialize; that remaining runner issue is environmental rather than an app test failure. A later `MobileCal` watchdog crash was isolated to Apple Calendar in a dedicated simulator and not to Acquiring or the physical iPhone; that simulator was shut down.
- The persistent melody scoring domain is tested but deliberately not connected to the Quiz UI yet.
- A newly bootstrapped catalog is empty until download or manual harvest succeeds, so empty Library UI on first launch is expected rather than proof of catalog failure.

## Five highest risks

1. Real-time synthesis and background continuity across interruptions, route changes, view lifetimes, and remote commands (F027, F038–F039).
2. YIN/DSP and vocal-practice behavior across physical devices, latency profiles, and audio routes (F040–F049).
3. Failure-safe replacement of the large compressed SQLite catalog without affecting durable user data (F010, F012, F053).
4. Enharmonic, chord-voicing, relative-Ionian, and fitted notation equivalence on edge cases (F021–F024, F037).
5. Converting implicit navigation, gesture, saved-state, and lifecycle contracts from the Compose entry point into explicit Swift ownership (F014, F025, F035, F041, F054).

## Resolved assumptions and remaining questions

Resolved for iOS v1: iOS 17+, iPhone/iPad and both orientations; background audio; the pinned catalog URL/schema-v3/40,609-row distribution contract; visible manual harvest; deferred F013/F052/F055; dark English UI; Dynamic Type, VoiceOver, reduced motion, and adaptive layout release gates; no authentication, analytics, crash SDK, cloud sync, billing, import/export, or Bluetooth-specific product feature.

Remaining questions requiring product or release evidence:

1. Which exact small iPhone, current iPhone, iPad, headphone, and Bluetooth models comprise the signed physical-device matrix?
2. What are the exact YouTube lookup/failure/region semantics for F017? Hooktheory links are defined, but Android’s external-video behavior still needs an iOS policy.
3. What quantitative launch/search/install memory and latency budgets must the real 40,609-row catalog meet?
4. What perceptual listening procedure and tolerance determines waveform parity for the ten instruments?
5. Who signs the TestFlight evidence for each feature and owns post-baseline Android parity triage?

## Recommended porting sequence

1. Lock reference/contracts and keep package/domain fixtures green.
2. Finish catalog integrity and pure theory semantics.
3. Complete Library/search/browse/navigation restoration.
4. Complete song details, notation, and finite previews.
5. Complete quiz transport together with background media behavior.
6. Complete hardware microphone/vocal practice.
7. Finish durable user data, accessibility, adaptive layout, recovery, and release evidence; keep F013, F052, and F055 Deferred.
