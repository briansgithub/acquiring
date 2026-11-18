import {useEffect,useState} from 'react';
import {displayArtist,displayTitle} from '../../domain/data';
import {openGuestPlaylistStore,PLAYLIST_IDS,type PlaylistStore,type PlaylistSummary} from '../playback/playlist-store';
import {toggledExpandedGroup,type SongBrowseRow} from './grouping';
import {PLAYLIST_SONGS_MAX_HEIGHT_PX,PLAYLISTS_EMPTY_COPY,songsForPlaylist} from './playlists';
import {startSavedQueue} from './song-queue-host';

interface PlaylistsSectionProps {
  browseBySlugs(slugs:string[]):Promise<SongBrowseRow[]>;
  onOpenSong(row:SongBrowseRow):void;
}

export function PlaylistsSection({browseBySlugs,onOpenSong}:PlaylistsSectionProps){
  const [store,setStore]=useState<PlaylistStore|null>(null);
  // N14 (Android 25c3fee4): Favorites opens under the search buttons by default; there is no Playlists accordion.
  const sectionExpanded=true;
  const [expandedPlaylistId,setExpandedPlaylistId]=useState<string|null>(PLAYLIST_IDS.FAVORITES);
  const [summaries,setSummaries]=useState<PlaylistSummary[]>([]);
  const [songs,setSongs]=useState<SongBrowseRow[]>([]);
  const [loadingSongs,setLoadingSongs]=useState(false);
  const [loadError,setLoadError]=useState<string|null>(null);
  const [revision,setRevision]=useState(0);

  useEffect(()=>{
    let closed=false,db:{close():void}|undefined;
    void openGuestPlaylistStore().then(opened=>{
      if(closed||!opened)return;
      db=opened.db;setStore(opened.store);
    });
    return ()=>{closed=true;db?.close();};
  },[]);

  useEffect(()=>{
    if(!store||!sectionExpanded)return;
    let cancelled=false;
    void (async()=>{
      try {
        await store.ensureBuiltInPlaylist(PLAYLIST_IDS.FAVORITES,PLAYLIST_IDS.FAVORITES_NAME,Date.now());
        const next=await store.getSummaries();
        if(!cancelled)setSummaries(next);
      } catch {
        if(!cancelled)setSummaries([]);
      }
    })();
    return ()=>{cancelled=true;};
  },[store,sectionExpanded,revision]);

  useEffect(()=>{
    if(!store||expandedPlaylistId===null){
      setSongs([]);setLoadingSongs(false);setLoadError(null);return;
    }
    let cancelled=false;
    setLoadingSongs(true);setLoadError(null);
    void (async()=>{
      try {
        const slugs=await store.getSlugsIn(expandedPlaylistId);
        const rows=slugs.length===0?[]:songsForPlaylist(slugs,await browseBySlugs(slugs));
        if(!cancelled){setSongs(rows);setLoadError(null);}
      } catch(error){
        if(!cancelled){setSongs([]);setLoadError(error instanceof Error?error.message:'Unable to load this playlist');}
      } finally {if(!cancelled)setLoadingSongs(false);}
    })();
    return ()=>{cancelled=true;};
  },[store,expandedPlaylistId,revision,browseBySlugs]);

  const ordered=[...summaries].sort((a,b)=>Number(b.id===PLAYLIST_IDS.FAVORITES)-Number(a.id===PLAYLIST_IDS.FAVORITES));
  return <div className="library-playlists" data-playlists-section="">
    {ordered.map(summary=>{
      const expanded=expandedPlaylistId===summary.id;
      const favorites=summary.id===PLAYLIST_IDS.FAVORITES;
      return <div key={summary.id} className={'library-playlist'+(favorites?' library-favorites-box':'')+(expanded?' library-playlist--open':'')}
        data-favorites-box={favorites?'':undefined}>
        <button className="library-playlist-row" type="button" aria-expanded={expanded}
          aria-label={expanded?`Collapse ${summary.name}`:`Expand ${summary.name}`}
          onClick={()=>setExpandedPlaylistId(toggledExpandedGroup(expandedPlaylistId,summary.id))}>
          <span className="library-playlist-name">{summary.name}</span>
          <span className="library-playlist-count">{summary.songCount}</span>
          <span aria-hidden="true">{expanded?'▴':'▾'}</span>
        </button>
        {expanded&&<>
          {summary.songCount>0&&<div className="library-queue-actions">
            <button className="library-back" type="button" disabled={!store} aria-label="Play playlist"
              onMouseDown={event=>event.preventDefault()}
              onClick={()=>{if(store)void startSavedQueue(store,browseBySlugs,summary.id,false);}}>Play</button>
            <button className="library-back" type="button" disabled={!store} aria-label="Shuffle play playlist"
              onMouseDown={event=>event.preventDefault()}
              onClick={()=>{if(store)void startSavedQueue(store,browseBySlugs,summary.id,true);}}>Shuffle play</button>
          </div>}
          {loadError&&<p className="library-playlist-error" role="alert">{loadError}</p>}
          {loadingSongs&&<p className="library-status" role="status" aria-live="polite">Loading playlist...</p>}
          {!loadingSongs&&!loadError&&songs.length===0&&
            <p className="library-playlist-empty">{PLAYLISTS_EMPTY_COPY}</p>}
          {!loadingSongs&&!loadError&&songs.length>0&&
            <ul className="library-playlist-songs library-compact-list" aria-label={summary.name} data-library-scroll={favorites?'favorites':undefined}
              style={favorites?undefined:{maxHeight:PLAYLIST_SONGS_MAX_HEIGHT_PX}}>
              {songs.map(row=>{
                const title=displayTitle(row.title);
                return <li className="library-song" key={row.slug}>
                  <div className="library-song-copy">
                    <h3 className="library-song-title">
                      <button className="library-open-song" type="button" data-song-slug={row.slug}
                        aria-label={`Open ${title}`} onClick={()=>onOpenSong(row)}>{title}</button>
                    </h3>
                    <p className="library-song-artist">{displayArtist(row.artist)}</p>
                  </div>
                  <button className="library-playlist-unstar" type="button"
                    aria-label={`Remove ${title} from ${summary.name}`}
                    onClick={()=>{void store?.removeEntry(summary.id,row.slug).then(()=>setRevision(n=>n+1));}}>★</button>
                </li>;
              })}
            </ul>}
        </>}
      </div>;
    })}
  </div>;
}
