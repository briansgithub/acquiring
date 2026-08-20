# Summary: Recent Accomplishments & Remaining Parity Audit Plan

---

## 1. What We Did

### A. Mid-Section Key Modulation Resolution
- **Dynamic Beat-Level Key Lookup**: Implemented `ExtractedSection.getKeyAtBeat(beat)` in `HooktheoryModels.kt` to resolve active keys dynamically for multi-key songs (e.g. Weird Al Yankovic's "Hardware Store").
- **Quiz Timeline Integration**: Updated melody note pitch calculation, timeline chord overlay label drawing, and current chord interactive button rendering in `MainActivity.kt` to pass the exact active key at each beat position.

### B. Polyphonic Audio Engine Architecture (`AudioEngine.kt`)
- **Independent `AudioTrack` Instances**: Replaced single shared static `AudioTrack` with per-sound `AudioTrack` instances using `AudioTrack.MODE_STATIC`.
- **Eliminated Multi-Sound Crashes**: Enabled native Android `AudioFlinger` mixing so melody notes, background chords, and manual chord button taps can play simultaneously without thread collisions or buffer crashes.
- **Background Cleanup**: Managed track lifecycle with background coroutines that automatically stop and release audio tracks upon completion.

### C. Quiz Tab UI & Control Layout
- **Perimetered Timeline Chords**: Added explicit outline borders (`Stroke(width = 2.dp)`) around all chord blocks in the visual timeline canvas and centered symbol strings inside each chord rectangle.
- **Top-Right Beat Counter**: Moved the beat counter (`Beat: X.XX / Y`) to the top-right corner.
- **Bottom-Right Overlay Controls**:
  - Positioned Play/Pause and Restart buttons above the Section selector dropdown.
  - Positioned the Chords toggle switch to the left of the Section selector dropdown with a small `"Chords"` label centered above it.
  - Enabled chord playback by default (`playChords` set to `true`).

### D. Web vs. Android Parity Benchmark Harness
- **Parity Exporter (`_Decode_oracle/export_parity_corpus.js`)**: Created a Node.js script that extracts 31 representative benchmark test cases from the JS web player engine (`web-player/lib/jsonToSymbol.js` and `web-player/lib/music.js`).
- **Kotlin Parity Test Suite (`CorpusParityTest.kt`)**: Implemented a JUnit 4 test suite in `android/app/src/test/java/com/acquiring/android/CorpusParityTest.kt` that loads `corpus_parity.json` and evaluates Android's `ChordInterpreter` against JS web player ground truth for Roman numerals, letter names, and pitch-class sets.

---

## 2. What Is Left To Do

### Step 1: Execute `CorpusParityTest` Benchmark
- Run `:app:testDebugUnitTest` to evaluate the 31 benchmark test cases and capture the discrepancy report comparing the JS web player output against Kotlin `ChordInterpreter`.

### Step 2: Resolve Engine Discrepancies in `ChordInterpreter.kt`
- Port relevant fixes from the JS web player engine (`DECODE_FIX_LOG.md`) to `ChordInterpreter.kt` and `MusicTheory.kt` for any identified failures, including:
  - Custom borrowed array absolute semitone offset handling.
  - Inversion figured-bass formatting rules.
  - Extended/altered chord voicing pipeline (`omits`, `adds`, `alterations`, `suspensions`).
  - Secondary applied chord target scale resolutions.

### Step 3: Expand Corpus Coverage & Final Verification
- Export larger corpus batches from `corpus2.json` / `corpus3.json` into `corpus_parity.json` to verify widespread accuracy.
- Re-run unit tests to confirm 100% parity across Roman symbols, letter names, and pitch-class sets.
