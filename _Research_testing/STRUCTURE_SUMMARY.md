# Hooktheory API Data Structure Documentation

## Overview
This document describes the JSON structure returned from the Hooktheory API for melody and chord data across different song sections.

**API Endpoint:** `https://api.hooktheory.com/v1/songs/public/{songId}?fields=ID,xmlData,song,jsonData`

## Data Location
The main data is in the `jsonData` field of the API response, which contains a JSON string that needs to be parsed.

## Root Structure
The parsed `jsonData` contains:
- `version`: Version number
- `chords`: Array of chord objects
- `notes`: Array or object containing melody/note objects
- `keys`: Key information
- `tempos`: Tempo information
- `meters`: Time signature information
- `sections`: Section definitions
- `bands`: Instrument/band information
- `lyrics`: Lyrics data
- And other metadata fields

## Chord Object Structure

Each chord in the `chords` array has the following structure:

```json
{
  "root": 1,              // Root note (0-11: 0=C, 1=C#, 2=D, 3=D#, 4=E, 5=F, 6=F#, 7=G, 8=G#, 9=A, 10=A#, 11=B)
  "beat": 1,             // Beat number where chord starts
  "duration": 3,         // Duration in beats
  "type": 5,             // Chord type (5=major, 7=dominant 7th, 9=9th, etc.)
  "inversion": 0,        // Inversion (0=root position, 1=first inversion, 2=second inversion, etc.)
  "applied": 0,          // Applied chord / secondary dominant (0=none)
  "adds": [],            // Array of added notes
  "omits": [],           // Array of omitted notes
  "alterations": [],     // Array of altered notes
  "suspensions": [],     // Array of suspended notes
  "pedal": null,         // Pedal tone (null if none)
  "alternate": "",       // Alternate chord name/notation
  "borrowed": null,      // Borrowed chord from parallel key (null if none)
  "isRest": false,       // Whether this is a rest
  "recordingEndBeat": null // End beat for recording (null if not applicable)
}
```

### Chord Type Values
- `5` = Major triad
- `7` = Dominant 7th
- `9` = 9th chord
- Other values represent different chord types

## Melody/Note Object Structure

Melody data is stored in the `notes` field, which can be either:
1. An array of note objects (single melody line)
2. An object with multiple melody lines (keys are melody identifiers)

### Single Melody (Array Format)
```json
[
  {
    "sd": "1",           // Scale degree (note name relative to key)
    "octave": 0,         // Octave number
    "beat": 1.5,         // Beat number where note starts
    "duration": 0.5,     // Duration in beats
    "isRest": false,     // Whether this is a rest
    "recordingEndBeat": null // End beat for recording
  }
]
```

### Multiple Melodies (Object Format)
```json
{
  "melody1": [
    { "sd": "1", "octave": 0, "beat": 1, "duration": 0.5, "isRest": false, "recordingEndBeat": null },
    // ... more notes
  ],
  "melody2": [
    // ... notes for second melody
  ]
}
```

## Section Mapping

Each section (Intro, Verse, Chorus, Bridge, Outro) is loaded as a separate API call with a unique `songId`:

- **Intro**: Multiple song IDs (e.g., `ZbgOR-qQmnY`, `yvgPqBwKxYq`)
- **Chorus**: Uses the main song ID (`nvgy-kVrgkA`)
- **Bridge**: Has its own song ID (`RPxenBQAob_`)
- **Outro**: (To be discovered)

Each section's `jsonData` follows the same structure with:
- `chords`: Array of chord objects for that section
- `notes`: Melody/note objects for that section
- Other metadata specific to that section

## Example Usage

```javascript
// Fetch section data
const response = await fetch('https://api.hooktheory.com/v1/songs/public/{songId}?fields=ID,xmlData,song,jsonData');
const data = await response.json();

// Parse jsonData
const jsonData = JSON.parse(data.jsonData);

// Access chords
const chords = jsonData.chords; // Array of chord objects

// Access melody/notes
const notes = jsonData.notes; // Array or object of note objects

// Access sections metadata
const sections = jsonData.sections; // Section definitions
```

## Notes

1. The `jsonData` field is a JSON string that must be parsed
2. Each section may have different song IDs
3. Chord and note arrays are indexed by beat position
4. The `root` field uses numeric encoding (0-11) for chromatic notes
5. The `sd` (scale degree) field in notes uses string notation relative to the key
6. Multiple melody lines can exist in the same section (stored as object with keys)

