import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {PlaybackRootDegreeCue,usesVoice} from '../../audio/synth';
import {ensureVoicePack,getVoicePackSnapshot,subscribeVoicePack} from '../../audio/transport/voice-pack';

/** Native PlaybackRootDegreeCue.controlLabel (Android 3c887223). */
export const VOICE_CUE_LABELS:Readonly<Record<PlaybackRootDegreeCue,string>>=Object.freeze({
  [PlaybackRootDegreeCue.OFF]:'Off',
  [PlaybackRootDegreeCue.ROOT_PULSES]:'Root Pulses',
  [PlaybackRootDegreeCue.HARMONIC_DISTANCE]:'Harmonic Distance',
  [PlaybackRootDegreeCue.SPOKEN_NUMBER]:'Spoken Number',
  [PlaybackRootDegreeCue.SUNG_NUMBER_WITH_DETAILS]:'Sung Number + Details',
  [PlaybackRootDegreeCue.MELODY_FUNCTION]:'Melody function',
  [PlaybackRootDegreeCue.MELODY_CHORD_TONE]:'Melody chord tones',
});
/** Native voiceOptionGroups, after the ungrouped Off row. */
export const VOICE_OPTION_GROUPS:readonly (readonly [string,readonly PlaybackRootDegreeCue[]])[]=Object.freeze([
  ['Melody',[PlaybackRootDegreeCue.MELODY_FUNCTION,PlaybackRootDegreeCue.MELODY_CHORD_TONE]],
  ['Chord',[PlaybackRootDegreeCue.SPOKEN_NUMBER,PlaybackRootDegreeCue.SUNG_NUMBER_WITH_DETAILS]],
  ['Pulses',[PlaybackRootDegreeCue.ROOT_PULSES,PlaybackRootDegreeCue.HARMONIC_DISTANCE]],
]);

/** N09: voice button beside Reset opening the Metadata Speak Aloud dialog (native PlaybackVoiceControls).
 * Choosing an option applies it and closes the dialog; the volume slider changes speech gain live.
 * PWA extension: spoken options download the verified speech pack on first use and show its progress. */
export function PlaybackVoiceControls({cue,volume,disabled=false,onCueChange,onVolumeChange}:{
  cue:PlaybackRootDegreeCue;volume:number;disabled?:boolean;
  onCueChange:(cue:PlaybackRootDegreeCue)=>void;onVolumeChange:(volume:number)=>void;
}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [open,setOpen]=useState(false);
  const pack=useSyncExternalStore(subscribeVoicePack,getVoicePackSnapshot,getVoicePackSnapshot);
  useEffect(()=>{if(usesVoice(cue))void ensureVoicePack();},[cue]);
  useEffect(()=>{
    const element=dialog.current;if(!element)return;
    if(open&&!element.open)element.showModal();
    if(!open&&element.open)element.close();
  },[open]);
  const choose=(next:PlaybackRootDegreeCue)=>{onCueChange(next);setOpen(false);};
  const option=(value:PlaybackRootDegreeCue)=><label key={value} className="voice-option" data-voice-cue={value}>
    <span>{VOICE_CUE_LABELS[value]}</span>
    <input type="radio" name="playback-voice-cue" checked={cue===value} onChange={()=>choose(value)}/>
  </label>;
  const percent=Math.round(volume*100);
  return <>
    <button className="action playback-voice-button" type="button" aria-label="Voice settings" aria-haspopup="dialog"
      aria-description={VOICE_CUE_LABELS[cue]} data-voice-cue={cue} disabled={disabled} onClick={()=>setOpen(value=>!value)}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="9.4" cy="7" r="4.3"/>
        <path d="M2.4 21.1C2.6 13.7 16.1 13.7 16.6 21.1"/>
        <path d="M16.1 8.4C20 9.6 20 14.4 16.1 15.6"/>
        <path d="M19 4.8C25.4 8.4 25.4 15.6 19 19.2"/>
      </svg>
    </button>
    <dialog ref={dialog} className="playback-voice-dialog" aria-labelledby="playback-voice-title"
      onClose={()=>setOpen(false)} onClick={event=>{if(event.target===event.currentTarget)setOpen(false);}}>
      <div className="playback-voice-dialog__body" role="radiogroup" aria-labelledby="playback-voice-title">
        <h2 id="playback-voice-title">Metadata Speak Aloud</h2>
        {option(PlaybackRootDegreeCue.OFF)}
        {VOICE_OPTION_GROUPS.map(([title,options])=><section key={title} className="voice-group">
          <h3>{title}</h3>
          {options.map(option)}
        </section>)}
        <label className="voice-volume">
          <span>Voice volume {percent}%</span>
          <input type="range" min={0} max={100} step={1} value={percent} aria-label="Voice volume"
            onChange={event=>onVolumeChange(Number(event.currentTarget.value)/100)}/>
        </label>
        {usesVoice(cue)&&pack.status==='loading'&&<p className="voice-status" role="status">
          Downloading voice {pack.totalBytes?Math.round(pack.loadedBytes/pack.totalBytes*100):0}%</p>}
        {usesVoice(cue)&&pack.status==='failed'&&<p className="voice-status" role="alert">
          Voice download failed. <button type="button" className="action" onClick={()=>void ensureVoicePack()}>Retry</button></p>}
        <button type="button" className="action voice-done" onClick={()=>setOpen(false)}>Done</button>
      </div>
    </dialog>
  </>;
}
