# Discrepancies (2)

## Verse beat 12
- truth: `ii65` (F6) | engine: `ii⁶⁵` (Dm7/F)
- engine notes: ["F3","A3","C4","D4"] | truth PCs: [0,3,5,9] | engine PCs: [0,2,5,9]
- json: root=2 applied=0 type=7 inv=1
- failing: rootPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/the-beatles__let-it-be/screens/Verse_strip0.png)

## Chorus beat 7
- truth: `iii65` (G6) | engine: `iii⁶⁵` (Em7/G)
- engine notes: ["G3","B3","D4","E4"] | truth PCs: [2,5,7,11] | engine PCs: [2,4,7,11]
- piano scrape: ["D3","E3","G3"] | piano PCs: [2,4,7]
- json: root=3 applied=0 type=7 inv=1
- failing: rootPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/the-beatles__let-it-be/screens/Chorus_strip0.png)

