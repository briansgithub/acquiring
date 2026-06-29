# Discrepancies (3)

## Verse beat 5
- truth: `vii°7/bII(maj)(phr)` (e°7) | engine: `vii°⁷/ii` (E#°7)
- engine notes: ["E3","Db4","G4","Bb4"] | truth PCs: [1,4,7,10] | engine PCs: [1,4,7,10]
- json: root=2 applied=7 type=7 inv=0 borrowed="phrygian"
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 21
- truth: `vii°7/bII(maj)(phr)` (e°7) | engine: `vii°⁷/ii` (E#°7)
- engine notes: ["E3","Db4","G4","Bb4"] | truth PCs: [1,4,7,10] | engine PCs: [1,4,7,10]
- json: root=2 applied=7 type=7 inv=0 borrowed="phrygian"
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 28.75
- truth: `bvi43(bor)` (cm7/G) | engine: `♭vi⁴³(bor)` (C#m7/G#)
- engine notes: ["G3","Bb3","C4","Eb4"] | truth PCs: [1,4,8,11] | engine PCs: [0,3,7,10]
- json: root=6 applied=0 type=7 inv=2 borrowed=[-1,1,3,5,6,8,10]
- failing: rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

