import {PlaybackCards} from './PlaybackCards';
import {PlaybackFavoriteStar} from './PlaybackFavoriteStar';
import {PlaybackSettingsPanel} from './PlaybackSettingsPanel';
import {PlaybackTimeline} from './PlaybackTimeline';
import {usePlaybackMicrophone} from './playback-microphone';
import {usePlaybackPitchPractice} from './use-playback-pitch-practice';
import {FavoriteSession} from './favorites-session';
import {openGuestPlaylistStore} from './playlist-store';
import {SingingDock} from '../singing/SingingDock';
import {openGuestSongOctaveOffsetStore,SongOctaveOffsetSession} from '../singing/song-octave-session';
import type {UserDatabase} from '../../storage/user';
import {singingTargetRequest,type SingingTargetRequest} from '../singing/singing-octave';
import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {
  DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX,DEFAULT_PLAYBACK_TEMPO_PERCENT,
  type PlaybackSettings,type SectionPlaybackController,
} from './controller';
import {appInstrumentSession} from '../settings/instrument-session';
import {enterPlayback,sessionTranspose} from './playback-route-memory';
import {emptyPlaybackState,playbackStatusCopy,rememberPlayback,startSectionPlayback} from './playback-screen-support';
import {useQueuePlayback} from './queue-playback';
import {resolveQueuedSection} from '../library/song-queue';
import {formatBeat} from '../details/overview';
import {displayTitle,safeSectionName} from '../../domain/data';
import {AppShell} from '../../ui/shell/AppShell';
import {SongDetailController} from '../details/controller';
import './playback.css';
import type {PlaybackScreenProps} from './view-contracts';

const emptySubscribe=()=>()=>{};
const emptySnapshot=()=>emptyPlaybackState;

export function PlaybackScreen({slug,onBack,onHome,onDownload,playOnceKey=null,autoStart=false,queueSectionId,queueSectionName,onSectionComplete,onSongUnavailable,onQueueSectionChange,queueNav}:PlaybackScreenProps){
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
  const selected=details?.sections.find(([id])=>id===(sectionId??intendedSection.current))
    ??(playOnceKey?null:details?.sections[0]??null);
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
    if(!details)return;
    const named=details.sections.map(([id,section])=>({key:id,name:safeSectionName(section)}));
    let section:typeof details.sections[number]|undefined=details.sections[0];
    let tempoPercent=DEFAULT_PLAYBACK_TEMPO_PERCENT,transpose=sessionTranspose();
    let waveform=instrument.session,arpeggioIndex=DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX,beat=1;
    if(playOnceKey){
      const resolved=resolveQueuedSection({
        sectionId:queueSectionId??'',sectionName:queueSectionName??'First section',
      },named);
      if(!resolved){
        onSongUnavailable?.(`Skipped ${displayTitle(details.song.title)}: song or saved section unavailable.`);
        return;
      }
      section=details.sections.find(([id])=>id===resolved);
    }else{
      if(!section)return;
      const entry=enterPlayback(slug,section[0],details.sections.map(([id])=>id));
      section=details.sections.find(([id])=>id===entry.sectionId)??section;
      tempoPercent=entry.tempoPercent;transpose=entry.transpose;waveform=entry.waveform;
      arpeggioIndex=entry.arpeggioIndex;beat=entry.beat;
    }
    if(!section)return;
    intendedSection.current=section[0];
    setSectionId(section[0]);
    let owner:SectionPlaybackController|null=null;
    try{
      owner=startSectionPlayback(section[1],playOnceKey,{tempoPercent,transpose,waveform,arpeggioIndex},beat);
      playbackOwner.current=owner;
      loadedSection.current=section[0];
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
  },[details,slug,playOnceKey,queueSectionId,queueSectionName]);

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
    if(onQueueSectionChange){onQueueSectionChange(id,Boolean(playback&&!playback.closed&&playback.getSnapshot().transport.playbackRequested));return;}
    const next=details?.sections.find(([candidate])=>candidate===id);
    const fail=(error:unknown)=>{
      setSectionId(id);
      setPlaybackError(error instanceof Error?error.message:'This section could not be prepared for playback.');
    };
    if(!next){playback?.pause();setSectionId(id);setPlaybackError('This section is unavailable.');return;}
    if(playback&&!playback.closed){
      try{playback.loadSection(next[1]);loadedSection.current=id;setSectionId(id);setPlaybackError(null);}
      catch(error){playback.pause();fail(error);}
      return;
    }
    let owner:SectionPlaybackController|null=null;
    try{
      owner=startSectionPlayback(next[1],playOnceKey,emptyPlaybackState.settings,1);
      playbackOwner.current=owner;loadedSection.current=id;setPlayback(owner);setSectionId(id);setPlaybackError(null);
    }catch(error){owner?.dispose();playbackOwner.current=null;loadedSection.current=null;setPlayback(null);fail(error);}
  }

  useQueuePlayback({
    playback,playbackError,autoStart,playOnceKey,phase:transport.phase,
    completionKey:transport.completion?.completionKey??null,
    detailPhase:detailState.phase,title,
    onSectionComplete,onSongUnavailable,
  });
  const beat=Math.max(1,Math.min(playbackState.endBeat,transport.beat));
  const active=transport.playbackRequested;
  const {phase,status}=playbackStatusCopy(playbackError,transport.phase,active);
  const mic=usePlaybackMicrophone();
  const pitch=usePlaybackPitchPractice({
    source:mic.persistent,
    section:playback&&!playbackError&&selected?selected[1]:null,beat,rootOnly:settings.rootOnly,
    majorLocked,transpose:settings.transpose,octaveOffset,
  });

  return <AppShell title={title} onBack={onBack}><div className="playback-screen" aria-busy={detailState.phase==='loading'} data-playback-phase={phase} data-playback-requested={String(active)} data-queue-section={queueSectionId??''}>
    {queueNav&&<div className="playback-queue-bar panel" data-song-queue-bar="">
      <span>{queueNav.label}</span>
      <button className="action" type="button" aria-label="Previous song" disabled={!queueNav.previousEnabled} onClick={queueNav.onPrevious}>Previous</button>
      <button className="action" type="button" aria-label="Next song" disabled={!queueNav.nextEnabled} onClick={queueNav.onNext}>Next</button>
    </div>}
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
            <button className="action" type="button" aria-label="Pitch monitoring" aria-pressed={pitch.monitoring} onClick={pitch.toggle} disabled={!playback||Boolean(playbackError)}>Mic</button>
            <button className="action" onClick={()=>{cardPreviewStop.current?.();pitch.clear();playback?.reset();}} disabled={!playback}>Reset</button>
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
          onSing={request=>{cardPreviewStop.current?.();pitch.cancel();playback.pause();singingRequestId.current+=1;setSingingTarget(singingTargetRequest(request.first,request.second,singingRequestId.current));setDockExpanded(true);}}/>}
        {playback&&!playbackError&&<PlaybackTimeline section={selected[1]} beat={beat} rootOnly={settings.rootOnly} majorLocked={majorLocked}
          scores={pitch.scores} monitoring={pitch.monitoring} live={pitch.live}
          onScrub={{tap:t=>{cardPreviewStop.current?.();playback.scrubTo(t);playback.finishScrub();},dragTo:t=>{cardPreviewStop.current?.();playback.scrubTo(t);},end:()=>playback.finishScrub()}}/>}
        <SingingDock octaveOffset={octaveOffset} onOctaveOffsetChange={offset=>octaveSession.updateOctaveOffset(offset)}
          target={singingTarget} expanded={dockExpanded} onExpandedChange={setDockExpanded} transpose={settings.transpose}
          capture={mic.capture} source={mic.singing}/>
        <PlaybackSettingsPanel settings={settings} disabled={!playback} onChange={updateSettings}/>
      </>}
    </>}
  </div></AppShell>;
}
