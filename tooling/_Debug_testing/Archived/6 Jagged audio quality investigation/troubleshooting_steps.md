# Chord Playback Troubleshooting Steps

## Simplified Version Applied
The chord scheduling has been simplified to isolate the issue:
1. Removed all overlap handling logic
2. Added extensive console logging
3. Added option to disable chords completely

## Testing Steps

### Step 1: Test with chords disabled
1. Open `web-player/audio/engine.js`
2. Uncomment the `return;` line in `scheduleChords()` (around line 55)
3. Reload and play - does melody sound fine?
4. If yes → issue is with chord playback specifically
5. If no → issue is with audio engine/synth setup

### Step 2: Test single chord
1. Comment out the `return;` line
2. Modify to play only first chord:
   ```javascript
   if (chords.length > 1) {
     chords = [chords[0]]; // Only play first chord
   }
   ```
3. Play and listen - does single chord sound okay?

### Step 3: Check console logs
1. Open browser DevTools console
2. Look for "CHORD DEBUG:" messages
3. Check:
   - Are notes in correct format? (e.g., ["C4", "E4", "G4"])
   - Are times reasonable?
   - Are durations reasonable?
   - Any errors?

### Step 4: Test manual chord playback
In browser console:
```javascript
// Get engine instance (if accessible)
engine.chordSynth.triggerAttackRelease(["C4", "E4", "G4"], "1n");
// Does this sound okay?
```

### Step 5: Check note format
Verify `chordRootToNotes()` returns correct format:
- Should be: ["C4", "E4", "G4"]
- Not: ["C", "E", "G"] (missing octaves)
- Not: ["C#4", "E#4"] (invalid notes)

## Common Issues to Check

1. **Note format**: PolySynth needs notes with octaves
2. **Invalid notes**: Check for notes like "E#" which don't exist
3. **Timing**: Are chords scheduled at correct times?
4. **PolySynth voice limit**: Too many overlapping voices?
5. **Envelope settings**: Still too aggressive?

