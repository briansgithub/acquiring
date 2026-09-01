# Android-to-iOS feature parity

This is the stable cross-platform implementation checklist. Android behavior at annotated tag `android-parity-ios-v1` is authoritative; shared contracts and fixtures corroborate it. Preserve IDs and append new IDs rather than renumbering.

iOS v1 contains **52 in-scope observable capabilities** from F001–F055. F013, F052, and F055 are explicitly **Deferred**, leaving 52 targets. A row becomes **Complete** only after its implementation, automated tests, required device evidence, empty/error states, and accessibility behavior pass. **Partial** includes implemented code that has remaining behavior or verification gates; **Not started** means no material implementation; **Deferred** is an explicit product decision, not an omitted task. Android also uses **Dormant** and **Unused** for compiled behavior outside its normal shipping flow.

Priority is porting priority (`P0` highest); complexity is relative (`S`, `M`, `L`, `XL`). Behavioral details are in [android-app-analysis.md](android-app-analysis.md), and the execution/acceptance contract is in [porting-plan.md](porting-plan.md).

## Catalog and library

| ID | Feature | Android status | iOS status | Priority | Complexity | Android reference | iOS notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F001 | Application launch and Library shell | Complete | Partial | P0 | M | `MainActivity.kt` | Native Library, explicit routes, typed states, dark iPhone/iPad shell, and launch UI test exist; complete adaptive/accessibility evidence remains. |
| F002 | Debounced title search, suggestions, pagination, and result cards | Complete | Partial | P0 | L | `MainActivity.kt`; `SongDao.kt` | GRDB queries, 250 ms debounce, and result rows exist; UI load-more/20-row paging and parity fixtures remain. |
| F003 | Recent-song history and focused empty-query suggestions | Complete | Partial | P2 | M | `HistoryManager.kt`; `MainActivity.kt` | Namespaced ten-item MRU storage and Library recents exist; focus-specific suggestion behavior remains. |
| F004 | Artist search, recent artists, paged suggestions, and artist result screen | Complete | Partial | P1 | L | `MainActivity.kt`; `SongDao.kt`; `HistoryManager.kt` | Artist queries/history/result route exist; UI paging and full restoration evidence remain. |
| F005 | Optional Hooktheory external-search handoff | Complete | Partial | P2 | S | `MainActivity.kt` | Search result includes a native external link; failure/return-path tests remain. |
| F006 | All Songs alphabetical browse with indexed groups | Complete | Partial | P0 | L | `AllSongsView.kt`; `SongDao.kt` | GRDB group counts and expandable alphabetical sections exist; indexed navigation and large-catalog evidence remain. |
| F007 | All Songs complexity browse, counts, and unrated bucket | Complete | Partial | P1 | M | `AllSongsView.kt`; `SongBrowse.kt`; `SongDao.kt` | Complexity counts/rows and Unrated are implemented; real-catalog parity/performance remains. |
| F008 | All Songs mode browse and counts | Complete | Partial | P1 | M | `AllSongsView.kt`; `SongBrowse.kt`; `SongDao.kt` | Mode membership counts/rows are implemented; real-catalog parity/performance remains. |
| F009 | Fuzzy filtering, states, legacy warnings, and list restoration | Complete | Partial | P1 | L | `AllSongsView.kt`; `MainActivity.kt` | Filtering and failure states exist; Android-equivalent fuzziness, legacy warnings, scroll/expanded restoration remain. |
| F010 | Catalog read, gzip/raw payload decoding, and compatibility repair | Complete | Partial | P0 | XL | `AppDatabase.kt`; `DataUtils.kt`; `HooktheoryDataCompat.kt` | Actor-owned GRDB repository, dynamic payload decode, gzip/raw support, v1 repair, and fixture tests exist; broader v2/real-catalog evidence remains. |
| F011 | Manual harvesting of one Hooktheory song | Complete | Partial | P2 | L | `HarvestService.kt`; `Scraper.kt`; `DataExtractor.kt` | Visible URL workflow, SwiftSoup parser, API extraction, and write path exist; live-service/end-to-end evidence remains. |
| F012 | Full download, validation, staging, backup, and replacement | Complete | Partial | P0 | XL | `DatabaseDownloader.kt`; `AppDatabase.kt`; catalog contract | Stream-to-file download, zlib preparation, contract/quick-check/floor validation, and backup swap exist; interrupted-swap and real artifact budgets remain. |
| F013 | Missing-payload on-demand harvest fallback | Dormant | Deferred | P3 | M | `MainActivity.kt`; `HarvestService.kt`; `SongDao.kt` | Explicitly deferred for iOS v1 because Android’s normal queries exclude these rows. |

## Song details and music theory

| ID | Feature | Android status | iOS status | Priority | Complexity | Android reference | iOS notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F014 | Song-detail navigation, origin-aware Back, header, and tabs | Complete | Partial | P0 | L | `MainActivity.kt` | Explicit parent → Detail → Quiz routes and a simulator navigation test exist; every origin/restoration/accessibility matrix remains. |
| F015 | Canonical section ordering and selection | Complete | Partial | P0 | M | `SectionOrder.kt`; `MainActivity.kt` | Pure ordering/dedup test and section picker exist; representative duplicate/source fixtures remain. |
| F016 | Info: key, BPM, meter, duration, bars, and event counts | Complete | Partial | P1 | M | `MainActivity.kt`; `HooktheoryModels.kt` | Overview now includes key, BPM, meter, duration, beats/bars, unique chords, and sounded/total melody notes; change-list and fixture parity remain. |
| F017 | Progression, chord preview, source metadata, Hooktheory/YouTube links | Complete | Partial | P1 | L | `MainActivity.kt`; `AudioEngine.kt` | Sorted playable progression plus Hooktheory/YouTube links exist; pill renderer, source detail, and external failure policy remain. |
| F018 | Unique-chord inventory and adaptive Chords grid | Complete | Partial | P1 | M | `MainActivity.kt`; `ChordInterpreter.kt` | Unique count and playable chord list exist; deduplicated adaptive grid and semantic renderer remain. |
| F019 | Roman-numeral versus letter-name display | Complete | Partial | P1 | M | `MainActivity.kt`; `ChordInterpreter.kt` | Toggle and corpus-backed interpreter labels exist; full enharmonic UI corpus and fitting remain. |
| F020 | Chord preview, arpeggiation, and 30–1000 ms speed | Complete | Partial | P1 | L | `MainActivity.kt`; `AudioEngine.kt` | Chords UI previews finite chords, toggles arpeggiation, and exposes the 30–1000 ms range; cancellation/listening/device evidence remains. |
| F021 | Pitch, key, scale, mode, transposition, and enharmonic engine | Complete | Partial | P0 | XL | `MusicTheory.kt`; parity corpus | The shared corpus plus focused enharmonic, melody-register, custom-scale, relative-Ionian, and structured-spelling tests pass; remaining Android interval/tessitura consumers and device evidence keep this Partial. |
| F022 | Chord parsing, interpretation, scale degrees, and voicing | Complete | Partial | P0 | XL | `ChordInterpreter.kt`; parity corpus | All 45 shared cases and Android-equivalent rest, modifier, inversion, applied, borrowed, custom-borrowed, tritone-substitution, and voicing regressions pass; remaining UI/audio integration and device evidence keep this Partial. |
| F023 | Fitted Roman-numeral renderer | Complete | Partial | P1 | XL | `RomanNumeralLayout.kt`; `RomanNumeralRenderer.kt` | A native SwiftUI Canvas renderer tokenizes and fits applied chords, figured bass, quality marks, suffixes, suspensions, and separate borrowed-mode rows in Info, Chords, and Quiz; Android-equivalent semantic tests pass, while visual/device evidence remains. |
| F024 | Fitted scale-degree renderer | Complete | Partial | P1 | L | `ScaleDegreeRenderer.kt` | A fitting SwiftUI Canvas renderer draws an independent rounded vector hat centered above the scale-degree column with separate accidentals and VoiceOver spelling; geometry/snapshot/device evidence remains. |

## Playback and quiz

| ID | Feature | Android status | iOS status | Priority | Complexity | Android reference | iOS notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F025 | Full timeline with melody/chords/key changes/playhead | Complete | Partial | P0 | XL | `MainActivity.kt`; `QuizPlaybackTiming.kt` | Pure chord/melody events, key-at-onset behavior, exact audible loop-end rules, Canvas chord lane, and transport-driven playhead exist; visual melody lane, key regions, scrolling, and full semantics remain. |
| F026 | Root-only Simple mode and interval slider | Complete | Partial | P1 | L | `MainActivity.kt`; `RootIntervalPreview.kt`; `QuizIntervalState.kt` | Simple mode now derives the duration-aware previous/current root interval, shows accessible root/interval cards, and previews previous → current → both with shared tessitura shift; final layout/fader and device evidence remain. |
| F027 | App-scoped looping transport and view continuity | Complete | Partial | P0 | XL | `QuizPlaybackController.kt`; `QuizPlaybackEngine.kt` | AppEnvironment owns a source-node loop renderer with elapsed publishing, exact wrap/overshoot tests, and play-state-preserving reconfiguration; view/background/device continuity evidence remains. |
| F028 | Tap seek, drag/inertia scrub, pause/resume, Simple seek | Complete | Partial | P1 | XL | `MainActivity.kt`; `QuizPlaybackTiming.kt` | Slider seek, exact-end paused seek, and pause/resume exist; timeline tap, gesture inertia, and pause-on-scrub remain. |
| F029 | Draggable play/pause, reset, section switch, continuation | Complete | Partial | P1 | L | `MainActivity.kt`; `QuizPlaybackController.kt` | Play/pause and section reload restart position while preserving requested playback; dragging, reset, persisted position, and device evidence remain. |
| F030 | Quiz tempo from 0–200 percent | Complete | Partial | P1 | M | `MainActivity.kt`; `QuizPlaybackEngine.kt` | Live 0–200% control rebuilds deterministic event timing while preserving progress and requested playback; zero-tempo/device semantics remain. |
| F031 | Global transposition from -12 to +12 semitones | Complete | Partial | P0 | L | `MainActivity.kt`; `AudioPitchAdapter.kt`; `QuizPlaybackEngine.kt` | UI range and pitch calculation preserve progress/play state during reconfiguration; card/preview consistency and device tests remain. |
| F032 | Ten synthesized waveforms/instruments | Complete | Partial | P1 | XL | `SynthVoice.kt`; audio engines | Ten native mathematical voices plus bounded, finite, envelope, gain, cancellation, and headroom tests exist; perceptual level and route evidence remain. |
| F033 | Transport chord-arpeggiation modes | Complete | Partial | P1 | M | `MainActivity.kt`; `QuizPlaybackEngine.kt` | All eight cycle options drive deterministic single-note transport events; renderer and transition parity tests remain. |
| F034 | Independent melody/chord transport balance | Complete | Partial | P1 | M | `MainActivity.kt`; `QuizDial.kt`; `QuizPlaybackEngine.kt` | Independent event gains, an accessible balance slider, progress-preserving updates, and sample-level headroom tests exist; custom dial, gain smoothing, and listening tests remain. |
| F035 | Active melody, interval, chord, and chord-tone cards | Complete | Partial | P0 | XL | `MainActivity.kt`; `QuizIntervalState.kt` | A duration/overlap-aware event index now drives root, melody, interval, and chord-tone cards with spelled labels; Android layout density, persistent-practice gestures, caching at the UI boundary, and device evidence remain. |
| F036 | Exclusive card/interval/chord/exact-frequency previews | Complete | Partial | P0 | XL | `AudioEngine.kt`; `RootIntervalPreview.kt`; `MainActivity.kt` | Root, melody, interval, and chord-tone cards replace the isolated preview channel; interval previews use the Android three-step sequence and fractional-MIDI playback is tested, while transport-pause policy and device evidence remain. |
| F037 | Lock in Major relative-Ionian labels/rendering | Complete | Partial | P1 | L | `RelativeIonianContext.kt`; `MainActivity.kt` | Android's fixed-context degree, staff, preview-register, enharmonic, and chord-label tests are ported; the Quiz toggle drives fitted Roman/root-degree notation without changing playback, while the remaining active-card consumers remain. |
| F038 | Native PCM output, synthesis, fades, cancellation, recovery | Complete | Partial | P0 | XL | `AppAudioOutput.kt`; audio engines; `SynthVoice.kt` | Pure preview/loop renderers and source node now have sample-level attack/release, slot-seam, loop-seam, dense-onset, gain, headroom, cancellation, huge-duration, and invalid-rate tests; underrun/recovery/device evidence remains. |
| F039 | Background playback, media controls, interruptions, route handling | Complete | Partial | P0 | XL | `QuizPlaybackService.kt`; manifest | Background mode, Now Playing, remote play/pause/stop, interruption and route observers exist; seek/resume/headphone/device soak evidence remains. |

## Microphone and vocal practice

| ID | Feature | Android status | iOS status | Priority | Complexity | Android reference | iOS notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F040 | Mic capture, YIN, gates, and smoothing | Complete | Partial | P0 | XL | `MicrophonePitchTracker.kt`; `PitchDetector.kt`; `PitchSmoother.kt` | Input tap converts to mono 16 kHz and applies YIN/confidence/RMS gates; smoothing integration, PCM corpus, and devices remain. |
| F041 | Just-in-time permission, exclusive ownership, lifecycle cleanup | Complete | Partial | P0 | L | `MicrophonePitchCoordinator.kt`; `MainActivity.kt` | Just-in-time request, one stream lease, termination cleanup, and typed errors exist; denial/cancellation/route tests remain. |
| F042 | Quiz-card sing-back target workflow | Complete | Partial | P1 | XL | `MainActivity.kt`; `SingingTargets.kt`; `HummingIntervalPopup.kt` | Explicit accessible Sing Back action, target preview, delayed capture, and cents feedback exist; active-card targeting and device evidence remain. |
| F043 | Two-note capture, name, cents, and playback | Complete | Partial | P1 | XL | `HummingIntervalPopup.kt`; `SpelledInterval.kt`; `ComfortablePitchCapture.kt` | Two-slot capture, measured directional shorthand/cents, ideal pair placement, and exact interval-preview sequencing exist; stable-window capture and captured-pair playback UI remain. |
| F044 | Target listening with spelled pitch and cents | Complete | Partial | P1 | L | `HummingIntervalPopup.kt`; `SingingTargets.kt` | Live note/cents feedback plus enharmonic, compound, direction, and fractional-MIDI playback regressions exist; target-mode transitions and device evidence remain. |
| F045 | Flip-Flop alternating two-slot capture | Complete | Not started | P2 | M | `HummingIntervalPopup.kt` | Manual two-slot capture is not the timed alternating Flip-Flop mode. |
| F046 | Persistent root/melody/chord-tone practice | Complete | Partial | P1 | XL | `PersistentQuizPitchPractice.kt`; `MainActivity.kt` | Explicit persistent pitch sheet exists; transport-following target kinds and fast melody mode remain. |
| F047 | Melody marker and median run scoring | Complete | Not started | P1 | XL | `PersistentQuizPitchPractice.kt`; `MainActivity.kt` | Continuous cents feedback exists, but marker and settle-gated per-run median scoring do not. |
| F048 | Three-second tessitura calibration states | Complete | Partial | P1 | XL | `TessituraControl.kt`; `ComfortablePitchCapture.kt`; `TessituraSessionViewModel.kt` | Three-second capture, dropout, retry, cancel, and progress exist; non-dismissable/state/device tests remain. |
| F049 | Tessitura target placement and continuity | Complete | Partial | P1 | XL | `TessituraResolver.kt`; `TessituraSessionViewModel.kt`; `MainActivity.kt` | Android-equivalent register, tritone-tie, asymmetric-window, contour, recentering, interval, transpose-once, and session-lifetime tests pass; Quiz scopes the anchor by section, while per-target continuity updates, all practice consumers, and device evidence remain. |

## User data, maintenance, and platform integration

| ID | Feature | Android status | iOS status | Priority | Complexity | Android reference | iOS notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F050 | Built-in Favorites and optimistic toggle rollback | Complete | Partial | P1 | L | `UserDataDatabase.kt`; `PlaylistDao.kt`; `MainActivity.kt` | Built-in Favorites, unique membership, toggle, and tests exist; explicit optimistic UI/rollback test remains. |
| F051 | Playlist counts, newest-first songs, and removal | Complete | Partial | P1 | L | `PlaylistsSection.kt`; `PlaylistDao.kt` | Library summaries/counts, slug resolution, newest-first order, browse route, and swipe removal exist; accordion/restoration tests remain. |
| F052 | Custom-playlist create/delete storage support | Partial | Deferred | P3 | M | `PlaylistDao.kt`; `Playlist.kt` | Explicitly deferred; Android has DAO/tests but no shipping management UI, and iOS v1 must not invent one. |
| F053 | Separate replaceable catalog and durable user stores | Complete | Partial | P0 | L | `AppDatabase.kt`; `UserDataDatabase.kt`; downloader | GRDB catalog and SwiftData user stores are separate; cross-replacement durability/recovery evidence remains. |
| F054 | Accessibility semantics for controls/practice gestures | Partial | Partial | P0 | L | `MainActivity.kt`; renderers; `TripleClickable.kt` | Native labels/hints, explicit practice buttons, Dynamic Type defaults, reduce-motion timeline, and adaptive widths exist; full VoiceOver/action/layout audit remains. |
| F055 | Standalone audiation pitch-practice container | Unused | Deferred | P3 | L | `AudiationPitchPractice.kt` | Explicitly deferred because Android has no production caller. |

## Coverage and implementation checkpoint

There are **55 stable IDs**: 13 catalog/library, 11 song/theory, 15 playback/quiz, 10 microphone/vocal-practice, and 6 user-data/maintenance/platform capabilities. Exactly **52 are in iOS v1 scope** and exactly **3 are Deferred** (F013, F052, F055). No web-only capability is included.

The current checkpoint establishes the intended package and lifecycle architecture and several functioning vertical slices, but it is not a parity release. No iOS row is labeled Complete yet because the physical-device, full error-state, and accessibility release gates have not been signed. Source and test evidence is tracked in [android-app-analysis.md](android-app-analysis.md).

## Five highest risks

1. Real-time synthesis and background continuity, including interruptions, routes, remote commands, and view-independent ownership (F027, F038–F039).
2. Microphone DSP and vocal practice across real hardware, routes, latency, confidence gates, and exclusive ownership (F040–F049).
3. Compatibility and recoverable replacement of the large compressed catalog (F010, F012, F053).
4. Enharmonic/chord/relative-Ionian rules and semantic notation fitting (F021–F024, F037).
5. Making Android’s implicit navigation, gesture, saved-state, and lifecycle contracts explicit without behavioral drift (F014, F025, F035, F041, F054).

## Open questions

1. Which exact small iPhone, current iPhone, iPad, headphone, and Bluetooth models make up the release evidence matrix?
2. What exact YouTube lookup, failure, and region-restriction policy should F017 use?
3. What launch/search/install latency and memory budgets must the real catalog meet?
4. What perceptual procedure and tolerances approve the ten iOS instruments?
5. Who signs TestFlight evidence and owns triage of Android changes after `android-parity-ios-v1`?

## Recommended porting sequence

1. Keep the reference lock, contracts, package boundaries, and shared fixtures green.
2. Finish catalog integrity and pure theory/relative-Ionian behavior.
3. Complete search/browse/navigation and exact restoration on iPhone/iPad.
4. Complete Info, Chords, native notation, links, and finite previews.
5. Complete quiz cards/controls/transport together with background media behavior.
6. Complete vocal practice using prerecorded fixtures and physical hardware.
7. Finish Favorites/playlist durability, accessibility, adaptive layout, recovery, and release evidence; retain F013, F052, and F055 as Deferred.
