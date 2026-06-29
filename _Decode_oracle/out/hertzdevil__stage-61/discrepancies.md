# Discrepancies (8)

## Instrumental beat 15
- truth: `vii6` (em/G) | engine: `vii⁶` (Em/G)
- engine notes: ["G3","B3","E4"] | truth PCs: [0,5,8] | engine PCs: [4,7,11]
- piano scrape: ["C#4","D#4"] | piano PCs: [1,3]
- json: root=7 applied=0 type=5 inv=1
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 25
- truth: `vii△7(bor)` (ammaj7) | engine: `♭vii△⁷(bor)` (Am7)
- engine notes: ["A3","C4","E4","G#4"] | truth PCs: [0,4,8,9] | engine PCs: [0,4,8,9]
- json: root=7 applied=0 type=7 inv=0 borrowed=[0,1,3,5,6,9,10]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 45
- truth: `II64` (C/G) | engine: `II⁶₄` (C/G)
- engine notes: ["G3","C4","E4"] | truth PCs: [1,5,8] | engine PCs: [0,4,7]
- piano scrape: ["G3","A3"] | piano PCs: [7,9]
- json: root=2 applied=0 type=5 inv=2
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 57
- truth: `vii6` (am/C) | engine: `vii⁶` (Am/C)
- engine notes: ["C4","E4","A4"] | truth PCs: [1,5,10] | engine PCs: [0,4,9]
- piano scrape: ["G#4","A4","B4"] | piano PCs: [8,9,11]
- json: root=7 applied=0 type=5 inv=1
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 79
- truth: `vii6` (em/G) | engine: `vii⁶` (Em/G)
- engine notes: ["G3","B3","E4"] | truth PCs: [0,5,8] | engine PCs: [4,7,11]
- piano scrape: ["C#4","D#4"] | piano PCs: [1,3]
- json: root=7 applied=0 type=5 inv=1
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 83
- truth: `undefined` (A) | engine: `` ()
- engine notes: null | truth PCs: [1,4,9] | engine PCs: []
- piano scrape: ["B3","D#4"] | piano PCs: [3,11]
- json: root=0 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- engine error: Cannot read properties of undefined (reading '0')

## Instrumental beat 113
- truth: `vi(bor)` (fm) | engine: `♭vi(bor)` (F)
- engine notes: ["F3","Ab3","C4"] | truth PCs: [0,5,8] | engine PCs: [0,5,8]
- json: root=6 applied=0 type=5 inv=0 borrowed=[-1,1,3,4,6,8,10]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 121
- truth: `vi(bor)` (fm) | engine: `♭vi(bor)` (F)
- engine notes: ["F3","Ab3","C4"] | truth PCs: [0,5,8] | engine PCs: [0,5,8]
- piano scrape: ["Fbbbb3","Fbb3","Fb3"] | piano PCs: [1,3,4]
- json: root=6 applied=0 type=5 inv=0 borrowed=[-1,1,3,4,6,8,10]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

