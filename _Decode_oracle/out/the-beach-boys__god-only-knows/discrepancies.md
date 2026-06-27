# Discrepancies (4)

## Verse beat 29
- truth: `#iø7(bor)` (a#m7(b5)) | engine: `♯iø⁷(bor)` (Amaj7)
- engine notes: ["A#3","C#4","E4","G#4"] | truth PCs: [1,4,7,10] | engine PCs: [1,4,8,10]
- piano scrape: ["C#3","D#3","E3","G#3"] | piano PCs: [1,3,4,8]
- json: root=1 applied=0 type=7 inv=0 borrowed=[1,2,4,6,7,9,11]
- failing: rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/the-beach-boys__god-only-knows/screens/Verse_strip1.png)

## Bridge beat 4.5
- truth: `V46` (A/E) | engine: `V⁶₄` (A/E)
- engine notes: ["E4","A4","C#5"] | truth PCs: [1,4,9] | engine PCs: [1,4,9]
- piano scrape: ["C#4"] | piano PCs: [1]
- json: root=5 applied=0 type=5 inv=2
- failing: romanExact, romanCore, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/the-beach-boys__god-only-knows/screens/Bridge_strip0.png)

## Bridge beat 12.5
- truth: `V46` (A/E) | engine: `V⁶₄` (A/E)
- engine notes: ["E4","A4","C#5"] | truth PCs: [1,4,9] | engine PCs: [1,4,9]
- piano scrape: ["C#4"] | piano PCs: [1]
- json: root=5 applied=0 type=5 inv=2
- failing: romanExact, romanCore, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/the-beach-boys__god-only-knows/screens/Bridge_strip1.png)

## Bridge beat 45
- truth: `#iø7(bor)` (d#m7(b5)) | engine: `♯iø⁷(bor)` (Dmaj7)
- engine notes: ["D#3","F#3","A3","C#4"] | truth PCs: [0,3,6,9] | engine PCs: [1,3,6,9]
- piano scrape: ["A3","F#3","G#3"] | piano PCs: [6,8,9]
- json: root=1 applied=0 type=7 inv=0 borrowed=[1,2,4,6,7,9,11]
- failing: rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/the-beach-boys__god-only-knows/screens/Bridge_strip2.png)

