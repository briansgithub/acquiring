# TODO

## Audio / playback

- [ ] Consider same-tick boundary handling for block chords (release 1 tick early or attack 1 tick late) if edge-case stuck notes reappear without arpeggio
- [ ] Route arpeggio chord previews through `arpeggioSynth` (or a shared preview mono path) for timbre consistency with playback
- [ ] Audit `releaseAllNotes()` — simplify multi-strategy release if no longer needed after arpeggio synth split

## Player / UX

- [x] Song Selector panel: unified library search, pipeline buttons, gated Load (2026-06-29)
- [x] Hide Controls song dropdown; load via Song Selector only (2026-06-29)
- [x] Roman numeral figured-bass display: equal stack digit sizes, °/ø quality stacks, Gladiolus verify harnesses (2026-07-02, `e57dc72`) — see [ROMAN_NUMERALS.md](./ROMAN_NUMERALS.md)
- [x] Chord pronunciation UI + `romanNumeralSpeak.js` (2026-07-01, `ff97572`) — see [PRONUNCIATION.md](./PRONUNCIATION.md)
- [ ] Sort melody events before scheduling (tiebreaker: release before attack) if legato overlap issues appear
- [ ] Progress / seek edge cases when switching sections during playback

## Oracle / data

- [ ] Document `_Decode_oracle` pipeline and how corpus outputs relate to player chord interpretation
- [ ] Track discrepancies between oracle reports and live player voicing

## Documentation

- [x] Initial `documentation/` structure (MEMORY, ARCHITECTURE, BUGS, TODO)
- [x] BUG-001 log: stuck arpeggio notes (2026-06-29)
- [x] Unified library + Song Selector documented in ARCHITECTURE.md and catalog USAGE.md (2026-06-29)
- [x] PRONUNCIATION.md + ROMAN_NUMERALS.md (2026-07-02)
- [ ] Add setup/run instructions for web player server and cache layout

## Housekeeping

- [ ] **Modularize data from code** — portable `SACRED_RING_DATA` root; gitignore cache + harvest blobs; see [HANDOFF.md](../HANDOFF.md)
- [ ] Keep `engine.js` and `player.js` under 400-line limit — split if they grow further
