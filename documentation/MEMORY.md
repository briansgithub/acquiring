# Project Memory

High-signal context for agents and contributors working on this repo.

## What this project is

**Sacred Ring** is a music-theory visualization and playback system built around Hooktheory-style song data (chords, melody, key, sections). The primary interactive surface is the **web player** (`web-player/`), which renders a circular chord ring, note indicator, timeline, and transport controls while playing back sections via Tone.js.

A separate **`_Decode_oracle`** pipeline validates and analyzes chord interpretation against corpus data; its outputs live under `_Decode_oracle/out/`.

A **`_Research_testing/hooktheory_catalog`** module indexes TheoryTab songs in SQLite. The web-player **Song Selector** (left column) searches via `GET /api/library` (catalog + pipeline flags). Playback loads section JSON from `sacred_ring_data/playback/.hooktheory_cache/`; complete pipeline songs **auto-load** into the player on detail view.

Bulky data (SQLite DB, playback cache, harvest artifacts) lives under **`sacred_ring_data/`** (portable data root). See [HANDOFF.md](../HANDOFF.md) and [Web player startup performance](#web-player-startup-performance-july-2026) below.

## Key conventions

- Song/section JSON lives in `sacred_ring_data/playback/.hooktheory_cache/` (portable data root); the web player loads sections via `GET /api/song?file=…`.
- **`GET /api/songs`** still exists and builds the *full* playable index from every cache folder, but the player **no longer calls it on page load** (see [Web player startup performance](#web-player-startup-performance-july-2026) below). When something does need the full index, it is served from a disk cache (`playback_library_cache.json`) after the first slow build.
- **`GET /api/songs/entry?key=…`** loads **one** song's section list from cache (fast). The Song Selector uses this when you pick a song to play.
- Section switches must resolve the active song by `loadedCacheKey`, not a stale array index, if `library` is rebuilt or reordered (see `documentation/BUGS.md` BUG-006).
- Timing uses **192 ticks per beat** (Tone.js transport ticks). Events are scheduled as `"<tick>i"` strings.
- Chord voicing and scale logic live in `web-player/lib/` (`music.js`, `chordVoicing.js`, etc.).
- Debug/research scripts go in `_Debug_testing` and `_Research_testing` respectively (per project rules).
- Source files should stay under **400 lines**; consult before exceeding 300.

## Web player startup performance (July 2026)

This section documents **why the player used to feel slow on first launch**, what was changed, and how the pieces fit together. If it “just works” now but you are not sure why, read this.

### The problem in plain terms

When you opened `http://localhost:3000`, two different kinds of “library” work were happening at once, and both were expensive:

1. **Playback library** — “What songs do we have cached on disk, and what sections does each have?”
2. **Catalog library** — “What songs are in the SQLite catalog, which are playable, and what are their titles/artists?”

The Song Selector only needs **#2** to show search and counts. The chord ring / timeline only need **#1 for the one song you actually load**. Yet the old code tried to build **the entire playback library for all ~34,000 cached artists** as soon as the page opened. That alone took about **20 seconds** on this machine.

On top of that, after the catalog JSON arrived, the browser ran **`buildPlayableCaches`**: three separate sorts of ~34,000 playable songs so the “Playable songs” dropdown could show complexity / alphabetical / artist order. That blocked the UI for about **4 more seconds**.

So “slow launch” was really: **20s server scan (unnecessary)** + **16MB JSON download** + **4s client sorting (unnecessary for search)**.

### Two libraries — do not confuse them

| API | Source | What it contains | Used for |
|-----|--------|------------------|----------|
| `GET /api/library` | SQLite catalog via `library_cache.json` (~16MB, ~39k songs) | `slug`, `title`, `artist`, `playable`, `cacheKey`, pipeline `flags`, etc. | Song Selector search, artist browse, pipeline UI |
| `GET /api/songs` | Filesystem scan of `.hooktheory_cache/` (~34k artist folders) | Per-song `sections[]` with `relPath` for `GET /api/song` | Legacy full index; **not** fetched at startup anymore |
| `GET /api/songs/entry?key=…` | One folder under `.hooktheory_cache/` | Same shape as one element of `/api/songs` | Loading **one** song into the player |
| `GET /api/song?file=…` | One section JSON file | Notes, chords, metadata for playback | Actually playing a section |

The **cache key** (e.g. `queen - Bohemian_Rhapsody`) is the folder name under `sacred_ring_data/playback/.hooktheory_cache/`. The catalog’s `cacheKey` field points at that folder when `playable` is true.

### What runs when you open the player now

**On page load (`player.js`):**

1. HTML loads; Tone.js loads from CDN.
2. `player.js` module runs: builds UI shells (chord ring, timeline, note indicator, song selector DOM).
3. `init()` runs — it only resets idle UI state. It does **not** fetch `/api/songs`.
4. Song Selector calls `loadIndex()` → `fetch("/api/library")`.

**After `/api/library` returns:**

1. Browser parses JSON and builds in-memory `songs[]` and `artists[]` (search indexes `_t`, `_a`).
2. Hint line updates immediately: e.g. `39204 songs · … artists · 34093 playable`.
3. **Search by song** and **search by artist** work right away — they only need `songs` / `artists`, not sorted playable lists.
4. **Playable songs dropdown** uses lazy caches (see below); default sort may prewarm in the background.

**When you pick a song to play:**

1. Selector may call `POST /api/library/load?slug=…` (pipeline gate).
2. `onLoad({ cacheKey })` in `player.js` looks up `cacheKey` in the in-memory `library` array.
3. If missing, it fetches **`GET /api/songs/entry?key=…`** (one folder, fast), pushes into `library`, then `loadSection(…)`.
4. `loadSection` fetches section JSON via `GET /api/song?file=…` and schedules audio.

You never wait for all 34k folders unless something explicitly calls `GET /api/songs` (e.g. legacy tooling).

### Fix 1 — Stop fetching `/api/songs` at startup

**File:** `web-player/player.js` — `init()`

**Before:** `init()` awaited `fetch("/api/songs")`, which triggered a full filesystem walk on the server.

**After:** `init()` only handles idle reset / session continuity. Playback metadata loads **on demand** when you select a song (`/api/songs/entry`).

**Why this is safe:** The Song Selector already knew `cacheKey` from `/api/library`. The full array index was redundant for normal use. `library` in the client starts as `[]` and grows per loaded song.

### Fix 2 — Server disk cache for `/api/songs` (when something still needs the full index)

**Files:** `web-player/playbackLibraryCache.js`, `web-player/server.js`

If anything calls `GET /api/songs` (or the server needs `loadLibrary()`), the first request still scans every cache directory (~20s). Results are written to:

`sacred_ring_data/catalog/playback_library_cache.json`

Format: `{ dirCount, builtAt, library: [...] }`. On later requests, if `dirCount` still matches the number of folders in `.hooktheory_cache/`, the server reads the JSON file (~100ms) instead of rescanning. An in-memory copy avoids even that on repeated calls in one server session.

`invalidatePlaybackLibraryCache()` clears memory + deletes the file (call when bulk-adding/removing cache folders if you wire it up later).

### Fix 3 — Lazy playable caches (Song Selector)

**Files:** `web-player/components/songSelectorPlayable.js` (`createLazyPlayableCaches`), `web-player/components/songSelector.js` (`schedulePlayableCachePrewarm`)

**Before:** `buildPlayableCaches(songs)` immediately sorted the entire playable pool **three times** (complexity, alphabetical, artist lists for the dropdown).

**After:**

- `createLazyPlayableCaches(songs)` builds **nothing** upfront except a thin wrapper.
- Each sort runs only when needed via `ensure(sortBy)` (e.g. when you open the dropdown or change “Sort by”).
- After `loadIndex()` succeeds, `schedulePlayableCachePrewarm()` uses `requestIdleCallback` to run **only the default sort** (complexity) when the browser is idle — ~0.7s, not blocking the “Loading catalog…” → counts transition.

`queryPlayable()` calls `caches.ensure(sortBy)` before reading the sorted array.

**User-visible effect:** The selector panel becomes usable for text search within ~1s of load (dominated by downloading/parsing catalog JSON). The playable dropdown may take up to ~1s on first open if prewarm has not finished; changing sort mode builds that sort on first use.

### Fix 4 — Gzip for `GET /api/library`

**File:** `_Research_testing/hooktheory_catalog/web/api.js` — `handleLibraryList(req, res)`

The catalog cache file is ~16MB raw JSON. Browsers send `Accept-Encoding: gzip`; the server now compresses once (cached in memory keyed on `library_cache.json` mtime) to ~1.6MB (~10× smaller). `fetch()` decompresses transparently.

This speeds up the network part of `loadIndex()` noticeably on slower links; localhost still benefits somewhat.

### Measured timings (this repo, ~34k playable)

| Step | Approx. time |
|------|----------------|
| Full `/api/songs` filesystem scan (old startup path) | **~20s** |
| `/api/library` server read + parse | **~100ms** |
| Client map songs + build artist list | **~10ms** |
| Old `buildPlayableCaches` (triple sort, blocking) | **~4.2s** |
| New lazy shell + immediate hint | **~9ms** after JSON parse |
| Complexity prewarm (idle, non-blocking) | **~0.7s** |
| Single-song `/api/songs/entry` | **~milliseconds** |

### Cache files on disk (catalog dir)

| File | Built by | Purpose |
|------|----------|---------|
| `sacred_ring_data/catalog/library_cache.json` | `libraryCache.js` when catalog changes | Full catalog for `GET /api/library` |
| `sacred_ring_data/catalog/playback_library_cache.json` | `playbackLibraryCache.js` after first full scan | Full playback index for `GET /api/songs` |

Deleting these files is safe; they rebuild on next access (slow once).

### Possible future speedups (not implemented)

- **Dynamic `import()`** for `chordRing.js` / `timeline.js` — defer heavy UI until first song load.
- **Self-host Tone.js** — remove CDN latency.
- **Pre-sorted playable picker cache on server** — eliminate client-side sort entirely for repeat visits.
- **Smaller `/api/library` payload** — e.g. summary endpoint for counts only, or field subset if search does not need all flags.

### Quick mental model

```
Page open
  → UI renders (no full cache scan)
  → GET /api/library (gzip, catalog only)
  → Search works immediately
  → Playable dropdown sorts in background / on demand

User picks song
  → GET /api/songs/entry?key=… (one folder)
  → GET /api/song?file=… (one section)
  → Play
```

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
