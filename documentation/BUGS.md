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
