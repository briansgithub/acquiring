import {chordTransitions} from './transitions';
import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import type {JsonObject} from '../../contracts';
import {PreviewOwner,type PreviewState} from '../../audio/transport';
import {displayArtist,displayTitle,getBpm,getParsedKey,safeSectionName,safeSongInfo} from '../../domain/data';
import {generateScaleLabels,getUniqueDisplayChords,interpret,SCALE_INTERVALS} from '../../domain/music';
import {RomanNumeral,ScaleDegree} from '../../ui/notation/Notation';
import {romanNumeralDisplayFromChord} from '../../ui/notation/roman-numeral';
import {AppShell} from '../../ui/shell/AppShell';
import {SongDetailController} from './controller';
import './details.css';

interface SongView {sectionId:string|null;tab:'info'|'chords';letters:boolean}
const remembered=new Map<string,SongView>();
function sourceUrl(value:string):string|null {try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}}
export function SongScreen({slug,onBack,onHome,onDownload}:{slug:string;onBack:()=>void;onHome:()=>void;onDownload:()=>void}){
  const [controller,setController]=useState(()=>new SongDetailController(slug));
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
  const [view,setView]=useState<SongView>(()=>remembered.get(slug)??{sectionId:null,tab:'info',letters:false});
  const [visible,setVisible]=useState(32),[selected,setSelected]=useState<string|null>(null),[preview,setPreview]=useState<PreviewState>({phase:'idle',revision:0,requestId:null});
  const previewOwner=useRef<PreviewOwner|null>(null);
  const [selectedChord,setSelectedChord]=useState<JsonObject|null>(null);
  const [rootOnlyTransitions,setRootOnlyTransitions]=useState(false);
  useEffect(()=>{
    if(controller.closed){setController(new SongDetailController(slug));return;}
    void controller.start();
    const hide=()=>controller.dispose(),show=(event:PageTransitionEvent)=>{if(event.persisted)setController(new SongDetailController(slug));};
    window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
    return ()=>{controller.dispose();window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);};
  },[controller,slug]);
  useEffect(()=>{
    const owner=new PreviewOwner();previewOwner.current=owner;
    const unsubscribe=owner.subscribe(()=>setPreview(owner.getSnapshot()));
    setPreview(owner.getSnapshot());
    return ()=>{unsubscribe();if(previewOwner.current===owner)previewOwner.current=null;void owner.release();};
  },[slug]);
  const details=state.details;
  const entry=details?.sections.find(([id])=>id===view.sectionId)??details?.sections[0],section=entry?.[1];
  const analysis=useMemo(()=>{
    if(!section)return null;
    try {
      if(section.chords.length>4096)return {key:getParsedKey(section),chords:[],error:'This section has too many chords to display.'};
      const key=getParsedKey(section);return {key,chords:getUniqueDisplayChords(section.chords,key),error:null};
    }catch{return {key:{tonic:'C',scale:'major'},chords:[],error:'These chords could not be displayed.'};}
  },[section]);
  const scale=useMemo(()=>analysis?generateScaleLabels(analysis.key.tonic,Object.hasOwn(SCALE_INTERVALS,analysis.key.scale)?SCALE_INTERVALS[analysis.key.scale]:SCALE_INTERVALS.major):[],[analysis]);
  const tones=useMemo(()=>selectedChord&&analysis?interpret(selectedChord,analysis.key):null,[selectedChord,analysis]);
  const transitions=useMemo(()=>{try{return section?chordTransitions(section,rootOnlyTransitions):[];}catch{return[];}},[section,rootOnlyTransitions]);
  function change(patch:Partial<SongView>){previewOwner.current?.stop();setSelected(null);setSelectedChord(null);setVisible(32);if(patch.sectionId!==undefined)setRootOnlyTransitions(false);setView(old=>{const next={...old,...patch};remembered.set(slug,next);return next;});}
  function play(chord:JsonObject,label:string){
    if(!analysis)return;
    const notes=interpret(chord,analysis.key).midi.filter(note=>note>0);
    setSelected(label);setSelectedChord(chord);
    void previewOwner.current?.play('song:'+slug+':'+entry?.[0]+':'+label,{freqs:notes.map(note=>440*2**((note-69)/12)),durationMs:450,arpeggiate:false});
  }
  function playTone(midi:number,label:string){
    setSelected('tone '+label);
    void previewOwner.current?.play('song:'+slug+':tone:'+label,{freqs:[440*2**((midi-69)/12)],durationMs:450,arpeggiate:false});
  }
  const title=details?displayTitle(details.song.title):'Song';
  return <AppShell title={title} onBack={onBack}><div className="song-details" aria-busy={state.phase==='loading'}>
    {state.phase==='loading'?<p role="status">Opening song…</p>:state.phase!=='ready'?<section className="panel">
      <h2>{state.phase==='download'?'Song library needed':state.phase==='missing'?'Song unavailable':'Unable to open song'}</h2>
      <p role={state.phase==='error'?'alert':undefined}>{state.message}</p>
      {state.phase==='download'?<button className="action" onClick={onDownload}>Download catalogs</button>:state.phase==='error'?<button className="action" onClick={()=>{void controller.retry();}}>Retry</button>:null}
      <button className="action" onClick={onHome}>Open Library</button>
    </section>:details&&<>
      <section className="panel"><h2>{title}</h2><p>{displayArtist(details.song.artist)}</p>
        {details.sections.length>0?<label className="song-section">Section<select value={entry?.[0]??''} onChange={event=>change({sectionId:event.target.value})}>
          {details.sections.map(([id,value])=><option key={id} value={id}>{safeSectionName(value)}</option>)}
        </select></label>:<p>No chord sections are available.</p>}
        {section&&safeSongInfo(section)&&<p>{safeSongInfo(section)}</p>}
      </section>
      {section&&analysis&&<>
        <nav className="song-tabs" aria-label="Song details">
          <button className="action" aria-pressed={view.tab==='info'} onClick={()=>change({tab:'info'})}>Info</button>
          <button className="action" aria-pressed={view.tab==='chords'} onClick={()=>change({tab:'chords'})}>Chords</button>
        </nav>
        {view.tab==='info'?<section className="panel"><h2>Overview</h2><dl>
          <dt>Key</dt><dd>{analysis.key.tonic} {analysis.key.scale.replaceAll('_',' ')}</dd>
          <dt>Tempo</dt><dd>{Number.isFinite(getBpm(section))?Math.round(getBpm(section))+' BPM':'Unknown'}</dd>
          <dt>Chords</dt><dd>{section.chords.length} ({analysis.chords.length} unique)</dd>
        </dl></section>:<section className="panel"><h2>Chords</h2>
          <p>Scale: {scale.join(', ')}</p>
          <label className="song-letters"><input type="checkbox" checked={view.letters} onChange={event=>change({letters:event.target.checked})}/>Letter names</label>
          <p>Key: {analysis.key.tonic} {analysis.key.scale}</p>
          {tones&&tones.toneLabels.length>0&&<section aria-label="Chord tones"><h3>Chord tones</h3><div className="song-tones">
            {tones.toneLabels.map((label,index)=><button className="song-tone" key={index} aria-label={'Preview chord tone '+label} disabled={tones.midi[index]===undefined} onClick={()=>playTone(tones.midi[index],label)}>
              <ScaleDegree label={label} fontSizePx={28} maxWidthPx={54} maxHeightPx={54}/>
            </button>)}
          </div></section>}
          {analysis.error?<p role="alert">{analysis.error}</p>:analysis.chords.length===0?<p>No sounding chords in this section.</p>:<div className="song-chords">
            {analysis.chords.slice(0,visible).map((chord,index)=>{
              const value=interpret(chord,analysis.key),label=view.letters?value.letter:value.roman;
              return <button className="song-chord" key={index} aria-label={'Preview '+label} aria-pressed={selectedChord===chord} onClick={()=>play(chord,label)}>
                {view.letters?<span>{value.letter}</span>:<RomanNumeral display={romanNumeralDisplayFromChord(value.roman,chord.borrowed)} fontSizePx={30} maxWidthPx={130} maxHeightPx={70}/>}
                <small>{value.toneLabels.join(' · ')}</small>
              </button>;
            })}
          </div>}
          {visible<analysis.chords.length&&<button className="action" onClick={()=>setVisible(count=>count+32)}>Show more chords</button>}
          <div className="song-preview" data-preview-phase={preview.phase}>
            <p role="status">{preview.phase==='playing'?'Playing '+selected:preview.phase==='preparing'?'Preparing chord…':preview.phase==='blocked'?'Tap a chord to enable audio.':preview.phase==='error'?'Chord preview is unavailable.':''}</p>
            {['playing','preparing'].includes(preview.phase)&&<button className="action" onClick={()=>previewOwner.current?.stop()}>Stop preview</button>}
          </div>
          {transitions.length>0&&<section aria-label="Chord transitions"><h3>Transitions</h3>
            <label className="song-letters"><input type="checkbox" checked={rootOnlyTransitions} onChange={event=>setRootOnlyTransitions(event.target.checked)}/>Root only transitions</label>
            {transitions.slice(0,8).map(row=><p key={row.id}>{row.id} ×{row.count}</p>)}
          </section>}
        </section>}
      </>}
      <section className="panel"><h2>Source</h2><p>{details.song.slug}</p>
        {sourceUrl(details.song.url)&&<a className="action" href={sourceUrl(details.song.url)!} target="_blank" rel="noopener noreferrer">Open original source</a>}
      </section>
    </>}
  </div></AppShell>;
}
