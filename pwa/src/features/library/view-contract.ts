import type {LibraryState} from './controller';
import type {SongBrowseRow} from './grouping';
import type {SongBrowseGroupCount,SongBrowseSortMode} from '../../storage/catalog/library-queries';
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
  browseGroupCounts(sortMode:SongBrowseSortMode,filterText?:string):Promise<SongBrowseGroupCount[]>;
  browseGroupSongs(sortMode:SongBrowseSortMode,groupKey:string,filterText?:string):Promise<SongBrowseRow[]>;
}
