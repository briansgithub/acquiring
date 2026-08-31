# Single Note Test Results

## Current Test
- Playing ONLY the root note of the first chord
- Using melodySynth (single voice Synth) instead of PolySynth
- Duration: 3.2 seconds

## Expected Results
- Clean, single note sound
- No distortion, clicks, or jaggedness

## If Single Note Sounds Good
- Issue is with PolySynth or multi-note chords
- Next: Test with 2 notes
- Then: Test with 3 notes using individual Synths

## If Single Note Sounds Bad
- Issue is with:
  - Basic Synth configuration
  - Envelope settings
  - Note format/parsing
  - AudioContext setup
  - Duration format (number vs string)

## Next Steps Based on Results

### If single note sounds good:
1. Test 2 notes with PolySynth
2. Test 3 notes with PolySynth
3. Compare PolySynth vs individual Synths

### If single note sounds bad:
1. Check note format: Is "E4" valid?
2. Test with hardcoded note: `melodySynth.triggerAttackRelease("C4", "1n")`
3. Check envelope settings
4. Check AudioContext state
5. Verify duration format (try string "3.2" vs number 3.2)

