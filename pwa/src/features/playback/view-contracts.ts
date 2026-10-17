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
 * Remaining slices: previous/interval cards,visualtimeline/home/relativekey/singing/favorites/default persistence
 * and routepositionmemory; wholeT12 remains in_progress, device/Safari acceptance remains unrun.
 */
export interface PlaybackScreenProps {
  readonly slug:string;readonly onBack:()=>void;readonly onHome:()=>void;readonly onDownload:()=>void;
}
