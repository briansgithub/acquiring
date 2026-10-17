import {useEffect,useMemo,useRef,useState} from 'react';
import type {ExtractedSection} from '../../contracts';
import {getKeys,keyAtBeat} from '../../domain/data';
import {doubleOrUndefined} from '../../domain/data/primitives';
import {getDegreeLabelFromSpelling,interpret,resolveScaleDegreePitch} from '../../domain/music';
import {nativeBooleanOrNull} from '../../domain/music/native-json';
import {PreviewOwner,type PreviewState} from '../../audio/transport';
import {RomanNumeral,ScaleDegree} from '../../ui/notation/Notation';
import {romanNumeralDisplayFromChord} from '../../ui/notation/roman-numeral';
import {PlaybackActiveEventIndex} from './event-state';
import {preparePlaybackSection} from './section-model';
import type {PlaybackSettings} from './controller';

const isRest=(chord:ExtractedSection['chords'][number])=>nativeBooleanOrNull(chord.isRest)===true||nativeBooleanOrNull(chord.rest)===true;
function cardDuration(duration:number,bpm:number):number|null {
  if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(bpm)||bpm<=0)return null;
  return Math.max(40,Math.min(2147483647,Math.round(duration*60000/bpm)));
}
/** First current-card band. Native source pitches stay independent of manual audio transpose.
 * Full interval/relative-context/singing/timeline controls remain separate slices.
 */
export function PlaybackCards({section,beat,baseBpm,settings,stopPreview}:{section:ExtractedSection;beat:number;baseBpm:number;settings:PlaybackSettings;stopPreview:{current:(()=>void)|null}}){
  const model=useMemo(()=>{const prepared=preparePlaybackSection(section);return {index:new PlaybackActiveEventIndex(section,prepared.melody),keys:getKeys(section)};},[section]);
  const owner=useRef<PreviewOwner|null>(null);
  const [preview,setPreview]=useState<PreviewState>({phase:'idle',revision:0,requestId:null});
  useEffect(()=>{
    const current=new PreviewOwner();owner.current=current;const stop=()=>current.stop();stopPreview.current=stop;
    const unsubscribe=current.subscribe(()=>setPreview(current.getSnapshot()));setPreview(current.getSnapshot());
    return ()=>{unsubscribe();if(stopPreview.current===stop)stopPreview.current=null;if(owner.current===current)owner.current=null;void current.release();};
  },[section,stopPreview]);
  const key=keyAtBeat(model.keys,beat),current=model.index.chordAtBeat(beat);
  const chord=current&&!isRest(current)?current:null;
  const interpretation=useMemo(()=>chord?interpret(chord,key):null,[chord,key]);
  const root=useMemo(()=>{if(!current)return null;const onset=doubleOrUndefined(current.beat)??1;return model.index.chordRootIntervalAtBeat(onset===0?1:onset);},[current,model]);
  const note=settings.rootOnly?null:model.index.melodyNoteAtBeat(beat);
  const melody=useMemo(()=>{
    if(!note||note.isRest)return null;
    const sourceKey=keyAtBeat(model.keys,note.beat),pitch=resolveScaleDegreePitch(note.sd,note.octave,sourceKey);
    return pitch?{pitch,label:getDegreeLabelFromSpelling(pitch,sourceKey)}:null;
  },[note,model]);
  const duration=chord?cardDuration(doubleOrUndefined(chord.duration)??1,baseBpm):null;
  function play(id:string,notes:readonly number[],durationMs=450){
    // Exact-frequency preview API bypasses global transpose; apply it once at this boundary.
    const freqs=notes.filter(note=>note>0).map(note=>440*2**((note+settings.transpose-69)/12));
    if(freqs.length)void owner.current?.play(id,{freqs,durationMs,waveform:settings.waveform,arpeggiate:false});
  }
  const scale=key.scale.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,first=>first.toLocaleUpperCase());
  return <section className="panel playback-cards" aria-label="At this beat" data-card-preview-phase={preview.phase}>
    <h2>At this beat</h2><p aria-label="Source key">{key.tonic} {scale}</p>
    {settings.rootOnly?<div role="group" aria-label="Root cards">
      <h3>Current root</h3>{root?<button className="playback-card" aria-label={'Play current root '+root.currentDegreeLabel} onClick={()=>play('root',[root.currentIntervalPitch.toAudioNoteNumber()])}>
        <ScaleDegree label={root.currentDegreeLabel} fontSizePx={40} maxWidthPx={130} maxHeightPx={66}/>
      </button>:<p>No sounding root</p>}
    </div>:<>
      <div role="group" aria-label="Chord cards"><h3>Current chord</h3>
        {chord&&interpretation?<button className="playback-card" aria-label={'Play current chord '+interpretation.roman} disabled={duration===null||interpretation.midi.length===0} onClick={()=>{if(duration!==null)play('chord',interpretation.midi,duration);}}>
          <RomanNumeral display={romanNumeralDisplayFromChord(interpretation.roman,chord.borrowed)} fontSizePx={32} maxWidthPx={160} maxHeightPx={80}/>
          <span>{interpretation.letter}</span>
        </button>:<p>No sounding chord</p>}
      </div>
      <div role="group" aria-label="Chord tones"><h3>Chord tones</h3><div className="playback-tone-cards">
        {interpretation&&interpretation.rootMidi!==null?interpretation.midi.map((midi,index)=><button key={index} className="playback-card" aria-label={'Play chord tone '+interpretation.toneLabels[index]} onClick={()=>play('tone:'+index,[midi])}>
          <ScaleDegree label={interpretation.toneLabels[index]??''} fontSizePx={30} maxWidthPx={66} maxHeightPx={60}/>
        </button>):null}
      </div></div>
      <div role="group" aria-label="Melody cards"><h3>Current melody</h3>{melody?<button className="playback-card" aria-label={'Play melody '+melody.label} onClick={()=>play('melody',[melody.pitch.toAudioNoteNumber()])}>
        <ScaleDegree label={melody.label} fontSizePx={40} maxWidthPx={130} maxHeightPx={66}/>
      </button>:<p>No sounding melody</p>}</div>
    </>}
    {(preview.phase==='error'||preview.phase==='blocked')&&<p role="alert">{preview.message??'Tap a card to enable its audio.'}</p>}
  </section>;
}
