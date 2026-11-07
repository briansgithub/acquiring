import {useEffect,useState} from 'react';
import {displayArtist,displayTitle} from '../../domain/data';
import type {SongBrowseGroupCount,SongBrowseSortMode} from '../../storage/catalog/library-queries';
import {groupsFor,toggledExpandedGroup,type SongBrowseRow} from './grouping';

interface AllSongsViewProps {
  browseGroupCounts(sortMode:SongBrowseSortMode,filterText?:string):Promise<SongBrowseGroupCount[]>;
  browseGroupSongs(sortMode:SongBrowseSortMode,groupKey:string,filterText?:string):Promise<SongBrowseRow[]>;
  onBack():void;
  onOpenSong(row:SongBrowseRow):void;
}

const SORT_OPTIONS:readonly {mode:SongBrowseSortMode;label:string}[]=Object.freeze([
  {mode:'alphabetical',label:'Alphabetical'},
  {mode:'complexity',label:'Complexity'},
  {mode:'mode',label:'Mode'},
]);

const FILTER_DEBOUNCE_MS=250;

/** Frozen AllSongsView.kt: one expansion, counts, 250ms title/artist filter. Prefix scrubber later. */
export function AllSongsView({browseGroupCounts,browseGroupSongs,onBack,onOpenSong}:AllSongsViewProps){
  const [sortMode,setSortMode]=useState<SongBrowseSortMode>('alphabetical');
  const [filterText,setFilterText]=useState('');
  const [appliedFilter,setAppliedFilter]=useState('');
  const [counts,setCounts]=useState<ReadonlyMap<string,number>>(new Map());
  const [expanded,setExpanded]=useState<string|null>(null);
  const [songs,setSongs]=useState<SongBrowseRow[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const groups=groupsFor(sortMode);

  useEffect(()=>{
    const timer=window.setTimeout(()=>setAppliedFilter(filterText.trim()),FILTER_DEBOUNCE_MS);
    return ()=>window.clearTimeout(timer);
  },[filterText]);

  useEffect(()=>{
    let cancelled=false;
    void browseGroupCounts(sortMode,appliedFilter).then(rows=>{
      if(!cancelled)setCounts(new Map(rows.map(row=>[row.groupKey,row.songCount])));
    }).catch(()=>{if(!cancelled)setCounts(new Map());});
    return ()=>{cancelled=true;};
  },[browseGroupCounts,sortMode,appliedFilter]);

  useEffect(()=>{
    if(expanded===null){setSongs([]);setLoading(false);setError(null);return;}
    let cancelled=false;
    setLoading(true);setError(null);
    void browseGroupSongs(sortMode,expanded,appliedFilter).then(rows=>{
      if(!cancelled){setSongs(rows);setError(null);}
    }).catch(caught=>{
      if(!cancelled){setSongs([]);setError(caught instanceof Error?caught.message:'Unable to load this group');}
    }).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[browseGroupSongs,expanded,sortMode,appliedFilter]);

  return <div className="library-all-songs" data-all-songs="">
    <header className="library-all-songs-header">
      <button className="library-back" type="button" aria-label="Back to Library" onClick={onBack}>&lt; Back</button>
      <h2 id="library-heading">All Songs</h2>
    </header>
    <label className="library-all-songs-sort-label" htmlFor="library-all-songs-sort">Sort by</label>
    <select id="library-all-songs-sort" className="library-all-songs-sort" data-all-songs-sort="" value={sortMode}
      onChange={event=>{setExpanded(null);setSortMode(event.currentTarget.value as SongBrowseSortMode);}}>
      {SORT_OPTIONS.map(option=><option key={option.mode} value={option.mode}>{option.label}</option>)}
    </select>
    <label className="library-all-songs-sort-label" htmlFor="library-all-songs-filter">Filter songs</label>
    <div className="library-all-songs-filter-row">
      <input id="library-all-songs-filter" className="library-all-songs-filter" type="search" maxLength={512}
        data-all-songs-filter="" placeholder="Title or artist" value={filterText} autoComplete="off"
        onChange={event=>setFilterText(event.currentTarget.value)}/>
      {filterText.length>0&&<button className="library-clear-search" type="button"
        onMouseDown={event=>event.preventDefault()} onClick={()=>setFilterText('')}>Clear song filter</button>}
    </div>
    {groups.map(group=>{
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
            <p className="library-playlist-empty">{appliedFilter?'No songs match this filter':'No songs in this group'}</p>}
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
