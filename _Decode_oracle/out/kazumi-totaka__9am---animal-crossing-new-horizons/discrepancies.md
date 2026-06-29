# Discrepancies (6)

## Intro and Verse beat 12.5
- truth: `bII11/vi(∆-sub)` (Eb/F) | engine: `V¹¹/vi` (B11)
- engine notes: ["B3","D#4","F#4","A4","C#5","E5"] | truth PCs: [1,3,4,6,9,11] | engine PCs: [1,3,4,6,9,11]
- json: root=6 applied=5 type=11 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, bassInNotes, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Intro and Verse beat 31.5
- truth: `#V9(bor)` (D#9) | engine: `♯V⁹(bor)` (D9)
- engine notes: ["D#3","F#3","A#3","C#4","E#4"] | truth PCs: [1,3,5,7,10] | engine PCs: [1,3,5,6,10]
- json: root=5 applied=0 type=9 inv=0 borrowed=[1,3,5,6,8,10,12]
- failing: rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Intro and Verse beat 44.5
- truth: `bII11/vi(∆-sub)` (Eb/F) | engine: `V¹¹/vi` (B11)
- engine notes: ["B3","D#4","F#4","A4","C#5","E5"] | truth PCs: [1,3,4,6,9,11] | engine PCs: [1,3,4,6,9,11]
- json: root=6 applied=5 type=11 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, bassInNotes, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Intro and Verse beat 63.5
- truth: `#V9(bor)` (D#9) | engine: `♯V⁹(bor)` (D9)
- engine notes: ["D#3","F#3","A#3","C#4","E#4"] | truth PCs: [1,3,5,7,10] | engine PCs: [1,3,5,6,10]
- json: root=5 applied=0 type=9 inv=0 borrowed=[1,3,5,6,8,10,12]
- failing: rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 25
- truth: `ii7/bIII(min)` (cm7) | engine: `ii⁷/iii` (C#m7)
- engine notes: ["C3","Eb3","G3","Bb3"] | truth PCs: [0,3,7,10] | engine PCs: [0,3,7,10]
- json: root=3 applied=2 type=7 inv=0 borrowed="minor"
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 26.5
- truth: `V9/bIII(min)` (F9) | engine: `V⁹/iii` (F#9)
- engine notes: ["F3","A3","C4","Eb4","G4"] | truth PCs: [0,3,5,7,9] | engine PCs: [0,3,5,7,9]
- json: root=3 applied=5 type=9 inv=0 borrowed="minor"
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

