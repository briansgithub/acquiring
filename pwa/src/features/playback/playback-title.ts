/** Pinned PlaybackDestination.playbackTitleText; displayed names never become identities. */
import type {Song} from '../../contracts';
import {displayTitle,displayArtist} from '../../domain/data';

export function playbackFullTitle(song:Pick<Song,'title'|'artist'>):string{
  const title=displayTitle(song.title);
  return song.artist?.trim()?`${title} by ${displayArtist(song.artist)}`:title;
}
