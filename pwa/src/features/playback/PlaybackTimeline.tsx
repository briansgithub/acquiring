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
  timelineDragBeat,
  timelineTapBeat,
} from './timeline-layout';
import {chordLaneRomanCenterY,chordLaneRomanFit,paintChordLaneRoman} from './timeline-roman';

export interface TimelineScrub {
  tap(beat:number):void;
  dragTo(beat:number):void;
  end():void;
}

/** Product timeline: Canvas lanes/playhead, tap-to-seek, live drag, chord-lane Roman. No inertia/scores. */
export function PlaybackTimeline({section,beat,rootOnly,majorLocked=false,onScrub}:{
  section:ExtractedSection;beat:number;rootOnly:boolean;majorLocked?:boolean;onScrub?:TimelineScrub;
}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const hostRef=useRef<HTMLDivElement>(null);
  const pointer=useRef<{x:number;y:number;beat:number;dragging:boolean}|null>(null);
  const [width,setWidth]=useState(0);
  const model=useMemo(()=>preparePlaybackSection(section),[section]);
  const melody=useMemo(()=>buildMelodyTimelineVisuals(model.melody,section,majorLocked),[model,section,majorLocked]);
  const chords=useMemo(()=>buildChordTimelineVisuals(section,majorLocked),[section,majorLocked]);
  const layout=width>0?layoutPlaybackTimeline({width,currentBeat:beat,rootOnly,melody,chords}):null;
  const endBeat=model.timeline.endBeat;

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
    layoutNow.chords.forEach((chord,index)=>{
      if(chord.culled)return;
      ctx.fillStyle=chord.active?'rgba(255,255,255,0.82)':'rgba(255,255,255,0.16)';
      ctx.fillRect(chord.x,chord.y,chord.width,chord.height);
      ctx.strokeStyle='#ffffff';
      ctx.lineWidth=chord.active?2:1;
      ctx.strokeRect(chord.x+0.5,chord.y+0.5,Math.max(0,chord.width-1),Math.max(0,chord.height-1));
      const visual=chords[index]?.roman;
      const fitted=visual?chordLaneRomanFit(visual,chord.width,chord.height):null;
      if(fitted)paintChordLaneRoman(ctx,fitted,chord.x+chord.width/2,chordLaneRomanCenterY(fitted.fontSizePx));
    });
    ctx.restore();
    ctx.fillStyle='#ffffff';
    ctx.fillRect(layoutNow.playheadX-TIMELINE_PLAYHEAD_STROKE_PX/2,0,TIMELINE_PLAYHEAD_STROKE_PX,layoutNow.height);
  },[chords,layout]);

  if(rootOnly||layout&&!layout.visible){
    return <div ref={hostRef} className="playback-timeline-host" data-playback-timeline="hidden" hidden/>;
  }

  function down(event:PointerEvent<HTMLCanvasElement>){
    if(event.button!==0)return;
    event.preventDefault();
    try{event.currentTarget.setPointerCapture(event.pointerId);}catch{/* inactive synthetic pointers */}
    pointer.current={x:event.clientX,y:event.clientY,beat,dragging:false};
  }
  function move(event:PointerEvent<HTMLCanvasElement>){
    const origin=pointer.current;if(!origin||!onScrub)return;
    const dx=event.clientX-origin.x;
    if(!origin.dragging){
      if(Math.hypot(dx,event.clientY-origin.y)<=TIMELINE_TAP_SLOP_PX)return;
      origin.dragging=true;
    }
    onScrub.dragTo(timelineDragBeat(origin.beat,dx,endBeat));
  }
  function up(event:PointerEvent<HTMLCanvasElement>){
    const origin=pointer.current;pointer.current=null;
    if(!origin||!onScrub||event.button!==0)return;
    if(origin.dragging){onScrub.end();return;}
    const rect=event.currentTarget.getBoundingClientRect();
    onScrub.tap(timelineTapBeat(origin.beat,event.clientX-rect.left,rect.width,endBeat));
  }
  function cancel(){
    const origin=pointer.current;pointer.current=null;
    if(origin?.dragging)onScrub?.end();
  }

  return <div ref={hostRef} className="playback-timeline-host">
    <canvas ref={canvasRef} className="playback-timeline" role="img" aria-label="Playback timeline"
      data-playback-timeline="visible"
      data-timeline-melody={String(melody.length)}
      data-timeline-chords={String(chords.length)}
      data-timeline-major={majorLocked?'true':'false'}
      data-timeline-staff={melody.map(note=>note.staffDegree).join(',')}
      data-timeline-romans={chords.map(chord=>chord.roman?.symbol??'').join('|')}
      data-timeline-playhead={layout?String(layout.playheadX):''}
      height={TIMELINE_HEIGHT_PX} draggable={false}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
      onDragStart={event=>event.preventDefault()}/>
  </div>;
}
