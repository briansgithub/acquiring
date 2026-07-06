# Bugs

Log of significant issues: symptoms, root cause, attempts, resolution, and date.

---

## BUG-001: Stuck notes during arpeggio playback

| Field | Detail |
|-------|--------|
| **Date reported** | 2026-06-29 |
| **Date resolved** | 2026-06-29 |
| **Severity** | High — audible stuck/drone notes; later regressions broke entire playback |
| **Affected area** | `web-player/audio/engine.js`, `web-player/player.js` |
| **Repro** | Play a section with arpeggio enabled (e.g. Guns N' Roses — Sweet Child O' Mine, Chorus). Individual chord tones hang and keep sounding, especially on long chords and fast arpeggio settings (~100 ms). |
| **Status** | **Resolved** |

### Symptom

During song playback in arpeggio mode, one or more notes/chords would appear to get stuck — continuously outputting after they should have stopped. Reported most often on dense sections (e.g. chorus). Block-chord mode was less affected but same-tick boundary issues existed there too.

### Root cause

Three interacting problems:

1. **PolySynth voice management for arpeggio** — Arpeggio was implemented as many separate `triggerAttack` / `triggerRelease` pairs on a single `Tone.PolySynth`. PolySynth uses one voice per pitch. When the same note repeats in an arpeggio loop, releases could fire without a matching tracked attack (or vice versa), leaving voices in sustain. Runtime logs confirmed re-attacks on notes still marked active and orphan releases.

2. **Release envelope much longer than note duration** — Default synth release was ~1 s while arpeggio notes were spaced ~100 ms apart. Release tails stacked, sounding like notes were stuck on even when scheduling was partially correct.

3. **Same-tick chord boundaries** — Adjacent chords sharing pitches could schedule release of chord *N* and attack of chord *N+1* on the same transport tick. Tone.js does not guarantee callback order within a tick, so block chords could attack before the prior release completed.

### What was tried

| Attempt | Result | Why |
|---------|--------|-----|
| **Shorter PolySynth envelope only** | Partial / insufficient | Reduced tail overlap but did not fix voice tracking desync on PolySynth. |
| **`triggerAttackRelease` on PolySynth for each arpeggio note** | **Worse** | Hundreds of overlapping voices on the same pitches; audible drone; player felt frozen. PolySynth is not suited to rapid retriggering of the same note names. |
| **Block-chord attack delayed +1 tick at boundaries** | Regressed UX | Speculative; did not address arpeggio path; contributed to confusion during debugging. |
| **`melodySynth.triggerRelease(noteName, time)`** | **Broke playback entirely** | Invalid API for monophonic `Tone.Synth` — first argument is time, not pitch. Passing e.g. `"D4"` corrupted Tone's scheduler; playback failed before the first measure completed. |
| **Dedicated monophonic `arpeggioSynth` + `triggerAttackRelease`** | **Fixed** | Arpeggio is inherently one note at a time; mono synth cannot leak PolySynth voices. |
| **Same-tick sort tiebreaker** (`release` → `arpeggio` → `attack`) | **Helps block mode** | Ensures deterministic ordering when events share a tick. |
| **Debug fetch instrumentation (many logs per schedule)** | **UI freeze** | Flooding the debug ingest endpoint on every `scheduleChords` call made the player feel stuck; throttling/removal required. |

### Final solution

**Files changed:** `web-player/audio/engine.js`, `web-player/player.js`

1. **Added `arpeggioSynth`** — monophonic `Tone.Synth` used only for arpeggio playback.
2. **Arpeggio events** — `createChordEvents()` emits `type: "arpeggio"` with `note` and `duration` (seconds); engine calls `arpeggioSynth.triggerAttackRelease(note, duration, time)`.
3. **Block chords unchanged in structure** — still `attack` / `release` on `chordSynth`, with a shorter envelope (`release: 0.2`).
4. **Event sort tiebreaker** — at equal ticks: `release` before `arpeggio` before `attack`.
5. **Melody release** — `melodySynth.triggerRelease(time)` only (never pass note name on monophonic synth).
6. **`releaseAllNotes()`** — also releases `arpeggioSynth`; chord volume slider applies to arpeggio synth.

### Verification

User confirmed fix after hard refresh. Pre-fix logs (session `224523`) showed hypothesis B/D (re-attack on active note, orphan release) and F (long release vs short arpeggio spacing). Post-fix: playback completes sections; no stuck notes in arpeggio mode.

### Lessons / guardrails

- Do **not** route arpeggio through `PolySynth` with separate attack/release pairs.
- Do **not** call `triggerRelease(note, time)` on `Tone.Synth` — use `triggerRelease(time)`.
- Prefer `triggerAttackRelease` on a **monophonic** synth for sequential single-note playback.
- When debugging audio, avoid high-volume `fetch` logging inside hot scheduling paths.

### References

- `web-player/audio/engine.js` — `arpeggioSynth`, `scheduleChords()`
- `web-player/player.js` — `createChordEvents()`, arpeggio branch
- `documentation/MEMORY.md` — synth roles and API notes

---

## BUG-002: Stuck chord notes at section end (All Star Verse / outros)

| Field | Detail |
|-------|--------|
| **Date reported** | 2026-07-01 |
| **Date resolved** | 2026-07-01 |
| **Severity** | High — chord tones sustain indefinitely, especially at section end |
| **Affected area** | `web-player/audio/engine.js`, `web-player/player.js`, `web-player/lib/chordVoicing.js` |
| **Repro** | Play **Smash Mouth — All Star**, especially **Verse** through beats 36–37 or **Outro** to the end. Final chord(s) hang and keep sounding after they should release. Also reproducible on other sections with fast back-to-back chords or long final holds. |
| **Status** | **Resolved** |
| **Commit** | `77a85d5` |

### Symptom

During block-chord playback (arpeggio off), one or more chord notes would get stuck — particularly near the end of a section. Reported on All Star Verse (last chords) and outros with long final chord durations.

### Root cause

Four interacting problems (confirmed with runtime logs, session `ac401b`):

1. **Invalid chord note spellings for Tone.js** — `chordInterpreter` sometimes outputs names Tone cannot attack, e.g. `E#3, G##3, B#4` (All Star Verse beat 36.5, exotic `borrowed` scale). Logs showed `chord-release` for those notes but **no matching `chord-attack`**; the previous chord (`E3, G#3, B3` at beat 36) kept sustaining.

2. **Per-note `triggerRelease` missed PolySynth voices** — `PolySynth.triggerRelease(specificNotes)` could fail to silence voices when spellings didn't match attacked notes or when `activeChordNotes` tracking drifted.

3. **Section-end stop raced the final release** — `songLength` used `(beat - 1) + duration`, one beat short of the true end. `totalTicks` equaled the last chord release tick exactly, so `engine.stop()` on `ratio >= 1` cancelled parts at the same moment as the final release (worst on Outro's 8-beat final chord).

4. **Same-tick attack/release collisions in `Tone.Part`** — Adjacent chords at fractional beats (e.g. beat 36 release and beat 36.5 attack on tick 6816) could drop the attack event when scheduled as object-array events.

### What was tried

| Attempt | Result | Why |
|---------|--------|-----|
| **`melodySynth.triggerRelease(event.name, time)`** | **Broke melody** | Invalid for monophonic `Tone.Synth` — zero `melody-release` events in logs; melody stopped playing. |
| **`releaseAll()` before every chord attack** | **Regressed** | Killed voice state aggressively; long held notes, timeline/progress issues. |
| **`songLength` via `beat + duration` + stop on `currentTicks > totalTicks`** | **Partial** | Fixed progress freeze but stop timing still wrong without `lastReleaseTick`. |
| **`normalizeToneNotes()` + `releaseAll` on chord release + `lastReleaseTick` + tuple `Tone.Part` events + +1 tick attack nudge** | **Fixed** | Targeted fix addressing all four root causes. |

### Final solution

**Files changed:** `web-player/audio/engine.js`, `web-player/player.js`, `web-player/lib/chordVoicing.js`

1. **`normalizeToneNotes()`** — MIDI roundtrip in `chordVoicing.js` converts exotic spellings (e.g. `E#3, G##3, B#4` → Tone-safe names) before scheduling in `createChordEvents()`.

2. **Chord release uses `releaseAll(time)`** — `scheduleChords()` calls `chordSynth.releaseAll(time)` on release events instead of per-note `triggerRelease`, then clears `activeChordNotes`.

3. **`lastReleaseTick`** — Derived from max scheduled release event tick; drives progress bar and section-end detection. Stop waits until `currentTicks > lastReleaseTick`, calls `releaseAllNotes()` first, then `stop()`.

4. **`songLength` correction** — Section length uses `beat + duration` (with beat-0 → 1 normalization), not `(beat - 1) + duration`.

5. **Same-tick collision handling** — Chord attacks sharing a tick with any release are nudged +1 tick after sort. `Tone.Part` events passed as `[time, event]` tuples for reliable same-tick scheduling.

### Verification

User confirmed fix after hard refresh. Pre-fix logs showed missing attack for `E#3,G##3,B#4` at Verse end and section-end stop at `currentTicks` equal to or past `lastReleaseTick` with `activeChordCount: 0` but audible sustain. Post-fix: Verse and Outro complete cleanly; no stuck notes at section end.

### Lessons / guardrails

- Normalize chord note names to Tone-compatible spellings **before** `triggerAttack` / `triggerRelease`.
- Do **not** use `triggerRelease(noteName, time)` on monophonic `Tone.Synth`.
- Section-end stop must be keyed to **last scheduled release tick**, not `songLength * 192` alone.
- Prefer `releaseAll()` on chord release over per-note release when PolySynth voice tracking is unreliable.
- When debugging audio, remove instrumentation after verification; avoid speculative `releaseAll()` on every attack.

### References

- `web-player/lib/chordVoicing.js` — `normalizeToneNotes()`, `midiToToneNote()`
- `web-player/audio/engine.js` — `scheduleChords()`, tuple `partEvents`, `releaseAll` on release
- `web-player/player.js` — `getLastReleaseTick()`, `createChordEvents()`, `setupProgressTracking()`
- `documentation/BUGS.md` — BUG-001 (related arpeggio / `triggerRelease` lessons)

---

## BUG-003: Song Selector load did nothing (missing `noteIndicator.setKey`)

| Field | Detail |
|-------|--------|
| **Date reported** | 2026-07-02 |
| **Date resolved** | 2026-07-02 |
| **Severity** | High — selecting a song from Song Selector appeared to do nothing |
| **Affected area** | `web-player/player.js`, `web-player/components/noteIndicator.js` |
| **Repro** | Open Song Selector, pick any song, click Load (or auto-load a pipeline-complete song). Player UI does not update; section does not load. |
| **Status** | **Resolved** |
| **Commit** | `e57dc72` |

### Symptom

After the Now Playing / note-indicator refactor, loading a song from Song Selector no longer populated the chord card or started playback setup. No obvious UI error.

### Root cause

`player.js` calls `noteIndicator.setKey(key)` in `loadSection()` and `resetIdleState()`. The method had been removed from `noteIndicator.js` during the refactor. The resulting `TypeError` was caught by the load handler and swallowed, so the load failed silently.

### Final solution

Restored `setKey(key)` on the note indicator — updates internal `currentKey` used by pronunciation and display logic. No change to load flow otherwise.

### References

- `web-player/player.js` — `loadSection`, `resetIdleState`
- `web-player/components/noteIndicator.js` — `setKey()`
- [ROMAN_NUMERALS.md](./ROMAN_NUMERALS.md) — other changes in same commit

---

## BUG-004: Secondary dominants rendered on root radius instead of functional radius

| Field | Detail |
|-------|--------|
| **Date reported** | 2026-07-02 |
| **Date resolved** | 2026-07-02 |
| **Severity** | Medium — chord ring communicates wrong functional placement for applied harmony |
| **Affected area** | `web-player/components/chordRing.js` |
| **Repro** | Load songs with applied chords (`V/x`, `vii°/x`). Node appears on `root` radius instead of the radius implied by applied harmony in the current key. |
| **Status** | **Resolved** |

### Symptom

Chord ring placement previously bucketed nodes by `chord.root` only. For applied chords, this made radius placement disagree with harmonic function in the active key. Coloring was correct for root degree but placement was misleading.

### Root cause

`setSongData()` grouped by root directly and all geometry/hit-test code assumed group index == both placement and color degree.

### Final solution

Split ring node metadata into:
- `placementDegree` — where node is drawn (geometry)
- `colorDegree` — what degree color is used (always original `root`)

For applied chords (`applied` 1..7), `placementDegree` is derived by:
1. `targetTonic = getNoteLabel(root, currentKey)`
2. `appliedRoot = getNoteLabel(applied, { tonic: targetTonic, scale: "major" })`
3. map `appliedRoot` back to the current key degree (exact label, then note-letter fallback)

Then:
- draw/hit-test/tooltip anchoring use `placementDegree`
- node/tooltip/transition colors use `colorDegree`
- click playback remains unchanged (original chord object)

### Verification

Closed-loop coverage for Gusty Garden Galaxy:
- Script: `_Research_testing/gustySecondaryDominantRingClosedLoopTest.mjs`
- Outputs:
  - `_Research_testing/gustySecondaryDominantRingClosedLoopReport.json`
  - `_Research_testing/gustySecondaryDominantRingClosedLoopTable.md`

Result:
- Sections checked: 5
- Chords checked: 80
- Applied chords checked: 5
- Affected applied chords: 5
- Failures: 0

### References

- `web-player/components/chordRing.js`
- `_Research_testing/gustySecondaryDominantRingClosedLoopTest.mjs`
- `_Research_testing/gustySecondaryDominantRingClosedLoopTable.md`

---

## BUG-005: Playback wiped mid-song when library fetch completed (false "crash" / key-change suspicion)

| Field | Detail |
|-------|--------|
| **Date reported** | 2026-07-05 |
| **Date resolved** | 2026-07-05 |
| **Severity** | High — loaded song disappears during playback; play fails with "No song loaded" |
| **Affected area** | `web-player/player.js` (`init()`, `resetIdleState()`) |
| **Repro** | Hard refresh. Immediately load a section (e.g. Weird Al — Everything You Know Is Wrong, Instrumental). Start playback before `"Loaded library N songs"` appears (~20s with ~34k cache entries). Playback stops / UI clears when that log line finally prints. Often misread as a key-signature change bug (Instrumental modulates at beats 33, 65, 73, 81). |
| **Status** | **Resolved** |

### Symptom

Section loads and plays, then after several measures the song vanishes, timeline/ring clear, and play warns `No song loaded`. Console order (oldest first): `Section loaded successfully` → playback → `Loaded library 34097 songs`. Double `Section loaded` lines are normal when switching sections after initial load.

Boomwhacker color scheme was initially suspected; simulation showed valid colors for all chords in the Instrumental section. Key changes during playback only trigger `chordRing.setKey()` when the key signature actually changes.

### Root cause

Race between async `init()` and user actions:

1. Page load starts `fetch("/api/songs")` (full cache scan — **~20s** measured for 34,097 songs).
2. User loads and plays a section while fetch is still in flight.
3. When fetch completes, `init()` unconditionally called `resetIdleState()` → `clearPlayerState()`, nulling `currentSong` and stopping transport UI.

The `"Loaded library"` log is **not** a page reload; it is the delayed completion of the initial library fetch.

### Final solution

**Files changed:** `web-player/player.js`, `web-player/components/chordRing.js`, `web-player/lib/scales.js`, `web-player/server.js`, `_Debug_testing/playerServerCtl.mjs`

1. **`init()` guard** — call `resetIdleState()` only when `!currentSong` at fetch completion.
2. **`chordRing.setKey()`** — early return when key signature unchanged (avoids full ring redraw every transport tick).
3. **Color / pattern hardening** — optional chaining on canvas color access; `createStripedPattern` fallback if `createPattern` returns null.
4. **Server lifecycle** — `playerServerCtl.mjs` for start/stop/status; server handles SIGTERM and `closeAllConnections()` for clean shutdown with an active browser tab.

### Lessons / guardrails

- Never call state-wiping idle reset from async startup paths without checking whether the user already started a session.
- `"Loaded library N songs"` appearing **after** section load is expected with a large cache; it does not imply reload.
- Key-signature changes during playback are handled by `syncDisplayedKeyAtBeat()` and are unrelated to library init.
- Use `npm run player:start` / `player:stop` for automation instead of blocking shell on `node server.js`.
- Replacing `library` without re-resolving `currentSongIdx` causes wrong-song section switches — see BUG-006.

### References

- `web-player/player.js` — `init()`, `resetIdleState()`, `clearPlayerState()`
- `HANDOFF.md` — server start options and race description
- `_Debug_testing/playerServerCtl.mjs` — detached server control
- `_Debug_testing/boomwhackerInstrumentalSim.mjs` — color-scheme simulation for Instrumental section

---

## BUG-006: Section switch loads wrong song after library fetch (stale `currentSongIdx`)

| Field | Detail |
|-------|--------|
| **Date reported** | 2026-07-05 |
| **Date resolved** | 2026-07-05 |
| **Severity** | High — section switch plays a completely different song (e.g. Kendrick Lamar — `__I__` chorus instead of Weird Al — Everything You Know Is Wrong chorus) |
| **Affected area** | `web-player/player.js` (`init()`, `loadSection()`, `handleSectionChange()`, `currentSongIdx`, `loadedCacheKey`) |
| **Repro** | Hard refresh. Immediately load a song (e.g. Weird Al — Everything You Know Is Wrong) before `"Loaded library N songs"` appears (~20s with ~34k cache entries). Switch to Instrumental and play. Wait for library fetch to complete. Switch to Chorus — player loads a different song's section (often Kendrick Lamar — `__I__`, which sorts to library index 0). |
| **Status** | **Resolved** |

### Symptom

User is listening to one song's section (e.g. Instrumental). After the delayed `"Loaded library N songs"` console line, switching sections (e.g. to Chorus) loads audio and timeline metadata for a **different** song. Title in Now Playing changes to the wrong song. Instrumental may continue sounding correct until the switch because playback state is already in memory.

Often reported alongside BUG-005 symptoms; same underlying race window (user acts before `init()` finishes).

### Root cause

Sibling race to BUG-005, different failure mode:

1. Page load starts `fetch("/api/songs")` (full cache scan, alphabetically sorted — **~20s** for 34,097 songs).
2. User loads a song via Song Selector while fetch is in flight. `onLoad` pushes the entry onto the partial `library` array at index **0** and sets `currentSongIdx = 0`.
3. User switches sections — `loadSection(0, sectionIndex)` reads from the pushed entry; **correct** while the partial array still holds that song.
4. When fetch completes, `init()` **replaces** the entire `library` array with the sorted full list. Index **0** is now `kendrick-lamar - __I__` (alphabetically first). Weird Al sits at index **~8807**.
5. BUG-005 fix prevented `resetIdleState()` when `currentSong` was set, but **`currentSongIdx` was never re-resolved**. Section switches call `loadSection(currentSongIdx, …)` → `library[0].sections[…]` → wrong song.

`loadedCacheKey` (stable cache-folder name) was correct throughout; only the numeric index was stale.

### Final solution

**Files changed:** `web-player/player.js`, `_Debug_testing/sectionSwitchRaceSim.mjs`

1. **`resolveSongIndex(preferredIndex)`** — if `loadedCacheKey` is set, `library.findIndex(s => s.artist === loadedCacheKey)`; fall back to `preferredIndex` when not found.
2. **`init()`** — after library fetch, if a song is already loaded (`hadSong && loadedCacheKey`), update `currentSongIdx` via `resolveSongIndex()`.
3. **`loadSection()`** — resolve `songIndex` through `resolveSongIndex()` before reading `library[songIndex]`.
4. **`handleSectionChange()`** — pass `resolveSongIndex(currentSongIdx)` into `loadSection()`.

### Verification

`_Debug_testing/sectionSwitchRaceSim.mjs` reproduces the race offline against the real cache:

- Pre-fix: `currentSongIdx: 0`, `artistAtCurrentIdx: "kendrick-lamar - __I__"`, `mismatch: true`
- Post-fix: `currentSongIdx: 8807`, chorus `relPath` points at Weird Al's `Chorus - 1700298 - nJmBYZPEboA.json`

### Lessons / guardrails

- Never use a bare array index as the long-lived song identity when the backing array can be replaced asynchronously.
- Prefer stable keys (`loadedCacheKey` / cache folder name) over positional indices for anything that survives `init()` or library refresh.
- BUG-005 and BUG-006 share the same repro window; fixing one without the other leaves a latent bug.
- Section switches re-fetch from `library[…]`; in-memory playback can mask a stale index until the next switch.

### References

- `web-player/player.js` — `resolveSongIndex()`, `init()`, `loadSection()`, `handleSectionChange()`
- `documentation/BUGS.md` — BUG-005 (related library-init race)
- `_Debug_testing/sectionSwitchRaceSim.mjs` — offline race reproduction and fix verification
