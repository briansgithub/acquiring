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
 * Remaining slices: previous/interval cards,visualtimeline/singing/favorites/default persistence
 * and routepositionmemory; wholeT12 remains in_progress, device/Safari acceptance remains unrun.
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
