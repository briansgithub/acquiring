/** First bounded product playback screen; root owns route/callback integration.
 * Reuse SongDetailController for readonly exactslug fetch and SectionPlaybackController for audio.
 * Props never imply autoplay. Construct no AudioContext/worker directly. Lifecycle/StrictMode
 * creates fresh owners after permanent disposal; pagehide stops, persisted pageshow stays paused.
 * Exactly one lazy section controller per ready song; section changes preserve settings/requested
 * intent through loadSection. Invalid section preparation must stop output and show usable error.
 * View controls: play/pause (buffering/playing count as active),reset, silent position range,
 * tempo0..200%,transpose-12..12,13nativeINSTRUMENTS,rootOnly,mix0..100,eight arpeggio options.
 * Explicit Play handler calls controller.play synchronously. Pointer/keyboard range beginScrub,
 * scrubTo,finishScrub; cancellation/blur cancel, never implicitly resume. Hide arpeggio inrootonly
 * while preserving its value. Currentbeat derives only from transport; no visual wallclock timer.
 * Expose data-playback-phase/requested for evidence and accessible labeled beat/settings controls.
 * 320px/200%text no overflow/overlap,44px targets, controls keyboard operable; stable loading,
 * missing/download/retry states. No App/router/catalog/audio/sharedcontract/dependency writes.
 * Current-card band now adds sourcekey/chord/tone/melody/root previews via borrowed owner.
 * Musical Home note/chord references follow sounding sourcekey,450ms/currentpreset/transposeonce.
 * Lock in Major fixes a sectioninitial relativeIoniancontext; cardlabels/registers follow native,
 * rootOnly andmelody taps staysource register (normalizedtarget is futureT13 singing),
 * fullchord/Home/sourcekey/transport remain sourcebased. Localstate is not globalpersistence.
 * Remaining slices: timeline tap/inertia/Roman/scores, singing mic scoring (T09),
 * favorites star and T21 Settings instrument default; route-position memory is in,
 * session waveform is in-memory only (not Settings default). wholeT12 remains in_progress,
 * device/Safari acceptance remains unrun. Lock-in-Major restaffs timeline melody staff
 * (native useRelativeIonianContext). Chord-lane Roman painter still absent. CSS=dp
 * noteHeight vs density-3 raw px remains a tracked mapping gap, not T27 proof.
 */
/** Next bounded presentation slice: previous root/melody single-pitch cards only.
 * Use accepted PlaybackActiveEventIndex, showsRootOnlyPrevious, melodyPitchCardDisplayMode,
 * buildMelodyPitchCards and melodyCurrentCardVerticalPosition. Root previous remains visible
 * even on unison; melody previous exists only in INTERVAL mode (written-pitch equality).
 * Previous root source label is state.previousDegreeLabel; Major label uses previousIntervalPitch.
 * Melody previous label is state.previousDegreeLabel or fixed Ionian context label when locked.
 * ALL root/melody tap audio remains RAW source pitch +manualtransposeonce,450ms/currentpreset.
 * Previous/current melody vertical placement follows the accepted native card helper; SINGLE
 * current remains centered. Source keys per event, relative display context fixed per section.
 * Reuse the existing preview owner/stop ref; no new owner/timers/context/controller/props/API.
 * Add accessible Play previous root <label>/Play previous melody <label> buttons; keep current
 * labels/selectors and empty/rest slots, section lifecycle/scrub/Reset behavior unchanged.
 * Keep 44px targets, 320px/200%text wrapping and keyboard operation. No interval-play button
 * before separately accepted sequenceaudio; no placeholder/debugtext, singing or persistence.
 */
export interface PlaybackScreenProps {
  readonly slug:string;readonly onBack:()=>void;readonly onHome:()=>void;readonly onDownload:()=>void;
}

/** Interval integration boundary: one stable PreviewOwner with renderCardPreview injection.
 * Untagged requests use unchanged static rendering; immutable cardPreviewKind=interval
 * invokes the pure3stage renderer. Existing owner snapshots preserve the tag; actualChrome
 * must prove propagation, mutual cancellation, stale-held render refusal and lifecycle.
 * This supersedes the earlier two-borrower proposal and avoids additional arbitration.
 * No App interval button before sequence acceptance; raw written pitches/currentpreset/
 * manualtransposeonce, tessitura0 pendingT13. Root/melody visibility uses accepted helpers.
 */

/** Next bounded UI binding (only after actual sequence audio acceptance):
 * Keep the ONE existing per-section PreviewOwner and stop ref/subscription/cleanup;
 * instantiate it with renderCardPreview. Static taps stay unchanged. Interval taps
 * synchronously call owner.play with cardIntervalPreviewRequest({raw source pitches,
 * settings.transpose/settings.waveform}); no await/timers/new audio context.
 * Root-only button exists iff showsRootOnlyInterval(previousIntervalPitch,
 * currentIntervalPitch, interval); melody button only for INTERVAL mode/state.
 * Root written-unison keeps previous note but hides interval; melody rest/unison
 * rules remain unchanged. Use accepted NamedInterval.shorthand visibly and
 * aria-label Play root interval <spokenName> / Play melody interval <spokenName>.
 * Label the visible action Interval; preserve every existing card name/action.
 * RelativeMajor relabels pitch cards only; interval audio stays written/raw.
 * Reuse 44px targets/320px200% wrapping; no singing/doubletap/persistence/API changes.
 */
