import {useEffect,useState} from 'react';
import {displayArtist,displayTitle} from '../../domain/data';
import type {SongBrowseGroupCount} from '../../storage/catalog/library-queries';
import {alphabeticalGroups,toggledExpandedGroup,type SongBrowseRow} from './grouping';

interface AllSongsViewProps {
  alphabeticalGroupCounts(filterText?:string):Promise<SongBrowseGroupCount[]>;
  songsInAlphabeticalGroup(groupKey:string,filterText?:string):Promise<SongBrowseRow[]>;
  onBack():void;
  onOpenSong(row:SongBrowseRow):void;
}

/** Frozen AllSongsView.kt alphabetical-only: one expansion, counts, no complexity/mode/scrubber. */
export function AllSongsView({alphabeticalGroupCounts,songsInAlphabeticalGroup,onBack,onOpenSong}:AllSongsViewProps){
  const [counts,setCounts]=useState<ReadonlyMap<string,number>>(new Map());
  const [expanded,setExpanded]=useState<string|null>(null);
  const [songs,setSongs]=useState<SongBrowseRow[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    let cancelled=false;
    void alphabeticalGroupCounts('').then(rows=>{
      if(!cancelled)setCounts(new Map(rows.map(row=>[row.groupKey,row.songCount])));
    }).catch(()=>{if(!cancelled)setCounts(new Map());});
    return ()=>{cancelled=true;};
  },[alphabeticalGroupCounts]);

  useEffect(()=>{
    if(expanded===null){setSongs([]);setLoading(false);setError(null);return;}
    let cancelled=false;
    setLoading(true);setError(null);
    void songsInAlphabeticalGroup(expanded,'').then(rows=>{
      if(!cancelled){setSongs(rows);setError(null);}
    }).catch(caught=>{
      if(!cancelled){setSongs([]);setError(caught instanceof Error?caught.message:'Unable to load this group');}
    }).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[expanded,songsInAlphabeticalGroup]);

  return <div className="library-all-songs" data-all-songs="">
    <header className="library-all-songs-header">
      <button className="library-back" type="button" aria-label="Back to Library" onClick={onBack}>&lt; Back</button>
      <h2 id="library-heading">All Songs</h2>
    </header>
    <p className="library-all-songs-sort">Alphabetical</p>
    {alphabeticalGroups.map(group=>{
      const isExpanded=expanded===group.key;
      const count=counts.get(group.key);
      return <div className="library-all-songs-group" key={group.key}>
        <button className="library-playlist-row" type="button" data-all-songs-group={group.key}
          aria-expanded={isExpanded}
          aria-label={isExpanded?`Collapse ${group.label}`:`Expand ${group.label}`}
          onMouseDown={event=>event.preventDefault()}
          onClick={()=>setExpanded(toggledExpandedGroup(expanded,group.key))}>
          <span className="library-playlist-name">{group.label}</span>
          {count!==undefined&&<span className="library-playlist-count">{count}</span>}
          <span aria-hidden="true">{isExpanded?'▴':'▾'}</span>
        </button>
        {isExpanded&&<>
          {error&&<p className="library-playlist-error" role="alert">{error}</p>}
          {loading&&<p className="library-status" role="status" aria-live="polite">Loading songs...</p>}
          {!loading&&!error&&songs.length===0&&
            <p className="library-playlist-empty">No songs in this group</p>}
          {!loading&&!error&&songs.length>0&&
            <ul className="library-song-list" aria-label={group.label}>
              {songs.map(row=>{
                const title=displayTitle(row.title);
                return <li className="library-song" key={row.slug}>
                  <div className="library-song-copy">
                    <h3 className="library-song-title">
                      <button className="library-open-song" type="button" data-song-slug={row.slug} data-all-songs-slug={row.slug}
                        aria-label={`Open ${title}`}
                        onMouseDown={event=>event.preventDefault()}
                        onClick={()=>onOpenSong(row)}>{title}</button>
                    </h3>
                    <p className="library-song-artist">{displayArtist(row.artist)}</p>
                  </div>
                </li>;
              })}
            </ul>}
        </>}
      </div>;
    })}
  </div>;
}
