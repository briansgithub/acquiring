import {useEffect,useMemo,useRef,useState} from 'react';
import type {ExtractedSection} from '../../contracts';
import {getKeys,keyAtBeat} from '../../domain/data';
import {doubleOrUndefined} from '../../domain/data/primitives';
import {canonicalScaleName,getChordNotes,getDegreeLabelFromSpelling,getMidiNote,getRelativeIonianRomanSymbol,interpret,ionianContextDegreeLabel,ionianContextPreviewAudioNote,relativeIonianKey,resolveChordRoot,resolveScaleDegreePitch} from '../../domain/music';
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
  const [majorLocked,setMajorLocked]=useState(false);
  const ionianKey=useMemo(()=>relativeIonianKey(keyAtBeat(model.keys,1)),[model]);
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
  const home=useMemo(()=>{const theoryKey={...key,scale:canonicalScaleName(key.scale)};return {note:getMidiNote('1',0,theoryKey),chord:getChordNotes({root:1,type:5},theoryKey)};},[key]);
  const chordRoman=chord&&interpretation?(majorLocked?getRelativeIonianRomanSymbol(chord,key,ionianKey):interpretation.roman):'';
  const spelledRoot=useMemo(()=>chord?resolveChordRoot(chord,key)?.pitch:null,[chord,key]);
  const rootLabel=root?(majorLocked?ionianContextDegreeLabel(root.current.pitch,ionianKey):root.currentDegreeLabel):'';
  // Native root-only tap uses its source register; the normalized target is for later singing.
  const rootMidi=root?.currentIntervalPitch.toAudioNoteNumber()??null;
  const melodyLabel=melody?(majorLocked?ionianContextDegreeLabel(melody.pitch,ionianKey):melody.label):'';
  // Native melody tap shares the raw pitch callback; display context only relabels this card.
  const melodyMidi=melody?.pitch.toAudioNoteNumber()??null;
  function toneMidi(midi:number){return majorLocked?ionianContextPreviewAudioNote(midi,ionianKey,3,spelledRoot??undefined)??midi:midi;}
  const duration=chord?cardDuration(doubleOrUndefined(chord.duration)??1,baseBpm):null;
  function play(id:string,notes:readonly number[],durationMs=450){
    // Exact-frequency preview API bypasses global transpose; apply it once at this boundary.
    const freqs=notes.filter(note=>note>0).map(note=>440*2**((note+settings.transpose-69)/12));
    if(freqs.length)void owner.current?.play(id,{freqs,durationMs,waveform:settings.waveform,arpeggiate:false});
  }
  const scale=key.scale.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,first=>first.toLocaleUpperCase());
  return <section className="panel playback-cards" aria-label="At this beat" data-card-preview-phase={preview.phase}>
    <h2>At this beat</h2>
    <label className="playback-check"><input type="checkbox" checked={majorLocked} onChange={event=>setMajorLocked(event.target.checked)}/>Lock in Major</label>
    {majorLocked&&<p aria-label="Display key">Display: {ionianKey.tonic} Major</p>}
    <p aria-label="Source key">{majorLocked?'Song: ':null}{key.tonic} {scale}</p>
    <div role="group" aria-label="Home references" className="playback-home-references">
      <button className="playback-card" aria-label="Play scale degree 1" onClick={()=>play('home-note',[home.note])}><ScaleDegree label={'1\u0302'} fontSizePx={28} maxWidthPx={66} maxHeightPx={60}/><span>Home note</span></button>
      <button className="playback-card" aria-label="Play home chord" onClick={()=>play('home-chord',home.chord)}><RomanNumeral display={romanNumeralDisplayFromChord('I',null)} fontSizePx={28} maxWidthPx={66} maxHeightPx={60}/><span>Home chord</span></button>
    </div>
    {settings.rootOnly?<div role="group" aria-label="Root cards">
      <h3>Current root</h3>{root?<button className="playback-card" aria-label={'Play current root '+rootLabel} onClick={()=>play('root',[rootMidi!])}>
        <ScaleDegree label={rootLabel} fontSizePx={40} maxWidthPx={130} maxHeightPx={66}/>
      </button>:<p>No sounding root</p>}
    </div>:<>
      <div role="group" aria-label="Chord cards"><h3>Current chord</h3>
        {chord&&interpretation?<button className="playback-card" aria-label={'Play current chord '+chordRoman} disabled={duration===null||interpretation.midi.length===0} onClick={()=>{if(duration!==null)play('chord',interpretation.midi,duration);}}>
          <RomanNumeral display={romanNumeralDisplayFromChord(chordRoman,chord.borrowed)} fontSizePx={32} maxWidthPx={160} maxHeightPx={80}/>
          <span>{interpretation.letter}</span>
        </button>:<p>No sounding chord</p>}
      </div>
      <div role="group" aria-label="Chord tones"><h3>Chord tones</h3><div className="playback-tone-cards">
        {interpretation&&interpretation.rootMidi!==null?interpretation.midi.map((midi,index)=><button key={index} className="playback-card" aria-label={'Play chord tone '+interpretation.toneLabels[index]} onClick={()=>play('tone:'+index,[toneMidi(midi)])}>
          <ScaleDegree label={interpretation.toneLabels[index]??''} fontSizePx={30} maxWidthPx={66} maxHeightPx={60}/>
        </button>):null}
      </div></div>
      <div role="group" aria-label="Melody cards"><h3>Current melody</h3>{melody?<button className="playback-card" aria-label={'Play melody '+melodyLabel} onClick={()=>play('melody',[melodyMidi!])}>
        <ScaleDegree label={melodyLabel} fontSizePx={40} maxWidthPx={130} maxHeightPx={66}/>
      </button>:<p>No sounding melody</p>}</div>
    </>}
    {(preview.phase==='error'||preview.phase==='blocked')&&<p role="alert">{preview.message??'Tap a card to enable its audio.'}</p>}
  </section>;
}
