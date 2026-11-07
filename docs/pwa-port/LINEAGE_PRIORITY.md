# Lineage sequencing inside current owner priority

Updated 2026-11-07. Reuses the completed 262-entry ledger in [HISTORY.md](HISTORY.md); do not repeat that audit. Frozen Android authority remains `801cf7984171d772afc4406ddb5c79c0cb7fd20a`. Final pinned behavior and accepted PWA contracts win over any historical intermediate.

Brian 2026-11-07 explicit order (overrides package-number order):

1. Playback behavior/UI to pinned Android parity
2. Singing tool (Playback dock, not Aural Sing mode)
3. Note cards and chord cards (already accepted — do not redo)
4. Everything Aural last: quiz, T15 song-rank, progression family trees, catalog-first Aural browser

Within 1–3, Android git lineage is the default sequencer and tie-breaker. Skip code/features that were later deleted. Do not recreate removed designs just to mimic chronology.

## Do not implement (deleted or superseded)

- Stray outer-repo interval tool `22217c64` (deleted `8e496fee`); real tool starts `aed98be9`
- Audiation puck / draggable target / hum-calibration / comfortable-pitch capture (`ad09e35e`…`4bb64d1f`…`45e7012e` removed calibration)
- Floating/draggable transport and spacer-alignment hacks (`febfadae` → `1c674526`)
- Background media service/notification (`9d149952` → `f89a775c`)
- Vertical balance fader (replaced by mix knob)
- Six-family Aural landing and old song “Quiz” naming (`b6b19077` → catalog-first browser)
- Length-first Aural grouping; old ranking defaults
- Generated-example auto-advance / remainder-only shuffle

## Surviving playback/singing/card lineage (after accepted work)

Already accepted on the continuation branch: product Playback route/controls, current/previous/home/interval cards, Lock in Major, 450ms/3-stage previews. Skip those native/browser recaptures.

Useful remaining order inside the owner priority, lineage-informed:

1. **Pure singing octave kernel** (`73f1259a` / `838b161b` / `45e7012e`): -2..+3, never shifts source transport; AudioEngine still applies manual transpose. Landed `165f3dbf`. T09 mic is not required for this math.
2. **Visual timeline geometry** (`3989f388` then inertia `c2f3fcef`/`3f35259d`): melody/chord lanes, center-playhead, silent scrub/coast. *Current slice:* pure CSS-px=dp layout. Next: Canvas-2D matching `PlaybackView` ~1122+ (no spacer hacks). Native inertia 1.4 / 0.5 beats/s; tap-during-coast cancels without seek. Hidden in simple/root-only. Pitch-score overlay waits for T13 scoring.
3. **Song-scoped octave persistence + selector UI** (`SongOctaveOffsetViewModel`, `SingingOctaveSelector`): T06 already has `songOctaveOffsets` store. Section changes keep offset; new song resets in-memory to 0 then Room restore. No calibration UI.
4. **Singing dock chrome / two-slot / Flip-Flop / card-target wiring** (`aed98be9`, `ee96eccf`, later Flip-Flop). Scoring, exclusive mic, 200ms freshness still need T09 capture — genuine dependency. Do not fake scores.
5. T12 defaults / route-position memory and T21 session sound stay after the above unless a slice is blocked.

Aural catalog ranking (`eligibleRankBits` / T15), curriculum family trees (`AuralCurriculum.families`), and catalog start-group trees are **not** playback/card work. They stay last even though T15 numerically precedes T13 in `tasks.json`.

## Tie-break rules

- Explicit owner priority > lineage > original T00–T28 package numbers.
- Pinned `801cf798` + accepted contracts > any historical feature row.
- If lineage and owner priority conflict on an unaccepted surface, ask Brian with the exact divergence; keep unrelated unambiguous work moving.
- Library Settings Back 64px remains owner-decision-blocked after two cycles; do not restart.

This file is the reusable lineage pass. Re-read `HISTORY.md` only when a new slice’s surviving-vs-deleted disposition is missing here.
