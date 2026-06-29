# TODO

## Audio / playback

- [ ] Consider same-tick boundary handling for block chords (release 1 tick early or attack 1 tick late) if edge-case stuck notes reappear without arpeggio
- [ ] Route arpeggio chord previews through `arpeggioSynth` (or a shared preview mono path) for timbre consistency with playback
- [ ] Audit `releaseAllNotes()` — simplify multi-strategy release if no longer needed after arpeggio synth split

## Player / UX

- [x] Song Selector panel: unified library search, pipeline buttons, gated Load (2026-06-29)
- [x] Hide Controls song dropdown; load via Song Selector only (2026-06-29)
- [ ] Sort melody events before scheduling (tiebreaker: release before attack) if legato overlap issues appear
- [ ] Progress / seek edge cases when switching sections during playback

## Oracle / data

- [ ] Document `_Decode_oracle` pipeline and how corpus outputs relate to player chord interpretation
- [ ] Track discrepancies between oracle reports and live player voicing

## Documentation

- [x] Initial `documentation/` structure (MEMORY, ARCHITECTURE, BUGS, TODO)
- [x] BUG-001 log: stuck arpeggio notes (2026-06-29)
- [x] Unified library + Song Selector documented in ARCHITECTURE.md and catalog USAGE.md (2026-06-29)
- [ ] Add setup/run instructions for web player server and cache layout

## Housekeeping

- [ ] Keep `engine.js` and `player.js` under 400-line limit — split if they grow further
