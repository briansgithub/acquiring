# Step-by-Step Chord Playback Testing

## Current State
- Chord playback is simplified to play ONLY the first chord
- PolySynth configured with maxPolyphony: 6
- Extensive logging enabled

## Testing Steps

### Step 1: Single Chord Test (Current)
**What it does:** Plays only the first chord once at time 0
**How to test:**
1. Load a section
2. Click Play
3. Listen to the single chord
4. Check console for logs

**Expected:** Clean, single chord sound
**If bad:** Issue is with:
- Note format (check console for note names)
- PolySynth configuration
- Envelope settings
- Basic synth setup

### Step 2: Manual Console Test
**What it does:** Test chord playback directly from console
**How to test:**
1. Open browser console
2. Run: `engine.chordSynth.triggerAttackRelease(['C4', 'E4', 'G4'], '1n');`
3. Listen

**Expected:** Clean C major chord
**If bad:** Issue is with PolySynth itself

### Step 3: Two Sequential Chords (No Overlap)
**Modify code to:**
```javascript
// Play first two chords with gap between them
if (chords.length >= 2) {
  Tone.Transport.scheduleOnce(() => {
    this.chordSynth.triggerAttackRelease(chords[0].notes, chords[0].duration);
  }, 0);
  Tone.Transport.scheduleOnce(() => {
    this.chordSynth.triggerAttackRelease(chords[1].notes, chords[1].duration);
  }, chords[0].duration + 0.1); // Gap between chords
  return;
}
```

**Expected:** First chord, then second chord, no overlap
**If bad:** Issue with chord transitions or voice management

### Step 4: Overlapping Chords
**Modify code to:**
```javascript
// Play two overlapping chords
if (chords.length >= 2) {
  Tone.Transport.scheduleOnce(() => {
    this.chordSynth.triggerAttackRelease(chords[0].notes, chords[0].duration);
  }, 0);
  Tone.Transport.scheduleOnce(() => {
    this.chordSynth.triggerRelease(); // Release first chord
    this.chordSynth.triggerAttackRelease(chords[1].notes, chords[1].duration);
  }, chords[0].time + chords[0].duration * 0.5); // Start second while first is playing
  return;
}
```

**Expected:** First chord starts, second chord replaces it cleanly
**If bad:** Issue with voice release/overlap handling

### Step 5: Full Part Scheduling
**Uncomment the Part code** and test with all chords
**Expected:** All chords play in sequence
**If bad:** Issue with Part timing or scheduling

## Common Issues to Check

1. **Note Format**: Should be ["C4", "E4", "G4"] not ["C", "E", "G"]
2. **Timing**: Are times in seconds? Are durations reasonable?
3. **PolySynth Voices**: Check `engine.chordSynth.activeVoices` - should not exceed maxPolyphony
4. **Envelope**: Are attack/release times causing clicks?
5. **Transport**: Is Transport running? Is time correct?

## Next Steps Based on Results

- **If Step 1 sounds bad:** Fix basic synth/envelope/note format
- **If Step 2 sounds bad:** Fix PolySynth configuration
- **If Step 3 sounds bad:** Fix chord sequencing
- **If Step 4 sounds bad:** Fix overlap handling
- **If Step 5 sounds bad:** Fix Part scheduling

