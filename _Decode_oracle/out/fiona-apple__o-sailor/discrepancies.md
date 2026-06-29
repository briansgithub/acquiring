# Discrepancies (4)

## Pre-Chorus beat 25
- truth: `V65/I(maj)(mix)` (A7/C#) | engine: `V⁶⁵/i` (A7/C#)
- engine notes: ["C#4","E4","G4","A4"] | truth PCs: [1,4,7,9] | engine PCs: [1,4,7,9]
- json: root=1 applied=5 type=7 inv=1 borrowed="mixolydian"
- failing: romanExact, romanCore, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Pre-Chorus beat 43
- truth: `vii°64/II(maj)` (d°/Ab) | engine: `vii°⁶₄/II` (D°/Ab)
- engine notes: ["Ab2","D3","F3"] | truth PCs: [3,6,9] | engine PCs: [2,5,8]
- json: root=2 applied=7 type=5 inv=2
- failing: romanExact, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 22
- truth: `vii/v(maj)(#5)` (d#m(#5)) | engine: `vii+°(#5)/v` (D#°)
- engine notes: ["D#3","F#3","Bb3"] | truth PCs: [3,6,11] | engine PCs: [3,6,10]
- json: root=5 applied=7 type=5 inv=0 alt=["#5"]
- failing: romanExact, romanCore, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 70
- truth: `vii/v(maj)(#5)` (d#m(#5)) | engine: `vii+°(#5)/v` (D#°)
- engine notes: ["D#3","F#3","Bb3"] | truth PCs: [3,6,11] | engine PCs: [3,6,10]
- json: root=5 applied=7 type=5 inv=0 alt=["#5"]
- failing: romanExact, romanCore, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

