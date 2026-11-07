import {PlaybackCards} from './PlaybackCards';
import {PlaybackFavoriteStar} from './PlaybackFavoriteStar';
import {PlaybackTimeline} from './PlaybackTimeline';
import {FavoriteSession} from './favorites-session';
import {openGuestPlaylistStore} from './playlist-store';
import {SingingDock} from '../singing/SingingDock';
import {openGuestSongOctaveOffsetStore,SongOctaveOffsetSession} from '../singing/song-octave-session';
import type {UserDatabase} from '../../storage/user';
import {singingTargetRequest,type SingingTargetRequest} from '../singing/singing-octave';
import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {INSTRUMENTS,Waveform} from '../../audio/synth';
import type {PlaybackSettings} from './controller';
import {PLAYBACK_ARPEGGIOS,SectionPlaybackController} from './controller';
import {appInstrumentSession} from '../settings/instrument-session';
import {capturePlayback,enterPlayback,setSessionTranspose,setSessionWaveform} from './playback-route-memory';
import {formatBeat} from '../details/overview';
import {displayTitle,safeSectionName} from '../../domain/data';
import {AppShell} from '../../ui/shell/AppShell';
import {SongDetailController} from '../details/controller';
import './playback.css';
import type {PlaybackScreenProps} from './view-contracts';

const emptyState=Object.freeze({
  settings:Object.freeze({tempoPercent:100,transpose:0,melodyPercent:50,waveform:Waveform.CLARINET,rootOnly:false,arpeggioIndex:3}),
  transport:Object.freeze({phase:'stopped' as const,transportRevision:0,playbackRequested:false,beat:1,bpm:120,window:null,renderEnded:false,completion:null,error:null,clock:null}),
  endBeat:32,baseBpm:120,scrubbing:false,
});
const emptySubscribe=()=>()=>{};
const emptySnapshot=()=>emptyState;
const arpeggioNames=['1/4','1/3','1/2','Off','1x','2x','3x','4x'];
function rememberPlayback(slug:string,sectionId:string|null,owner:SectionPlaybackController|null):void {
  if(!owner||owner.closed||!sectionId)return;
  const {settings,transport}=owner.getSnapshot();
  capturePlayback(slug,{sectionId,beat:transport.beat,tempoPercent:settings.tempoPercent,arpeggioIndex:settings.arpeggioIndex});
  setSessionTranspose(settings.transpose);setSessionWaveform(settings.waveform);
}

export function PlaybackScreen({slug,onBack,onHome,onDownload}:PlaybackScreenProps){
  const [detailController,setDetailController]=useState(()=>new SongDetailController(slug));
  const detailState=useSyncExternalStore(detailController.subscribe,detailController.getSnapshot,detailController.getSnapshot);
  const [sectionId,setSectionId]=useState<string|null>(null);
  const [majorLocked,setMajorLocked]=useState(false);
  const [dockExpanded,setDockExpanded]=useState(false);
  const [singingTarget,setSingingTarget]=useState<SingingTargetRequest|null>(null);
  const singingRequestId=useRef(0);
  const octaveSession=useMemo(()=>new SongOctaveOffsetSession(),[]);
  const octaveOffset=useSyncExternalStore(octaveSession.subscribe,octaveSession.getSnapshot,octaveSession.getSnapshot);
  const favoriteSession=useMemo(()=>new FavoriteSession(),[]);
  const favorite=useSyncExternalStore(favoriteSession.subscribe,favoriteSession.getSnapshot,favoriteSession.getSnapshot);
  const instrument=useSyncExternalStore(appInstrumentSession.subscribe,appInstrumentSession.getSnapshot,appInstrumentSession.getSnapshot);
  const [playback,setPlayback]=useState<SectionPlaybackController|null>(null);
  const [playbackError,setPlaybackError]=useState<string|null>(null);
  const playbackOwner=useRef<SectionPlaybackController|null>(null);
  const cardPreviewStop=useRef<(()=>void)|null>(null);
  const loadedSection=useRef<string|null>(null);
  const intendedSection=useRef<string|null>(null);

  useEffect(()=>{
    if(detailController.closed){setDetailController(new SongDetailController(slug));return;}
    void detailController.start();
    const hide=()=>{
      rememberPlayback(slug,loadedSection.current,playbackOwner.current);
      detailController.dispose();
      playbackOwner.current?.dispose();
      playbackOwner.current=null;
      loadedSection.current=null;
      setPlayback(null);
    };
    const show=(event:PageTransitionEvent)=>{if(event.persisted)setDetailController(new SongDetailController(slug));};
    window.addEventListener('pagehide',hide);
    window.addEventListener('pageshow',show);
    return ()=>{
      detailController.dispose();
      window.removeEventListener('pagehide',hide);
      window.removeEventListener('pageshow',show);
    };
  },[detailController,slug]);

  const details=detailState.details;
  const selected=details?.sections.find(([id])=>id===(sectionId??intendedSection.current))??details?.sections[0]??null;
  const sectionKey=selected?.[0]??'';

  useEffect(()=>{
    let closed=false;
    let db:UserDatabase|undefined;
    void openGuestSongOctaveOffsetStore().then(opened=>{
      if(closed){opened?.db.close();return;}
      if(!opened)return;
      db=opened.db;
      octaveSession.attachStore(opened.store);
    });
    return ()=>{closed=true;octaveSession.attachStore(null);db?.close();};
  },[octaveSession]);
  useEffect(()=>{
    let closed=false;
    let db:UserDatabase|undefined;
    void openGuestPlaylistStore().then(opened=>{
      if(closed){opened?.db.close();return;}
      if(!opened)return;
      db=opened.db;
      favoriteSession.attachStore(opened.store);
    });
    return ()=>{closed=true;favoriteSession.attachStore(null);db?.close();};
  },[favoriteSession]);

  useEffect(()=>{void octaveSession.enterSession(slug,`${slug}:${sectionKey}`);},[octaveSession,slug,sectionKey]);
  useEffect(()=>{void favoriteSession.enterSong(slug);},[favoriteSession,slug]);
  useEffect(()=>{setMajorLocked(false);setDockExpanded(false);setSingingTarget(null);},[slug]);

  useEffect(()=>{
    if(!details||details.sections.length===0)return;
    const sectionIds=details.sections.map(([id])=>id);
    const entry=enterPlayback(slug,sectionIds[0]!,sectionIds);
    const section=details.sections.find(([id])=>id===entry.sectionId)??details.sections[0]!;
    intendedSection.current=section[0];
    setSectionId(section[0]);
    let owner:SectionPlaybackController|null=null;
    try{
      owner=new SectionPlaybackController(section[1]);
      playbackOwner.current=owner;
      loadedSection.current=section[0];
      owner.start();
      owner.updateSettings({tempoPercent:entry.tempoPercent,transpose:entry.transpose,waveform:entry.waveform,arpeggioIndex:entry.arpeggioIndex});
      if(entry.beat!==1)owner.restoreBeat(entry.beat);
      setPlayback(owner);
      setPlaybackError(null);
    }catch(error){
      owner?.dispose();
      playbackOwner.current=null;
      loadedSection.current=null;
      setPlayback(null);
      setPlaybackError(error instanceof Error?error.message:'This section could not be prepared for playback.');
    }
    return ()=>{
      const current=playbackOwner.current;
      rememberPlayback(slug,loadedSection.current??intendedSection.current,current??owner);
      playbackOwner.current=null;
      loadedSection.current=null;
      current?.dispose();
      if(current!==owner)owner?.dispose();
    };
  },[details,slug]);

  useEffect(()=>{
    if(!playback||playback.closed||playback.getSnapshot().settings.waveform===instrument.session)return;
    try{playback.updateSettings({waveform:instrument.session});}
    catch(error){setPlaybackError(error instanceof Error?error.message:'Playback settings could not be applied.');}
  },[playback,instrument.session]);

  useEffect(()=>{
    if(!playback||!selected||playbackError||loadedSection.current===selected[0])return;
    try{
      playback.loadSection(selected[1]);
      loadedSection.current=selected[0];
      setPlaybackError(null);
    }catch(error){
      playback.pause();
      setPlaybackError(error instanceof Error?error.message:'This section could not be prepared for playback.');
    }
  },[playback,selected,playbackError]);

  const playbackState=useSyncExternalStore(playback?.subscribe??emptySubscribe,playback?.getSnapshot??emptySnapshot,playback?.getSnapshot??emptySnapshot);
  const settings=playbackState.settings as PlaybackSettings;
  const transport=playbackState.transport;
  const title=details?displayTitle(details.song.title):'Playback';

  function updateSettings(patch:Partial<PlaybackSettings>){
    try{
      if(patch.waveform)appInstrumentSession.selectForSession(patch.waveform);
      playback?.updateSettings(patch);
      if(loadedSection.current===selected?.[0])setPlaybackError(null);
    }catch(error){setPlaybackError(error instanceof Error?error.message:'Playback settings could not be applied.');}
  }
  function changeSection(id:string){
    const next=details?.sections.find(([candidate])=>candidate===id);
    if(!next){playback?.pause();setSectionId(id);setPlaybackError('This section is unavailable.');return;}
    if(!playback||playback.closed){
      let owner:SectionPlaybackController|null=null;
      try{
        owner=new SectionPlaybackController(next[1]);
        playbackOwner.current=owner;
        loadedSection.current=id;
        owner.start();
        setPlayback(owner);
        setSectionId(id);
        setPlaybackError(null);
      }catch(error){
        owner?.dispose();
        playbackOwner.current=null;
        loadedSection.current=null;
        setPlayback(null);
        setSectionId(id);
        setPlaybackError(error instanceof Error?error.message:'This section could not be prepared for playback.');
      }
      return;
    }
    try{
      playback.loadSection(next[1]);
      loadedSection.current=id;
      setSectionId(id);
      setPlaybackError(null);
    }catch(error){
      playback.pause();
      setSectionId(id);
      setPlaybackError(error instanceof Error?error.message:'This section could not be prepared for playback.');
    }
  }

  const beat=Math.max(1,Math.min(playbackState.endBeat,transport.beat));
  const active=transport.playbackRequested;
  const phase=playbackError?'error':transport.phase;
  const status=playbackError??(transport.phase==='error'?'Playback stopped because an audio error occurred.':
    transport.phase==='blocked'?'Tap Play to enable audio.':
    active&&transport.phase==='buffering'?'Preparing playback...':
    active&&transport.phase==='playing'?'Playing':
    transport.phase==='completed'?'Playback finished.':
    active?'Playback requested.':'Playback paused.');

  return <AppShell title={title} onBack={onBack}><div className="playback-screen" aria-busy={detailState.phase==='loading'} data-playback-phase={phase} data-playback-requested={String(active)}>
    {detailState.phase==='loading'?<p role="status">Opening song...</p>:detailState.phase!=='ready'?<section className="panel">
      <h2>{detailState.phase==='download'?'Song library needed':detailState.phase==='missing'?'Song unavailable':'Unable to open song'}</h2>
      <p role={detailState.phase==='error'?'alert':undefined}>{detailState.message}</p>
      {detailState.phase==='download'&&<button className="action" onClick={onDownload}>Download catalogs</button>}
      {detailState.phase==='error'&&<button className="action" onClick={()=>{void detailController.retry();}}>Retry</button>}
      <button className="action" onClick={onHome}>Open Library</button>
    </section>:details&&<>
      <section className="panel">
        <h2>{title}</h2>
        {details.sections.length===0?<p>No playable sections are available.</p>:<label className="playback-field">Section
          <select aria-label="Section" value={selected?.[0]??''} onChange={event=>changeSection(event.target.value)}>
            {details.sections.map(([id,section])=><option key={id} value={id}>{safeSectionName(section)}</option>)}
          </select>
        </label>}
      </section>
      {details.sections.length>0&&selected&&<>
        <section className="panel playback-transport" aria-label="Playback controls">
          <div className="playback-actions">
            <PlaybackFavoriteStar snapshot={favorite} onToggle={()=>favoriteSession.toggle()}/>
            <button className="action" onClick={()=>active?playback?.pause():playback?.play()} disabled={!playback||Boolean(playbackError)}>{active?'Pause':'Play'}</button>
            <button className="action" onClick={()=>{cardPreviewStop.current?.();playback?.reset();}} disabled={!playback}>Reset</button>
          </div>
          <label className="playback-field playback-position">Position
            <input aria-label="Position" type="range" min="1" max={playbackState.endBeat} step="0.01" value={beat} disabled={!playback}
              onPointerDown={()=>{cardPreviewStop.current?.();playback?.beginScrub();}}
              onPointerUp={()=>playback?.finishScrub()}
              onPointerCancel={()=>playback?.cancelScrub()}
              onKeyDown={event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)){cardPreviewStop.current?.();playback?.beginScrub();}}}
              onKeyUp={event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))playback?.finishScrub();}}
              onBlur={()=>playback?.cancelScrub()}
              onChange={event=>{cardPreviewStop.current?.();playback?.scrubTo(Number(event.target.value));}}/>
          </label>
          <p className="playback-beat">Current beat <output aria-label="Current beat">{formatBeat(beat)}</output></p>
          <p role="status" aria-live="polite" className="playback-status">{status}</p>
        </section>
        {playbackError&&<section className="panel"><p role="alert">{playbackError}</p></section>}
        {playback&&!playbackError&&<PlaybackCards section={selected[1]} beat={beat} baseBpm={playbackState.baseBpm} settings={settings} stopPreview={cardPreviewStop}
          majorLocked={majorLocked} onMajorLockedChange={setMajorLocked}
          onSing={request=>{cardPreviewStop.current?.();playback.pause();singingRequestId.current+=1;setSingingTarget(singingTargetRequest(request.first,request.second,singingRequestId.current));setDockExpanded(true);}}/>}
        {playback&&!playbackError&&<PlaybackTimeline section={selected[1]} beat={beat} rootOnly={settings.rootOnly} majorLocked={majorLocked}/>}
        <SingingDock octaveOffset={octaveOffset} onOctaveOffsetChange={offset=>octaveSession.updateOctaveOffset(offset)}
          target={singingTarget} expanded={dockExpanded} onExpandedChange={setDockExpanded}/>
        <section className="panel playback-settings" aria-label="Playback settings">
          <label className="playback-field">Tempo (%)
            <input aria-label="Tempo (%)" type="range" min="0" max="200" step="1" value={settings.tempoPercent} disabled={!playback}
              onChange={event=>updateSettings({tempoPercent:Number(event.target.value)})}/>
            <output>{settings.tempoPercent}%</output>
          </label>
          <label className="playback-field">Transpose
            <input aria-label="Transpose" type="range" min="-12" max="12" step="1" value={settings.transpose} disabled={!playback}
              onChange={event=>updateSettings({transpose:Number(event.target.value)})}/>
            <output>{settings.transpose}</output>
          </label>
          <label className="playback-field">Instrument
            <select aria-label="Instrument" value={settings.waveform} disabled={!playback}
              onChange={event=>updateSettings({waveform:event.target.value as Waveform})}>
              {INSTRUMENTS.map(instrument=><option key={instrument.waveform} value={instrument.waveform}>{instrument.displayName}</option>)}
            </select>
          </label>
          <label className="playback-check"><input type="checkbox" aria-label="Root only" checked={settings.rootOnly} disabled={!playback}
            onChange={event=>updateSettings({rootOnly:event.target.checked})}/>Root only</label>
          <label className="playback-field">Melody mix
            <input aria-label="Melody mix" type="range" min="0" max="100" step="1" value={settings.melodyPercent} disabled={!playback}
              onChange={event=>updateSettings({melodyPercent:Number(event.target.value)})}/>
            <output>{settings.melodyPercent}%</output>
          </label>
          {!settings.rootOnly&&<label className="playback-field">Arpeggio
            <select aria-label="Arpeggio" value={settings.arpeggioIndex} disabled={!playback}
              onChange={event=>updateSettings({arpeggioIndex:Number(event.target.value)})}>
              {PLAYBACK_ARPEGGIOS.map((_,index)=><option key={index} value={index}>{arpeggioNames[index]}</option>)}
            </select>
          </label>}
        </section>
      </>}
    </>}
  </div></AppShell>;
}
