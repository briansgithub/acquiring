# Discrepancies (31)

## Verse beat 1
- truth: `i` (dm) | engine: `iv` (Gm)
- engine notes: ["G3","Bb3","D4"] | truth PCs: [2,5,9] | engine PCs: [2,7,10]
- json: root=4 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 5
- truth: `III` (F) | engine: `i` (Dm)
- engine notes: ["D3","F3","A3"] | truth PCs: [0,5,9] | engine PCs: [2,5,9]
- piano scrape: ["F3","G3"] | piano PCs: [5,7]
- json: root=1 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 8.5
- truth: `VII` (C) | engine: `III` (F)
- engine notes: ["F3","A3","C4"] | truth PCs: [0,4,7] | engine PCs: [0,5,9]
- piano scrape: ["E3","F3"] | piano PCs: [4,5]
- json: root=3 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 13
- truth: `iv` (gm) | engine: `VII` (C)
- engine notes: ["C3","E3","G3"] | truth PCs: [2,7,10] | engine PCs: [0,4,7]
- json: root=7 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 16.5
- truth: `i` (dm) | engine: `iv` (Gm)
- engine notes: ["G3","Bb3","D4"] | truth PCs: [2,5,9] | engine PCs: [2,7,10]
- piano scrape: ["C3","F3"] | piano PCs: [0,5]
- json: root=4 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 21
- truth: `III6` (F/A) | engine: `i` (Dm)
- engine notes: ["D3","F3","A3"] | truth PCs: [2,6,9] | engine PCs: [2,5,9]
- piano scrape: ["C3","F3","G3"] | piano PCs: [0,5,7]
- json: root=1 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 24.5
- truth: `VII` (C) | engine: `III⁶` (F/A)
- engine notes: ["A3","C4","F4"] | truth PCs: [0,4,7] | engine PCs: [0,5,9]
- piano scrape: ["E3","F3"] | piano PCs: [4,5]
- json: root=3 applied=0 type=5 inv=1
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 32.5
- truth: `VII` (C) | engine: `VIIsus4` (Csus4)
- engine notes: ["C3","F3","G3"] | truth PCs: [0,5,7] | engine PCs: [0,5,7]
- json: root=7 applied=0 type=5 inv=0 sus=[4]
- failing: romanExact, romanCore, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 35.5
- truth: `i` (dm) | engine: `VII` (C)
- engine notes: ["C3","E3","G3"] | truth PCs: [2,5,9] | engine PCs: [0,4,7]
- piano scrape: ["C3","F3"] | piano PCs: [0,5]
- json: root=7 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 6.5
- truth: `iiø11(no3no5)` (em11(n°3n5)(b5b9)) | engine: `iiø¹¹(no3)(no5)(b5)(b9)` (E°11)
- engine notes: ["E3","Bb3","Db4","Bb3"] | truth PCs: [1,4,5,10] | engine PCs: [1,4,10]
- json: root=2 applied=0 type=11 inv=0
- failing: romanExact, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 14.5
- truth: `i11(no3no5)` (dm11(n°3n5)) | engine: `i¹¹(no3)(no5)` (Dm11)
- engine notes: ["D3","G4"] | truth PCs: [0,2,4,7] | engine PCs: [2,7]
- json: root=1 applied=0 type=11 inv=0
- failing: romanExact, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 26.5
- truth: `iiø11(no3no5)` (em11(n°3n5)(b5b9)) | engine: `iiø¹¹(no3)(no5)(b5)(b9)` (E°11)
- engine notes: ["E3","Bb3","Db4","Bb3"] | truth PCs: [1,4,5,10] | engine PCs: [1,4,10]
- json: root=2 applied=0 type=11 inv=0
- failing: romanExact, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Bridge beat 1
- truth: `IV` (Bb) | engine: `V` (C)
- engine notes: ["C3","E3","G3"] | truth PCs: [2,5,10] | engine PCs: [0,4,7]
- piano scrape: ["Ab3","G3"] | piano PCs: [7,8]
- json: root=5 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Bridge beat 5
- truth: `I6` (F/A) | engine: `IV` (Bb)
- engine notes: ["Bb3","D4","F4"] | truth PCs: [2,5,10] | engine PCs: [2,5,10]
- piano scrape: ["A3","G3"] | piano PCs: [7,9]
- json: root=4 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, bassInNotes, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Bridge beat 9
- truth: `iii` (am) | engine: `I⁶` (F/A)
- engine notes: ["A3","C4","F4"] | truth PCs: [0,4,9] | engine PCs: [0,5,9]
- json: root=1 applied=0 type=5 inv=1
- failing: romanExact, romanCore, rootPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Bridge beat 13
- truth: `V` (C) | engine: `iii` (Am)
- engine notes: ["A3","C4","E4"] | truth PCs: [0,4,7] | engine PCs: [0,4,9]
- piano scrape: ["E3","F3"] | piano PCs: [4,5]
- json: root=3 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Outro beat 1
- truth: `i` (dm) | engine: `VII` (C)
- engine notes: ["C3","E3","G3"] | truth PCs: [2,5,9] | engine PCs: [0,4,7]
- json: root=7 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Outro beat 5
- truth: `iiø11(no3no5)` (em11(n°3n5)(b5b9)) | engine: `i(no3)(no5)(b5)(b9)` (Dm)
- engine notes: ["D3","Ab3","Eb4"] | truth PCs: [4,5,10] | engine PCs: [2,3,8]
- json: root=1 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Outro beat 10.5
- truth: `i6` (dm/F) | engine: `iiø¹¹(no3)(no5)` (E°11)
- engine notes: ["E3","Bb3","Db4","Bb3"] | truth PCs: [2,4,6,9] | engine PCs: [1,4,10]
- json: root=2 applied=0 type=11 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Outro beat 11.5
- truth: `VII` (C) | engine: `i⁶` (Dm/F)
- engine notes: ["F3","A3","D4"] | truth PCs: [0,4,7] | engine PCs: [2,5,9]
- piano scrape: ["F3","G3"] | piano PCs: [5,7]
- json: root=1 applied=0 type=5 inv=1
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Outro beat 12.5
- truth: `i11(no3)` (dm11(n°3)) | engine: `VII(no3)` (C)
- engine notes: ["C3","G3"] | truth PCs: [2,9] | engine PCs: [0,7]
- json: root=7 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Outro beat 18.5
- truth: `VII6` (C/E) | engine: `i¹¹(no3)` (Dm11)
- engine notes: ["D3","A3","C4","E4","G4"] | truth PCs: [0,2,4,7,9] | engine PCs: [0,2,4,7,9]
- json: root=1 applied=0 type=11 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, bassInNotes, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Outro beat 19.5
- truth: `iv` (gm) | engine: `VII⁶` (C/E)
- engine notes: ["E3","G3","C4"] | truth PCs: [2,7,10] | engine PCs: [0,4,7]
- json: root=7 applied=0 type=5 inv=1
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Outro beat 25
- truth: `iv6sus2` (gsus2/A) | engine: `ivsus2` (Gmsus2)
- engine notes: ["G3","A3","D4"] | truth PCs: [2,7,9] | engine PCs: [2,7,9]
- json: root=4 applied=0 type=5 inv=0 sus=[2]
- failing: romanExact, romanCore, bassPcMatch, bassInNotes, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Outro beat 26.5
- truth: `iv6` (gm/Bb) | engine: `iv⁶sus2` (Gmsus2/Bb)
- engine notes: ["A3","D4","G4"] | truth PCs: [2,7,9] | engine PCs: [2,7,9]
- json: root=4 applied=0 type=5 inv=1 sus=[2]
- failing: romanExact, romanCore, bassInNotes, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Outro beat 27.5
- truth: `VIIsus2` (Csus2) | engine: `iv⁶sus2` (Gmsus2/Bb)
- engine notes: ["A3","D4","G4"] | truth PCs: [0,2,7] | engine PCs: [2,7,9]
- piano scrape: ["F3","G3"] | piano PCs: [5,7]
- json: root=4 applied=0 type=5 inv=1
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Outro beat 28.5
- truth: `i` (dm) | engine: `VIIsus2` (Csus2)
- engine notes: ["C3","D3","G3"] | truth PCs: [2,4,9] | engine PCs: [0,2,7]
- piano scrape: ["F3","G3"] | piano PCs: [5,7]
- json: root=7 applied=0 type=5 inv=0 sus=[2]
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Outro beat 29
- truth: `iiø11(no3no5)` (em11(n°3n5)(b5b9)) | engine: `i(no3)(no5)(b5)(b9)` (Dm)
- engine notes: ["D3","Ab3","Eb4"] | truth PCs: [4,5,10] | engine PCs: [2,3,8]
- json: root=1 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Outro beat 30.5
- truth: `i6` (dm/F) | engine: `iiø¹¹(no3)(no5)` (E°11)
- engine notes: ["E3","Bb3","Db4","Bb3"] | truth PCs: [2,4,6,9] | engine PCs: [1,4,10]
- json: root=2 applied=0 type=11 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Outro beat 31.5
- truth: `VII` (C) | engine: `i⁶` (Dm/F)
- engine notes: ["F3","A3","D4"] | truth PCs: [0,4,7] | engine PCs: [2,5,9]
- piano scrape: ["E3","F3"] | piano PCs: [4,5]
- json: root=1 applied=0 type=5 inv=1
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Outro beat 42.5
- truth: `iiø11(no3no5)` (em11(n°3n5)(b5b9)) | engine: `iiø¹¹(no3)(no5)(b5)(b9)` (E°11)
- engine notes: ["E3","Bb3","Db4","Bb3"] | truth PCs: [1,4,5,10] | engine PCs: [1,4,10]
- json: root=2 applied=0 type=11 inv=0
- failing: romanExact, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

