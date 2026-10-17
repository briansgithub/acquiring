import {PlaybackScreen} from '../features/playback/PlaybackScreen';
import {SongScreen} from '../features/details/SongScreen';
import {LibraryScreen,libraryRouteState,saveLibraryView} from '../features/library/LibraryScreen';
import { useSyncExternalStore } from 'react';
import { CatalogPanel } from '../features/catalog/CatalogPanel';
import { AppShell } from '../ui/shell/AppShell';
import { navigate, parseRoute, subscribeRoute } from './routes';

export function App() {
  const pathname = useSyncExternalStore(subscribeRoute, () => location.pathname, () => '/');
  const route = parseRoute(pathname);
  const home = () => navigate('/',libraryRouteState());
  const backToLibrary = () => { if(history.state?.fromLibrary||history.state?.fromSong||history.state?.fromPlayback)history.back();else home(); };
  if (route.kind === 'settings') return <AppShell title="Settings" onBack={backToLibrary}>
    <CatalogPanel />
    <section className="panel"><h2>Appearance</h2><p>Dark theme</p></section>
    <button className="action" onClick={() => navigate('/help')}>Help</button>
  </AppShell>;
  if (route.kind === 'help') return <AppShell title="Help" onBack={() => navigate('/settings')}>
    <section className="panel"><h2>Acquiring</h2><p>Listen, practice and learn music.</p><p>Once downloaded, your catalogs and saved practice will be available offline on this device.</p></section>
  </AppShell>;
  if (route.kind === 'playback') return <PlaybackScreen key={route.slug} slug={route.slug} onBack={()=>{if(history.state?.fromSongInfo)history.back();else home();}} onHome={home} onDownload={()=>navigate('/settings',{fromPlayback:true})} />;
  if (route.kind === 'song') return <SongScreen key={route.slug} slug={route.slug} onBack={backToLibrary} onHome={home} onDownload={()=>navigate('/settings',{fromSong:true})} onPlay={()=>navigate('/playback/'+encodeURIComponent(route.slug),{fromSongInfo:true})} />;
  if (route.kind === 'not-found') return <AppShell title={'Page unavailable'} onBack={backToLibrary}>
    <section className="panel"><h2>{'Page unavailable'}</h2><p>Return to your library to choose a song.</p><button className="action" onClick={home}>Open Library</button></section>
  </AppShell>;
  return <AppShell title="Library" onSettings={() => {saveLibraryView();navigate('/settings',{fromLibrary:true});}}>
    <LibraryScreen />
  </AppShell>;
}
