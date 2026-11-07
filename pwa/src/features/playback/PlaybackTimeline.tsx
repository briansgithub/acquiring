import {useEffect,useMemo,useRef,useState,type PointerEvent} from 'react';
import type {ExtractedSection} from '../../contracts';
import {preparePlaybackSection} from './section-model';
import {
  TIMELINE_HEIGHT_PX,
  TIMELINE_PLAYHEAD_STROKE_PX,
  TIMELINE_TAP_SLOP_PX,
  buildChordTimelineVisuals,
  buildMelodyTimelineVisuals,
  layoutPlaybackTimeline,
  timelineTapBeat,
} from './timeline-layout';

/** Product timeline: Canvas 2D matching PlaybackView lanes/playhead plus tap-to-seek. No inertia/scores/Roman. */
export function PlaybackTimeline({section,beat,rootOnly,majorLocked=false,onTapBeat}:{
  section:ExtractedSection;beat:number;rootOnly:boolean;majorLocked?:boolean;onTapBeat?:(beat:number)=>void;
}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const hostRef=useRef<HTMLDivElement>(null);
  const pointerOrigin=useRef<{x:number;y:number}|null>(null);
  const [width,setWidth]=useState(0);
  const model=useMemo(()=>preparePlaybackSection(section),[section]);
  const melody=useMemo(()=>buildMelodyTimelineVisuals(model.melody,section,majorLocked),[model,section,majorLocked]);
  const chords=useMemo(()=>buildChordTimelineVisuals(section),[section]);
  const layout=width>0?layoutPlaybackTimeline({width,currentBeat:beat,rootOnly,melody,chords}):null;

  useEffect(()=>{
    const host=hostRef.current;if(!host)return;
    const sync=()=>setWidth(host.clientWidth);
    sync();
    const observer=new ResizeObserver(sync);observer.observe(host);
    return ()=>observer.disconnect();
  },[rootOnly]);

  useEffect(()=>{
    const canvas=canvasRef.current,layoutNow=layout;
    if(!canvas||!layoutNow||!layoutNow.visible)return;
    const dpr=window.devicePixelRatio||1;
    canvas.width=Math.max(1,Math.floor(layoutNow.width*dpr));
    canvas.height=Math.max(1,Math.floor(layoutNow.height*dpr));
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,layoutNow.width,layoutNow.height);
    ctx.save();
    ctx.translate(layoutNow.translationX,0);
    for(const note of layoutNow.melody){
      if(note.culled)continue;
      ctx.fillStyle=note.active?'#a6c8ff':'rgba(166,200,255,0.6)';
      ctx.fillRect(note.x,note.y,note.width,note.height);
    }
    for(const chord of layoutNow.chords){
      if(chord.culled)continue;
      ctx.fillStyle=chord.active?'rgba(255,255,255,0.82)':'rgba(255,255,255,0.16)';
      ctx.fillRect(chord.x,chord.y,chord.width,chord.height);
      ctx.strokeStyle='#ffffff';
      ctx.lineWidth=chord.active?2:1;
      ctx.strokeRect(chord.x+0.5,chord.y+0.5,Math.max(0,chord.width-1),Math.max(0,chord.height-1));
    }
    ctx.restore();
    ctx.fillStyle='#ffffff';
    ctx.fillRect(layoutNow.playheadX-TIMELINE_PLAYHEAD_STROKE_PX/2,0,TIMELINE_PLAYHEAD_STROKE_PX,layoutNow.height);
  },[layout]);

  if(rootOnly||layout&&!layout.visible){
    return <div ref={hostRef} className="playback-timeline-host" data-playback-timeline="hidden" hidden/>;
  }
  function tap(event:PointerEvent<HTMLCanvasElement>){
    const origin=pointerOrigin.current;pointerOrigin.current=null;
    if(!onTapBeat||!origin||event.button!==0)return;
    if(Math.hypot(event.clientX-origin.x,event.clientY-origin.y)>TIMELINE_TAP_SLOP_PX)return;
    const rect=event.currentTarget.getBoundingClientRect();
    onTapBeat(timelineTapBeat(beat,event.clientX-rect.left,rect.width,model.timeline.endBeat));
  }

  return <div ref={hostRef} className="playback-timeline-host">
    <canvas ref={canvasRef} className="playback-timeline" role="img" aria-label="Playback timeline"
      data-playback-timeline="visible"
      data-timeline-melody={String(melody.length)}
      data-timeline-chords={String(chords.length)}
      data-timeline-major={majorLocked?'true':'false'}
      data-timeline-staff={melody.map(note=>note.staffDegree).join(',')}
      data-timeline-playhead={layout?String(layout.playheadX):''}
      height={TIMELINE_HEIGHT_PX}
      onPointerDown={event=>{if(event.button===0)pointerOrigin.current={x:event.clientX,y:event.clientY};}}
      onPointerUp={tap}
      onPointerCancel={()=>{pointerOrigin.current=null;}}/>
  </div>;
}
