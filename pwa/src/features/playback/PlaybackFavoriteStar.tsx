import type {FavoriteSnapshot} from './favorites-session';

export function PlaybackFavoriteStar({snapshot,onToggle}:{snapshot:FavoriteSnapshot;onToggle:()=>void}){
  return <>
    <button type="button" className="action playback-favorite" aria-pressed={snapshot.favorite}
      aria-label={snapshot.favorite?'Remove from Favorites':'Add to Favorites'}
      data-playback-favorite={String(snapshot.favorite)} onClick={onToggle}>{snapshot.favorite?'★':'☆'}</button>
    {snapshot.confirmation&&<p className="playback-favorited" role="status" data-favorited-confirmation="">Favorited</p>}
  </>;
}
