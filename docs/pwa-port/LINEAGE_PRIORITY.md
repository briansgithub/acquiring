> 2026-11-07 N05 bounded singing UI follow-up at `503cfd2d`: selected-section accidental preference now reaches both tapes with captured pitches/capture policy unchanged. FIRST PASS1217unit+parity/types/build and9browser/1original skip. Ledger N05 pins source/tests; **N01 root-only monitoring remains next/open**, plus title/help/reset leaves. No physical-device/whole-port acceptance; Aural/T15/family trees LAST.

> 2026-11-07 S06 implementation follow-up: collapsed persistent Stop/native two-way owner handoff landed at `d30df565` with scoped desktop async/lifecycle proof. Ordinary cleanup and policy A800ms unchanged. [FEATURE_LEDGER.md](FEATURE_LEDGER.md) pins S06 only; next independent ready primary slice **N01 root-only persistent selection/target/gauge and mode/session reset**. Other frozen audit rows, Settings Back/trusted-tab/device gates and Aural-last priority remain unchanged.

> 2026-11-07 docs-only reconciliation: [FEATURE_LEDGER.md](FEATURE_LEDGER.md) maps current code at `7b889f1c` to native/history and known/NEW gaps. Brian explicitly requested this bounded audit; older do-not-repeat language did not block it. The table below is a chronological snapshot: query overlays/atomic harvest and 300ms exit have since landed (remaining gaps stay open). No priority/acceptance decision changes. Next implementation remains collapsed-monitoring Stop, then root-only monitoring; Aural/T15/family trees LAST.

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
5. **T12 defaults / route-position memory** landed `00f26f2a`. **Playback Favorites star** landed `b75165b8`. **T21 Settings `selectAsDefault`** landed `eb7b0d21`. **Timeline tap-to-seek** landed `2d8651ee`. **Live timeline drag/scrub** landed `57fa7312`. **Chord-lane Roman + queued `changeSection`** landed `cf9eb52a`. **Pitch monitoring overlay** `4657c977`. **Shared PLAYBACK_PERSISTENT/SINGING_TOOL capture** `bfeddec5`. Real Playwright mouse/canvas drag original `page.mouse` assertions pass after scroll-then-box. **Live halo/marker/label** `6bc917fe` (captured estimate; held display-only; silent white `0¢` rest ≠ banked score). **Emulated browser touch** `7e85c96b` (Playwright/CDP; not Pixel). **T21 HelpCatalog `/help` index** `7e85c96b`. **SYNTHETIC product banked-score Chrome** `435ffd9a`. **T21 one-shot IntroductionPrefs** `435ffd9a`. **audio-sink suspend `canRender` reconcile** + **HelpNotationArticles/Roman** `2b69bf32`. **T21 audio diagnostics export + engine-stop reset** `00abb9a4`. **T21 timeline fps + privacy** `2c0d7de6`. **Singing-dock listen slot scoring** `f2e3e2d6`. **Record / request-clear / captured-pitch preview / snap tape** `ba24c4d1`. **Collapse slot-clear / shared PREVIEW / tape ticks** `fe09d620`. **Artists chip + Flip-Flop target-drop** `b8642714`. **T21 Updates chrome** `13ebc863`. **T22 harvest-ledger kernel + Play/Open Play honesty** this checkpoint. **T10** Favorites/Recents/All Songs A+mode+filter + Play/Shuffle + resolve + save landed prior. **T09** PitchPublisher/lease/tracker/AudioWorklet/Flip-Flop rest/policy A landed prior (SYNTHETIC ≠ Pixel; linear resample to 16kHz hops is in). **Next:** not inertia/tween polish. T22 catalog-swap wiring (T05+T06; no Hooktheory HTTP). T08 trusted-tab unproven. T26 skipWaiting. Play/SW mismatch unaccepted.

## Coverage vs pinned Android `801cf798` (2026-11-07)

Primary playback / singing-dock / card surfaces. Cards stay accepted — do not redo. Aural last.

| Surface | State vs pinned | Honest gap |
|---|---|---|
| Playback route, transport, settings, Home/cards | landed | device/Safari unrun |
| Lock in Major labels + timeline staff + chord-lane Roman | landed | T04 node measure is char×0.6 fallback; Chrome paints |
| Timeline geometry / Canvas / tap / live drag | landed | CSS=dp vs density-3 ~9.4px staff; real `page.mouse` drag passes. Emulated browser touch tap+drag PASS (CDP/Playwright `hasTouch`; not PointerEvent math; not Pixel). PointerEvent case remains handler-only |
| Timeline inertia/coast | **missing (polish)** | native `exponentialDecay(1.4)` if \|v\|>0.5 beats/s; tap-during-coast cancels without seek |
| Pitch-score overlay | **SYNTHETIC product Chrome landed** | Kernel+hook+badges + **product** oscillator→Mic→banked scored `¢` / Unscored `·` while monitoring. Fake/silent still empty scores + live rest `0¢`. Halo rest **`0¢` ≠ banked empty ≠ banked `·` ≠ dock target `+0¢`**. Held display-only. **32ms tween outstanding. 11px vs 11.sp outstanding** (not silent parity). Pixel/real-mic unrun |
| T21 help / display / privacy / updates | **partial** | HelpCatalog + intro + notation/Roman + Display 60fps/Maximum + Privacy last + `Version 0.1.0` from `package.json`. Updates section UNAVAILABLE, **no Open Play**. Play Store UI ≠ SW; mismatch unaccepted. No fabricated build code. No `preferredRefreshRate`. skipWaiting is T26 |
| Favorites star + T21 `selectAsDefault` | landed | |
| T21 diagnostics/reset | **landed** | Allow-listed export + engine-stop (preview + registered transports). Not app-data wipe. Does not release ApplicationAudioContext. Disposable fixture tests only |
| Singing octave kernel + song persist + dock chrome | landed | no calibration UI (deleted) |
| Listen / Flip-Flop capture | partial | AudioWorklet hashed module; linear resample to 16kHz hops **is in**; SYNTHETIC oscillator ≠ Pixel/real mic; **policy A accepted**. Playwright fake/silent getUserMedia is not SYNTHETIC and not Pixel. One capture+coordinator serializes PLAYBACK_PERSISTENT and SINGING_TOOL |
| Singing-dock slot scoring | **SYNTHETIC listen cents landed** | `displayedSlotData` retarget + gauge colors + remaining. Target `+0¢` placeholder ≠ sung score. Interval green uses rounded cents. Flip-Flop nearest/white while active. Pixel/real-mic unrun |
| Singing Record / preview / tape | **SYNTHETIC Record + collapse-clear + shared PREVIEW + Flip-Flop target-drop landed** | Empty-slot Record start(60)/nearest/3s. `requestId` clears slots. Literal Hz 1000ms preview; interval 1000ms gaps. Collapse immediately clears slots+target (no 300ms shrink). Shared cards PreviewOwner. Tape ticks 10×1 CSS=dp. Snap tape (no Compose tween). Flip-Flop nulls local `displayedTarget` without changing `requestId` |
| Song queue Play/Shuffle / resolve / save / section override | landed | `auralSectionIdentity` RPC deferred; originQuiz begin last |
| Library Favorites / Recents / All Songs A+mode+filter / Artists chip | landed | prefix scrubber is polish; local catalog-worker `getArtistSuggestions` (no remote deploy). Empty Search copy landed. Remaining nonparity: Search paged 20 vs native unbounded; NOCASE vs unordered DISTINCT; no alphanumeric-fold index |
| Library Settings Back | **blocked** | Native overlay keep-alive vs PWA remount/`window.scrollY`. Assertion `|ΔscrollY|<3` after Settings Back. CI Received **110**. Owner pick A–E in HANDOFF; do not restart |
| Aural quiz / T15 song-rank / family trees | **last** | not playback/card work |
| T22 harvest overlay | **partial swap wiring** | record/adopt/replay + T06 persist + songs adopt-before/T05 pointer/overlay replay-after. No catalog.db writes. songPayload + browseBySlugs overlay. All Songs overlay and Hooktheory worker remain |

This checkpoint: T22 catalog-swap wiring (adopt-before / T05 pointer / T06 overlay replay-after; immutable catalog.db). Play Store/Open Play honesty from `18cd6ae5` unchanged (`Version 0.1.0`; no Open Play; Play≠SW unaccepted). Artists paging 20 / ORDER BY / index fold remain explicit nonparity. Halo rest `0¢` remains distinct from banked empty/`·` and from dock unsung `+0¢`. Snap tape / 32ms tween / CSS=dp vs density-3 / inertia / collapse shrink stay outstanding, not accepted. Unmount-without-finish tracked. No `preferredRefreshRate`; probe fallback 60, not 120fps. Actual CI `fe09d620` 42380664547 **102/1/2**, sole fail Settings Back 110px. This commit unseen. Do not claim whole CI green. Device proof remains SYNTHETIC≠Pixel≠emulated-touch≠fake/silent. No further mic-policy question. Next concrete: T22 Hooktheory harvest worker (still no remote) or T08; All Songs overlay remaining.

Whole-port remainder (outside this primary table): T08 trusted-tab/Safari/BFCache; T14–T20 Aural last; T22 Hooktheory harvest worker; T23 auth; T24–T25 sync; T26 recovery; T27 device; T28 release.

Aural catalog ranking (`eligibleRankBits` / T15), curriculum family trees (`AuralCurriculum.families`), and catalog start-group trees are **not** playback/card work. They stay last even though T15 numerically precedes T13 in `tasks.json`.

## Tie-break rules

- Explicit owner priority > lineage > original T00–T28 package numbers.
- Pinned `801cf798` + accepted contracts > any historical feature row.
- If lineage and owner priority conflict on an unaccepted surface, ask Brian with the exact divergence; keep unrelated unambiguous work moving.
- Library Settings Back remains owner-decision-blocked (HANDOFF A–E); do not restart.

This file is the reusable lineage pass. Re-read `HISTORY.md` only when a new slice’s surviving-vs-deleted disposition is missing here.
