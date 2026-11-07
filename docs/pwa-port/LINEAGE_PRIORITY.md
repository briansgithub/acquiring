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
2. **Visual timeline geometry** (`3989f388` then inertia `c2f3fcef`/`3f35259d`): melody/chord lanes, center-playhead, silent scrub/coast. Layout `0d77407e`, Canvas `430a6430`. Lock-in-Major restaffs melody staff. Chord-lane Roman landed `cf9eb52a`. Real mouse/canvas drag is a **basic input gap**, not polish. Inertia remains polish (1.4 / 0.5; tap-during-coast cancels). CSS=dp noteHeight vs density-3 raw px is a tracked mapping gap.
3. **Song-scoped octave persistence + selector UI** (`SongOctaveOffsetViewModel`, `SingingOctaveSelector`): selector lives in the expanded dock; T06 `songOctaveOffsets` restore landed this checkpoint. Section changes keep offset; new song zeros then store restore. No calibration UI.
4. **Singing dock chrome / two-slot / Flip-Flop / card-target wiring** (`aed98be9`, `ee96eccf`, later Flip-Flop): collapsed handle, expand without mic, two slots from card double-click. Flip-Flop/listen via T09 capture; 2s rest after slot 2; measured interval from accepted `calculateMeasuredInterval` when both slots exist. **Brian 2026-11-07 policy A accepted:** card double-click / target load may start slot-1 listening after 800ms, including the first permission prompt. Expand handle still does not start mic. Collapse/release/navigation cancel. No fabricated cents. No further policy question.
5. **T12 defaults / route-position memory** landed `00f26f2a`. **Playback Favorites star** landed `b75165b8`. **T21 Settings `selectAsDefault`** landed `eb7b0d21`. **Timeline tap-to-seek** landed `2d8651ee`. **Live timeline drag/scrub** landed `57fa7312`. **Chord-lane Roman + queued `changeSection`** landed `cf9eb52a`. **Pitch monitoring overlay** `4657c977`. **Shared PLAYBACK_PERSISTENT/SINGING_TOOL capture** `bfeddec5`. Real Playwright mouse/canvas drag original `page.mouse` assertions pass after scroll-then-box. **Live halo/marker/label** `6bc917fe` (captured estimate; held display-only; silent white `0¢` rest ≠ banked score). **Emulated browser touch** `7e85c96b` (Playwright/CDP; not Pixel). **T21 HelpCatalog `/help` index** `7e85c96b`. **SYNTHETIC product banked-score Chrome** `435ffd9a`. **T21 one-shot IntroductionPrefs** `435ffd9a`. **audio-sink suspend `canRender` reconcile** + **HelpNotationArticles/Roman** `2b69bf32`. **T21 audio diagnostics export + engine-stop reset** this checkpoint. **T10** Favorites/Recents/All Songs A+mode+filter + Play/Shuffle + resolve + save landed prior. **T09** PitchPublisher/lease/tracker/AudioWorklet/Flip-Flop rest/policy A landed prior (SYNTHETIC ≠ Pixel; linear resample to 16kHz hops is in). **Next:** not inertia/tween polish. Artists chip needs a new `getArtistSuggestions` RPC.

## Coverage vs pinned Android `801cf798` (2026-11-07)

Primary playback / singing-dock / card surfaces. Cards stay accepted — do not redo. Aural last.

| Surface | State vs pinned | Honest gap |
|---|---|---|
| Playback route, transport, settings, Home/cards | landed | device/Safari unrun |
| Lock in Major labels + timeline staff + chord-lane Roman | landed | T04 node measure is char×0.6 fallback; Chrome paints |
| Timeline geometry / Canvas / tap / live drag | landed | CSS=dp vs density-3 ~9.4px staff; real `page.mouse` drag passes. Emulated browser touch tap+drag PASS (CDP/Playwright `hasTouch`; not PointerEvent math; not Pixel). PointerEvent case remains handler-only |
| Timeline inertia/coast | **missing (polish)** | native `exponentialDecay(1.4)` if \|v\|>0.5 beats/s; tap-during-coast cancels without seek |
| Pitch-score overlay | **SYNTHETIC product Chrome landed** | Kernel+hook+badges + **product** oscillator→Mic→banked scored `¢` / Unscored `·` while monitoring. Fake/silent still empty scores + live rest `0¢`. Halo rest **`0¢` ≠ banked empty ≠ banked `·`**. Held display-only. **32ms tween outstanding. 11px vs 11.sp outstanding** (not silent parity). Pixel/real-mic unrun. Singing scoring not done |
| T21 help | **partial** | HelpCatalog index + one-shot IntroductionPrefs + HelpNotationArticles/Roman prose. Timeline fps / privacy link if required |
| Favorites star + T21 `selectAsDefault` | landed | |
| T21 diagnostics/reset | **landed** | Allow-listed export + engine-stop (preview + registered transports). Not app-data wipe. Does not release ApplicationAudioContext. Disposable fixture tests only |
| Singing octave kernel + song persist + dock chrome | landed | no calibration UI (deleted) |
| Listen / Flip-Flop capture | partial | AudioWorklet hashed module; linear resample to 16kHz hops **is in**; SYNTHETIC oscillator ≠ Pixel/real mic; **policy A accepted**. Playwright fake/silent getUserMedia is not SYNTHETIC and not Pixel. One capture+coordinator serializes PLAYBACK_PERSISTENT and SINGING_TOOL |
| Song queue Play/Shuffle / resolve / save / section override | landed | `auralSectionIdentity` RPC deferred; originQuiz begin last |
| Library Favorites / Recents / All Songs A+mode+filter | landed | prefix scrubber is polish; Artists chip needs **new** `getArtistSuggestions` RPC |
| Library Settings Back 64px | **blocked** | owner decision after two cycles; do not restart |
| Aural quiz / T15 song-rank / family trees | **last** | not playback/card work |

This checkpoint: T21 audio diagnostics export + engine-stop reset (native event order; clipboard/share; onboarding/catalog/T06 preserved). Halo rest `0¢` remains distinct from banked empty/`·`. 32ms tween and 11px vs 11.sp stay outstanding. Unmount-without-finish: native in-composition finish vs disable-clear vs remember-drop; not a silent PWA finish-on-cleanup. `2b69bf32` CI still in progress. Latest completed CI `435ffd9a` 42376950150: 98/2/2. Do not claim whole CI green. Settings Back owner-blocked. Device proof remains SYNTHETIC≠Pixel≠emulated-touch≠fake/silent. No further mic-policy question.

Aural catalog ranking (`eligibleRankBits` / T15), curriculum family trees (`AuralCurriculum.families`), and catalog start-group trees are **not** playback/card work. They stay last even though T15 numerically precedes T13 in `tasks.json`.

## Tie-break rules

- Explicit owner priority > lineage > original T00–T28 package numbers.
- Pinned `801cf798` + accepted contracts > any historical feature row.
- If lineage and owner priority conflict on an unaccepted surface, ask Brian with the exact divergence; keep unrelated unambiguous work moving.
- Library Settings Back 64px remains owner-decision-blocked after two cycles; do not restart.

This file is the reusable lineage pass. Re-read `HISTORY.md` only when a new slice’s surviving-vs-deleted disposition is missing here.
