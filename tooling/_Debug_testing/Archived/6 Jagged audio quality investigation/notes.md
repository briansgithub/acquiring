# Jagged Audio Quality Investigation

## Symptoms
- Tones sound jagged/not clean
- Audio quality is poor/rough

## Potential Causes

### 1. Envelope Settings
- Attack: 0.01s (very short - may cause clicks)
- Decay: 0.1s (short)
- Release: 0.3s (short - may cut off notes abruptly)
- Very short envelope times can cause audio artifacts

### 2. Timing Precision
- Events scheduled with `(note.beat - 1) * currentSecondsPerBeat`
- No quantization or smoothing
- Multiple notes triggering at exact same time might cause issues

### 3. Overlapping Notes
- Notes might overlap when durations are longer than gaps
- No voice management or note-off handling
- PolySynth might be handling overlapping notes poorly

### 4. Sample Rate / Buffer Issues
- Default Tone.js settings might not be optimal
- No explicit buffer size configuration

### 5. Synth Recreation
- Synths are disposed/recreated on stop()
- This might cause audio glitches if done during playback

## Investigation Plan
1. Test with longer envelope times
2. Add smoothing/quantization to timing
3. Check for overlapping note issues
4. Test with different oscillator types
5. Verify buffer/sample rate settings

## Findings

### Primary Issue: Very Short Envelope Times
- Attack: 0.01s is extremely short and can cause clicks/pops
- Release: 0.3s is short and may cut notes off abruptly
- These settings are optimized for percussive sounds, not smooth melodic/chordal playback

### Secondary Issues
- No smoothing between notes
- Triangle wave for chords might be too harsh
- No volume/gain control to prevent clipping

## Recommended Fixes
1. Increase attack time to 0.05-0.1s for smoother note starts
2. Increase release time to 0.5-0.8s for smoother note endings
3. Consider using smoother oscillator types (sine for both, or sawtooth with filter)
4. Add slight gain reduction to prevent clipping
5. Consider adding a limiter or compressor

## NEW ISSUE: Overlapping Chords
- Chords have overlapping durations (e.g., beat 1 duration 3 overlaps with beat 4)
- PolySynth stacks all overlapping notes, causing terrible sound
- Need to release previous chord notes before playing new ones
- Solution: Track and release currently playing chord notes when new chord starts

