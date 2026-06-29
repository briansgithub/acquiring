# Discrepancies (2)

## Pre-Chorus beat 31
- truth: `iii` (dm) | engine: `V` (F)
- engine notes: ["F3","A3","C4"] | truth PCs: [2,5,9] | engine PCs: [0,5,9]
- piano scrape: ["A2","C#3"] | piano PCs: [1,9]
- json: root=5 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Pre-Chorus beat 33
- truth: `V` (F) | engine: `I` (Bb)
- engine notes: ["Bb3","D4","F4"] | truth PCs: [0,5,9] | engine PCs: [2,5,10]
- json: root=1 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

