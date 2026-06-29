# Discrepancies (2)

## Solo beat 32
- truth: `III+(no3no5)` (C++(n°3n5)) | engine: `III+(no3)(no5)` (C+)
- engine notes: ["C3"] | truth PCs: [0,8] | engine PCs: [0]
- piano scrape: ["A3","A#3","Bb3"] | piano PCs: [9,10]
- json: root=3 applied=0 type=5 inv=0
- failing: romanExact, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Outro beat 10.5
- truth: `V7/v°(maj)(phr)` (B7) | engine: `V⁷/v` (B7)
- engine notes: ["B3","D4","F4","Ab4"] | truth PCs: [2,5,8,11] | engine PCs: [2,5,8,11]
- json: root=5 applied=5 type=7 inv=0 borrowed="phrygian"
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

