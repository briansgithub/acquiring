# Simplified Architecture Overview

## Recommended Structure for Current App Size

## Directory Structure

```
web-player/
├── index.html              # Main HTML with three-pane layout
├── player.js               # Main orchestration (coordinates all components)
├── style.css               # Styling for three-pane layout
├── server.js               # HTTP server
│
├── lib/                    # Core libraries
│   ├── config.js          # Constants (SONG_LIBRARY, music theory constants)
│   └── music.js           # All music utilities combined
│       - chordParser       # Chord-to-notes conversion (encapsulated)
│       - scaleUtils        # Scale degree parsing and MIDI conversion
│       - timingUtils       # Beat/time conversions
│       - dataUtils         # Data fetching and flattening
│
├── audio/                  # Audio engine
│   └── engine.js          # Tone.js setup, synths, parts, transport
│
└── components/             # UI components (flat structure, no subdirectories)
    ├── controls.js        # Left pane: song selection and controls
    ├── chordRing.js       # Center pane: circular chord visualization
    └── noteIndicator.js   # Right pane: currently playing notes
```