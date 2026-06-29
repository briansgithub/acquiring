# Discrepancies (6)

## Chorus beat 58
- truth: `V42/III(maj)` (C/Bb) | engine: `V⁴²/III` (C7/Bb)
- engine notes: ["Bb2","C3","E3","G3"] | truth PCs: [1,5,8,11] | engine PCs: [0,4,7,10]
- json: root=3 applied=5 type=7 inv=3
- failing: romanExact, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 63
- truth: `vi(bor)` (bbm) | engine: `♭vi(bor)` (Bb)
- engine notes: ["Bb3","Db4","F4"] | truth PCs: [1,5,10] | engine PCs: [1,5,10]
- json: root=6 applied=0 type=5 inv=0 borrowed=[-1,1,3,5,6,8,10]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 67
- truth: `bII6(bor)` (Eb/G) | engine: `♭II⁶(bor)` (E°/G)
- engine notes: ["G3","Bb3","Eb4"] | truth PCs: [4,8,11] | engine PCs: [3,7,10]
- json: root=2 applied=0 type=5 inv=1 borrowed=[-1,1,3,5,6,8,10]
- failing: rootPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 16
- truth: `V42/VII(maj)` (C/Bb) | engine: `V⁴²/VII` (C7/Bb)
- engine notes: ["Bb2","C3","E3","G3"] | truth PCs: [1,5,8,11] | engine PCs: [0,4,7,10]
- json: root=7 applied=5 type=7 inv=3
- failing: romanExact, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 39
- truth: `iii6(bor)` (bbm/Db) | engine: `♭iii⁶(bor)` (Bb/D)
- engine notes: ["Db4","F4","Bb4"] | truth PCs: [1,5,10] | engine PCs: [1,5,10]
- json: root=3 applied=0 type=5 inv=1 borrowed=[-1,1,3,5,6,8,10]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 41
- truth: `#III7(bor)` (B7) | engine: `III⁷(bor)` (Bbmaj7)
- engine notes: ["B3","D#4","F#4","A4"] | truth PCs: [3,6,9,11] | engine PCs: [3,6,9,11]
- json: root=3 applied=0 type=7 inv=0 borrowed=[1,2,4,6,8,9,11]
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

