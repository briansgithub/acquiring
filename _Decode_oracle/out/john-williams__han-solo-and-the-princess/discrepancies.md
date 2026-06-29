# Discrepancies (2)

## Verse beat 9
- truth: `bII△42(phr)` (Ebb/Db) | engine: `♯II△⁴²(phr)` (Dmaj7/Db)
- engine notes: ["C#4","D4","F#4","A4"] | truth PCs: [1,2,6,9] | engine PCs: [1,2,6,9]
- json: root=2 applied=0 type=7 inv=3 borrowed="phrygian"
- failing: romanExact, romanCore, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 21
- truth: `bII(phr)` (Ebb) | engine: `♯II(phr)` (D)
- engine notes: ["D3","F#3","A3"] | truth PCs: [2,6,9] | engine PCs: [2,6,9]
- piano scrape: ["G3","A3"] | piano PCs: [7,9]
- json: root=2 applied=0 type=5 inv=0 borrowed="phrygian"
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

