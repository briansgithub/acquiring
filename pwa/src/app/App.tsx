import { useSyncExternalStore } from 'react';
import { CatalogPanel } from '../features/catalog/CatalogPanel';
import { AppShell } from '../ui/shell/AppShell';
import { navigate, parseRoute, subscribeRoute } from './routes';

export function App() {
  const pathname = useSyncExternalStore(subscribeRoute, () => location.pathname, () => '/');
  const route = parseRoute(pathname);
  const home = () => navigate('/');
  if (route.kind === 'settings') return <AppShell title="Settings" onBack={home}>
    <CatalogPanel />
    <section className="panel"><h2>Appearance</h2><p>Dark theme</p></section>
    <button className="action" onClick={() => navigate('/help')}>Help</button>
  </AppShell>;
  if (route.kind === 'help') return <AppShell title="Help" onBack={() => navigate('/settings')}>
    <section className="panel"><h2>Acquiring</h2><p>Listen, practice and learn music.</p><p>Once downloaded, your catalogs and saved practice will be available offline on this device.</p></section>
  </AppShell>;
  if (route.kind === 'song' || route.kind === 'not-found') return <AppShell title={route.kind === 'song' ? 'Song' : 'Page unavailable'} onBack={home}>
    <section className="panel"><h2>{route.kind === 'song' ? 'Song unavailable' : 'Page unavailable'}</h2><p>Return to your library to choose a song.</p><button className="action" onClick={home}>Open Library</button></section>
  </AppShell>;
  return <AppShell title="Library" onSettings={() => navigate('/settings')}>
    <section className="empty-library"><h2>No songs yet</h2><p>Your downloaded songs and saved playlists will appear here.</p><button className="action" onClick={() => navigate('/settings')}>Download catalogs</button></section>
  </AppShell>;
}
