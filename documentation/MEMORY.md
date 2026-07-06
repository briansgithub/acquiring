# Project Memory

High-signal context for agents and contributors working on this repo.

## What this project is

**Sacred Ring** is a music-theory visualization and playback system built around Hooktheory-style song data (chords, melody, key, sections). The primary interactive surface is the **web player** (`web-player/`), which renders a circular chord ring, note indicator, timeline, and transport controls while playing back sections via Tone.js.

A separate **`_Decode_oracle`** pipeline validates and analyzes chord interpretation against corpus data; its outputs live under `_Decode_oracle/out/`.

A **`_Research_testing/hooktheory_catalog`** module indexes TheoryTab songs in SQLite. The web-player **Song Selector** (left column) searches via `GET /api/library` (catalog + pipeline flags). Playback loads section JSON from `.hooktheory_cache/`; complete pipeline songs **auto-load** into the player on detail view.

**Planned:** bulky data (SQLite DB, `.hooktheory_cache/`, per-song harvest under `_Decode_oracle/out/`) will move to a separate portable data root — see [HANDOFF.md](../HANDOFF.md).

## Key conventions

- Song/section JSON lives in `.hooktheory_cache/`; the web player loads it via `web-player/server.js` (`GET /api/song`).
- **`GET /api/songs`** builds the full playable index from cache folders; with a large library this can take **15–20 seconds**. `player.js` `init()` must not reset player state when that fetch completes if the user already loaded a section (see `documentation/BUGS.md` BUG-005). Section switches must resolve the active song by `loadedCacheKey`, not a stale array index, after the fetch replaces `library` (BUG-006).
- Timing uses **192 ticks per beat** (Tone.js transport ticks). Events are scheduled as `"<tick>i"` strings.
- Chord voicing and scale logic live in `web-player/lib/` (`music.js`, `chordVoicing.js`, etc.).
- Debug/research scripts go in `_Debug_testing` and `_Research_testing` respectively (per project rules).
- Source files should stay under **400 lines**; consult before exceeding 300.

## Audio playback model

| Synth | Role |
|-------|------|
| `melodySynth` | Monophonic melody (`Tone.Synth`) |
| `chordSynth` | Block chords (`Tone.PolySynth`) |
| `arpeggioSynth` | Arpeggiated chords only (`Tone.Synth`, one note at a time) |
| `previewSynth` | UI chord/note previews, isolated from playback |

**Important:** `Tone.Synth` (monophonic) uses `triggerRelease(time)` — not `triggerRelease(note, time)`. PolySynth uses `triggerRelease(notes, time)`.

## Arpeggio mode

When arpeggio is enabled, `createChordEvents()` in `player.js` emits `type: "arpeggio"` events with `note` and `duration` (seconds). The engine plays them via `arpeggioSynth.triggerAttackRelease()`. Block-chord mode still uses paired `attack` / `release` events on `chordSynth`.

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system layout
- [ROMAN_NUMERALS.md](./ROMAN_NUMERALS.md) — roman symbol display (HTML + canvas)
- [PRONUNCIATION.md](./PRONUNCIATION.md) — spoken chord readings
- [BUGS.md](./BUGS.md) — resolved and known issues
- [TODO.md](./TODO.md) — planned work
