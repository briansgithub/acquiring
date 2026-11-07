import {OCTAVE_OFFSET_MAX,OCTAVE_OFFSET_MIN,clampSingingOctaveOffset,singingOctaveOffsetLabel,type SingingTargetRequest} from './singing-octave';
import './singing.css';

/** Playback singing dock chrome from HummingIntervalPopup.kt. Expand does not start
 * the microphone. Flip-Flop/listen/scores wait for T09 capture — no fabricated cents.
 */
export function SingingDock({octaveOffset,onOctaveOffsetChange,target,expanded,onExpandedChange}:{
  octaveOffset:number;
  onOctaveOffsetChange:(offset:number)=>void;
  target:SingingTargetRequest|null;
  expanded:boolean;
  onExpandedChange:(expanded:boolean)=>void;
}){
  const first=target?.first?.scaleDegreeLabel??'';
  const second=target?.second?.scaleDegreeLabel??'';
  return <section className="panel singing-dock" data-singing-dock={expanded?'expanded':'collapsed'} aria-label="Interval Singing Tool">
    <button type="button" className="singing-dock__handle action" aria-expanded={expanded}
      aria-label={expanded?'Collapse humming tool':'Expand Humming Tool'}
      onClick={()=>onExpandedChange(!expanded)}>
      {expanded?'Collapse':'Interval Singing Tool'}
    </button>
    {expanded&&<>
      <div className="singing-dock__toolbar">
        <label className="playback-check singing-dock__flipflop">
          <input type="checkbox" role="switch" aria-label="Flip-Flop" disabled title="Flip-Flop needs microphone capture."/>
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
      </div>
      <div className="singing-dock__slots" data-singing-target-row="">
        <div className="singing-dock__slot" data-singing-slot="1" aria-label="Singing slot 1">{first||'—'}</div>
        <div className="singing-dock__slot" data-singing-slot="2" aria-label="Singing slot 2">{second||'—'}</div>
        <div className="singing-dock__interval" data-singing-interval="empty" aria-label="Sung interval">
          <span>Interval</span>
          <output>—</output>
        </div>
      </div>
    </>}
  </section>;
}
