# Discrepancies (5)

## Instrumental beat 25
- truth: `V42/III(maj)` (Bb/Ab) | engine: `V⁴²/III` (Bb7/Ab)
- engine notes: ["Ab3","Bb4","D4","F4"] | truth PCs: [3,6,9,11] | engine PCs: [2,5,8,10]
- json: root=3 applied=5 type=7 inv=3
- failing: romanExact, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 29
- truth: `iii6(bor)` (ebm/Gb) | engine: `♭iii⁶(bor)` (Eb/G)
- engine notes: ["Gb3","Bb3","Eb4"] | truth PCs: [3,6,10] | engine PCs: [3,6,10]
- json: root=3 applied=0 type=5 inv=1 borrowed=[-1,1,3,5,6,8,10]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 49
- truth: `V42/VI(maj)` (Eb/Db) | engine: `V⁴²/VI` (Eb7/Db)
- engine notes: ["Db3","Eb4","G4","Bb4"] | truth PCs: [2,4,8,11] | engine PCs: [1,3,7,10]
- json: root=6 applied=5 type=7 inv=3
- failing: romanExact, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 127
- truth: `bII6(bor)` (Db/F) | engine: `♭II⁶(bor)` (D°/F)
- engine notes: ["F3","Ab3","Db4"] | truth PCs: [2,6,9] | engine PCs: [1,5,8]
- piano scrape: ["B4","C#5"] | piano PCs: [1,11]
- json: root=2 applied=0 type=5 inv=1 borrowed=[-1,1,3,5,6,8,10]
- failing: rootPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 160.5
- truth: `#vii°7(hmin)` (b°7) | engine: `♯viiø⁷(hmin)` (B°7)
- engine notes: ["B3","D4","F4","Ab4"] | truth PCs: [2,5,8,11] | engine PCs: [2,5,8,11]
- json: root=7 applied=0 type=7 inv=0 borrowed="harmonicMinor"
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

