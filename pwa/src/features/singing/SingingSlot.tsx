import {useEffect,useRef} from 'react';
import {effectiveTargetMidi,type SingingTargetNote} from './singing-octave';
import {formatSungIntervalCents,type SingingSlotPitch} from './singing-microphone';
import {displayedSlotData,pitchAccuracyBand,pitchAccuracyColor} from './singing-score';
import {TAPE_TICK_PX,TAPE_TICK_STROKE_PX,tapeOctaveLabel,tapeRows} from './singing-tape';

export const SLOT_TAP_DELAY_MS = 300;

export function SingingSlot({slot,note,captured,transpose,octaveOffset,listening,recording,ignoreTarget,remaining,onTap,onDoubleTap,interactive=true}:{
  slot:1|2;
  note:SingingTargetNote|null;
  captured:SingingSlotPitch|null;
  transpose:number;
  octaveOffset:number;
  listening:boolean;
  recording:boolean;
  ignoreTarget:boolean;
  remaining:number;
  interactive?:boolean;
  onTap:()=>void;
  onDoubleTap:()=>void;
}){
  const effective=ignoreTarget||!note?null:effectiveTargetMidi(note,transpose,octaveOffset);
  const displayed=displayedSlotData(captured,effective);
  const degree=ignoreTarget?'':(note?.scaleDegreeLabel||'');
  const showTape=recording||displayed!=null;
  const tapeMidi=displayed?.midi??60;
  const centsColor=recording?'#fff':displayed?pitchAccuracyColor(displayed.cents):undefined;
  const enabled=!recording&&interactive;
  const tap=useTap(onTap,onDoubleTap,enabled);
  return <button type="button" className="singing-dock__slot" data-singing-slot={slot}
    aria-label={`Singing slot ${slot}`} data-listening={listening?'true':undefined}
    data-recording={recording?'true':undefined} data-singing-cents-source={displayed?.source}
    onClick={tap}>
    <span className="singing-dock__degree" data-singing-degree="">{degree||'—'}</span>
    {showTape
      ? <SingingTape midi={tapeMidi} cents={displayed?.cents??0} recording={recording}/>
      : <span className="singing-dock__prompt" data-singing-prompt="record">Double tap to record</span>}
    {displayed?.source==='captured'&&<span className="singing-dock__sung">{displayed.label}</span>}
    {displayed&&<span className="singing-dock__cents" data-singing-cents=""
      data-singing-cents-source={displayed.source} data-pitch-accuracy={recording?'recording':pitchAccuracyBand(displayed.cents)}
      style={{color:centsColor}}>{formatSungIntervalCents(displayed.cents)}</span>}
    {(listening||recording)&&<span className="singing-dock__remaining" data-singing-remaining="">{remaining}s</span>}
  </button>;
}

function SingingTape({midi,cents,recording}:{midi:number;cents:number;recording:boolean}){
  return <div className="singing-dock__tape" data-singing-tape="" data-tape-recording={recording?'true':undefined}
    style={{color:pitchAccuracyColor(cents)}}>
    <span className="singing-dock__tape-center" aria-hidden="true"/>
    {tapeRows(midi).map((row)=>
      <span key={row.midi} className="singing-dock__tape-row" data-tape-center={row.center?'true':undefined}
        style={{transform:`translateY(calc(-50% + ${-row.offsetPx}px))`}}>
        <span className="singing-dock__tape-tick singing-dock__tape-tick--left" data-tape-tick="left"
          style={{width:TAPE_TICK_PX,height:TAPE_TICK_STROKE_PX}} aria-hidden="true"/>
        <span className="singing-dock__tape-label">{row.label}</span>
        <span className="singing-dock__tape-tick singing-dock__tape-tick--right" data-tape-tick="right"
          style={{width:TAPE_TICK_PX,height:TAPE_TICK_STROKE_PX}} aria-hidden="true"/>
      </span>)}
    <span className="singing-dock__tape-oct">{tapeOctaveLabel(midi)}</span>
  </div>;
}

function useTap(onSingle:()=>void,onDouble:()=>void,enabled:boolean){
  const timer=useRef(0),current=useRef({onSingle,onDouble,enabled});
  current.current={onSingle,onDouble,enabled};
  useEffect(()=>{
    const cancel=()=>{window.clearTimeout(timer.current);timer.current=0;};
    if(!enabled)cancel();
    window.addEventListener('pagehide',cancel);
    return()=>{cancel();window.removeEventListener('pagehide',cancel);};
  },[enabled]);
  return ()=>{
    if(!current.current.enabled)return;
    if(timer.current){window.clearTimeout(timer.current);timer.current=0;current.current.onDouble();return;}
    timer.current=window.setTimeout(()=>{timer.current=0;if(current.current.enabled)current.current.onSingle();},SLOT_TAP_DELAY_MS);
  };
}
