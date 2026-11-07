import type {LibraryState} from './controller';
import type {SongBrowseRow} from './grouping';
import type {SongBrowseGroupCount} from '../../storage/catalog/library-queries';
/** Frozen local presentation contract; lifecycle and navigation belong to the coordinator. */
export interface LibraryContentProps {
  state:LibraryState;
  onSearch(text:string):void;
  onArtist(artist:string):void;
  onClearArtist():void;
  onLoadMore():void;
  onRetry():void;
  onDownload():void;
  onOpenSong(row:SongBrowseRow):void;
  browseBySlugs(slugs:string[]):Promise<SongBrowseRow[]>;
  alphabeticalGroupCounts(filterText?:string):Promise<SongBrowseGroupCount[]>;
  songsInAlphabeticalGroup(groupKey:string,filterText?:string):Promise<SongBrowseRow[]>;
}
