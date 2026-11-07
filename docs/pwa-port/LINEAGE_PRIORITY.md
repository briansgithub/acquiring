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
5. **T12 defaults / route-position memory** landed `00f26f2a`. **Playback Favorites star** landed `b75165b8`. **T21 Settings `selectAsDefault`** landed `eb7b0d21`. **Timeline tap-to-seek** landed `2d8651ee`. **Live timeline drag/scrub** landed `57fa7312`. **Chord-lane Roman + queued `changeSection`** landed `cf9eb52a`. **Pitch monitoring overlay** `4657c977`. **Shared PLAYBACK_PERSISTENT/SINGING_TOOL capture** `bfeddec5`. Real Playwright mouse/canvas drag original `page.mouse` assertions pass after scroll-then-box. **Live halo/marker/label** `6bc917fe` (captured estimate; held display-only; silent white `0¢` rest ≠ banked score). **Emulated browser touch** `7e85c96b` (Playwright/CDP; not Pixel). **T21 HelpCatalog `/help` index** `7e85c96b`. **SYNTHETIC product banked-score Chrome** `435ffd9a`. **T21 one-shot IntroductionPrefs** `435ffd9a`. **audio-sink suspend `canRender` reconcile** + **HelpNotationArticles/Roman** `2b69bf32`. **T21 audio diagnostics export + engine-stop reset** `00abb9a4`. **T21 timeline fps + privacy** `2c0d7de6`. **Singing-dock listen slot scoring** `f2e3e2d6`. **Record / request-clear / captured-pitch preview / snap tape** `ba24c4d1`. **Collapse slot-clear / shared PREVIEW / tape ticks** this checkpoint. **T10** Favorites/Recents/All Songs A+mode+filter + Play/Shuffle + resolve + save landed prior. **T09** PitchPublisher/lease/tracker/AudioWorklet/Flip-Flop rest/policy A landed prior (SYNTHETIC ≠ Pixel; linear resample to 16kHz hops is in). **Next:** not inertia/tween polish. Artists chip (`getArtistSuggestions` RPC). Flip-Flop still does not drop PWA card target.

## Coverage vs pinned Android `801cf798` (2026-11-07)

Primary playback / singing-dock / card surfaces. Cards stay accepted — do not redo. Aural last.

| Surface | State vs pinned | Honest gap |
|---|---|---|
| Playback route, transport, settings, Home/cards | landed | device/Safari unrun |
| Lock in Major labels + timeline staff + chord-lane Roman | landed | T04 node measure is char×0.6 fallback; Chrome paints |
| Timeline geometry / Canvas / tap / live drag | landed | CSS=dp vs density-3 ~9.4px staff; real `page.mouse` drag passes. Emulated browser touch tap+drag PASS (CDP/Playwright `hasTouch`; not PointerEvent math; not Pixel). PointerEvent case remains handler-only |
| Timeline inertia/coast | **missing (polish)** | native `exponentialDecay(1.4)` if \|v\|>0.5 beats/s; tap-during-coast cancels without seek |
| Pitch-score overlay | **SYNTHETIC product Chrome landed** | Kernel+hook+badges + **product** oscillator→Mic→banked scored `¢` / Unscored `·` while monitoring. Fake/silent still empty scores + live rest `0¢`. Halo rest **`0¢` ≠ banked empty ≠ banked `·` ≠ dock target `+0¢`**. Held display-only. **32ms tween outstanding. 11px vs 11.sp outstanding** (not silent parity). Pixel/real-mic unrun |
| T21 help / display / privacy | **partial** | HelpCatalog + intro + notation/Roman + Display 60fps/Maximum + Privacy last. No `preferredRefreshRate`. Maximum = visual throttle + `screen.refreshRate` else **60**, not 120fps / native window. Version omits native build code. Play Store updates are T26 |
| Favorites star + T21 `selectAsDefault` | landed | |
| T21 diagnostics/reset | **landed** | Allow-listed export + engine-stop (preview + registered transports). Not app-data wipe. Does not release ApplicationAudioContext. Disposable fixture tests only |
| Singing octave kernel + song persist + dock chrome | landed | no calibration UI (deleted) |
| Listen / Flip-Flop capture | partial | AudioWorklet hashed module; linear resample to 16kHz hops **is in**; SYNTHETIC oscillator ≠ Pixel/real mic; **policy A accepted**. Playwright fake/silent getUserMedia is not SYNTHETIC and not Pixel. One capture+coordinator serializes PLAYBACK_PERSISTENT and SINGING_TOOL |
| Singing-dock slot scoring | **SYNTHETIC listen cents landed** | `displayedSlotData` retarget + gauge colors + remaining. Target `+0¢` placeholder ≠ sung score. Interval green uses rounded cents. Flip-Flop nearest/white while active. Pixel/real-mic unrun |
| Singing Record / preview / tape | **SYNTHETIC Record + collapse-clear + shared PREVIEW landed** | Empty-slot Record start(60)/nearest/3s. `requestId` clears slots. Literal Hz 1000ms preview; interval 1000ms gaps. Collapse immediately clears slots+target (no 300ms shrink). Shared cards PreviewOwner. Tape ticks 10×1 CSS=dp. Snap tape (no Compose tween). Flip-Flop still does not drop PWA card target |
| Song queue Play/Shuffle / resolve / save / section override | landed | `auralSectionIdentity` RPC deferred; originQuiz begin last |
| Library Favorites / Recents / All Songs A+mode+filter | landed | prefix scrubber is polish; Artists chip needs **new** `getArtistSuggestions` RPC |
| Library Settings Back | **blocked** | Native overlay keep-alive vs PWA remount/`window.scrollY`. Assertion `|ΔscrollY|<3` after Settings Back. CI Received **110**. Owner pick A–E in HANDOFF; do not restart |
| Aural quiz / T15 song-rank / family trees | **last** | not playback/card work |

This checkpoint: collapse slot-clear + shared PREVIEW owner + tape ticks. Halo rest `0¢` remains distinct from banked empty/`·` and from dock unsung `+0¢`. Snap tape / 32ms tween / CSS=dp vs density-3 / inertia stay outstanding, not accepted. Unmount-without-finish tracked. No `preferredRefreshRate`; probe fallback 60, not 120fps. Actual CI `ba24c4d1` 42380019116 **101/1/2**, sole fail Settings Back 110px (same as `f2e3e2d6` 100/1/2, `2c0d7de6` 99/1/2). Do not claim whole CI green. Device proof remains SYNTHETIC≠Pixel≠emulated-touch≠fake/silent. No further mic-policy question.

Whole-port remainder (outside this primary table): T08 trusted-tab/Safari/BFCache; T14–T20 Aural last; T22 harvest; T23 auth; T24–T25 sync; T26 recovery; T27 device; T28 release.

Aural catalog ranking (`eligibleRankBits` / T15), curriculum family trees (`AuralCurriculum.families`), and catalog start-group trees are **not** playback/card work. They stay last even though T15 numerically precedes T13 in `tasks.json`.

## Tie-break rules

- Explicit owner priority > lineage > original T00–T28 package numbers.
- Pinned `801cf798` + accepted contracts > any historical feature row.
- If lineage and owner priority conflict on an unaccepted surface, ask Brian with the exact divergence; keep unrelated unambiguous work moving.
- Library Settings Back remains owner-decision-blocked (HANDOFF A–E); do not restart.

This file is the reusable lineage pass. Re-read `HISTORY.md` only when a new slice’s surviving-vs-deleted disposition is missing here.
