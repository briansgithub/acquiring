import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {OCTAVE_OFFSET_MAX,OCTAVE_OFFSET_MIN,clampSingingOctaveOffset,effectiveTargetMidi,singingOctaveOffsetLabel,type SingingTargetRequest} from './singing-octave';
import {AUTO_LISTEN_MS,SingingMicrophoneSession,formatSungIntervalCents,sungInterval} from './singing-microphone';
import './singing.css';

/** Playback singing dock. Expand does not start the microphone.
 * Native auto-listen 800ms after target load is NOT blocked by getUserMedia transient
 * activation (MDN: getUserMedia does not require it). AudioContext autoplay is sticky.
 * First-load auto-listen without prior mic opt-in remains a Brian decision (permission-prompt
 * UX). This slice auto-listens only after explicit listen/Flip-Flop this session, with
 * visible mic state and Stop. No fabricated cents. AudioWorklet + linear resample; not real mic.
 */
export function SingingDock({octaveOffset,onOctaveOffsetChange,target,expanded,onExpandedChange,transpose=0}:{
  octaveOffset:number;
  onOctaveOffsetChange:(offset:number)=>void;
  target:SingingTargetRequest|null;
  expanded:boolean;
  onExpandedChange:(expanded:boolean)=>void;
  transpose?:number;
}){
  const session=useMemo(()=>new SingingMicrophoneSession(),[]);
  const micVersion=useSyncExternalStore(session.subscribe,()=>session.version,()=>session.version);
  const mic=session;
  const [nowTick,setNowTick]=useState(0);
  const expandedRef=useRef(expanded);
  expandedRef.current=expanded;
  useEffect(()=>()=>session.release(),[session]);
  useEffect(()=>{if(!expanded)session.stop();},[expanded,session]);
  useEffect(()=>{
    if(session.action.kind!=='listening')return;
    const note=session.action.slot===1?target?.first:target?.second;
    if(!note)return;
    session.retarget(effectiveTargetMidi(note,transpose,octaveOffset));
  },[octaveOffset,transpose,target,session]);
  useEffect(()=>{
    const first=target?.first;
    if(!first)return;
    const id=window.setTimeout(()=>{
      if(!expandedRef.current)return;
      session.maybeAutoListen(1,effectiveTargetMidi(first,transpose,octaveOffset));
    },AUTO_LISTEN_MS);
    return()=>window.clearTimeout(id);
  },[target?.requestId,transpose,octaveOffset,session]);
  useEffect(()=>{
    if(mic.action.kind==='idle')return;
    const id=window.setInterval(()=>{session.tick();setNowTick((n)=>n+1);},100);
    return()=>window.clearInterval(id);
  },[mic.action.kind,session]);
  const first=target?.first?.scaleDegreeLabel??'';
  const second=target?.second?.scaleDegreeLabel??'';
  const flip=mic.action.kind==='flipflop'||mic.action.kind==='flipflop-rest';
  const interval=sungInterval(mic.slot1,mic.slot2);
  const listeningSlot=mic.action.kind==='listening'||mic.action.kind==='flipflop'?mic.action.slot:null;
  void nowTick;void micVersion;
  function toggleListen(slot:1|2){
    if(mic.action.kind==='listening'&&mic.action.slot===slot){session.stop();return;}
    const note=slot===1?target?.first:target?.second;
    if(!note)return;
    session.listen(slot,effectiveTargetMidi(note,transpose,octaveOffset));
  }
  return <section className="panel singing-dock" data-singing-dock={expanded?'expanded':'collapsed'}
    data-mic-state={mic.action.kind} data-mic-opted-in={mic.optedIn?'true':'false'}
    aria-label="Interval Singing Tool">
    <button type="button" className="singing-dock__handle action" aria-expanded={expanded}
      aria-label={expanded?'Collapse humming tool':'Expand Humming Tool'}
      onClick={()=>onExpandedChange(!expanded)}>
      {expanded?'Collapse':'Interval Singing Tool'}
    </button>
    {expanded&&<>
      <div className="singing-dock__toolbar">
        <label className="playback-check singing-dock__flipflop">
          <input type="checkbox" role="switch" aria-label="Flip-Flop" checked={flip}
            onChange={(event)=>session.setFlipFlop(event.target.checked)}/>
          Flip-Flop
        </label>
        <div className="playback-octave" aria-label="Singing octave">
          <button type="button" className="action" aria-label="Lower singing octave" disabled={octaveOffset<=OCTAVE_OFFSET_MIN}
            onClick={()=>onOctaveOffsetChange(clampSingingOctaveOffset(octaveOffset-1))}>−</button>
          <output role="status" aria-label="Singing octave">{singingOctaveOffsetLabel(octaveOffset)}</output>
          <button type="button" className="action" aria-label="Raise singing octave" disabled={octaveOffset>=OCTAVE_OFFSET_MAX}
            onClick={()=>onOctaveOffsetChange(clampSingingOctaveOffset(octaveOffset+1))}>+</button>
          <span>Singing octave does not transpose source playback.</span>
        </div>
        {mic.action.kind!=='idle'&&<button type="button" className="action" data-singing-stop=""
          aria-label="Stop microphone" onClick={()=>session.stop()}>Stop</button>}
      </div>
      {mic.error&&<p role="alert">{mic.error}</p>}
      <div className="singing-dock__slots" data-singing-target-row="">
        <button type="button" className="singing-dock__slot" data-singing-slot="1" aria-label="Singing slot 1"
          data-listening={listeningSlot===1?'true':undefined}
          onDoubleClick={()=>toggleListen(1)}>{mic.slot1?.label||first||'—'}</button>
        <button type="button" className="singing-dock__slot" data-singing-slot="2" aria-label="Singing slot 2"
          data-listening={listeningSlot===2?'true':undefined}
          onDoubleClick={()=>toggleListen(2)}>{mic.slot2?.label||second||'—'}</button>
        <div className="singing-dock__interval" data-singing-interval={interval?'measured':'empty'}
          aria-label="Sung interval">
          <span>Interval</span>
          <output>{interval?interval.shorthand:'—'}</output>
          {interval&&<span className="singing-dock__interval-cents">{formatSungIntervalCents(interval.centsDeviation)}</span>}
        </div>
      </div>
    </>}
  </section>;
}
