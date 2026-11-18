import {useEffect,useRef} from 'react';

/** N03: native PlaybackDestination showPlaybackHelp overlay (Android 877bb982, surviving at 3c887223).
 * A 72% scrim covering the whole screen; any tap or key dismisses it without reaching the controls beneath. */
export function PlaybackHelpOverlay({onDismiss}:{onDismiss:()=>void}){
  const overlay=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    overlay.current?.focus();
    return ()=>previous?.focus({preventScroll:true});
  },[]);
  // Dismiss on pointerdown and swallow the rest of the gesture so nothing under the scrim activates.
  return <div ref={overlay} className="playback-help-overlay" role="dialog" aria-modal="true" aria-label="Playback help overlay" tabIndex={-1}
    data-playback-help=""
    onPointerDown={event=>{event.preventDefault();event.stopPropagation();onDismiss();}}
    onClick={event=>{event.preventDefault();event.stopPropagation();}}
    onKeyDown={event=>{if(event.key!=='Tab'){event.preventDefault();event.stopPropagation();onDismiss();}else event.preventDefault();}}>
    <div className="playback-help-overlay__body">
      <h2>Playback help</h2>
      <p>Tap a card to hear it. Double-tap to sing it back. Use the microphone button for live pitch practice.</p>
      <p>The singing dock’s octave offset moves targets only. Expand the dock from its handle without starting the microphone.</p>
      <p>Tap anywhere to dismiss without activating a control.</p>
    </div>
  </div>;
}
