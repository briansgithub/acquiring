# Acquiring: Android to iOS Conversion Master Plan

This document provides a comprehensive, structured strategy for porting the Acquiring application from Android (Kotlin/Compose) to iOS (Swift/SwiftUI).

## 1. Project Overview & Scope
Acquiring is a music-theoretical tool and ear training app. The core value lies in its ability to:
- Harvest and parse Hooktheory data.
- Interpret complex chord progressions and scale degrees.
- Provide a real-time audio synthesis engine for playback.
- Track user pitch via microphone for interactive practice.

**Scope of Port:** Full feature parity, including the Song Library, Chord/Melody Quiz, Tessitura tracking, and Audio Synthesis.

---

## 2. Architecture Mapping
To maintain maintainability, we will map Android components to their closest iOS equivalents:

| Android Component | iOS Equivalent | Strategy |
| :--- | :--- | :--- |
| **Jetpack Compose** | **SwiftUI** | Declarative mapping; Use `Canvas` for custom notation. |
| **ViewModel (AAC)** | **@Observable classes** | Standard iOS state management. |
| **Room Database** | **SwiftData** | Map Entity/DAO patterns to SwiftData models. |
| **Coroutines/Flow** | **Swift Concurrency (Async/Await/Combine)** | Task-based concurrency. |
| **AudioTrack / Custom Engine** | **AVAudioEngine / AVFoundation** | Low-level C/Swift interop for DSP. |
| **Room Migrations** | **SwiftData Versioning** | Handle database schema updates. |
| **Retrofit / Scraper** | **URLSession / SwiftSoup** | Port scraping logic directly. |

---

## 3. Phase-by-Phase Execution Strategy

### Phase 1: Foundation & Project Scaffolding
*   **Goal:** Setup the Xcode project, SwiftData schema, and basic navigation.
*   **AI Model:** **Claude Code: Sonnet 5 (High)**
*   **Tasks:**
    1.  Create Xcode Project (SwiftUI, SwiftData).
    2.  Define `Song` and `Section` models in SwiftData based on `AppDatabase.kt` and `Song.kt`.
    3.  Implement `DataUtils` (Zlib decompression) using `Compression` framework.
    4.  Set up the `HistoryManager` equivalent using `UserDefaults`.

### Phase 2: Domain Logic Porting (The "Musical Brain")
*   **Goal:** Port the pure Kotlin logic that handles music theory.
*   **AI Model:** **Google Gemini 3.5** (for initial extraction) -> **Sonnet 5 (Medium)** (for translation).
*   **Tasks:**
    1.  Port `MusicTheory.kt`: Scale intervals, degree generation, and pitch calculations.
    2.  Port `ChordInterpreter.kt`: Roman numeral resolution and chord note generation.
    3.  Port `SpelledInterval.kt`: Interval naming and shorthand logic.
    4.  Verify logic parity with unit tests in Swift.

### Phase 3: Audio Engine & Synthesis
*   **Goal:** Replicate the `AudioEngine.kt` and `SynthVoice.kt` behavior.
*   **AI Model:** **OpenAI Codex: Sol (Ultra)**
*   **Tasks:**
    1.  Setup `AVAudioEngine` graph.
    2.  Implement `SynthVoice` as a custom `AVAudioSourceNode` or `AVAudioUnitSampler`.
    3.  Port `QuizPlaybackEngine.kt`: Handle the complex timing and scheduling of notes/chords.
    4.  Port `PitchDetector.kt` and `MicrophonePitchTracker.kt` using `Accelerate` (vDSP) for FFT.

### Phase 4: UI Development (Compose to SwiftUI)
*   **Goal:** Rebuild the interactive views.
*   **AI Model:** **Claude Code: Sonnet 5 (High)**
*   **Tasks:**
    1.  `MainScreen` / `LibraryView`: Navigation and search dropdowns.
    2.  `SongDetailView`: Tab management and section selection.
    3.  `QuizTab`: **CRITICAL TASK.** Rebuild the custom timeline `Canvas` and interactive scale degree buttons.
    4.  `RomanNumeralRenderer`: Port the custom text layout logic to a SwiftUI `View`.

### Phase 5: Harvesting & Scraping
*   **Goal:** Port `Scraper.kt` and `DatabaseDownloader.kt`.
*   **AI Model:** **Gemini 3.6 Flash (Medium)**
*   **Tasks:**
    1.  Implement Hooktheory scraping using `URLSession` and regex/parsing.
    2.  Implement the "Download Full Library" logic, ensuring atomic database swaps.

### Phase 6: Integration & Verification
*   **Goal:** End-to-end testing and performance tuning.
*   **AI Model:** **Claude Code: Sonnet 5 (Ultracode)**
*   **Tasks:**
    1.  UI Testing: Ensure the "Double Tap to Sing" flow works as expected.
    2.  Audio Verification: Compare synthesized output of Android vs. iOS.
    3.  Latency Tuning: Optimize the microphone input path for pitch detection.

---

## 4. Technical Implementation Details

### Audio Synthesis Parity
The Android app uses a custom `AudioEngine` with Sawtooth/Sine waveforms. On iOS, we will use `AVAudioSourceNode` to render the same math-based waveforms to ensure the "Acquiring" sound is identical.
- **Android:** `AudioTrack` with manual buffer filling.
- **iOS:** `AVAudioSourceNode` callback for real-time synthesis.

### The "Canvas" Challenge
The `QuizTab` features a custom-rendered timeline. We will use SwiftUI's `Canvas` (introduced in iOS 15) which provides an immediate-mode drawing API very similar to Compose's `Canvas`. The `RomanNumeralPainter` logic will be ported to a SwiftUI-friendly `Shape` or `View` renderer.

---

## 5. Timeline & Milestones

| Milestone | Duration | Primary Model |
| :--- | :--- | :--- |
| **M1: Core Models & Musical Logic** | 1 Week | Gemini 3.5 / Sonnet 5 |
| **M2: Audio Synthesis & Playback** | 2 Weeks | Sol (Ultra) |
| **M3: UI Scaffolding & Library** | 1 Week | Sonnet 5 (High) |
| **M4: The Quiz View (Advanced UI)** | 2 Weeks | Sonnet 5 (High) |
| **M5: Pitch Detection & Scraper** | 1 Week | Gemini 3.6 Flash |
| **M6: Polishing & Bug Fixes** | 1 Week | Sonnet 5 (Ultracode) |

---

## 6. Risk Assessment

- **Audio Latency (High Risk):** iOS usually has better latency, but the `vDSP` port for pitch detection must be highly optimized.
- **Music Theory Complexity (Medium Risk):** The `ChordInterpreter` has many edge cases. We will mitigate this by porting the Android unit tests first.
- **SwiftData Performance (Low Risk):** The library is large; we must ensure indexes are set correctly for the `Song` slug searches.

---
*Document Version: 1.1*
*Status: Awaiting Approval for Phase 1*
