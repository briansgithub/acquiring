# Chord Testing Progression

## Results So Far
✅ Single note sounds good (melodySynth)
❌ Full chord sounds bad (PolySynth)

## Current Test: Two Notes
- Testing with first 2 notes of chord using PolySynth
- This will tell us if issue is:
  - PolySynth itself
  - Multiple notes (2+)
  - Specific to 3-note chords

## Next Steps Based on Results

### If 2 notes sound good:
- Test with 3 notes
- If 3 notes sound bad → issue with voice count or specific note combination

### If 2 notes sound bad:
- Try individual Synths instead of PolySynth
- Check if it's a PolySynth configuration issue
- Test with different note combinations

## Alternative Approach: Individual Synths
If PolySynth continues to sound bad, we can use separate Synth instances:
```javascript
// Create 3 separate synths for chord
const chordSynths = [
  new Tone.Synth(...).toDestination(),
  new Tone.Synth(...).toDestination(),
  new Tone.Synth(...).toDestination(),
];
// Trigger each separately
chordSynths[0].triggerAttackRelease(notes[0], duration, time);
chordSynths[1].triggerAttackRelease(notes[1], duration, time);
chordSynths[2].triggerAttackRelease(notes[2], duration, time);
```

