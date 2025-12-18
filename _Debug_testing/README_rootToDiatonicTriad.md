# Testing rootToDiatonicTriad Function

This directory contains test and debug utilities for the `rootToDiatonicTriad` function located in `web-player/lib/music.js`.

## Files

- **`test_rootToDiatonicTriad.js`** - Main test and debug file with utilities to test the function
- **`test_cases_rootToDiatonicTriad.js`** - Comprehensive collection of test cases covering various scenarios
- **`package.json`** - Package configuration for running tests with ES modules

## Usage

### Web Browser GUI (Recommended)

Launch the interactive GUI in your web browser:

```bash
cd _Debug_testing
npm run gui
# or
node test_server.js
```

Then open `http://localhost:3001` in your browser.

#### GUI Features:

**Manual Input Tab:**
- Form fields for all function parameters:
  - Chord Root Scale Degree (1-7)
  - Key (Tonic and Scale type)
  - Base Octave
  - Borrowed Scale (mode borrowing or custom intervals)
  - Chord Type (Triad or 7th)
  - Inversion (0-3)
- Custom intervals input for custom scales
- "Test Function" button to execute and display results
- "Test Helpers" button to test helper functions (getNoteLabel, scaleDegreeToSpecificInterval, etc.)
- Reset button to clear all fields

**Test Cases Tab:**
- Browse all predefined test cases
- Click any test case to load it into the form and auto-test
- Organized by category (basic, inversions, 7th chords, borrowed chords, etc.)

**Results Panel:**
- Displays function results (notes and chord degrees)
- Shows all input parameters
- Full JSON result object
- Color-coded output (success/error)
- Detailed error messages with stack traces

### Run All Test Cases (Command Line)

```bash
cd _Debug_testing
npm test
# or
node test_rootToDiatonicTriad.js
```

### Run Specific Scenarios

```bash
node test_rootToDiatonicTriad.js --scenarios
```

### Test a Single Chord

```bash
node test_rootToDiatonicTriad.js --single <chordRootSD> <tonic> <scale> <baseOctave> [borrowed] [chordType] [inversion]
```

Example:
```bash
node test_rootToDiatonicTriad.js --single 1 C major 3
node test_rootToDiatonicTriad.js --single 5 C major 3 null 7 0
node test_rootToDiatonicTriad.js --single 4 C major 3 minor 5 0
```

### Import and Use in Your Own Code

```javascript
import { testSingleChord, testAllCases, testSpecificScenarios } from './test_rootToDiatonicTriad.js';
import { testCases, getTestCasesByCategory } from './test_cases_rootToDiatonicTriad.js';

// Test a single chord
testSingleChord(1, { tonic: 'C', scale: 'major' }, 3);

// Run all test cases
testAllCases();

// Get test cases by category
const borrowedChords = getTestCasesByCategory('borrowed');
```

## Test Case Categories

The test cases file includes helper functions to filter test cases:

- `getTestCasesByCategory(category)` - Get test cases by category:
  - `'basic'` - Basic major key triads
  - `'inversions'` - Chords with inversions
  - `'sevenths'` - 7th chords
  - `'minor'` - Minor key chords
  - `'borrowed'` - Borrowed chords (mode mixing)
  - `'custom'` - Custom scale chords
  - `'modal'` - Modal scale chords
  - `'edge'` - Edge cases

- `getTestCasesByScaleDegree(degree)` - Get all test cases for a specific scale degree (1-7)
- `getTestCasesByKey(tonic, scale)` - Get all test cases for a specific key

## Function Signature

```javascript
rootToDiatonicTriad(chordRootSD, key, baseOctave, borrowed = null, chordType = 5, inversion = 0)
```

### Parameters

- **`chordRootSD`** (number, 1-7): Scale degree of the chord root (no modifiers)
- **`key`** (object): `{ tonic: string, scale: string }` - The key signature
- **`baseOctave`** (number): Base octave for note generation
- **`borrowed`** (null | string | array): 
  - `null` - Use the key's native scale
  - `string` - Mode name ("major", "minor", "dorian", "phrygian", "lydian", "mixolydian", "locrian")
  - `array` - Custom scale intervals [d1, d2, d3, d4, d5, d6, d7]
- **`chordType`** (number): 
  - `5` - Triad (3-note chord)
  - `7` - Dominant 7th (4-note chord)
- **`inversion`** (number): 
  - `0` - Root position
  - `1` - First inversion
  - `2` - Second inversion
  - `3` - Third inversion (7th chords only)

### Returns

```javascript
{
  notes: string[],           // Tone.js note names (e.g., ["C3", "E3", "G3"])
  chordDegrees: string[]     // Scale degrees relative to original key (e.g., ["1", "3", "5"])
}
```

## Test Coverage

The test cases cover:

1. **Basic Major Key Triads** - All 7 scale degrees in major keys
2. **Inversions** - All inversion types for triads and 7th chords
3. **7th Chords** - Dominant 7th chords in various keys
4. **Minor Key Triads** - Chords in minor keys
5. **Different Keys** - Various key signatures (C, G, F, D, Bb, F#, Eb, etc.)
6. **Borrowed Chords** - Mode mixing (borrowing from parallel modes)
7. **Custom Scales** - Custom interval arrays
8. **Modal Scales** - Dorian, Mixolydian, Lydian, Phrygian, Locrian
9. **Edge Cases** - Different octaves, boundary conditions

## Debugging

The test file provides detailed output including:

- Function results (notes and chord degrees)
- Debug information (all input parameters)
- Helper function results (getNoteLabel, scaleDegreeToSpecificInterval, etc.)
- Color-coded console output for easy reading
- Error messages with stack traces

## Dependencies

The test files import from:
- `../web-player/lib/music.js` - Main music functions
- `./test_cases_rootToDiatonicTriad.js` - Test case definitions

Make sure you're running from the `_Debug_testing` directory or adjust the import paths accordingly.
