# Discrepancies (2)

## Verse beat 48.5
- truth: `bvii6(add9)(bor)` (dm(add9)/F) | engine: `♭vii⁶(add9)(bor)` (D#°/F#)
- engine notes: ["F3","A3","E4","D4"] | truth PCs: [3,5,6,10] | engine PCs: [2,4,5,9]
- piano scrape: ["A#2","C#3"] | piano PCs: [1,10]
- json: root=7 applied=0 type=5 inv=1 borrowed=[-1,1,3,5,6,8,10]
- failing: rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 55
- truth: `Vsus47` (B7sus4) | engine: `V⁷sus4` (B7sus4)
- engine notes: ["B3","E4","F#4","A4"] | truth PCs: [4,6,9,11] | engine PCs: [4,6,9,11]
- json: root=5 applied=0 type=7 inv=0 sus=[4]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

