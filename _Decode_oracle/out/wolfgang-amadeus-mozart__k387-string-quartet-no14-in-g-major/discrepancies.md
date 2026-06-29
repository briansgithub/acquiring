# Discrepancies (4)

## Solo 1 beat 34
- truth: `#v°7(bor)` (d#°7) | engine: `♯vø⁷(bor)` (D7)
- engine notes: ["D#3","C4","Gb4","A4"] | truth PCs: [0,3,6,9] | engine PCs: [0,3,6,9]
- json: root=5 applied=0 type=7 inv=0 borrowed=[0,2,4,5,8,9,11]
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Solo 1 beat 39
- truth: `#iv°7(bor)` (c#°7) | engine: `♯ivø⁷(bor)` (Cmaj7)
- engine notes: ["C#3","Bb3","E4","G4"] | truth PCs: [1,4,7,10] | engine PCs: [1,4,7,10]
- piano scrape: ["D3","E3","G#3","A3"] | piano PCs: [2,4,8,9]
- json: root=4 applied=0 type=7 inv=0 borrowed=[0,2,3,6,7,9,10]
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Solo 2 beat 51
- truth: `V46` (D/A) | engine: `V⁶₄` (D/A)
- engine notes: ["A3","D4","F#4"] | truth PCs: [2,6,9] | engine PCs: [2,6,9]
- piano scrape: ["G#3","A3","B3","C4","D4"] | piano PCs: [0,2,8,9,11]
- json: root=5 applied=0 type=5 inv=2
- failing: romanExact, romanCore, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Solo 2 beat 53
- truth: `V46` (D/A) | engine: `V⁶₄` (D/A)
- engine notes: ["A3","D4","F#4"] | truth PCs: [2,6,9] | engine PCs: [2,6,9]
- piano scrape: ["G#3","A3","B3","C4","D4"] | piano PCs: [0,2,8,9,11]
- json: root=5 applied=0 type=5 inv=2
- failing: romanExact, romanCore, pianoExact, pianoPcsExact, pianoValidated, usePiano

