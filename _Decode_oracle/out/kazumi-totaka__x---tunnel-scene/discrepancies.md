# Discrepancies (6)

## Intro beat 1
- truth: `vi7(bor)` (bm7) | engine: `♭vi⁷(bor)` (Bmaj7)
- engine notes: ["B3","D4","F#4","A4"] | truth PCs: [2,6,9,11] | engine PCs: [2,6,9,11]
- json: root=6 applied=0 type=7 inv=0 borrowed=[-1,1,3,4,6,8,10]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Intro beat 2
- truth: `vii7(bor)` (c#m7) | engine: `♭vii⁷(bor)` (C#7)
- engine notes: ["C#3","E3","G#3","B3"] | truth PCs: [1,4,8,11] | engine PCs: [1,4,8,11]
- json: root=7 applied=0 type=7 inv=0 borrowed=[-1,1,3,5,6,8,10]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Intro beat 5
- truth: `iii7(bor)` (f#m7) | engine: `♭iii⁷(bor)` (F#maj7)
- engine notes: ["F#3","A3","C#4","E4"] | truth PCs: [1,4,6,9] | engine PCs: [1,4,6,9]
- piano scrape: ["D#3","Fx3","B#4"] | piano PCs: [0,3,7]
- json: root=3 applied=0 type=7 inv=0 borrowed=[-1,1,3,4,6,8,10]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Intro beat 6
- truth: `bIV6(bor)` (G/B) | engine: `♭IV⁶(bor)` (G#m/B)
- engine notes: ["B3","D4","G4"] | truth PCs: [0,3,8] | engine PCs: [2,7,11]
- piano scrape: ["F###3","Bx4"] | piano PCs: [1,8]
- json: root=4 applied=0 type=5 inv=1 borrowed=[-1,1,3,4,6,8,10]
- failing: rootPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Intro beat 7
- truth: `biisus47(bor)` (e7sus4) | engine: `♭ii⁷sus4(bor)` (E#°7sus4)
- engine notes: ["E3","A3","B3","D4"] | truth PCs: [2,4,9,11] | engine PCs: [2,4,9,11]
- piano scrape: ["Ax2","D###3","G###3"] | piano PCs: [5,10,11]
- json: root=2 applied=0 type=7 inv=0 borrowed=[-1,1,3,4,6,8,10] sus=[4]
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Intro beat 8
- truth: `vii7(bor)` (c#m7) | engine: `♭vii⁷(bor)` (C#7)
- engine notes: ["C#3","E3","G#3","B3"] | truth PCs: [1,4,8,11] | engine PCs: [1,4,8,11]
- json: root=7 applied=0 type=7 inv=0 borrowed=[-1,1,3,5,6,8,10]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

