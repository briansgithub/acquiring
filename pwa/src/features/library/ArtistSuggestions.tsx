import {displayArtist} from '../../domain/data';

export function ArtistSuggestions({query,names,recent,onSelect,onLoadMore,hasMore}:{
  query:string;
  names:string[];
  recent:boolean;
  onSelect(name:string):void;
  onLoadMore():void;
  hasMore:boolean;
}){
  const trimmed=query.trim();
  if(recent&&names.length===0)return null;
  return <div className="library-artist-suggestions" data-artist-suggestions="">
    {recent
      ? <h3 className="library-recents-heading">Recent Artists</h3>
      : names.length===0&&trimmed
        ? <p className="library-status">No artists matching '{trimmed}'</p>
        : null}
    {names.length>0&&<ul className="library-song-list" aria-label={recent?'Recent Artists':'Artist suggestions'}>
      {names.map((name)=>
        <li className="library-song" key={name}>
          <button className="library-open-song" type="button" data-artist-suggestion={name}
            aria-label={`Songs by ${displayArtist(name)}`}
            onMouseDown={(event)=>event.preventDefault()}
            onClick={()=>onSelect(name)}>{displayArtist(name)}</button>
        </li>)}
    </ul>}
    {hasMore&&<button className="library-load-more" type="button"
      onMouseDown={(event)=>event.preventDefault()} onClick={onLoadMore}>Load more artists</button>}
  </div>;
}
