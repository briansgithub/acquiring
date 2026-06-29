# Discrepancies (3)

## Verse beat 23
- truth: `vii7(#5)` (f#m7(#5)) | engine: `vii+ø⁷(#5)` (F#°7)
- engine notes: ["F#3","D4","E4","A4"] | truth PCs: [2,4,6,9] | engine PCs: [2,4,6,9]
- json: root=7 applied=0 type=7 inv=0 alt=["#5"]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 33
- truth: `iiø7(b5)/ii` (bm7(b5)) | engine: `ii⁷(b5)/ii` (Bm7)
- engine notes: ["B3","D4","F4","Ab4"] | truth PCs: [2,5,8,11] | engine PCs: [2,5,8,11]
- json: root=2 applied=2 type=7 inv=0 alt=["b5"]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 64
- truth: `ii°6(b5)4/ii` (b°(b5)/F) | engine: `ii⁶₄(b5)/ii` (Bm/F#)
- engine notes: ["F3","F4","B4","D4"] | truth PCs: [2,5,11] | engine PCs: [2,5,11]
- json: root=2 applied=2 type=5 inv=2 alt=["b5"]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

