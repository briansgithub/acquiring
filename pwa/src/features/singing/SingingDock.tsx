import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import type {BrowserMicrophoneCapture, ExclusivePitchSource} from '../../audio/capture';
import {OCTAVE_OFFSET_MAX,OCTAVE_OFFSET_MIN,clampSingingOctaveOffset,effectiveTargetMidi,singingOctaveOffsetLabel,type SingingTargetNote,type SingingTargetRequest} from './singing-octave';
import {AUTO_LISTEN_MS,SingingMicrophoneSession,formatSungIntervalCents,sungInterval,type SingingSlotPitch} from './singing-microphone';
import {displayedSlotData,intervalCentsClose,pitchAccuracyBand,pitchAccuracyColor,remainingSeconds} from './singing-score';
import './singing.css';

/** Playback singing dock. Expand handle does not start the microphone.
 * Brian 2026-11-07 policy A: match Android — card double-click / target load may start
 * slot-1 listening after AUTO_LISTEN_MS (800), including the first permission prompt.
 * Collapse/release/navigation cancel; capture generation serializes in-flight getUserMedia.
 * Visible listening + Stop. No fabricated cents. AudioWorklet + linear resample; not Pixel.
 */
export function SingingDock({octaveOffset,onOctaveOffsetChange,target,expanded,onExpandedChange,transpose=0,capture,source}:{
  octaveOffset:number;
  onOctaveOffsetChange:(offset:number)=>void;
  target:SingingTargetRequest|null;
  expanded:boolean;
  onExpandedChange:(expanded:boolean)=>void;
  transpose?:number;
  capture?:BrowserMicrophoneCapture;
  source?:ExclusivePitchSource;
}){
  const session=useMemo(()=>new SingingMicrophoneSession({capture,source}),[capture,source]);
  const micVersion=useSyncExternalStore(session.subscribe,()=>session.version,()=>session.version);
  const mic=session;
  const [nowTick,setNowTick]=useState(0);
  const expandedRef=useRef(expanded);
  const targetRef=useRef(target);
  const midiRef=useRef({transpose,octaveOffset});
  expandedRef.current=expanded;
  targetRef.current=target;
  midiRef.current={transpose,octaveOffset};
  useEffect(()=>()=>session.release(),[session]);
  useEffect(()=>{if(!expanded)session.stop();},[expanded,session]);
  useEffect(()=>{
    if(mic.action.kind!=='idle'&&mic.action.kind!=='flipflop-rest'&&!session.ownsMicrophone) session.tick();
  });
  useEffect(()=>{
    if(session.action.kind!=='listening')return;
    const note=session.action.slot===1?target?.first:target?.second;
    if(!note)return;
    session.retarget(effectiveTargetMidi(note,transpose,octaveOffset));
  },[octaveOffset,transpose,target,session]);
  useEffect(()=>{
    session.stop();
    const first=target?.first;
    const requestId=target?.requestId;
    if(!first||requestId==null)return;
    const id=window.setTimeout(()=>{
      if(!expandedRef.current)return;
      if(targetRef.current?.requestId!==requestId)return;
      const midi=midiRef.current;
      session.maybeAutoListen(1,effectiveTargetMidi(first,midi.transpose,midi.octaveOffset));
    },AUTO_LISTEN_MS);
    return()=>window.clearTimeout(id);
  },[target?.requestId,session]);
  useEffect(()=>{
    if(mic.action.kind==='idle')return;
    const id=window.setInterval(()=>{session.tick();setNowTick((n)=>n+1);},100);
    return()=>window.clearInterval(id);
  },[mic.action.kind,session]);
  const flip=mic.action.kind==='flipflop'||mic.action.kind==='flipflop-rest';
  const interval=sungInterval(mic.slot1,mic.slot2);
  const listenSlot=mic.action.kind==='listening'?mic.action.slot:null;
  const recordSlot=mic.action.kind==='flipflop'?mic.action.slot:null;
  const remaining=remainingSeconds(session.remainingMs());
  void nowTick;void micVersion;
  function toggleListen(slot:1|2){
    if(mic.action.kind==='listening'&&mic.action.slot===slot){session.stop();return;}
    const note=slot===1?target?.first:target?.second;
    if(!note)return;
    session.listen(slot,effectiveTargetMidi(note,transpose,octaveOffset));
  }
  return <section className="panel singing-dock" data-singing-dock={expanded?'expanded':'collapsed'}
    data-mic-state={mic.action.kind} data-mic-opted-in={mic.optedIn?'true':'false'}
    data-mic-owns={mic.ownsMicrophone?'true':'false'}
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
        <SingingSlotCard slot={1} note={target?.first??null} captured={mic.slot1} transpose={transpose}
          octaveOffset={octaveOffset} listening={listenSlot===1} recording={recordSlot===1}
          ignoreTarget={flip} remaining={remaining} onToggleListen={()=>toggleListen(1)}/>
        <SingingSlotCard slot={2} note={target?.second??null} captured={mic.slot2} transpose={transpose}
          octaveOffset={octaveOffset} listening={listenSlot===2} recording={recordSlot===2}
          ignoreTarget={flip} remaining={remaining} onToggleListen={()=>toggleListen(2)}/>
        <div className="singing-dock__interval" data-singing-interval={interval?'measured':'empty'}
          data-interval-cents-close={interval&&intervalCentsClose(interval.centsDeviation)?'true':undefined}
          aria-label="Sung interval">
          <span>Interval</span>
          <output>{interval?interval.shorthand:'—'}</output>
          {interval&&<span className="singing-dock__interval-cents">{formatSungIntervalCents(interval.centsDeviation)}</span>}
        </div>
      </div>
    </>}
  </section>;
}

function SingingSlotCard({slot,note,captured,transpose,octaveOffset,listening,recording,ignoreTarget,remaining,onToggleListen}:{
  slot:1|2;
  note:SingingTargetNote|null;
  captured:SingingSlotPitch|null;
  transpose:number;
  octaveOffset:number;
  listening:boolean;
  recording:boolean;
  ignoreTarget:boolean;
  remaining:number;
  onToggleListen:()=>void;
}){
  const effective=ignoreTarget||!note?null:effectiveTargetMidi(note,transpose,octaveOffset);
  const displayed=displayedSlotData(captured,effective);
  const degree=ignoreTarget?'':(note?.scaleDegreeLabel||'—');
  const centsColor=recording?'#fff':displayed?pitchAccuracyColor(displayed.cents):undefined;
  return <button type="button" className="singing-dock__slot" data-singing-slot={slot}
    aria-label={`Singing slot ${slot}`} data-listening={listening?'true':undefined}
    data-recording={recording?'true':undefined} data-singing-cents-source={displayed?.source}
    onDoubleClick={ignoreTarget?undefined:onToggleListen}>
    <span className="singing-dock__degree">{degree||'—'}</span>
    {displayed?.source==='captured'&&<span className="singing-dock__sung">{displayed.label}</span>}
    {displayed&&<span className="singing-dock__cents" data-singing-cents=""
      data-singing-cents-source={displayed.source} data-pitch-accuracy={recording?'recording':pitchAccuracyBand(displayed.cents)}
      style={{color:centsColor}}>{formatSungIntervalCents(displayed.cents)}</span>}
    {(listening||recording)&&<span className="singing-dock__remaining" data-singing-remaining="">{remaining}s</span>}
  </button>;
}
