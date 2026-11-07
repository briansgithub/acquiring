import {useEffect,useState} from 'react';
import {displayArtist,displayTitle} from '../../domain/data';
import type {SongBrowseRow} from './grouping';
import {openGuestHistoryStore} from './history-store';
import {songsForPlaylist} from './playlists';

interface RecentSelectionsProps {
  browseBySlugs(slugs:string[]):Promise<SongBrowseRow[]>;
  onOpenSong(row:SongBrowseRow):void;
}

/** Frozen LibrarySearchSuggestions.kt Recent Selections: focused empty search only, never on launch. */
export function RecentSelections({browseBySlugs,onOpenSong}:RecentSelectionsProps){
  const [songs,setSongs]=useState<SongBrowseRow[]>([]);

  useEffect(()=>{
    let cancelled=false,db:{close():void}|undefined;
    void (async()=>{
      const opened=await openGuestHistoryStore();
      if(cancelled||!opened)return;
      db=opened.db;
      try {
        const slugs=await opened.store.getRecentSlugs();
        const rows=slugs.length===0?[]:songsForPlaylist(slugs,await browseBySlugs(slugs));
        if(!cancelled)setSongs(rows);
      } catch {
        if(!cancelled)setSongs([]);
      }
    })();
    return ()=>{cancelled=true;db?.close();};
  },[browseBySlugs]);

  if(songs.length===0)return null;
  return <div className="library-recents" data-recent-selections="">
    <h3 className="library-recents-heading">Recent Selections</h3>
    <ul className="library-song-list" aria-label="Recent Selections">
      {songs.map(row=>{
        const title=displayTitle(row.title);
        return <li className="library-song" key={row.slug}>
          <div className="library-song-copy">
            <h3 className="library-song-title">
              <button className="library-open-song" type="button" data-song-slug={row.slug} data-recent-slug={row.slug}
                aria-label={`Open ${title}`}
                onMouseDown={event=>event.preventDefault()}
                onClick={()=>onOpenSong(row)}>{title}</button>
            </h3>
            <p className="library-song-artist">{displayArtist(row.artist)}</p>
          </div>
        </li>;
      })}
    </ul>
  </div>;
}
