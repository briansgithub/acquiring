import {useEffect,useMemo,useRef,useState} from 'react';
import type {ExtractedSection} from '../../contracts';
import {preparePlaybackSection} from './section-model';
import {
  TIMELINE_HEIGHT_PX,
  TIMELINE_PLAYHEAD_STROKE_PX,
  buildChordTimelineVisuals,
  buildMelodyTimelineVisuals,
  layoutPlaybackTimeline,
} from './timeline-layout';
import {chordLaneRomanCenterY,chordLaneRomanFit,paintChordLaneRoman} from './timeline-roman';
import {paintMelodyRunScores} from './timeline-scores';
import {liveMelodyPitchLabel,paintLiveMelodyPitch,type LiveMelodyPitch} from './timeline-live-pitch';
import {useTimelineScrub,type TimelineScrub} from './timeline-scrub';
import {formatMelodyTimelinePitchScore,type MelodyRunScoreOutcome} from './melody-timeline-score';

export type {TimelineScrub};

/** Product timeline: Canvas lanes/playhead, tap/drag, chord-lane Roman, banked melody scores, live halo. No inertia. */
export function PlaybackTimeline({section,beat,rootOnly,majorLocked=false,onScrub,scores=emptyScores,monitoring=false,live=null}:{
  section:ExtractedSection;beat:number;rootOnly:boolean;majorLocked?:boolean;onScrub?:TimelineScrub;
  scores?:ReadonlyMap<number,MelodyRunScoreOutcome>;monitoring?:boolean;live?:LiveMelodyPitch|null;
}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const hostRef=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(0);
  const model=useMemo(()=>preparePlaybackSection(section),[section]);
  const melody=useMemo(()=>buildMelodyTimelineVisuals(model.melody,section,majorLocked),[model,section,majorLocked]);
  const chords=useMemo(()=>buildChordTimelineVisuals(section,majorLocked),[section,majorLocked]);
  const layout=width>0?layoutPlaybackTimeline({width,currentBeat:beat,rootOnly,melody,chords}):null;
  const endBeat=model.timeline.endBeat;
  useTimelineScrub(canvasRef,beat,endBeat,onScrub,!rootOnly);

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
    paintMelodyRunScores(ctx,melody,scores,layoutNow);
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
    if(monitoring&&live){
      const active=melody.find(note=>beat>=note.beat&&beat<note.beat+note.duration);
      paintLiveMelodyPitch(ctx,layoutNow,live,active?active.staffDegree:null);
    }
  },[beat,chords,layout,live,melody,monitoring,scores]);

  if(rootOnly||layout&&!layout.visible){
    return <div ref={hostRef} className="playback-timeline-host" data-playback-timeline="hidden" hidden/>;
  }

  return <div ref={hostRef} className="playback-timeline-host">
    <canvas ref={canvasRef} className="playback-timeline" role="img" aria-label="Playback timeline"
      data-playback-timeline="visible"
      data-timeline-melody={String(melody.length)}
      data-timeline-chords={String(chords.length)}
      data-timeline-major={majorLocked?'true':'false'}
      data-timeline-staff={melody.map(note=>note.staffDegree).join(',')}
      data-timeline-romans={chords.map(chord=>chord.roman?.symbol??'').join('|')}
      data-timeline-scores={scoreAttr(scores)}
      data-pitch-monitoring={monitoring?'true':'false'}
      data-timeline-halo={monitoring&&live?'true':'false'}
      data-timeline-live-estimate={live?.hasEstimate?'true':'false'}
      data-timeline-live-cents={monitoring&&live?liveMelodyPitchLabel(live):''}
      data-timeline-playhead={layout?String(layout.playheadX):''}
      height={TIMELINE_HEIGHT_PX} draggable={false}/>
  </div>;
}

const emptyScores:ReadonlyMap<number,MelodyRunScoreOutcome>=new Map();
function scoreAttr(scores:ReadonlyMap<number,MelodyRunScoreOutcome>):string {
  return [...scores.values()].map(outcome=>outcome.kind==='scored'?formatMelodyTimelinePitchScore(outcome.score):'·').join('|');
}
