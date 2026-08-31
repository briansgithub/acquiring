# Android-to-iOS feature parity

This is the stable implementation checklist for the iOS port. Android repository code is the reference implementation; the web app and shared fixtures are corroborating evidence only. Preserve feature IDs when updating status, and append new IDs rather than renumbering existing rows.

Status meanings:

- **Complete**: present in the production Android path and supported by the audited implementation.
- **Partial**: some production-capable infrastructure exists, but the observable capability is incomplete.
- **Dormant**: defensive or fallback production code exists but is not reachable from the normal audited UI flow.
- **Unused**: compiled production declaration exists but no production caller was found.
- **Shell**: an iOS boundary or model exists without the end-to-end feature.
- **Not started**: no corresponding iOS implementation was found.

Priority is the recommended porting priority (`P0` highest). Complexity is relative (`S`, `M`, `L`, `XL`). Behavioral detail, caveats, and verification evidence live in [android-app-analysis.md](android-app-analysis.md).

## Catalog and library

| ID | Feature | Android status | iOS status | Priority | Complexity | Android reference | iOS notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F001 | Application launch and Library shell | Complete | Shell | P0 | M | `MainActivity.kt` (`onCreate`, `MainScreen`) | `ContentView` is a static Library shell backed by an empty repository. |
| F002 | Debounced title search, suggestions, pagination, and result cards | Complete | Not started | P0 | L | `MainActivity.kt`; `SongDao.kt` | No search repository methods or UI. |
| F003 | Recent-song history and focused empty-query suggestions | Complete | Not started | P2 | M | `HistoryManager.kt`; `MainActivity.kt` | No preferences/history store. |
| F004 | Artist search, recent artists, paged suggestions, and artist result screen | Complete | Not started | P1 | L | `MainActivity.kt`; `SongDao.kt`; `HistoryManager.kt` | No artist model, query, or screen. |
| F005 | Optional Hooktheory external-search handoff | Complete | Not started | P2 | S | `MainActivity.kt` | Decide whether the browser handoff belongs in the iOS product. |
| F006 | All Songs alphabetical browse with indexed groups | Complete | Not started | P0 | L | `AllSongsView.kt`; `SongDao.kt` | Requires the browse-index repository surface. |
| F007 | All Songs complexity browse, counts, and unrated bucket | Complete | Not started | P1 | M | `AllSongsView.kt`; `SongBrowse.kt`; `SongDao.kt` | Requires complexity metadata from the catalog. |
| F008 | All Songs mode browse and counts | Complete | Not started | P1 | M | `AllSongsView.kt`; `SongBrowse.kt`; `SongDao.kt` | Requires many-to-many browse-mode data. |
| F009 | All Songs fuzzy filtering, loading/error/empty states, legacy warnings, and list restoration | Complete | Not started | P1 | L | `AllSongsView.kt`; `MainActivity.kt` | Preserve expanded group, filters, and scroll when returning from details. |
| F010 | Catalog song-payload read, gzip/raw decoding, and compatibility repair | Complete | Shell | P0 | XL | `AppDatabase.kt`; `DataUtils.kt`; `HooktheoryDataCompat.kt` | `CatalogRepository` exists, but `EmptyCatalogRepository` has no database or payload implementation. |
| F011 | Manual harvesting of one Hooktheory song into the local catalog | Complete | Not started | P2 | L | `HarvestService.kt`; `Scraper.kt`; `DataExtractor.kt` | Network/import authoring workflow; confirm whether it should ship on iOS. |
| F012 | Full catalog download, validation, staging, backup, and atomic replacement | Complete | Shell | P0 | XL | `DatabaseDownloader.kt`; `AppDatabase.kt`; `contracts/catalog/` | Repository comments describe a boundary, but no downloader or installer exists. |
| F013 | On-demand harvest fallback for a song missing its payload | Dormant | Not started | P3 | M | `MainActivity.kt`; `HarvestService.kt`; `SongDao.kt` | Normal browse/search queries exclude missing payloads, so the fallback is not normally reachable. |

## Song details and music theory

| ID | Feature | Android status | iOS status | Priority | Complexity | Android reference | iOS notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F014 | Song-detail navigation, origin-aware Back behavior, header, and tabs | Complete | Not started | P0 | L | `MainActivity.kt` | Hand-built Android state has no iOS route equivalent yet. |
| F015 | Canonical section ordering and section selection | Complete | Not started | P0 | M | `SectionOrder.kt`; `MainActivity.kt` | Must preserve duplicate/source section identity. |
| F016 | Info overview: key, BPM, meter, duration, bars, and event counts | Complete | Not started | P1 | M | `MainActivity.kt`; `HooktheoryModels.kt` | Depends on decoded section models and timing rules. |
| F017 | Progression summary, chord-pill preview, source metadata, Hooktheory link, and YouTube link | Complete | Not started | P1 | L | `MainActivity.kt`; `AudioEngine.kt` | External-link behavior and YouTube lookup policy need an iOS decision. |
| F018 | Unique-chord inventory and adaptive Chords grid | Complete | Not started | P1 | M | `MainActivity.kt`; `ChordInterpreter.kt` | Depends on canonical chord interpretation. |
| F019 | Roman-numeral versus letter-name chord display | Complete | Not started | P1 | M | `MainActivity.kt`; `ChordInterpreter.kt` | UI choice must share the same enharmonic spelling rules. |
| F020 | Chord preview, optional arpeggiation, and 30–1000 ms speed control | Complete | Not started | P1 | L | `MainActivity.kt`; `AudioEngine.kt` | Needs preview-channel cancellation and native synthesis. |
| F021 | Pitch, key, scale, mode, transposition, and enharmonic theory engine | Complete | Not started | P0 | XL | `MusicTheory.kt`; shared parity corpus | Port pure rules before UI; shared fixtures corroborate Android behavior. |
| F022 | Chord parsing, interpretation, scale degrees, and playable voicing | Complete | Not started | P0 | XL | `ChordInterpreter.kt`; shared parity corpus | One of the highest semantic-parity risks. |
| F023 | Fitted Roman-numeral renderer with figures, qualities, applied chords, and borrowing | Complete | Not started | P1 | XL | `RomanNumeralLayout.kt`; `RomanNumeralRenderer.kt` | Android uses Canvas/Paint; implement a native SwiftUI/Core Graphics renderer. |
| F024 | Fitted scale-degree renderer with accidentals and vector hat | Complete | Not started | P1 | L | `ScaleDegreeRenderer.kt` | Android Canvas code is not portable directly. |

## Playback and quiz

| ID | Feature | Android status | iOS status | Priority | Complexity | Android reference | iOS notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F025 | Full quiz timeline with melody, chord lanes, key changes, and moving playhead | Complete | Not started | P0 | XL | `MainActivity.kt`; `QuizPlaybackTiming.kt` | Requires theory, timing, renderer, and transport layers. |
| F026 | Root-only Simple quiz mode and interval slider | Complete | Not started | P1 | L | `MainActivity.kt`; `RootIntervalPreview.kt`; `QuizIntervalState.kt` | Must match the reduced control and content surface. |
| F027 | Process-wide looping section transport and continuity across Compose changes | Complete | Not started | P0 | XL | `QuizPlaybackController.kt`; `QuizPlaybackEngine.kt` | Model transport outside SwiftUI view lifetime. |
| F028 | Timeline tap-seek, drag, inertial scrub, pause/resume, and Simple-mode slider seek | Complete | Not started | P1 | XL | `MainActivity.kt`; `QuizPlaybackTiming.kt` | Gesture and transport synchronization are tightly coupled. |
| F029 | Draggable play/pause control, reset, section switching, and requested-state continuation | Complete | Not started | P1 | L | `MainActivity.kt`; `QuizPlaybackController.kt` | Android persists button fractions with `rememberSaveable`. |
| F030 | Quiz tempo control from 0–200 percent | Complete | Not started | P1 | M | `MainActivity.kt`; `QuizPlaybackEngine.kt` | Includes live renderer reconfiguration. |
| F031 | Global quiz transposition from -12 to +12 semitones | Complete | Not started | P0 | L | `MainActivity.kt`; `AudioPitchAdapter.kt`; `QuizPlaybackEngine.kt` | Apply exactly once across playback and previews. |
| F032 | Ten selectable synthesized waveforms/instruments | Complete | Not started | P1 | XL | `SynthVoice.kt`; `AudioEngine.kt`; `QuizPlaybackEngine.kt` | Native DSP must match envelope and timbre closely enough for training. |
| F033 | Transport chord-arpeggiation modes | Complete | Not started | P1 | M | `MainActivity.kt`; `QuizPlaybackEngine.kt` | Options are 1/4, 1/3, 1/2, off, 1, 2, 3, and 4. |
| F034 | Independent melody/chord transport balance | Complete | Not started | P1 | M | `MainActivity.kt`; `QuizDial.kt`; `QuizPlaybackEngine.kt` | Includes a custom vertical dial and smoothed gain changes. |
| F035 | Active melody, interval, chord, and chord-tone quiz cards | Complete | Not started | P0 | XL | `MainActivity.kt`; `QuizIntervalState.kt` | Cards track transport position, rests, gaps, and live key context. |
| F036 | Exclusive card, interval, chord, and exact-frequency preview playback | Complete | Not started | P0 | XL | `AudioEngine.kt`; `RootIntervalPreview.kt`; `MainActivity.kt` | Starting a singing target also pauses section transport. |
| F037 | Lock in Major relative-Ionian labels and rendering | Complete | Not started | P1 | L | `RelativeIonianContext.kt`; `MainActivity.kt` | Mapping affects keys, intervals, chords, and scale degrees. |
| F038 | Shared native PCM output, synthesis, fades, cancellation, and dead-object recovery | Complete | Not started | P0 | XL | `AppAudioOutput.kt`; `AudioEngine.kt`; `QuizPlaybackEngine.kt`; `SynthVoice.kt` | Likely iOS mapping: `AVAudioSession` plus `AVAudioEngine`/source nodes. |
| F039 | Background playback, media notification/session controls, audio focus, and unplug handling | Complete | Not started | P0 | XL | `QuizPlaybackService.kt`; `AndroidManifest.xml` | Map to background audio, Now Playing, remote commands, interruptions, and route changes; Android notification permission has no direct iOS analogue. |

## Microphone and vocal practice

| ID | Feature | Android status | iOS status | Priority | Complexity | Android reference | iOS notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F040 | Live microphone capture, YIN pitch detection, confidence/RMS gates, and smoothing | Complete | Not started | P0 | XL | `MicrophonePitchTracker.kt`; `PitchDetector.kt`; `PitchSmoother.kt`; `PitchSource.kt` | Requires device-matrix tuning with `AVAudioEngine` input. |
| F041 | Just-in-time microphone permission, exclusive ownership, and lifecycle cleanup | Complete | Not started | P0 | L | `MicrophonePitchCoordinator.kt`; `MainActivity.kt` | Three clients intentionally compete for one recorder. |
| F042 | Double-tap quiz-card sing-back target workflow | Complete | Not started | P1 | XL | `MainActivity.kt`; `SingingTargets.kt`; `HummingIntervalPopup.kt` | Includes delayed capture, transposed/voiced target calculation, and accessibility descriptions. |
| F043 | Manual two-note interval capture, naming, cents measurement, and playback | Complete | Not started | P1 | XL | `HummingIntervalPopup.kt`; `SpelledInterval.kt`; `ComfortablePitchCapture.kt` | Bottom popup is globally available during song detail. |
| F044 | Target-guided listening with live spelled pitch and cents feedback | Complete | Not started | P1 | L | `HummingIntervalPopup.kt`; `SingingTargets.kt` | Target mode auto-expands and listens after the preview transition. |
| F045 | Flip-Flop alternating two-slot vocal capture | Complete | Not started | P2 | M | `HummingIntervalPopup.kt` | Alternates three-second captures with a pause after slot two. |
| F046 | Long-press persistent pitch practice for roots, melody, and chord tones | Complete | Not started | P1 | XL | `PersistentQuizPitchPractice.kt`; `MainActivity.kt` | Target follows playback; melody mode uses lower-latency capture. |
| F047 | Timeline melody marker and per-run median pitch scoring | Complete | Not started | P1 | XL | `PersistentQuizPitchPractice.kt`; `MainActivity.kt` | Includes settle gating and unscored states. |
| F048 | Three-second tessitura calibration with permission, dropout, retry, and cancellation states | Complete | Not started | P1 | XL | `TessituraControl.kt`; `ComfortablePitchCapture.kt`; `TessituraSessionViewModel.kt` | Non-dismissable capture dialog and timing semantics require focused tests. |
| F049 | Tessitura-based target placement and continuity rules | Complete | Not started | P1 | XL | `TessituraResolver.kt`; `TessituraSessionViewModel.kt`; `MainActivity.kt` | Shifts practice targets only, preserves contour, and does not transpose source playback. |

## User data, maintenance, and platform integration

| ID | Feature | Android status | iOS status | Priority | Complexity | Android reference | iOS notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F050 | Built-in Favorites playlist and optimistic favorite toggle with rollback | Complete | Not started | P1 | L | `UserDataDatabase.kt`; `PlaylistDao.kt`; `MainActivity.kt` | `PlaylistRecord` has no built-in flag, membership relation, or Favorites UI. |
| F051 | Library playlist accordion, counts, newest-first songs, and removal | Complete | Shell | P1 | L | `PlaylistsSection.kt`; `PlaylistDao.kt` | SwiftData stores playlist records only; there is no membership or UI. |
| F052 | Custom-playlist create/delete storage support | Partial | Shell | P3 | M | `PlaylistDao.kt`; `Playlist.kt` | Android DAO/tests support it, but Android has no create, rename, or delete UI; do not invent one for parity. |
| F053 | Separate replaceable catalog and durable user-data stores | Complete | Partial | P0 | L | `AppDatabase.kt`; `UserDataDatabase.kt`; `DatabaseDownloader.kt` | SwiftData establishes a user-store boundary, while the catalog repository remains empty. |
| F054 | Accessibility semantics for controls and practice gestures | Partial | Not started | P0 | L | `MainActivity.kt`; custom renderers; `TripleClickable.kt` | Labels/descriptions are broad, but the helper with explicit custom multi-tap actions is unused; production double-tap sing-back lacks an equivalent custom action. |
| F055 | Standalone audiation pitch-practice container | Unused | Not started | P3 | L | `AudiationPitchPractice.kt` | Compiled and instrumented, but no production caller was found; treat as experimental until product confirms inclusion. |

## Coverage and interpretation

The checklist contains **55 features**: 13 catalog/library, 11 song/theory, 15 playback/quiz, 10 microphone/vocal-practice, and 6 user-data/maintenance/platform features. Every audited screen, meaningful popup/dialog, menu or selector, external-link path, background-media behavior, persistent user-data capability, and material empty/error state maps to at least one ID.

The iOS shell is not evidence of behavioral parity. Its current repository protocol, navigation shell, and SwiftData playlist record are useful boundaries, but no feature should move to **Complete** until its Swift implementation and relevant parity tests pass.

## Highest porting risks

1. Real-time synthesis and process/background transport continuity, including interruptions and remote controls (F027, F038–F039).
2. Microphone DSP and vocal-practice behavior across real iOS hardware, audio routes, and latency profiles (F040–F049).
3. Catalog compatibility and failure-safe replacement of a large, compressed SQLite artifact (F010, F012, F053).
4. Music-theory, enharmonic, chord-voicing, and custom-renderer equivalence (F021–F024, F037).
5. Untangling the implicit navigation, gesture, lifecycle, and shared-state contracts concentrated in Android's Compose entry point (F014, F025, F035, F041, F054).

## Open questions

1. What iPhone/iPad and iOS-version matrix is required, and should background audio be enabled in the first release?
2. Is the pinned v1.0.0 catalog URL and minimum count of 40,609 a permanent distribution contract or temporary bootstrap configuration?
3. Should manual harvest and the dormant missing-payload fallback ship on iOS, or remain Android maintenance tools?
4. Should custom-playlist UI be added on both platforms, or should iOS match only the observable Favorites/playlist-browse behavior?
5. Should the unused audiation container and unused multi-tap helper be retired, promoted to product features, or excluded from the port?
6. What are the required external-link semantics for Hooktheory and YouTube, including failure and region-restriction behavior?
7. Are dark-only presentation, localization/RTL behavior, Dynamic Type, VoiceOver, and iPad layouts release gates or later hardening work?

## Recommended porting sequence

1. Establish shared Swift domain models, catalog/user-store boundaries, catalog validation, and atomic installation (F010, F012, F021–F022, F053).
2. Implement Library navigation, title/artist search, All Songs browsing, history, and origin-aware routing (F001–F009, F014–F015).
3. Deliver Info and Chords with theory parity, native renderers, previews, and source links (F016–F024).
4. Build the foreground audio layer, quiz transport/timeline/cards, controls, then background media integration (F025–F039).
5. Add microphone capture, sing-back, interval practice, persistent pitch, and tessitura calibration on real devices (F040–F049).
6. Complete Favorites, playlist membership/browsing, accessibility semantics, and user-data resilience (F050–F054).
7. Resolve maintenance-only and unused capabilities, run cross-platform parity suites, and harden recovery, performance, and release behavior (F011, F013, F052, F055).
