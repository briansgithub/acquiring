# Chord Playback Findings

## Test Results Summary

✅ Single note sounds good (melodySynth)
❌ Two notes with PolySynth sounds bad
❌ Full chord with individual synths sounds bad
❌ Full chord with sequential notes (current test)

## Hypothesis: Volume/Clipping Issue

If multiple notes playing simultaneously cause clipping/distortion, sequential playback should sound better.

## Current Test: Sequential Notes
- Playing notes one after another (not simultaneously)
- Each note plays for 30% of chord duration
- Using single melodySynth (known to work)

## If Sequential Sounds Good:
- Issue is with simultaneous playback
- Possible causes:
  - Volume too high (clipping)
  - AudioContext overload
  - Destructive interference
  - Need volume reduction

## If Sequential Still Sounds Bad:
- Issue is with the notes themselves or timing
- Check:
  - Are note names correct?
  - Are durations reasonable?
  - Is there something wrong with the chord data?

## Next Steps

### If sequential sounds good:
1. Reduce volume/gain for simultaneous playback
2. Add limiter/compressor
3. Test with lower volume individual synths

### If sequential still sounds bad:
1. Verify note names are correct
2. Test with hardcoded notes: ["C4", "E4", "G4"]
3. Check if duration format is correct
4. Test with different envelope settings

