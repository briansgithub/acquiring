# Porting Advanced Chord and Roman Numeral Logic to Android

This plan outlines the porting of sophisticated music theory conversion logic from the Sacred Ring web player to the Android application. The goal is to provide accurate Roman Numeral and Letter Name representations of chords, including support for applied chords, borrowed modes, inversions, and proper musical symbols (♭/♯).

## User Review Required

> [!IMPORTANT]
> **Musical Symbols**: As requested, we will use the proper Unicode symbols for flat (♭, U+266D) and sharp (♯, U+266F) in all UI displays.
> **Data Availability**: The current Android app downloads a ~2.4MB metadata catalog. The full harvested song JSON data (the `dataBlob` in the `Song` entity) is currently populated on-demand via web scraping in the `HarvestService`. If you have a pre-harvested bundle of all songs, we should discuss how to integrate its download or inclusion as an asset.

## Proposed Changes

### 1. Music Theory Engine Refactor
We will enhance `MusicTheory.kt` to support dynamic scale label generation and include more scale types, matching the web app's `musicScale.js` and `scales.js`.

#### [MODIFY] [MusicTheory.kt](file:///H:/Desktop/3_sacred_ring/android/app/src/main/java/com/sacredring/android/MusicTheory.kt)
- Update `NOTE_TO_PC` and `SCALE_INTERVALS` to include Harmonic Minor and Phrygian Dominant.
- Replace hardcoded `MAJOR_LABELS` with a dynamic `generateScaleLabels` function that correctly calculates note names based on the tonic and scale intervals.
- Implement Unicode symbols (♭, ♯) in note labels.

### 2. Advanced Chord Interpretation
We will overhaul `ChordInterpreter.kt` to implement the full logic from `jsonToSymbol.js`.

#### [MODIFY] [ChordInterpreter.kt](file:///H:/Desktop/3_sacred_ring/android/app/src/main/java/com/sacredring/android/ChordInterpreter.kt)
- **Port `buildSuffix`**: Handle inversions (figured-bass), suspensions, extensions, alterations, additions, and omits.
- **Port `getRomanSymbol`**: Full support for applied chords (secondary functions), borrowed chords, and complex suffixes.
- **Port `getLetterName`**: Resolve root note name accurately for applied/borrowed contexts and append quality/extension suffixes.
- **Support Inversions**: Correctly identify the bass note for slash-chord notation (e.g., C/G).

### 3. UI Enhancements in Chords Tab
Update the `ChordsTab` in `MainActivity.kt` to use the new interpreter and provide a toggle for letter names.

#### [MODIFY] [MainActivity.kt](file:///H:/Desktop/3_sacred_ring/android/app/src/main/java/com/sacredring/android/MainActivity.kt)
- Enhance `ChordsTab` to display the refined Roman Numeral symbols.
- Add a toggle switch or button to show/hide note pitch class letter names below the Roman Numerals.
- Ensure chord cards are sized appropriately for complex symbols (e.g., `♭VII7sus4/V`).

## Verification Plan

### Automated Tests
- Create or update unit tests for `ChordInterpreter` with a suite of complex test cases:
    - Applied chords: `V7/V`, `vii°7/ii`.
    - Borrowed chords: `♭VI(min)`, `ii°(dor)`.
    - Inversions: `I6`, `V43`, `ii65`.
    - Alterations: `V7(#5)`, `I(add9)`.
- Verify that `MusicTheory.getNoteLabel` produces correct results for remote keys (e.g., F♯ major, C♭ major).

### Manual Verification
1. Deploy the app to a device/emulator.
2. Harvest a complex song (e.g., "Bohemian Rhapsody" or "Maple Leaf Rag").
3. Navigate to the **Chords** tab.
4. Verify that Roman Numerals match the web app's display.
5. Toggle Letter Names and verify accuracy.
6. Click chord names to confirm they play the correct notes audibly.
