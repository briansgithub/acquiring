# Technical Summary: Mid-Section Key Change Resolution & "Hardware Store" Audio Assessment

### **1. Executive Summary & Goal**
- **Objective**: Assess and debug timeline melody playback in the Android app's **Quiz tab** for Weird Al Yankovic's "Hardware Store" (`weird-al-yankovic__hardware-store`). Ensure mid-section key modulations (which occur at specific beat offsets within a section) are handled dynamically during melody MIDI pitch generation, chord symbol rendering, and root degree label calculation, matching the JavaScript web app (`H:\Desktop\3_sacred_ring\web-player\player.js`).

---

### **2. Architectural Analysis & Key Discoveries**
- **Web App (`web-player/player.js`) Logic**:
  - Web player defines `activeSectionKeyAtBeat(keys, beat, fallbackKey)` which iterates through `keys` (sorted by `beat` ascending) and picks the latest key where `k.beat <= beat`.
  - When scheduling melody notes (`createMelodyEvents`) and chord events (`createChordEvents`), active keys are resolved dynamically per note/chord beat position.
- **Android App Defect**:
  - `ExtractedSection.getParsedKey()` previously only extracted `keys[0]` from section metadata, treating entire sections as single-key structures.
  - `QuizTab` in `MainActivity.kt` used a static single `KeyInfo` for melody playback (`MusicTheory.getMidiNote`), chord symbol drawing, and interactive chord/root button rendering across the entire section timeline.

---

### **3. Completed Modifications**

#### **A. `android/app/src/main/java/com/sacredring/android/HooktheoryModels.kt`**
1. Added `KeyInfoWithBeat(val key: KeyInfo, val beat: Double)` data class.
2. Added `ExtractedSection.getKeys(): List<KeyInfoWithBeat>`:
   - Parses all objects in `metadata["keys"]` `JsonArray` (extracting `tonic`, `scale`, and `beat`), returning a list sorted by `beat`.
3. Added `ExtractedSection.getKeyAtBeat(beat: Double): KeyInfo`:
   - Iterates through `getKeys()` and returns the latest active key where `key.beat <= beat`.
4. Refactored `getParsedKey()` to delegate to `getKeyAtBeat(1.0)` for backward compatibility.

#### **B. `android/app/src/main/java/com/sacredring/android/MainActivity.kt`**
1. Refactored `QuizTab(section)` melody playback loop:
   - Replaced static `key` resolution with `val activeKey = section.getKeyAtBeat(note.beat)` per note, passing `activeKey` to `MusicTheory.getMidiNote(note.sd, note.octave, activeKey)`.

---

### **4. Remaining Implementation Steps**

1. **Finish `MainActivity.kt` `QuizTab` Updates**:
   - Update timeline chord overlay label drawing to use `val chordKey = section.getKeyAtBeat(beat)` when calling `ChordInterpreter.getRomanSymbol(chord, chordKey)`.
   - Update `currentChord` interactive button section to use `val activeKey = section.getKeyAtBeat(currentBeat)` for chord Roman symbol, chord note list (`ChordInterpreter.getChordNotes`), and root degree label generation (`MusicTheory.getDegreeLabelFromMidi(rootMidi, activeKey)`).

2. **Unit Testing (`KeyChangePlaybackTest.kt`)**:
   - Create `android/app/src/test/java/com/sacredring/android/KeyChangePlaybackTest.kt` to verify:
     - Beat-level key resolution (`section.getKeyAtBeat`).
     - Correct MIDI note pitch shifts across key boundary changes (e.g., Bb Mixolydian to C major).
     - Accurate chord note generation across mid-section key modulations.
   - Run `./gradlew testDebugUnitTest` or `gradle_build("app:testDebugUnitTest")`.

3. **Walkthrough & Verification Artifact**:
   - Create `walkthrough.artifact.md` summarizing the completed changes, test execution results, and timeline accuracy.
