import {useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import type {BrowserMicrophoneCapture, ExclusivePitchSource} from '../../audio/capture';
import type {AudioPreviewOwner} from '../../audio/transport';
import {DEFAULT_WAVEFORM,type Waveform} from '../../audio/synth';
import {OCTAVE_OFFSET_MAX,OCTAVE_OFFSET_MIN,clampSingingOctaveOffset,effectiveTargetMidi,singingOctaveOffsetLabel,type SingingTargetRequest} from './singing-octave';
import {AUTO_LISTEN_MS,SingingMicrophoneSession,formatSungIntervalCents,sungInterval,type SingingSlotPitch,type SingingMicAction} from './singing-microphone';
import {capturedPreviewFreqs,intervalCentsClose,intervalPreviewStages,remainingSeconds} from './singing-score';
import {SingingSlot} from './SingingSlot';
import {SINGING_EXPAND_MS,SingingExit} from './singing-exit';
import './singing.css';

interface DockVisual {target:SingingTargetRequest|null;slot1:SingingSlotPitch|null;slot2:SingingSlotPitch|null;action:SingingMicAction;remaining:number;error:string|null;transpose:number;octaveOffset:number}


/** Playback singing dock. Expand handle does not start the microphone.
 * Brian 2026-11-07 policy A: match Android — card double-click / target load may start
 * slot-1 listening after AUTO_LISTEN_MS (800), including the first permission prompt.
 * Collapse/release/navigation cancel; capture generation serializes in-flight getUserMedia.
 * Visible listening + Stop. No fabricated cents. AudioWorklet + linear resample; not Pixel.
 * Native PREVIEW is one AudioEngine channel: borrow the cards PreviewOwner, do not construct a second.
 * Collapse clears live work immediately; data-only exit visuals shrink for native 300ms. Interrupted
 * reopen restores passive display only. Reduced motion removes visuals immediately.
 * Flip-Flop nulls local displayedTarget (native activeTarget) without changing requestId, so slots
 * and the pending auto-listen LaunchedEffect stay intact; labels stay empty after Flip-Flop off.
 */
export function SingingDock({octaveOffset,onOctaveOffsetChange,target,expanded,onExpandedChange,transpose=0,capture,source,waveform=DEFAULT_WAVEFORM,previewOwner,isPersistentMonitoring=false,onStopPersistent}:{
  octaveOffset:number;
  onOctaveOffsetChange:(offset:number)=>void;
  target:SingingTargetRequest|null;
  expanded:boolean;
  onExpandedChange:(expanded:boolean)=>void;
  transpose?:number;
  capture?:BrowserMicrophoneCapture;
  source?:ExclusivePitchSource;
  waveform?:Waveform;
  previewOwner?:{current:AudioPreviewOwner|null};
  isPersistentMonitoring?:boolean;
  onStopPersistent?:()=>void;
}){
  const session=useMemo(()=>new SingingMicrophoneSession({capture,source}),[capture,source]);
  const micVersion=useSyncExternalStore(session.subscribe,()=>session.version,()=>session.version);
  const mic=session;
  const [nowTick,setNowTick]=useState(0);
  const expandedRef=useRef(expanded);
  const midiRef=useRef({transpose,octaveOffset});
  const previewGen=useRef(0);
  const previewWait=useRef<{id:number;resolve:()=>void}|null>(null);
  const autoTimer=useRef(0),autoEpoch=useRef(0);
  const exit=useRef(new SingingExit<DockVisual>());
  const [exitVisual,setExitVisual]=useState<DockVisual|null>(null);
  const body=useRef<HTMLDivElement|null>(null),handle=useRef<HTMLButtonElement|null>(null);
  const animation=useRef<Animation|null>(null),fromHeight=useRef<number|null>(null);
  const motion=useMemo(()=>window.matchMedia('(prefers-reduced-motion: reduce)'),[]);
  const reduced=useSyncExternalStore(listener=>{motion.addEventListener('change',listener);return()=>motion.removeEventListener('change',listener);},()=>motion.matches,()=>false);
  const onExpandedChangeRef=useRef(onExpandedChange);
  onExpandedChangeRef.current=onExpandedChange;
  const [displayedTarget,setDisplayedTarget]=useState(target);
  const displayedTargetRef=useRef(displayedTarget);
  expandedRef.current=expanded;
  displayedTargetRef.current=displayedTarget;
  midiRef.current={transpose,octaveOffset};
  useEffect(()=>()=>{cancelAutoListen();cancelPreview();exit.current.clear();animation.current?.cancel();session.release();},[session]);
  useEffect(()=>{if(!expanded){cancelAutoListen();cancelPreview();session.clearCollapsedToolState();}},[expanded,session]);
  useEffect(()=>{
    if(mic.action.kind!=='idle'&&mic.action.kind!=='flipflop-rest'&&!session.ownsMicrophone) session.tick();
  });
  useEffect(()=>{
    if(session.action.kind!=='listening')return;
    const note=session.action.slot===1?displayedTarget?.first:displayedTarget?.second;
    if(!note)return;
    session.retarget(effectiveTargetMidi(note,transpose,octaveOffset));
  },[octaveOffset,transpose,displayedTarget,session]);
  useEffect(()=>{
    setDisplayedTarget(target);
    stopAction();
    session.clearSlots();
    const first=target?.first;
    const requestId=target?.requestId;
    if(!first||requestId==null)return;
    const epoch=autoEpoch.current;
    const id=window.setTimeout(()=>{
      if(autoTimer.current===id)autoTimer.current=0;
      if(epoch!==autoEpoch.current||!expandedRef.current)return;
      if(displayedTargetRef.current?.requestId!==requestId)return;
      const midi=midiRef.current;
      session.maybeAutoListen(1,effectiveTargetMidi(first,midi.transpose,midi.octaveOffset));
    },AUTO_LISTEN_MS);
    autoTimer.current=id;
    window.addEventListener('pagehide',cancelAutoListen);
    return()=>{cancelAutoListen();window.removeEventListener('pagehide',cancelAutoListen);};
  },[target?.requestId,session]);
  useEffect(()=>{
    // Native HummingIntervalPopup ON_STOP: collapse, stop even Flip-Flop rest, clear slots/target.
    const hide=()=>{clearExit();stopAction();session.clearCollapsedToolState();expandedRef.current=false;displayedTargetRef.current=null;setDisplayedTarget(null);onExpandedChangeRef.current(false);};
    window.addEventListener('pagehide',hide);
    return()=>window.removeEventListener('pagehide',hide);
  },[session]);
  useEffect(()=>{
    if(mic.action.kind==='idle')return;
    const id=window.setInterval(()=>{session.tick();setNowTick((n)=>n+1);},100);
    return()=>window.clearInterval(id);
  },[mic.action.kind,session]);
  // Native PlaybackDestination collapses the ordinary tool on persistent opt-in.
  // Clear only SINGING_TOOL work; its revoked lease must never stop the new owner.
  useLayoutEffect(()=>{
    if(isPersistentMonitoring&&expandedRef.current)collapse();
  },[isPersistentMonitoring]);
  useLayoutEffect(()=>{
    const element=body.current;if(!element)return;
    if(expanded&&exitVisual){exit.current.clear();setExitVisual(null);return;}
    const token=exit.current.token;
    const start=fromHeight.current??(expanded?0:element.getBoundingClientRect().height);
    fromHeight.current=null;
    if(expanded)exit.current.clear();
    const finish=()=>{if(!expandedRef.current&&exit.current.finish(token))setExitVisual(null);};
    if(reduced){if(!expanded)finish();return;}
    const anim=element.animate([{height:`${start}px`},{height:expanded?`${element.scrollHeight}px`:'0px'}],{duration:SINGING_EXPAND_MS,easing:'cubic-bezier(0.4,0,0.2,1)',fill:expanded?'none':'forwards'});
    animation.current=anim;
    void anim.finished.then(()=>{if(animation.current===anim){animation.current=null;finish();}},()=>{});
    return()=>{if(animation.current===anim){fromHeight.current??=element.getBoundingClientRect().height;animation.current=null;}anim.cancel();};
  },[expanded,exitVisual,reduced]);
  const visual:DockVisual=!expanded&&exitVisual?exitVisual:{target:displayedTarget,slot1:mic.slot1,slot2:mic.slot2,action:mic.action,remaining:remainingSeconds(session.remainingMs()),error:mic.error,transpose,octaveOffset};
  const flip=visual.action.kind==='flipflop'||visual.action.kind==='flipflop-rest';
  const interval=sungInterval(visual.slot1,visual.slot2);
  const listenSlot=visual.action.kind==='listening'?visual.action.slot:null;
  const recordSlot=visual.action.kind==='recording'||visual.action.kind==='flipflop'?visual.action.slot:null;
  const remaining=visual.remaining;
  void nowTick;void micVersion;
  function cancelAutoListen(){++autoEpoch.current;window.clearTimeout(autoTimer.current);autoTimer.current=0;}
  function cancelPreview(){++previewGen.current;const wait=previewWait.current;previewWait.current=null;if(wait){window.clearTimeout(wait.id);wait.resolve();}previewOwner?.current?.stop();}
  function stopAction(){cancelAutoListen();cancelPreview();session.stop();}
  function clearExit(){exit.current.clear();animation.current?.cancel();animation.current=null;setExitVisual(null);}
  function collapse(){
    const snapshot:DockVisual={target:displayedTargetRef.current,slot1:mic.slot1,slot2:mic.slot2,action:mic.action,remaining:remainingSeconds(session.remainingMs()),error:mic.error,transpose,octaveOffset};
    fromHeight.current=body.current?.getBoundingClientRect().height??0;
    exit.current.begin(snapshot);setExitVisual(snapshot);
    expandedRef.current=false;stopAction();session.clearCollapsedToolState();displayedTargetRef.current=null;setDisplayedTarget(null);
    if(body.current?.contains(document.activeElement))handle.current?.focus({preventScroll:true});
    onExpandedChange(false);
  }
  function reopen(){
    fromHeight.current=body.current?.getBoundingClientRect().height??0;
    const snapshot=exit.current.reopen();animation.current?.cancel();animation.current=null;setExitVisual(null);
    if(snapshot){displayedTargetRef.current=snapshot.target;setDisplayedTarget(snapshot.target);session.restorePassiveSlots(snapshot.slot1,snapshot.slot2);}
    onExpandedChange(true);
  }
  function playPreview(id:string,freqs:readonly number[]){
    if(!expandedRef.current)return;
    cancelPreview();
    void previewOwner?.current?.play(id,{freqs:[...freqs],durationMs:1000,waveform,arpeggiate:false});
  }
  function onTap(slot:1|2){
    const freqs=capturedPreviewFreqs(slot===1?mic.slot1:mic.slot2);
    if(freqs)playPreview(`singing-slot-${slot}`,freqs);
  }
  function onDoubleTap(slot:1|2){
    if(!expandedRef.current||flip)return;
    if(mic.action.kind==='listening'&&mic.action.slot===slot){stopAction();return;}
    const note=slot===1?displayedTarget?.first:displayedTarget?.second;
    if(note)session.listen(slot,effectiveTargetMidi(note,transpose,octaveOffset));
    else session.record(slot);
  }
  function onIntervalClick(){
    const stages=intervalPreviewStages(mic.slot1,mic.slot2);
    if(!stages||!expandedRef.current)return;
    cancelPreview();const gen=previewGen.current;
    void (async()=>{
      for(let i=0;i<stages.length;i++){
        if(gen!==previewGen.current||!expandedRef.current)return;
        void previewOwner?.current?.play(`singing-interval-${i}`,{freqs:[...stages[i]!],durationMs:1000,waveform,arpeggiate:false});
        if(i<stages.length-1) await new Promise<void>((resolve)=>{const id=window.setTimeout(()=>{previewWait.current=null;resolve();},1000);previewWait.current={id,resolve};});
      }
    })();
  }
  return <section className="panel singing-dock" data-singing-dock={expanded?'expanded':'collapsed'}
    data-mic-state={mic.action.kind} data-mic-opted-in={mic.optedIn?'true':'false'}
    data-mic-owns={mic.ownsMicrophone?'true':'false'}
    data-preview-owner={previewOwner?'shared':'none'}
    data-singing-transition={expanded?'expanded':exitVisual?'exiting':'collapsed'} aria-label="Interval Singing Tool">
    <div className="singing-dock__header">
    <button ref={handle} type="button" className="singing-dock__handle action" aria-expanded={expanded}
      aria-label={expanded?'Collapse humming tool':'Expand Humming Tool'}
      onClick={()=>expanded?collapse():reopen()}>
      {expanded?'Collapse':'Interval Singing Tool'}
    </button>
    {!expanded&&isPersistentMonitoring&&<button type="button" className="action"
      data-singing-persistent-stop="" aria-label="Stop persistent pitch practice"
      onClick={onStopPersistent}>Stop</button>}
    </div>
    {(expanded||exitVisual)&&<div ref={body} className="singing-dock__body" data-singing-body="" data-singing-exit-snapshot={!expanded?"true":undefined} inert={!expanded} aria-hidden={!expanded}>
      <div className="singing-dock__toolbar">
        <label className="playback-check singing-dock__flipflop">
          <input type="checkbox" role="switch" aria-label="Flip-Flop" checked={flip}
            onChange={(event)=>{
              if(event.target.checked){
                displayedTargetRef.current=null;
                setDisplayedTarget(null);
              }
              session.setFlipFlop(event.target.checked);
            }}/>
          Flip-Flop
        </label>
        <div className="playback-octave" aria-label="Singing octave">
          <button type="button" className="action" aria-label="Lower singing octave" disabled={visual.octaveOffset<=OCTAVE_OFFSET_MIN}
            onClick={()=>onOctaveOffsetChange(clampSingingOctaveOffset(octaveOffset-1))}>−</button>
          <output role="status" aria-label="Singing octave">{singingOctaveOffsetLabel(visual.octaveOffset)}</output>
          <button type="button" className="action" aria-label="Raise singing octave" disabled={visual.octaveOffset>=OCTAVE_OFFSET_MAX}
            onClick={()=>onOctaveOffsetChange(clampSingingOctaveOffset(octaveOffset+1))}>+</button>
          <span>Singing octave does not transpose source playback.</span>
        </div>
        {visual.action.kind!=='idle'&&<button type="button" className="action" data-singing-stop=""
          aria-label="Stop microphone" onClick={stopAction}>Stop</button>}
      </div>
      {visual.error&&<p role="alert">{visual.error}</p>}
      <div className="singing-dock__slots" data-singing-target-row="">
        <SingingSlot slot={1} note={visual.target?.first??null} captured={visual.slot1} transpose={visual.transpose} interactive={expanded}
          octaveOffset={visual.octaveOffset} listening={listenSlot===1} recording={recordSlot===1}
          ignoreTarget={flip} remaining={remaining} onTap={()=>onTap(1)} onDoubleTap={()=>onDoubleTap(1)}/>
        <SingingSlot slot={2} note={visual.target?.second??null} captured={visual.slot2} transpose={visual.transpose} interactive={expanded}
          octaveOffset={visual.octaveOffset} listening={listenSlot===2} recording={recordSlot===2}
          ignoreTarget={flip} remaining={remaining} onTap={()=>onTap(2)} onDoubleTap={()=>onDoubleTap(2)}/>
        <div className="singing-dock__interval" data-singing-interval={interval?'measured':'empty'}
          data-interval-cents-close={interval&&intervalCentsClose(interval.centsDeviation)?'true':undefined}
          aria-label="Sung interval" role={interval?'button':undefined}
          onClick={interval?onIntervalClick:undefined}>
          <span>Interval</span>
          <output>{interval?interval.shorthand:'—'}</output>
          {interval&&<span className="singing-dock__interval-cents">{formatSungIntervalCents(interval.centsDeviation)}</span>}
        </div>
      </div>
    </div>}
  </section>;
}
