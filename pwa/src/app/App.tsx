import {PlaybackScreen} from '../features/playback/PlaybackScreen';
import {leavePlaybackSong} from '../features/playback/playback-route-memory';
import {SongScreen} from '../features/details/SongScreen';
import {LibraryScreen,libraryRouteState,saveLibraryView} from '../features/library/LibraryScreen';
import {mutateSongQueue,songQueueSession,songQueueVersion,subscribeSongQueue} from '../features/library/song-queue-host';
import {SongQueueRouteSync} from '../features/library/song-queue-route';
import {DefaultInstrumentControl} from '../features/settings/DefaultInstrumentControl';
import {hydrateAppInstrumentSession,openGuestInstrumentPreferences} from '../features/settings/instrument-session';
import { useEffect, useSyncExternalStore } from 'react';
import { CatalogPanel } from '../features/catalog/CatalogPanel';
import { AppShell } from '../ui/shell/AppShell';
import { navigate, parseRoute, subscribeRoute } from './routes';

export function App() {
  useEffect(()=>{
    let db:Awaited<ReturnType<typeof openGuestInstrumentPreferences>>;
    let cancelled=false;
    void openGuestInstrumentPreferences().then(opened=>{
      if(cancelled){opened?.close();return;}
      db=opened;if(opened)void hydrateAppInstrumentSession(opened);
    });
    return ()=>{cancelled=true;db?.close();};
  },[]);
  const pathname = useSyncExternalStore(subscribeRoute, () => location.pathname, () => '/');
  const queueVersion = useSyncExternalStore(subscribeSongQueue, songQueueVersion, songQueueVersion);
  const route = parseRoute(pathname);
  const queue = songQueueSession();
  void queueVersion;
  const home = () => {
    mutateSongQueue(session=>{if(session.active)session.dismiss();});
    leavePlaybackSong();
    navigate('/',libraryRouteState());
  };
  const backToLibrary = () => { if(history.state?.fromLibrary||history.state?.fromSong||history.state?.fromPlayback)history.back();else home(); };
  const queued = queue.active && queue.started;
  const current = queued ? queue.entries[queue.index] : undefined;
  return <>
    <SongQueueRouteSync />
    {route.kind === 'settings' ? <AppShell title="Settings" onBack={backToLibrary}>
      <CatalogPanel />
      <section className="panel"><h2>Default Instrument</h2><DefaultInstrumentControl /></section>
      <section className="panel"><h2>Appearance</h2><p>Dark theme</p></section>
      <button className="action" onClick={() => navigate('/help')}>Help</button>
    </AppShell> : route.kind === 'help' ? <AppShell title="Help" onBack={() => navigate('/settings')}>
      <section className="panel"><h2>Acquiring</h2><p>Listen, practice and learn music.</p><p>Once downloaded, your catalogs and saved practice will be available offline on this device.</p></section>
    </AppShell> : route.kind === 'playback' ? <PlaybackScreen key={queued?queue.loadToken:route.slug} slug={route.slug}
      playOnceKey={queued?queue.playbackCompletionKey:null}
      autoStart={queued&&queue.autoStart}
      queueSectionId={current?(queue.sectionOverride??current.sectionId):undefined}
      queueSectionName={current?.sectionName}
      onSectionComplete={key=>mutateSongQueue(session=>session.completed(key))}
      onSongUnavailable={message=>mutateSongQueue(session=>session.unavailable(queue.loadToken,message))}
      queueNav={queued?{
        label:`${queue.index+1} of ${queue.entries.length}`,
        previousEnabled:queue.index>0,
        nextEnabled:queue.index<queue.entries.length-1,
        onPrevious:()=>mutateSongQueue(session=>session.select(session.index-1,true)),
        onNext:()=>mutateSongQueue(session=>session.select(session.index+1,true)),
      }:undefined}
      onBack={()=>{if(queued)home();else if(history.state?.fromSongInfo)history.back();else home();}}
      onHome={home} onDownload={()=>navigate('/settings',{fromPlayback:true})} />
    : route.kind === 'song' ? <SongScreen key={route.slug} slug={route.slug} onBack={()=>{leavePlaybackSong();backToLibrary();}} onHome={home} onDownload={()=>navigate('/settings',{fromSong:true})} onPlay={()=>navigate('/playback/'+encodeURIComponent(route.slug),{fromSongInfo:true})} />
    : route.kind === 'not-found' ? <AppShell title={'Page unavailable'} onBack={backToLibrary}>
      <section className="panel"><h2>{'Page unavailable'}</h2><p>Return to your library to choose a song.</p><button className="action" onClick={home}>Open Library</button></section>
    </AppShell>
    : <AppShell title="Library" onSettings={() => {saveLibraryView();navigate('/settings',{fromLibrary:true});}}>
      <LibraryScreen />
    </AppShell>}
  </>;
}
