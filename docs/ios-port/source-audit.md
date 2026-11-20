# Android to iOS source audit

Android-to-iOS source audit at main `c58f9fcd`. GPT-6-Astra at high. Repository remained read-only. This completes the audit, not the port. No iOS tests, builds, simulator sessions or device checks ran. No expensive suites ran. No workers, PRs or merges were created.

The companion inventory is `commit-inventory.json`. It contains every commit in `4d847e27..c58f9fcd`, exact changed paths, feature/batch associations, all inherited historical audit rows without altered statuses, and the separate local PR #52 branch inventory.

## Conclusions

The existing Swift app already has catalog acquisition, theory contracts, playback/preview synthesis, cards, singing ownership, durable Favorites and browse UI. Preserve it. The main gaps are durable song settings and octave state; melody-function and spoken-cue rendering; Song-mode continuation; new playback/Library controls; and the entire Aural catalog, queue and learning subsystem. The iOS tree contains no Aural or song-queue files.

Build the pure models and storage before their UI. Keep ordinary playback batches ahead of the Aural screens. B07 may be prepared independently after B00, but it is required for the complete Library example-shuffle feature. B09 can proceed after its listed dependencies without waiting for the Library screen. No parallel workers are proposed for this audit.

PR #52 is pending and excluded from baseline. Mainline voice gain is 1.4, mainline default is Loop, and foreground-only playback remains authoritative. Do not merge `android-bg-media-voice`. Do not touch `fix/android-timeline-scrub` or other worktrees.

## Evidence and scope

- Main was clean at start. Last commit touching `ios/` is `4d847e27`; current main is `c58f9fcd`; native authority remains `3c887223`.
- Complete post-iOS metadata inventory: 430 commits, 46 touching Android/contracts when merge-parent changed paths are included. Merge entries are integration records, not duplicate product features.
- Reused 262 frozen historical rows from the three `docs/pwa-port/history-*.json` files, 58 feature-ledger groups, and the additive N06-N16 delta. Frozen PWA authority `801cf798` includes rehashed lineage; subject matches are labeled as such, not asserted to be patch-identical.
- Read house rules, ios/AGENTS.md, docs/ios-port-plan.md, docs/porting-plan.md and docs/pwa-port/HANDOFF.md. Used feature-parity.md, the PWA JSON inventories and contract source evidence. Bounded source/test inspection is detailed below. Historical records were not promoted to passing/approved.
- Phase 0 results supplied by the user and recorded in the ledger are historical evidence: 1,291 PWA unit tests, parity/build and shared contracts passed. This audit did not rerun them. The Phase 0 unchecked fast-forward/push boxes are stale relative to the user receipt; lead should reconcile them.
- Local branch references were read without checkout/fetch. PR #52 remote head/state and the other owner branches were not tested. No PR was worked on as an implementation/review task or linked; it is a pending dependency reference only.

## Source findings that change the plan

1. `ios/Acquiring/Infrastructure/AppEnvironment.swift:499` returns only the current song continuity; `rememberQuizSettings` at line 537 changes memory. Android `SongPlaybackSettingsViewModel.kt:77` resets defaults on entry, then guards asynchronous reads by generation and edit state. This is a persistence and ownership change, not only new controls.
2. `ios/Acquiring/Features/VocalPracticeModel.swift:401` updates an in-memory octave; lines 579 and 630 reset it. Android saved octave state predates the last iOS change. A newer iOS timestamp therefore does not establish prior parity.
3. `ios/Packages/AcquiringKit/Sources/AcquiringAudio/QuizPCMRenderer.swift:181` always wraps at loopFrames. Android `PlaybackEngine.kt:635` advances through queued sections and emits splice metadata at line 675; the worker consumes it at line 1124. Port the clock and renderer together.
4. `ios/Acquiring/Infrastructure/AudioSystem.swift:106` creates a 48 kHz graph. Android playback is 44.1 kHz and spoken source clips are 24 kHz. PWA bit-exact output cannot be copied into an iOS success claim without controlling sample format/rate.
5. `ios/Acquiring/Features/PlaybackKnob.swift:56` puts the value above the dial, so N13 remains a real layout delta despite existing rotary interaction. `SongViews.swift:3029` and `LibraryViews.swift:788` retain the retired frame-rate preference.
6. `ios/Acquiring/Infrastructure/AudioSystem.swift:119` clears Now Playing metadata and explicitly retains foreground-only playback. The old F039/F1/F2 descriptions must not cause restoration of retired background behavior before the pending policy is approved.
7. `AuralCatalog.kt` supports v1-v3, source-key provenance, ranking/query/grouping and bounded readers. `AuralCatalogStore.kt:14` has prepared-resource leases and replacement ordering. Reuse those semantics with the existing Swift catalog boundary; do not treat the simple corpus schema as sufficient for the full catalog.

## Dependency-ordered batches

Every batch below is a proposal for the lead. New Swift filenames are explicitly identified as proposals; the listed iOS paths otherwise exist and are integration points. Split substantial batches into small behavior-complete commits. Checks are future procedures unless the audit verification section says otherwise.

### B00. Pin contracts and retain review history

Depends on: none. Feature groups: R01, R02, I01, I02, I03, I04, X01, X02, D01, D02, D03, D04, D05, D06.

Freeze main c58f9fcd and native 3c887223. Preserve source-truth fields separately from generated parity expectations. Existing GRDB catalog replacement and SwiftData user storage remain. Check older import, lenient JSON, repeated section identity and recovery semantics against existing implementations before assigning edits. Do not import PWA auth, sync or service-worker requirements into native scope.

Android source:
- `android/app/src/main/java/com/acquiring/android/HarvestLedger.kt`
- `android/app/src/main/java/com/acquiring/android/HooktheoryDataCompat.kt`
- `android/app/src/main/java/com/acquiring/android/DataExtractor.kt`
- `android/app/src/main/java/com/acquiring/android/DatabaseDownloader.kt`

Swift integration points:
- `ios/Packages/AcquiringKit/Sources/AcquiringCatalog/HarvestLedger.swift`
- `ios/Packages/AcquiringKit/Sources/AcquiringCatalog/HooktheoryHarvester.swift`
- `ios/Packages/AcquiringKit/Sources/AcquiringCatalog/CatalogCoordinator.swift`
- `ios/Packages/AcquiringKit/Sources/AcquiringCore/ChordInterpreter.swift`

Android regression references:
- `android/app/src/test/java/com/acquiring/android/ChordRoleContractTest.kt`
- `android/app/src/test/java/com/acquiring/android/HooktheoryDataCompatTest.kt`
- `android/app/src/test/java/com/acquiring/android/HarvestLedgerTest.kt`

Procedural checks:
- Compare contract consumers and immutable truth fingerprints without regenerating fixtures. Reconcile F IDs and later dispositions in the lead plan. Inspect changed hunks for any catalog migration before choosing it.

Unknowns and boundaries:
- Historical source accuracy retains an unresolved Lady Gaga pitch field and explicit altered-fifth eleventh boundary. This audit does not resolve either. Catalog replacement/recovery requires later runtime checks.

### B01. Older singing and navigation gaps

Depends on: B00. Feature groups: S01, S02, S03, S04, S05, S06, S07, N02, N03, N05, V01, V03, V04, V07, N01.

Persist singer octave by song slug, retaining -2..+3 and transpose-once. Swift currently resets octave to zero on a song change and holds it only in VocalPracticeModel. Key-aware singing labels already landed in 4d847e27 and must not be ported twice. Keep header monitoring, Full timeline feedback and Root gauge. Verify title expansion/help interception, collapsed Stop and route cleanup against the current callers. Keep removed tessitura and unreachable chord-tone monitoring removed.

Android source:
- `android/app/src/main/java/com/acquiring/android/SongOctaveOffset.kt`
- `android/app/src/main/java/com/acquiring/android/SongOctaveOffsetViewModel.kt`
- `android/app/src/main/java/com/acquiring/android/HummingIntervalPopup.kt`
- `android/app/src/main/java/com/acquiring/android/PersistentPlaybackPitchPractice.kt`
- `android/app/src/main/java/com/acquiring/android/PlaybackDestination.kt`
- `android/app/src/main/java/com/acquiring/android/PracticeNavigation.kt`

Swift integration points:
- `ios/Acquiring/Features/VocalPracticeModel.swift`
- `ios/Acquiring/Features/VocalPracticeViews.swift`
- `ios/Acquiring/Features/QuizCards.swift`
- `ios/Acquiring/Features/QuizHelpOverlay.swift`
- `ios/Acquiring/Features/SongViews.swift`
- `ios/Acquiring/Infrastructure/AppEnvironment.swift`
- `ios/Acquiring/Infrastructure/MicrophoneSession.swift`

Android regression references:
- `android/app/src/test/java/com/acquiring/android/SongOctaveOffsetViewModelTest.kt`
- `android/app/src/test/java/com/acquiring/android/PersistentPlaybackPitchPracticeTest.kt`
- `android/app/src/test/java/com/acquiring/android/SingingTargetsTest.kt`

Procedural checks:
- Use existing VocalTargetParityTests.swift and PersistentPitchPracticeTests.swift as insertion points for targeted cases only. Trace first permission, 800 ms target handoff, immediate operational cancellation versus closing animation, stale reading exclusion and exact-Hz replay. Review 500 Miles song switch, same-song section switch and relaunch once a simulator exists.

Unknowns and boundaries:
- Durable octave restoration is a confirmed gap; the remaining gesture/animation items are source-review candidates, not all confirmed defects. Historical VoiceOver work is explicitly deferred. Physical capture and timing remain unverified.

### B02. Durable per-song playback settings

Depends on: B00. Feature groups: N10, V02.

Add durable settings keyed by slug for lock, tempo, arpeggio, mix, nullable instrument override, transpose, cue, voice volume and Loop/Song. Existing QuizContinuityState is app-lifetime single-song state, not durable storage. Publish defaults immediately on song entry, retain settings across sections, reject obsolete reads and reads after an edit, coalesce writes without losing earlier songs. Mainline defaults to Loop and voice volume 0.5. A null instrument tracks Settings default. Do not persist Full/Root or selected section as part of this Android row.

Android source:
- `android/app/src/main/java/com/acquiring/android/SongPlaybackSettings.kt`
- `android/app/src/main/java/com/acquiring/android/SongPlaybackSettingsViewModel.kt`
- `android/app/src/main/java/com/acquiring/android/UserDataDatabase.kt`
- `android/app/src/main/java/com/acquiring/android/PlaybackDestination.kt`
- `android/app/src/main/java/com/acquiring/android/InstrumentSession.kt`

Swift integration points:
- `ios/Acquiring/Infrastructure/AppEnvironment.swift`
- `ios/Acquiring/Infrastructure/UserLibraryStore.swift`
- `ios/Acquiring/PlaylistRecord.swift`
- `ios/Acquiring/Features/SongViews.swift`
- `ios/Packages/AcquiringKit/Sources/AcquiringAudio/AudioContracts.swift`

Android regression references:
- `android/app/src/test/java/com/acquiring/android/SongPlaybackSettingsViewModelTest.kt`
- `android/app/src/test/java/com/acquiring/android/SongQueueMigrationTest.kt`

Procedural checks:
- Port eight SongPlaybackSettingsViewModelTest scenarios: missing row writes nothing; round trip; immediate defaults; same-song no-op; edit wins over read; old-song read rejected; invalid fields/defaults/null; coalesced ticks. Inspect SwiftData registration in AppEnvironment before selecting a record or dedicated store.

Unknowns and boundaries:
- New Swift storage schema and error presentation need design at implementation time. The older roadmap claim that no migration is needed predates these features. Do not apply PR52 gain/default changes.

### B03. Melody function and cue metadata

Depends on: B00. Feature groups: N08.

Port pure classification and timeline annotation before the speech renderer. Preserve chord roles, diatonic/chromatic movement, rests breaking neighbor connections, anticipation, suspension, retardation and chord-member labels. Keep sit/lean/move/outside colors and one/two-word cue vocabulary. Do not infer roles from MIDI position alone. Mainline melody register has a rising B4-to-C5 exception; a strict B4 ceiling belongs to pending PR52.

Android source:
- `android/app/src/main/java/com/acquiring/android/MelodyFunction.kt`
- `android/app/src/main/java/com/acquiring/android/PlaybackMelodyFunction.kt`
- `android/app/src/main/java/com/acquiring/android/MusicTheory.kt`
- `android/app/src/main/java/com/acquiring/android/PlaybackEngine.kt`
- `android/app/src/main/java/com/acquiring/android/SpokenRootDegrees.kt`

Swift integration points:
- `ios/Packages/AcquiringKit/Sources/AcquiringCore/MusicTheory.swift`
- `ios/Packages/AcquiringKit/Sources/AcquiringCore/Models.swift`
- `ios/Packages/AcquiringKit/Sources/AcquiringCore/QuizIntervalState.swift`
- `ios/Packages/AcquiringKit/Sources/AcquiringAudio/AudioContracts.swift`
- `ios/Acquiring/Features/QuizCards.swift`

Android regression references:
- `android/app/src/test/java/com/acquiring/android/MelodyFunctionTest.kt`
- `android/app/src/test/java/com/acquiring/android/SingingMelodyRegisterTest.kt`
- `android/app/src/test/java/com/acquiring/android/SpokenModePitchTest.kt`

Procedural checks:
- Reuse pwa/src/domain/music/melody-function.test.ts and Android native cases. Verify actual role labels from chord_role_contract.json. Compare source onset keys, Lock in Major and transformed melody register separately.

Unknowns and boundaries:
- Swift package has the underlying theory but no MelodyFunction equivalent. New pure Swift file is reasonable; proposed location is Sources/AcquiringCore/MelodyFunction.swift. No Swift compile evidence exists.

### B04. Pulses, speech clips and renderer gain

Depends on: B02, B03. Feature groups: N06, N07, P02, P04.

Implement Root Pulses and Harmonic Distance with tonic hold and distance-plus-one non-tonic pulses. Pulses replace chord synthesis and suppress its arpeggiation while retaining melody. Spoken Number and Sung Number + Details use exact clips, accidentals before number, full suffix names and independent voice gain. Root-voice mode announcements occupy a separate window at the end of the preceding chord, pitched to the new tonic C3-B3 with transpose. Lock in Major suppresses mode announcements. Mainline gain ceiling is 1.4 and soft knee 0.85 with tanh saturation. Live gain/tempo/seek must not restart completed phrases.

Android source:
- `android/app/src/main/java/com/acquiring/android/PlaybackEngine.kt`
- `android/app/src/main/java/com/acquiring/android/SpokenRootDegrees.kt`
- `android/app/src/main/java/com/acquiring/android/PlaybackController.kt`
- `android/app/src/main/java/com/acquiring/android/SynthVoice.kt`

Swift integration points:
- `ios/Packages/AcquiringKit/Sources/AcquiringAudio/QuizPCMRenderer.swift`
- `ios/Packages/AcquiringKit/Sources/AcquiringAudio/AudioContracts.swift`
- `ios/Acquiring/Infrastructure/AudioSystem.swift`

Android regression references:
- `android/app/src/test/java/com/acquiring/android/PlaybackRootDegreeCueTest.kt`
- `android/app/src/test/java/com/acquiring/android/SpokenModePitchTest.kt`
- `android/app/src/test/java/com/acquiring/android/PlaybackAudioGlitchTest.kt`

Procedural checks:
- Read sonic/Sonic.java and reuse native-sonic.json, native-cue-stream.json and native-stream.json under pwa/src/audio/synth/fixtures. Verify clip SHA-256 against pwa/public/voice manifest and Android raw assets. Port focused cue tests before wiring UI. Compare deterministic PCM at a controlled common sample rate; separately check conversion to the existing 48 kHz iOS graph.

Unknowns and boundaries:
- Android uses 44.1 kHz PCM16 output and 24 kHz speech clips; iOS uses Float output at 48 kHz. Existing PWA bit-exact evidence does not establish Swift equality. Clip delivery/cache policy for iOS must be selected; Android bundles clips and PWA downloads on demand. Never synthesize replacement system-TTS voices silently.

### B05. Song mode and gapless section continuation

Depends on: B02, B04. Feature groups: N11, P01, P03, G01, G02.

Add continuation across canonically ordered sections and wrap to the first. Loop repeats the active section. Preserve fractional overshoot and perform section switches inside a render block with frame-indexed clock metadata. Toggling mode preserves playhead and intent; explicit section selection still respects the approved iOS paused-at-start override. Current Swift renderer unconditionally reduces timelineFrame modulo loopFrames. Do not implement completion by a UI timer that stops/reloads audio.

Android source:
- `android/app/src/main/java/com/acquiring/android/PlaybackEngine.kt`
- `android/app/src/main/java/com/acquiring/android/PlaybackController.kt`
- `android/app/src/main/java/com/acquiring/android/SectionPlaybackFacts.kt`
- `android/app/src/main/java/com/acquiring/android/SectionOrder.kt`
- `android/app/src/main/java/com/acquiring/android/PlaybackDestination.kt`

Swift integration points:
- `ios/Packages/AcquiringKit/Sources/AcquiringAudio/QuizPCMRenderer.swift`
- `ios/Packages/AcquiringKit/Sources/AcquiringAudio/AudioContracts.swift`
- `ios/Packages/AcquiringKit/Sources/AcquiringCore/PlaybackTiming.swift`
- `ios/Packages/AcquiringKit/Sources/AcquiringCore/SectionOrdering.swift`
- `ios/Acquiring/Infrastructure/AudioSystem.swift`
- `ios/Acquiring/Features/SongViews.swift`

Android regression references:
- `android/app/src/test/java/com/acquiring/android/PlaybackEngineTest.kt`
- `android/app/src/test/java/com/acquiring/android/PlaybackTimingTest.kt`
- `android/app/src/test/java/com/acquiring/android/SectionOrderTest.kt`

Procedural checks:
- Port renderer_songModeSplicesTheQueuedSectionInTheSameBlock: 1000 Hz synthetic renderer, splice at frame 500, next performance ID, nonzero latter samples. Check played versus rendered clock, partial writes, pause during priming, rapid seek/reset and stale completion identity. Reuse PWA native-stream fixture, but inspect that it actually covers the required splice.

Unknowns and boundaries:
- PWA has renderer splice parity but transport wiring is still incomplete, so PWA UI is not an acceptance oracle. Swift source-node synchronization must be designed without unbounded allocation/work on the audio callback. Leave fix/android-timeline-scrub untouched; baseline scrub changes later require a new delta review.

### B06. Playback controls, frame clock and captions

Depends on: B01, B02, B03, B04, B05. Feature groups: N04, N09, N12, N13, N16, V05, G03, P05, P06.

Reuse existing rotary controls; move live values inside dials. Add grouped Metadata Speak Aloud choices beside Reset and saxophone instrument affordance. Add sounding-key tonic/home-chord preview buttons, independent of inversion and relative-major display. Root-only gains current melody/function and scrub bar. Full mode reserves a caption row during rests. Retire the 60/Maximum preference and use maximum display scheduling while retaining inactive/scrub/Reduce Motion guards. Public playback naming must follow current Android without confusing Aural Quiz.

Android source:
- `android/app/src/main/java/com/acquiring/android/PlaybackView.kt`
- `android/app/src/main/java/com/acquiring/android/PlaybackHeaderChrome.kt`
- `android/app/src/main/java/com/acquiring/android/PlaybackMenus.kt`
- `android/app/src/main/java/com/acquiring/android/PlaybackTransportBar.kt`
- `android/app/src/main/java/com/acquiring/android/PlaybackDial.kt`
- `android/app/src/main/java/com/acquiring/android/PlaybackFrameRate.kt`
- `android/app/src/main/java/com/acquiring/android/PlaybackHomeReference.kt`
- `android/app/src/main/java/com/acquiring/android/PlaybackMelodyFunction.kt`
- `android/app/src/main/java/com/acquiring/android/HelpMelodyFunctionArticle.kt`

Swift integration points:
- `ios/Acquiring/Features/SongViews.swift`
- `ios/Acquiring/Features/PlaybackKnob.swift`
- `ios/Acquiring/Features/QuizCards.swift`
- `ios/Acquiring/Features/HelpViews.swift`
- `ios/Acquiring/Features/LibraryViews.swift`
- `ios/Acquiring/Infrastructure/AppEnvironment.swift`

Android regression references:
- `android/app/src/test/java/com/acquiring/android/PlaybackDialTest.kt`
- `android/app/src/test/java/com/acquiring/android/PlaybackFrameRateTest.kt`
- `android/app/src/test/java/com/acquiring/android/PlaybackHomeReferenceTest.kt`
- `android/app/src/test/java/com/acquiring/android/RootOnlyCardLayoutTest.kt`
- `android/app/src/test/java/com/acquiring/android/HelpContentTest.kt`

Procedural checks:
- Check cue order Off then Melody/Chord/Pulses groups in native menu; accessibility actions must expose values. Verify preview uses current instrument and transpose once. Source-check removal of Settings picker and timeline preference consumers. On a future simulator inspect 500 Miles Full/Root, rests, Lock, controls and narrow layout.

Unknowns and boundaries:
- Historical frame-rate review stays pending even though this new batch supersedes its product preference. UIView preferredFrameRateRange assignments still appear in SongViews.swift; compiler validity needs a real SDK. Do not report maximum hardware cadence from a requested range.

### B07. Aural catalog reader and installation

Depends on: B00. Feature groups: A05, A06, A07, A10.

Add a separate prepared Aural reader rather than putting progression data in user storage. Accept catalog schema v1-v3 with capability flags; preserve source key versus analysis key and reduced sequence provenance. Stage/hash/snapshot-validate full bundle, reject mixed snapshots/downgrades, serialize activation and wait for reader leases. Reuse bounded paging/cache behavior and query/grouping/rank contracts. Do not run mining on device.

Android source:
- `android/app/src/main/java/com/acquiring/android/AuralCatalog.kt`
- `android/app/src/main/java/com/acquiring/android/AuralCatalogStore.kt`
- `android/app/src/main/java/com/acquiring/android/AuralCatalogDownloader.kt`
- `android/app/src/main/java/com/acquiring/android/AuralLoopReduction.kt`
- `android/app/src/main/java/com/acquiring/android/AuralRankEligibility.kt`
- `android/app/src/main/java/com/acquiring/android/AuralProgressionQuery.kt`
- `android/app/src/main/java/com/acquiring/android/AuralPatternSongs.kt`

Swift integration points:
- `ios/Packages/AcquiringKit/Sources/AcquiringCatalog/CatalogCoordinator.swift`
- `ios/Packages/AcquiringKit/Sources/AcquiringCatalog/CatalogFileSystem.swift`
- `ios/Packages/AcquiringKit/Sources/AcquiringCatalog/CatalogValidation.swift`
- `ios/Acquiring/Infrastructure/AppEnvironment.swift`
- `ios/Acquiring/Features/LibraryStore.swift`

Android regression references:
- `android/app/src/test/java/com/acquiring/android/AuralCatalogDownloaderTest.kt`
- `android/app/src/test/java/com/acquiring/android/AuralPreparedResourceTest.kt`
- `android/app/src/test/java/com/acquiring/android/AuralCatalogMatchingTest.kt`
- `android/app/src/test/java/com/acquiring/android/AuralLoopReductionTest.kt`
- `android/app/src/test/java/com/acquiring/android/AuralProgressionQueryTest.kt`
- `android/app/src/test/java/com/acquiring/android/AuralRankEligibilityTest.kt`

Procedural checks:
- Use contracts/aural-corpus/schema.sql and selection-fixtures.json plus pwa/src/domain/catalog/fixtures/native-{identity,loop,query,rank-eligibility,song-rank,statistics,target}.json. Validate source fingerprints and version pins before reuse. Exercise corrupt/missing file, cancellation, busy reader, v1-v3 and newer installed bundle in future focused tests.

Unknowns and boundaries:
- No Aural Swift implementation exists in main. Proposed new package files are AcquiringCatalog/AuralCatalog.swift and AuralCatalogStore.swift. Full published artifact availability, size, memory and download behavior were not checked here. Generic corpus schema is not the whole newer v3 catalog contract; inspect Android reader/producer together.

### B08. Song queue and Library layout

Depends on: B02, B05, B07. Feature groups: A08, N14, N15, L01, L02, L03, L04, L05, L06.

Implement complete popularity-ordered queue preview, one random eligible section per song, reversible whole-list shuffle and ordered saved snapshots. Keep current entry when shuffling. Resolve exact key or stable section digest before unique-name fallback; ambiguous repeated section names must fail safely. Generated examples repeat until manual previous/next; ordinary saved queues advance with a once-consumed completion token. Library shuffle filters by minimum popularity, deduplicates songs, opens chorus or first section and holds the song. Relayout search, Aural entry, shuffle, internally scrolling compact Favorites and All Songs. Preserve search/history and catalog/user-store separation.

Android source:
- `android/app/src/main/java/com/acquiring/android/SongQueueViewModel.kt`
- `android/app/src/main/java/com/acquiring/android/SongQueueControls.kt`
- `android/app/src/main/java/com/acquiring/android/LibraryView.kt`
- `android/app/src/main/java/com/acquiring/android/MainActivity.kt`
- `android/app/src/main/java/com/acquiring/android/PlaylistDao.kt`
- `android/app/src/main/java/com/acquiring/android/SectionOrder.kt`
- `android/app/src/main/java/com/acquiring/android/AuralCatalog.kt`

Swift integration points:
- `ios/Acquiring/Features/LibraryViews.swift`
- `ios/Acquiring/Features/LibraryStore.swift`
- `ios/Acquiring/Features/UserLibraryViewModel.swift`
- `ios/Acquiring/Features/UserLibraryViews.swift`
- `ios/Acquiring/Infrastructure/UserLibraryStore.swift`
- `ios/Acquiring/PlaylistRecord.swift`
- `ios/Acquiring/Features/AllSongsBrowseView.swift`
- `ios/Acquiring/Features/SongViews.swift`

Android regression references:
- `android/app/src/test/java/com/acquiring/android/SongQueueTest.kt`
- `android/app/src/test/java/com/acquiring/android/SongQueueMigrationTest.kt`
- `android/app/src/test/java/com/acquiring/android/LibrarySearchTest.kt`
- `android/app/src/test/java/com/acquiring/android/FavoritedConfirmationTest.kt`

Procedural checks:
- Port SongQueueTest cases for popularity cutoff including null/unscored, shuffle restoration, manual hold and paused navigation. Check SectionOrder chorus fallback and missing/ambiguous source behavior. Verify queue membership is not limited to a displayed page. Future product script: install both song/Aural fixtures, Shuffle, verify chorus, wait at end, Next, Settings Back with retained inner scroll.

Unknowns and boundaries:
- No queue Swift model exists; proposed new Features/SongQueueModel.swift must use app-lifetime ownership. Existing PlaylistEntryRecord stores slug and addedAt but no explicit queue order or section identity. Add an ordered snapshot representation without changing Favorites membership semantics. PWA reader reports error on Settings Back despite remembered rows; do not reproduce this bug.

### B09. Aural learning, evidence and audio ownership

Depends on: B01, B04, B07. Feature groups: A01, A02, A03, A04.

Add deterministic seven-skill learning model, Recognize/Recall/Sing grouping and four microphone tasks. Named targets count as supported practice. Preserve independent/transfer gates, immutable replay provenance, popularity/variety/favorite weighting and honest synthetic fallback. Familiarity requires positive physical transition overlap, not merely a shared endpoint. Record exposure only after audible source-start acknowledgment; damaged exposure history forces conservative supported practice. Technical audio failure is not a wrong musical answer.

Android source:
- `android/app/src/main/java/com/acquiring/android/AuralCurriculum.kt`
- `android/app/src/main/java/com/acquiring/android/AuralSession.kt`
- `android/app/src/main/java/com/acquiring/android/AuralCorpus.kt`
- `android/app/src/main/java/com/acquiring/android/AuralPitchAssessment.kt`
- `android/app/src/main/java/com/acquiring/android/AuralAudio.kt`
- `android/app/src/main/java/com/acquiring/android/AuralPracticeModes.kt`
- `android/app/src/main/java/com/acquiring/android/AuralPatternExercise.kt`

Swift integration points:
- `ios/Packages/AcquiringKit/Sources/AcquiringCore/Models.swift`
- `ios/Packages/AcquiringKit/Sources/AcquiringCore/PitchDetector.swift`
- `ios/Packages/AcquiringKit/Sources/AcquiringAudio/StaticPCMRenderer.swift`
- `ios/Acquiring/Infrastructure/AudioSystem.swift`
- `ios/Acquiring/Infrastructure/MicrophoneSession.swift`
- `ios/Acquiring/Infrastructure/UserLibraryStore.swift`

Android regression references:
- `android/app/src/test/java/com/acquiring/android/AuralCurriculumTest.kt`
- `android/app/src/test/java/com/acquiring/android/AuralSessionTest.kt`
- `android/app/src/test/java/com/acquiring/android/AuralCorpusParityTest.kt`
- `android/app/src/test/java/com/acquiring/android/AuralCorpusSessionTest.kt`
- `android/app/src/test/java/com/acquiring/android/AuralPitchAssessmentTest.kt`
- `android/app/src/test/java/com/acquiring/android/AuralAudioTest.kt`
- `android/app/src/test/java/com/acquiring/android/AuralPracticeModesTest.kt`

Procedural checks:
- Reuse contracts/aural-corpus/selection-fixtures.json and pwa/src/domain/learning/fixtures/native-{assessment,builtin-current,evidence,generator,initializer,random,scheduler,session-envelope}.json. Port fake-clock/audio-ack tests and corrupted optional-state recovery before UI. Reuse exclusive mic ownership and literal-Hz preview boundaries.

Unknowns and boundaries:
- This is a new native subsystem and needs multiple small commits within the batch. Proposed new AcquiringCore/AuralSession.swift and AuralCurriculum.swift plus durable evidence store require explicit versioning. PWA task completion does not prove native mic/audio behavior.

### B10. Aural catalog and practice screens

Depends on: B06, B07, B08, B09. Feature groups: A09.

Build catalog-first navigation with frequency-first ranks, independent matching/global counts, minimum length 2..9999, default popularity 80%, mode/inversion/grouping controls and reorderable chord constraints. Retain long progression navigation and Songs tab recursive state. Reuse full Playback for source exploration and header passage jump while preserving answer draft, evidence, tab and return context. Do not rebuild retired six-family landing or compact embedded player. Render numeral colors per degree, not one mode-wide tint.

Android source:
- `android/app/src/main/java/com/acquiring/android/AuralCatalogScreen.kt`
- `android/app/src/main/java/com/acquiring/android/AuralProgressionSearch.kt`
- `android/app/src/main/java/com/acquiring/android/AuralQuizScreen.kt`
- `android/app/src/main/java/com/acquiring/android/AuralQuizComponents.kt`
- `android/app/src/main/java/com/acquiring/android/AuralExampleSettingsPanel.kt`
- `android/app/src/main/java/com/acquiring/android/AuralRomanColors.kt`
- `android/app/src/main/java/com/acquiring/android/PracticeNavigation.kt`

Swift integration points:
- `ios/Acquiring/Features/LibraryViews.swift`
- `ios/Acquiring/Features/SongViews.swift`
- `ios/Acquiring/Features/NotationViews.swift`
- `ios/Acquiring/Infrastructure/AppEnvironment.swift`
- `ios/Acquiring/ContentView.swift`

Android regression references:
- `android/app/src/test/java/com/acquiring/android/AuralQuizUiTest.kt`
- `android/app/src/test/java/com/acquiring/android/AuralRomanColorsTest.kt`
- `android/app/src/test/java/com/acquiring/android/AuralPatternSongTest.kt`
- `android/app/src/test/java/com/acquiring/android/PracticeNavigationTest.kt`

Procedural checks:
- Use Android AuralCatalogDeviceTest.kt/AuralQuizDeviceTest.kt as future scenario references. Verify missing bundle progress/retry, cancellation without false errors, no legacy landing flash, source failure preserves draft, returned passage does not award unsupported mastery.

Unknowns and boundaries:
- Proposed new Features/AuralCatalogView.swift and AuralQuizView.swift. Exact Swift navigation shape is an implementation choice. Runtime accessibility and large catalog responsiveness need later Mac/device work.

### B11. Review and separate verification gate

Depends on: B06, B08, B10. Feature groups: final gate.

Lead consolidates unresolved checks and requests the separately authorized full-app scope when appropriate. Feature source review and portable contract checks cannot close historical human, Swift build or hardware gates. TestFlight remains separately authorized.

Android source:

Swift integration points:
- `ios/AcquiringTests/AcquiringTests.swift`
- `ios/AcquiringUITests/AcquiringUITests.swift`

Procedural checks:
- On a Mac, incremental Debug build then warm iPhone 17 install/launch and focused checks appropriate to each changed behavior. Reuse 500 Miles. Physical microphone, interruptions, Bluetooth, background and lock screen require device validation. No screenshots without requested approval.

Unknowns and boundaries:
- No iOS toolchain is available in this audit. No Swift, simulator, device or full suite was run.

## Commit-to-feature inventory after the last iOS change

The following lists non-merge Android/contracts commits. All other commits and merge paths remain in JSON so the range is complete. Subject-matched frozen entries preserve their original review status and disposition in the inherited inventory. B00 on an unmatched row means classify before implementation, not permission to ignore it.

| Commit | Change | Batches / rows |
| --- | --- | --- |
| `517dd47a` | Adds mode-aware catalog analysis and relative-major identity view, original-source key provenance, modal filtering and relative token realization; updates catalog schema readers/producers. | B07, B10, A05, A06 |
| `b1fac76e` | Separate grouping order, analysis mode/inversion controls and recursive subsequence visibility. | B07, B10, A05, A06 |
| `816bde06` | Button/chip progression query with chord degree/accidental/quality variants and reorder controls. | B07, B10, A06 |
| `3192ba6a` | Reduce repeated-loop sequences while retaining original occurrence/source lookup. | B07, A05 |
| `3dbd09f6` | Bound/collapse long progression headers and keep song tab reachable; descending length presentation. | B10, A05, A07 |
| `897c38e2` | Frequency-first global catalog ranking, independent matching/global counts, prepared reader reuse,80% popularity filter, minimum2..9999 length and browsable controls. | B07, B10, A05, A06, A10 |
| `55dfd49f` | Build complete popularity-ordered progression example queues, safe section lookup and ordered saved playlist snapshots. | B08, A08 |
| `df981dec` | Examples opens full queue preview; reversible whole-order shuffle and selection/save before play. | B08, A08 |
| `4528b994` | Preview sounding-key tonic note and home chord independent of inversions/relative-major display. | B06, P05 |
| `a4048192` | Place tonic/home previews before Lock and key in one header row. | B06, P05 |
| `2a7d64fd` | Repeat generated example sections and expose previous/next queue controls even in expanded singing dock. | B08, A08 |
| `0a3a4d01` | Automatically deliver full-v3 example bundle and Settings update with byte progress, serialized install, validation and reader release. | B07, A10 |
| `b54e5aa0` | Adds audible root-degree pulses under Playback chords. | B04, N06 |
| `03424346` | Adds spoken root-degree cue selection and bundled Kokoro degree clips. | B04, B06, N07, N09 |
| `01054738` | Pitches spoken degrees to the chord root and adds concise chord-quality suffix clips. | B04, N07 |
| `873072d1` | Separates the lower root-degree voice from Roman chord-detail speech. | B04, N07 |
| `ca4b2efd` | Fits chord voice cues to playback tempo, transpose and key context. | B04, N07 |
| `75511baa` | Distinguishes dominant-seventh and major-seventh spoken suffixes. | B04, N07 |
| `29e1155c` | Announces suspended chords and restores the af_heart voice for all clips. | B04, N07 |
| `2813b390` | Adds an independent voice volume for spoken cues. | B04, B06, N07, N09 |
| `38f5bec4` | Describes the current melody note role and adds root-only melody plus scrub bar. | B03, B06, N08, N16 |
| `2f14372d` | Colors melody roles: green sits, blue leans, amber moves, red outside the chord. | B03, N08 |
| `b5febe0f` | Shows and speaks one/two-word melody functions below C5 and adds a Help article; mode-change voice without tonic; full spoken suffix names. | B03, B04, N08, N07 |
| `caf41a66` | Shows the live value inside each playback dial. | B06, N13 |
| `e79c6781` | Shows melody function above the full-chord card and reserves the caption row during rests. | B03, N08 |
| `0c7f7a42` | Adds the Melody chord tones cue: speaks only chord-member melody notes. | B03, N08 |
| `aff64bd3` | Adds Harmonic Distance: held tonic plus pulses per circle-of-fifths step; Lock in Major measures from the opening relative major. | B04, N06 |
| `00b362fc` | Adds one pulse to every non-tonic distance (distance 1 = 2 pulses, tritone = 7). | B04, N06 |
| `9ec04a87` | Moves the say-aloud button beside Reset; the instrument button shows a saxophone. | B06, N09 |
| `01b654b6` | Song mode continues into the next section and wraps; Loop repeats the section; toggling keeps the playhead. | B05, N11 |
| `4b93f355` | Groups voice choices under Melody/Chord/Pulses titled sections, Off first. | B06, N09 |
| `6584afe7` | Renames the dialog Metadata Speak Aloud and tightens rows. | B06, N09 |
| `4bb0972a` | Renders Playback at the display maximum refresh rate instead of a 60 Hz vote. | B06, N12 |
| `9c1abe50` | Saves playback controls per song in Room schema v5 song_playback_settings. | B02, N10 |
| `ec9f0037` | Draws the melody timeline on the display frame clock instead of recomposing per note. | B06, N12 |
| `95687890` | Splices the next queued section inside the audio block with no gap. | B05, N11 |
| `25c3fee4` | Opens Favorites under the Library search buttons. | B08, N14 |
| `1b86ef6c` | Shuffles example songs from the Library by popularity cutoff, opening on the chorus and holding each song. | B08, N15 |
| `c34651ce` | Pitches key-change mode speech to the new tonic including transpose. | B04, N07 |
| `78eee8a8` | Schedules key-change mode speech in its own window at the end of the current chord, tonic in C3-B3. | B04, N07 |
| `08280a4e` | Replaces the Any chip and free-text cutoff with a minimum-popularity menu. | B08, N15 |
| `3c887223` | Voice ceiling 1.4x with a tanh soft limiter above 0.85; compact Favorites rows. | B04, B08, N07, N14 |

## Older parity crosswalk

These groups come from the frozen PWA discovery ledger, including removals and native behavior, not PWA acceptance claims. The native path lists and original historical records remain in JSON. X01/X02 are PWA-specific requirements and are excluded from the native implementation queue. D rows document superseded behavior rather than new port work.

| Group | Final behavior to retain or review | Batch |
| --- | --- | --- |
| P01 | Timeline section order, end-beat and silent seek cancel old sounding notes; controls restart only requested transport. | B05 |
| P02 | Per-layer generation invalidation, bounded PCM, PREVIEW retirement/fade; literal measured Hz bypasses transpose. | B04 |
| P03 | Foreground owner/focus loss stops sound; explicit activation governs resume after departure. Background notification service is retired. | B05 |
| P04 | Browser interruption/clock reconciliation is a platform adaptation of native focus-locked playback requests. | B04 |
| P05 | Current/previous/Home/interval cards, tap preview and double-click singing, root/melody contexts and Lock in Major. | B06 |
| P06 | Chord inventory, individual tone cards and ranked transitions use interpreted voicings and block previews. | B06 |
| N01 | Root-only mode supports persistent SimpleRoot monitoring from the header, with target updates and a root gauge. | B01 |
| N02 | Truncated Playback title opens a selectable full-title bottom sheet. | B01 |
| N03 | Contextual Playback help scrim dismisses anywhere without activating covered controls. | B01 |
| N04 | Tempo/arpeggio/mix rotary controls support angular drag and tap reset (100%, DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX, 0.5 mix). | B06 |
| S01 | Two captured slots: tap literal-Hz replay, double-click recapture, interval replay and raw-MIDI interval/cents. | B01 |
| S02 | Target listening/Flip-Flop, contiguous voiced-run median, no stale held score and two-second quiet rest. | B01 |
| S03 | Per-song octave -2..+3 is durable and affects singing targets, not source transport. | B01 |
| S04 | Card auto-listen follows approved policy A800ms including first prompt; expand alone does not start recording. | B01 |
| S05 | Exit retains inert visual content for native 300ms shrink; immediate operational cleanup, rapid reopen and departure clear. | B01 |
| S06 | Collapsed singing handle exposes Stop while persistent monitoring remains active. | B01 |
| N05 | Singing tape note names use section-key relative-major signature preference for sharps/flats. | B01 |
| S07 | Persistent melody monitoring banks contiguous-run scores; live halo rest 0 cents, unscored dot and absent score are distinct. | B01 |
| G01 | Timeline centered lanes, silent tap/drag seek and cancellation of prior notes. | B05 |
| G02 | Timeline inertia coast, velocity threshold and tap-during-coast cancellation. | B05 |
| G03 | Pitch marker32ms tween, tape interpolation, density/sp font geometry and other native motion. | B06 |
| L01 | All Songs alphabetic/complexity/unrated/mode groups, membership, counts and stable ordered pages. | B08 |
| L02 | Title/artist scopes, focus hides chrome, empty artist refusal, exact artist selection and suggestions. | B08 |
| L03 | In-memory diacritic/case/alphanumeric folded index and Found N matches rendering. | B08 |
| L04 | Prefix subgroup scrubber for sufficiently large All Songs lists. | B08 |
| L05 | Display-only cleanup preserves meaningful hyphens, IDs/URLs and recent title/artist history. | B08 |
| L06 | Favorites/ordered playlists live separately from catalog; star rolls back on write failure and only successful addition shows brief Favorited. | B08 |
| I01 | Page section tabs retain order/names, repeated API IDs fetch once but retain distinct section keys and full payload. | B00 |
| I02 | Native lenient nested JSON/Unicode first-letter titlecasing/wider URL forms. | B00 |
| I03 | Harvest preservation: bounded one-time outgoing adoption, persist, catalog activate, replay/startup repair nonfatal; existing catalog slug wins including ghost. | B00 |
| I04 | Harvest result plus established T06 mutation receipt/outbox commit atomically, retries duplicate safely and worker loss recovers. | B00 |
| R01 | User database schema migrations and durable rows survive catalog swap; guest/account namespaces do not imply auth implemented. | B00 |
| R02 | Empty-catalog bootstrap/install freshness, staged verified catalog replacement and interrupted-install reader recovery. | B00 |
| V01 | Origin-preserving Back, Song Info detour and Library Settings overlay scroll continuity. | B01 |
| V02 | Saved default instrument independent of session selection; deliberate default selection updates current session. | B02 |
| V03 | One-shot Introduction, offline Help/notation/Roman articles and privacy link. | B01 |
| V04 | Allow-listed bounded audio diagnostics export and engine stop/reset, not user-data reset. | B01 |
| V05 | 60fps/Maximum affects visual timeline scheduling independent of audio; device maximum refresh is platform-specific. | B06 |
| V06 | Updates honestly unavailable; native Play listing/status and native versionCode have no accepted SW/build-number equivalent. | B00 |
| V07 | Phone portrait vs tablet rotation policy, navigation restoration and responsive accessibility. | B01 |
| X01 | Auth/account verification/reset/Google, cloud conflicts/RLS/guest merge and feature sync are PWA roadmap requirements, not native shipping behavior inferred from a title. | B00 |
| X02 | PWA install/service-worker upgrade/cache compatibility/recovery/a11y/release gates. | B00 |
| A01 | Seven evidence skills, deterministic generation/assessment/scheduling, supported-independent-transfer gates and four microphone task kinds. | B09 |
| A02 | Recognize/Recall/Sing mode labels, explicit named target makes supported practice; family prerequisite/progress model survives old landing removal. | B09 |
| A03 | Corpus settings/popularity/variety/favorites/inversions, deterministic selector cache, provenance and honest synthetic fallback. | B09 |
| A04 | Familiarity uses positive physical-transition overlap, shared endpoint stays fresh; actual audible exposure begins beyond sourceStart. Corrupt exposure history is conservative. | B09 |
| A05 | Catalog-first ranking/search, counts independent of display filters, global frequency defaults and min length2..9999. | B07 |
| A06 | Mode/relative-major source provenance, chord-query accidental/type variants, reorder and Apply, start-group trees. | B07 |
| A07 | Songs tab hierarchy, recursive drill/return state, complete distinct song/section examples and robust identity lookup. | B07 |
| A08 | Examples use complete queue, reversible whole-list shuffle, ordered saved playlist snapshot; repeat with previous/next even expanded. | B08 |
| A09 | Open source passage in full Playback, preserve draft/evidence/return destination and header passage jump; compact embedded player deleted. | B10 |
| A10 | Automatic full-v3 example catalog, serial install/reader release, progress and supported v1-v3 mode compatibility. | B07 |
| D01 | Outer-repo stray interval tool was deleted; real native tool has separate introduction/lineage. | B00 |
| D02 | Triple-tap persistent monitoring was replaced; old chord-tone selection type alone does not prove reachable current activation. | B00 |
| D03 | Puck/draggable target/calibration/comfortable-pitch capture removed; octave selector is replacement. | B00 |
| D04 | Floating movable transport and background media notification service retired; fixed foreground transport survives. | B00 |
| D05 | Old Quiz naming, six-family landing, length-first ranks and compact source player superseded; family curriculum data still survives. | B00 |
| D06 | SacredRing -> Inquiring -> Acquiring and monorepo moves are identity/path ancestry, not three copies of features. | B00 |

## Retain historical iOS review dispositions

The report makes no changes to review status. `docs/porting-plan.md` remains the review authority. The JSON preserves its status-bearing lines with line numbers. Earlier implementation/release records are historical, not fresh verification. In particular:

- A1 Reset, A2 section/navigation override and A3 tap seeking were explicitly advanced. New section selection remains paused-at-start unless the lead obtains a superseding product decision. Automatic Song continuation is distinct.
- A4/C5 gestures, B controls, C cards, D Library and E/F device work retain their pending review conditions. Later entries supersede removed calibration and persistent card gestures without approving unrelated work.
- F048 is Dropped and F049 is Replaced by a singer-set octave offset. F046 chord-tone monitoring is deliberately unreachable; do not add an activation gesture solely because a type/test survives.
- F013, F052 and F055 stay Deferred. Queue snapshot support is a new queue requirement, not authorization for arbitrary playlist-management UI.
- The later quiz-help record retains a deferred VoiceOver failure; the catalog-identity record retains an unresolved final simulator CI state. This audit did not query those runs.
- The frame-rate follow-up has an unrun iOS regression and pending review. N12 supersedes the preference product behavior, but does not turn that record into a pass.
- No row in the capability inventory becomes Complete through this source audit. Full-app testing and release gates remain separate.

## PR #52 pending branch

Read-only local branch snapshot `bbc690a7f4dfd0b275301a95c254a2836ea326cb`. No remote status assertion. Source differences were inspected without entering its worktree.

- `d9ae4333` feat(android): keep the synthesized read-aloud voice at or below B4.
- `266103c3` feat(android): default the playback Loop/Song toggle to Song.
- `cfcb9a45` feat(android): double the read-aloud volume range, keeping saved loudness.
- `bbc690a7` feat(android): optional background playback as a media stream.

The strict B4 voice cap folds requested spoken pitches by octaves at phrase/function preparation and mode rendering. The volume ceiling doubles to 2.8 while the default halves to 0.25; Android schema 5-to-6 halves saved voiceVolume to preserve old loudness. Default Song mode affects missing/new settings while explicit saved Loop choices remain. Background playback defaults off and adds a persisted opt-in, media session/notification service, metadata, remote controls and lifecycle policy. The existing Swift foreground-only design must not silently adopt this branch.

If the lead later accepts these changes, add P52 after B02/B04/B05/B06. Review `android/app/src/main/java/com/acquiring/android/PlaybackMediaService.kt`, `PlaybackController.kt`, `SpokenRootDegrees.kt`, `PlaybackEngine.kt`, `SongPlaybackSettings.kt`, `SongPlaybackSettingsViewModel.kt`, `UserDataDatabase.kt`, and AndroidManifest.xml. References are `BackgroundPlaybackTest.kt`, `PlaybackRootDegreeCueTest.kt`, `SongQueueMigrationTest.kt` and `SongPlaybackSettingsViewModelTest.kt` in the Android test directory. Swift integration would be AudioSystem.swift, AppEnvironment.swift, SongViews.swift, Info.plist and the new settings store. Require targeted migration tests and real background/interruption/route validation. Do not copy Android foreground-service APIs into iOS.

## Portable checks and remaining uncertainties

- Reuse existing contract bytes and generators; do not regenerate expected results to hide drift. `contracts/CHORD_INTERPRETATION.md` distinguishes generated expected fields from frozen source truth. Corpus parity is necessary but does not prove perceptual accuracy.
- Future portable checks may include `python3 -B docs/pwa-port/validate_audit.py`, `validate_feature_ledger.py`, `validate_android_delta.py` and focused Node contract checks. Check each tool for write behavior and avoid render/update flags in read-only work. They validate inventories/fixtures, not Swift.
- Future native checks should target changed tests under `ios/Packages/AcquiringKit/Tests/AcquiringCoreTests`, `AcquiringAudioTests`, `AcquiringCatalogTests`, and `ios/AcquiringTests/AcquiringTests.swift`. Do not run broad suites merely because a batch ended.
- Speech asset delivery choice for iOS, SwiftData schema/migration, source-node continuation synchronization, Aural durable evidence format and full bundle resource budgets require implementation design. These are explicit unknowns, not missing user approval for this completed audit.
- Current PWA gaps remain useful warnings: in-block splice transport wiring, rotary/value layout, Aural row, example-shuffle product test, Settings Back reader recovery, and physical/browser/audio gates. No PWA completion label is used as iOS evidence.
- Historical Android rehashes were matched by exact SHA where available and subject otherwise. The frozen inventory documents prior patch identity, but this audit does not assert newly computed patch-ID equivalence. A batch implementer should inspect its exact commit diff if ancestry matters.
- This is a bounded source-backed audit, not an assertion that every line in 430 commits was read. All commit paths are inventoried, major final behavior groups are traced, inherited evidence is preserved, and residual validation is explicit.

## Audit verification receipt

Read-only git status/log/diff/show and source inspection only. JSON parseability, exact 430-commit range coverage, all listed existing batch paths, and byte-equivalent decoded historical records were checked successfully. All 55 stable capability rows are also retained verbatim in JSON. Final git status was clean at this check. No Android/PWA/iOS suites ran. No repository files were modified; git status remained clean. The lead should commit the execution plan only after reviewing these artifacts.

## Smallest useful slices within the large batches

- B04 should separate portable cue preparation and deterministic rendering from app asset loading and live controls. The final batch still needs the complete user-visible behavior. Existing `ios/Packages/AcquiringKit/Tests/AcquiringAudioTests/AudioParityTests.swift` already uses 44.1 kHz in its pure renderer tests, so the new controlled-rate oracle need not change the app graph.
- B07 can separate validated catalog installation/lease ownership from SQL and binary-array reading, then grouping/ranking/query contracts. Keep each slice usable and verify cancellation and failure behavior before UI.
- B09 can separate deterministic generation/assessment, durable session/evidence recovery, and audible-exposure/mic integration. Seven evidence skills must remain distinct even when the UI groups them into three modes.
- B10 can separate catalog browsing/search, source-song/queue navigation, and guided practice. Each needs loading, empty, failure and return-state behavior, not only its successful path.

The inherited history-to-batch suggestions in JSON use evidence-path overlap and explicitly say so. They are navigation aids, not fresh reviews of every original patch. In particular, old deleted transport, calibration, family-landing and embedded-player implementations must never be revived just because an old commit maps to a live file.
