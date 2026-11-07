import {useEffect,useRef,useState} from 'react';
import {openGuestHistoryStore} from './history-store';
import {ArtistSuggestions} from './ArtistSuggestions';
import type {ArtistSuggestionsPage} from '../../storage/catalog/library-queries';

export type LibrarySearchScope='songs'|'artists';

export function LibrarySearchPanel({text,searchFocused,onSearchFocused,onSearch,onSearchArtistSongs,onArtist,artistSuggestions,onScopeChange}:{
  text:string;
  searchFocused:boolean;
  onSearchFocused(focused:boolean):void;
  onSearch(text:string):void;
  onSearchArtistSongs(text:string):void;
  onArtist(artist:string):void;
  artistSuggestions(query:string,limit?:number,offset?:number):Promise<ArtistSuggestionsPage>;
  onScopeChange(scope:LibrarySearchScope):void;
}){
  const [scope,setScope]=useState<LibrarySearchScope>('songs');
  const [artistQuery,setArtistQuery]=useState('');
  const [names,setNames]=useState<string[]>([]);
  const [recent,setRecent]=useState(false);
  const [hasMore,setHasMore]=useState(false);
  const [offset,setOffset]=useState(0);
  const generation=useRef(0);
  const songs=scope==='songs';
  const trimmed=artistQuery.trim();

  useEffect(()=>{
    if(songs||!searchFocused){setNames([]);setRecent(false);setHasMore(false);return;}
    const gen=++generation.current;
    if(!trimmed){
      let closed=false,db:{close():void}|undefined;
      void openGuestHistoryStore().then(async(opened)=>{
        if(closed||!opened)return;
        db=opened.db;
        try {
          const recents=await opened.store.getRecentArtists();
          if(!closed&&gen===generation.current){setNames(recents);setRecent(recents.length>0);setHasMore(false);setOffset(0);}
        } catch {
          if(!closed&&gen===generation.current){setNames([]);setRecent(false);}
        }
      });
      return ()=>{closed=true;db?.close();};
    }
    const timer=window.setTimeout(()=>{
      void artistSuggestions(artistQuery,20,0).then((page)=>{
        if(gen!==generation.current)return;
        setNames(page.names);setRecent(false);setHasMore(page.hasMore);setOffset(page.nextOffset??page.names.length);
      },()=>{if(gen===generation.current){setNames([]);setRecent(false);setHasMore(false);}});
    },200);
    return ()=>window.clearTimeout(timer);
  },[songs,searchFocused,artistQuery,trimmed,artistSuggestions]);

  function loadMore(){
    if(!hasMore||!trimmed)return;
    const gen=generation.current;
    void artistSuggestions(artistQuery,20,offset).then((page)=>{
      if(gen!==generation.current)return;
      setNames((current)=>[...current,...page.names]);
      setHasMore(page.hasMore);
      setOffset(page.nextOffset??offset+page.names.length);
    });
  }

  return <>
    <h2 id="library-heading">Songs</h2>
    <label className="library-search-label" htmlFor={songs?'library-song-search':'library-artist-search'}>
      {songs?'Search songs':'Search artists'}
    </label>
    <div className="library-search-row">
      {songs
        ? <input id="library-song-search" className="library-search-input" type="search" maxLength={512}
            data-library-search value={text} autoComplete="off"
            onChange={(event)=>onSearch(event.currentTarget.value)}
            onFocus={()=>onSearchFocused(true)} onBlur={()=>onSearchFocused(false)}/>
        : <input id="library-artist-search" className="library-search-input" type="search" maxLength={512}
            data-library-artist-search value={artistQuery} autoComplete="off"
            onChange={(event)=>setArtistQuery(event.currentTarget.value.replace('\n',''))}
            onFocus={()=>onSearchFocused(true)} onBlur={()=>onSearchFocused(false)}/>}
      <button className="library-clear-search" type="button"
        onMouseDown={(event)=>event.preventDefault()}
        onClick={()=>{onSearchFocused(false);if(songs)onSearch('');else setArtistQuery('');}}>Clear search</button>
    </div>
    <div className="library-search-scopes" role="group" aria-label="Library search scope">
      <button type="button" className="library-search-scope" data-library-search-scope="songs" aria-pressed={songs}
        onMouseDown={(event)=>event.preventDefault()} onClick={()=>{setScope('songs');onScopeChange('songs');}}>Songs</button>
      <button type="button" className="library-search-scope" data-library-search-scope="artists" aria-pressed={!songs}
        onMouseDown={(event)=>event.preventDefault()} onClick={()=>{setScope('artists');onScopeChange('artists');}}>Artists</button>
    </div>
    {!songs&&<button className="library-primary-action" type="button" data-library-artist-search-submit=""
      onMouseDown={(event)=>event.preventDefault()}
      onClick={()=>{onSearchFocused(false);onSearchArtistSongs(artistQuery);}}>Search</button>}
    {!songs&&searchFocused&&<ArtistSuggestions query={artistQuery} names={names} recent={recent} hasMore={hasMore}
      onSelect={onArtist} onLoadMore={loadMore}/>}
  </>;
}
