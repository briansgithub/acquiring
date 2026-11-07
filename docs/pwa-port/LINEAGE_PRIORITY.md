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
2. **Visual timeline geometry** (`3989f388` then inertia `c2f3fcef`/`3f35259d`): melody/chord lanes, center-playhead, silent scrub/coast. Layout `0d77407e`, Canvas `430a6430`. Lock-in-Major now restaffs melody staff (native `useRelativeIonianContext`). Chord-lane Roman landed this checkpoint (T03 symbols + T04 fit/paint; rest → null; ionian-lock vs source). **Partial:** no inertia/scores. Native inertia 1.4 / 0.5 beats/s; tap-during-coast cancels without seek. Hidden in simple/root-only. Pitch-score overlay waits for T09. Inertia remains polish. CSS=dp noteHeight vs density-3 raw px is a tracked mapping gap.
3. **Song-scoped octave persistence + selector UI** (`SongOctaveOffsetViewModel`, `SingingOctaveSelector`): selector lives in the expanded dock; T06 `songOctaveOffsets` restore landed this checkpoint. Section changes keep offset; new song zeros then store restore. No calibration UI.
4. **Singing dock chrome / two-slot / Flip-Flop / card-target wiring** (`aed98be9`, `ee96eccf`, later Flip-Flop): collapsed handle, expand without mic, two slots from card double-click. Flip-Flop/listen opt-in via T09 capture; 2s rest after slot 2; measured interval from accepted `calculateMeasuredInterval` when both slots exist. First-load auto-listen 800ms is a Brian decision (not silently dropped); this slice auto-listens only after prior mic opt-in. No fabricated cents.
5. **T12 defaults / route-position memory** landed `00f26f2a`. **Playback Favorites star** landed `b75165b8`. **T21 Settings `selectAsDefault`** landed `eb7b0d21`. **Timeline tap-to-seek** landed `2d8651ee`. **Live timeline drag/scrub** landed `57fa7312` (startBeat-deltaX/60, 18dp slop, no inertia decay). **Real Playwright mouse/canvas drag still failing** (stayed beat 1); synthetic PointerEvent proves handler math only — not mouse/touch acceptance; `test.fixme` kept (skipped would still not be acceptance). **T10 Library Favorites accordion** landed `c82fe15d`. **T10 Library Recent Selections** landed `1d07f296`. **T10 All Songs alphabetical** landed `d336acc2`. **T10 All Songs complexity/mode** landed `d9bba889`. **T10 All Songs in-view filter** landed `53e875d1`. **T09 PitchPublisher hop/200ms hold** landed `fefa526e`. **T09 exclusive MicrophonePitchCoordinator lease** landed `7418359d`. **T09 MicrophonePitchTracker hop-to-YIN** landed `9fe4a607`. **T09 browser capture adapter + dock listen/Flip-Flop** landed `2bdccfb6` (SYNTHETIC oscillator only; not real mic/Pixel). **Flip-Flop 2s rest + measured interval + opt-in-only auto-listen** landed `e084ac9e`. **SongQueueViewModel kernel** landed `53df124f`. **Play/Shuffle chrome + playOnceKey auto-advance** landed `7b6bc68f`. **resolveQueuedSection** landed `2f89752f`. **AudioWorklet hashed module + playlist-save Chrome proof** landed `8ef5bc11`. **Chord-lane Roman + queued `changeSection` remount** landed this checkpoint. **Next:** remaining playback inertia polish (1.4 / 0.5; tap-during-coast cancels), or coordinated device mic when a specific ADB test exists — not more Library prefix polish. Mic policy B pending Brian, not parity. ScriptProcessor gone. SYNTHETIC ≠ Pixel. Linear resample 16kHz hops still required (AudioRecord 16kHz vs Chrome 44.1/48k). Artists chip needs a new `getArtistSuggestions` RPC. Mouse/canvas drag waits for an input/device pass.

## Coverage vs pinned Android `801cf798` (2026-11-07)

Primary playback / singing-dock / card surfaces. Cards stay accepted — do not redo. Aural last.

| Surface | State vs pinned | Honest gap |
|---|---|---|
| Playback route, transport, settings, Home/cards | landed | device/Safari unrun |
| Lock in Major labels + timeline staff + chord-lane Roman | landed | T04 node measure is char×0.6 fallback; Chrome paints |
| Timeline geometry / Canvas / tap / live drag | landed | CSS=dp vs density-3 ~9.4px staff; real mouse/canvas `test.fixme` |
| Timeline inertia/coast | **missing (polish)** | native `exponentialDecay(1.4)` if \|v\|>0.5 beats/s; tap-during-coast cancels without seek |
| Pitch-score overlay | **blocked** | waits T09/real estimates; no fabricated cents |
| Favorites star + T21 `selectAsDefault` | landed | T21 intro/help/diagnostics/reset remain |
| Singing octave kernel + song persist + dock chrome | landed | no calibration UI (deleted) |
| Listen / Flip-Flop capture | partial | AudioWorklet hashed module; **linear resample to 16kHz hops required**; SYNTHETIC oscillator ≠ Pixel/real mic; first-load auto-listen **B pending Brian**, not parity |
| Song queue Play/Shuffle / resolve / save / section override | landed | `auralSectionIdentity` RPC deferred; originQuiz begin last |
| Library Favorites / Recents / All Songs A+mode+filter | landed | prefix scrubber is polish; Artists chip needs **new** `getArtistSuggestions` RPC |
| Library Settings Back 64px | **blocked** | owner decision after two cycles; do not restart |
| Aural quiz / T15 song-rank / family trees | **last** | not playback/card work |

This checkpoint implemented the next unblocked primary after Roman: native queued `changeSection` remount (`MainActivity` `songQueue.changeSection(it, isPlaybackRequested)`), not inertia polish.

Aural catalog ranking (`eligibleRankBits` / T15), curriculum family trees (`AuralCurriculum.families`), and catalog start-group trees are **not** playback/card work. They stay last even though T15 numerically precedes T13 in `tasks.json`.

## Tie-break rules

- Explicit owner priority > lineage > original T00–T28 package numbers.
- Pinned `801cf798` + accepted contracts > any historical feature row.
- If lineage and owner priority conflict on an unaccepted surface, ask Brian with the exact divergence; keep unrelated unambiguous work moving.
- Library Settings Back 64px remains owner-decision-blocked after two cycles; do not restart.

This file is the reusable lineage pass. Re-read `HISTORY.md` only when a new slice’s surviving-vs-deleted disposition is missing here.
