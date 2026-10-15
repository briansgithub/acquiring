import { useEffect, useSyncExternalStore } from 'react';
import { catalogInstaller } from './installer';
import './catalog.css';
const names = { songs: 'Song library', aural: 'Aural practice' };
export function CatalogPanel() {
  const state = useSyncExternalStore(catalogInstaller.subscribe, catalogInstaller.getSnapshot);
  useEffect(() => { void catalogInstaller.refresh(); }, []);
  return <section className="panel" aria-labelledby="catalogs-heading">
    <h2 id="catalogs-heading">Catalogs</h2>
    <p>Download catalogs to keep them on this device. Downloads can be paused and resumed.</p>
    {state.loading && <p role="status">Checking catalogs…</p>}
    {state.sourceMessage && <p>{state.sourceMessage}</p>}
    {state.catalogs.map(card => {
      const name = names[card.kind];
      const running = ['checking','downloading','activating'].includes(card.phase);
      const retry = card.phase === 'paused' || card.phase === 'error';
      const action = card.installed ? 'Check for update' : retry ? 'Resume download' : 'Download';
      return <article className="catalog-card" key={card.kind} aria-labelledby={'catalog-' + card.kind}>
        <h3 id={'catalog-' + card.kind}>{name}</h3>
        <p>{card.installed ? card.installed.confirmed ? 'Available offline' : 'Downloaded and verified' : 'Not installed'}</p>
        {card.phase === 'checking' && <p role="status">Preparing download…</p>}
        {card.phase === 'activating' && <p role="status">Finishing verification…</p>}
        {card.phase === 'downloading' && card.total > 0 && <div>
          <progress aria-label={name + ' download'} value={Math.min(card.bytes,card.total)} max={card.total} />
          <p>{Math.min(100,Math.floor(card.bytes / card.total * 100))}%</p>
        </div>}
        {card.message && <p role="status">{card.message}</p>}
        <button className="action" disabled={!card.source || state.loading || state.busy} aria-label={action + ' ' + name.toLowerCase()} onClick={() => { void catalogInstaller.install(card.kind); }}>{action}</button>
        {running && <button className="action" aria-label={'Pause ' + name.toLowerCase() + ' download'} onClick={() => catalogInstaller.pause()}>Pause</button>}
      </article>;
    })}
    <button className="action" disabled={state.loading || state.busy} onClick={() => { void catalogInstaller.refresh(); }}>Refresh catalog availability</button>
  </section>;
}
