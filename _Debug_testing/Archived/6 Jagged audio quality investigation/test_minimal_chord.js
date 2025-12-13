// Minimal chord test - copy/paste into browser console
// Test basic PolySynth functionality

console.log("=== MINIMAL CHORD TEST ===");

// Test 1: Single chord, manual trigger
console.log("\nTest 1: Manual single chord");
console.log("Run: engine.chordSynth.triggerAttackRelease(['C4', 'E4', 'G4'], '1n');");
console.log("Expected: Clean C major chord");

// Test 2: Single chord with longer duration
console.log("\nTest 2: Longer duration");
console.log("Run: engine.chordSynth.triggerAttackRelease(['C4', 'E4', 'G4'], '2n');");
console.log("Expected: Same chord, held longer");

// Test 3: Two chords in sequence (no overlap)
console.log("\nTest 3: Sequential chords");
console.log("Run:");
console.log("  engine.chordSynth.triggerAttackRelease(['C4', 'E4', 'G4'], '1n', '+0');");
console.log("  engine.chordSynth.triggerAttackRelease(['F4', 'A4', 'C5'], '1n', '+1');");
console.log("Expected: C chord, then F chord, no overlap");

// Test 4: Overlapping chords (the problem case)
console.log("\nTest 4: Overlapping chords");
console.log("Run:");
console.log("  engine.chordSynth.triggerAttackRelease(['C4', 'E4', 'G4'], '2n', '+0');");
console.log("  engine.chordSynth.triggerAttackRelease(['F4', 'A4', 'C5'], '1n', '+1');");
console.log("Expected: C chord starts, F chord starts while C is still playing");
console.log("This should sound bad if PolySynth is stacking voices");

// Test 5: Check PolySynth configuration
console.log("\nTest 5: Check PolySynth settings");
console.log("Run: console.log(engine.chordSynth);");
console.log("Check: maxPolyphony, voiceCount, activeVoices");

