# Discrepancies (3)

## Chorus beat 14
- truth: `V7(no5)sus2sus4/ii°(maj)` (A7(n°5)sus2sus4) | engine: `V⁷(no5)sus2sus4/ii°` (A7sus2sus4)
- engine notes: ["A3","D4","Gb4"] | truth PCs: [2,3,6,9] | engine PCs: [2,6,9]
- json: root=2 applied=5 type=7 inv=0 sus=[2,4]
- failing: romanExact, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 14.5
- truth: `V7(no5)sus2sus4/ii°(maj)` (A7(n°5)sus2sus4) | engine: `V⁷(no5)sus2sus4/ii°` (A7sus2sus4)
- engine notes: ["A3","D4","Gb4"] | truth PCs: [2,3,6,9] | engine PCs: [2,6,9]
- json: root=2 applied=5 type=7 inv=0 sus=[2,4]
- failing: romanExact, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 15
- truth: `ii6(add6)(#5)4sus4(maj)` (d(add6)(#5)sus4/A) | engine: `ii+⁶₄(add6)sus4(#5)(maj)` (Dmsus4/A)
- engine notes: ["Bb3","B3","D4","G4"] | truth PCs: [2,7,10,11] | engine PCs: [2,7,10,11]
- piano scrape: ["A3","C#4"] | piano PCs: [1,9]
- json: root=2 applied=0 type=5 inv=2 borrowed="major" sus=[4] alt=["#5"]
- failing: romanExact, romanCore, bassInNotes, pianoExact, pianoPcsExact, pianoValidated, usePiano

