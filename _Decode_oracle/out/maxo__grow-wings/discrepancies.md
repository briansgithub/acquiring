# Discrepancies (3)

## Pre-Chorus beat 22.5
- truth: `vii°/i(maj)` (fx°) | engine: `vii°/i` (F##°)
- engine notes: null | truth PCs: [1,7,10] | engine PCs: []
- json: root=1 applied=7 type=5 inv=0
- failing: romanExact, bassPcMatch, rootInPcs, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- engine error: Cannot read properties of undefined (reading '0')

## Pre-Chorus beat 23.5
- truth: `vii°/i(maj)` (fx°) | engine: `vii°/i` (F##°)
- engine notes: null | truth PCs: [1,7,10] | engine PCs: []
- json: root=1 applied=7 type=5 inv=0
- failing: romanExact, bassPcMatch, rootInPcs, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- engine error: Cannot read properties of undefined (reading '0')

## Pre-Chorus beat 29.5
- truth: `vii°9/iv(maj)` (b#°7(b9)) | engine: `vii°⁹(b9)/iv` (B#°9)
- engine notes: ["B#3","D#4","F#4","A4","C#5","C##5"] | truth PCs: [0,1,3,6,9] | engine PCs: [0,1,2,3,6,9]
- piano scrape: ["D##3","E#4","G##4"] | piano PCs: [4,5,9]
- json: root=4 applied=7 type=9 inv=0
- failing: romanExact, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

