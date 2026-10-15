import { displayArtist, displayTitle } from '../../domain/data';
import type { SongBrowseRow } from './grouping';
import type { LibraryContentProps } from './view-contract';
import './library.css';

export function LibraryContent({
  state,
  onSearch,
  onArtist,
  onClearArtist,
  onLoadMore,
  onRetry,
  onDownload,
  onOpenSong,
}: LibraryContentProps) {
  const browsingArtist = state.artist !== null;
  const hasSearch = state.text.trim().length > 0;
  const loading = state.phase === 'loading';
  const noResultsLabel = browsingArtist
    ? 'No songs by this artist.'
    : hasSearch
      ? 'No matching songs.'
      : 'No songs are available yet.';

  const renderSong = (row: SongBrowseRow) => {
    const title = displayTitle(row.title);
    const artist = displayArtist(row.artist);
    const rawArtist = row.artist;
    return <li className="library-song" key={row.slug}>
      <div className="library-song-copy">
        <h3 className="library-song-title">
          <button
            className="library-open-song"
            type="button"
            data-song-slug={row.slug}
            aria-label={`Open ${title}`}
            onClick={() => onOpenSong(row)}
          >{title}</button>
        </h3>
        <p className="library-song-artist">{artist}</p>
      </div>
      {rawArtist !== null && <button
        className="library-artist-action"
        type="button"
        aria-label={`Songs by ${artist}`}
        onClick={() => onArtist(rawArtist)}
      >Songs by artist</button>}
    </li>;
  };

  return <section className="library-content" aria-labelledby="library-heading" aria-busy={loading || state.loadingMore}>
    <header className="library-header">
      {browsingArtist ? <>
        <button className="library-back" type="button" onClick={onClearArtist}>Back to search</button>
        <h1 id="library-heading">{displayArtist(state.artist)}</h1>
      </> : <>
        <h1 id="library-heading">Songs</h1>
        <label className="library-search-label" htmlFor="library-song-search">Search songs</label>
        <div className="library-search-row">
          <input
            id="library-song-search"
            className="library-search-input"
            type="search"
            maxLength={512}
            data-library-search
            value={state.text}
            onChange={event => onSearch(event.currentTarget.value)}
            autoComplete="off"
          />
          <button className="library-clear-search" type="button" onClick={() => onSearch('')}>Clear search</button>
        </div>
      </>}
    </header>

    {loading && <p className="library-status" role="status" aria-live="polite">Loading songs...</p>}

    {state.phase === 'missing' && <div className="library-message">
      <h2>No songs yet</h2>
      <p>Download catalogs to browse songs.</p>
      <button className="library-primary-action" type="button" onClick={onDownload}>Download catalogs</button>
    </div>}

    {state.phase === 'error' && <div className="library-message" role="alert">
      <p>{state.message ?? 'Songs could not be loaded. Try again.'}</p>
      <button className="library-primary-action" type="button" onClick={onRetry}>Retry</button>
    </div>}

    {state.phase === 'ready' && state.rows.length === 0 && <div className="library-message">
      <h2>{noResultsLabel}</h2>
      {(hasSearch || browsingArtist) && <p>Try another search or browse the available catalogs.</p>}
      <button className="library-primary-action" type="button" onClick={onDownload}>Download catalogs</button>
    </div>}

    {state.rows.length > 0 && <ul className="library-song-list" aria-label="Songs">
      {state.rows.map(renderSong)}
    </ul>}

    {state.phase === 'ready' && state.nextOffset !== null && <div className="library-pagination">
      <button className="library-load-more" type="button" disabled={state.loadingMore} onClick={onLoadMore}>
        {state.loadingMore ? 'Loading more...' : 'Load more songs'}
      </button>
      {state.loadingMore && <p className="library-status" role="status" aria-live="polite">Loading more songs...</p>}
    </div>}
  </section>;
}
