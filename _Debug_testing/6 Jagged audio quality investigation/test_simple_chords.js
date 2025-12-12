// Simple chord test - run in browser console
// This tests basic chord playback without overlap handling

console.log("=== Simple Chord Test ===");
console.log("Testing basic chord playback to isolate issues");

// Test 1: Single chord
console.log("\nTest 1: Play single chord (C4, E4, G4)");
// In console: engine.chordSynth.triggerAttackRelease(["C4", "E4", "G4"], "1n");

// Test 2: Two chords in sequence
console.log("\nTest 2: Play two chords sequentially");
// In console: 
// engine.chordSynth.triggerAttackRelease(["C4", "E4", "G4"], "1n", "+0");
// engine.chordSynth.triggerAttackRelease(["F4", "A4", "C5"], "1n", "+1");

// Test 3: Overlapping chords (the problem case)
console.log("\nTest 3: Overlapping chords (problem case)");
// In console:
// engine.chordSynth.triggerAttackRelease(["C4", "E4", "G4"], "2n", "+0");
// engine.chordSynth.triggerAttackRelease(["F4", "A4", "C5"], "1n", "+1");

