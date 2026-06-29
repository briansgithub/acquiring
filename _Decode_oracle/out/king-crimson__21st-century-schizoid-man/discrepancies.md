# Discrepancies (7)

## Instrumental beat 5
- truth: `V/#vi(maj)(maj)` (E) | engine: `V/VI` (Eb)
- engine notes: ["E3","G#3","B3"] | truth PCs: [4,8,11] | engine PCs: [4,8,11]
- json: root=6 applied=5 type=5 inv=0 borrowed="major"
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 10
- truth: `V/#iii(maj)(maj)` (B) | engine: `V/III` (Bb)
- engine notes: ["B3","D#4","F#4"] | truth PCs: [3,6,11] | engine PCs: [3,6,11]
- piano scrape: ["A#3","Bb3"] | piano PCs: [10]
- json: root=3 applied=5 type=5 inv=0 borrowed="major"
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 32
- truth: `ivsus27` (f7sus2) | engine: `iv⁷sus2` (Fm7sus2)
- engine notes: ["F3","G3","C4","Eb4"] | truth PCs: [0,3,5,7] | engine PCs: [0,3,5,7]
- json: root=4 applied=0 type=7 inv=0 sus=[2]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 41
- truth: `#iii65(maj)` (G6) | engine: `♯iii⁶⁵(maj)` (Em7/G)
- engine notes: ["G3","B3","D4","E4"] | truth PCs: [1,3,6,10] | engine PCs: [2,4,7,11]
- json: root=3 applied=0 type=7 inv=1 borrowed="major"
- failing: rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 58
- truth: `vi(bor)` (abm) | engine: `♭vi(bor)` (Ab)
- engine notes: ["Ab3","Cb4","Eb4"] | truth PCs: [3,8,11] | engine PCs: [3,8,11]
- piano scrape: ["G#4","Ab4"] | piano PCs: [8]
- json: root=6 applied=0 type=5 inv=0 borrowed=[-1,1,3,5,6,8,10]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 65
- truth: `V/#vi(maj)(maj)` (E) | engine: `V/VI` (Eb)
- engine notes: ["E3","G#3","B3"] | truth PCs: [4,8,11] | engine PCs: [4,8,11]
- json: root=6 applied=5 type=5 inv=0 borrowed="major"
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 82
- truth: `vi(bor)` (abm) | engine: `♭vi(bor)` (Ab)
- engine notes: ["Ab3","Cb4","Eb4"] | truth PCs: [3,8,11] | engine PCs: [3,8,11]
- piano scrape: ["G#4","Ab4"] | piano PCs: [8]
- json: root=6 applied=0 type=5 inv=0 borrowed=[-1,1,3,5,6,8,10]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

