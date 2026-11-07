/** Song browse RPCs against one readonly withSongs handle. Worker stays dispatch-only. */
import type {SongBrowseRow} from '../../features/library/grouping';
import {
  alphabeticalGroupCountsQuery,
  mapBrowseEntryRows,
  mapGroupCounts,
  mapSongBrowseRows,
  songBrowseBySlugsQuery,
  songPageQuery,
  songsInAlphabeticalGroupQuery,
  type SongBrowseGroupCount,
  type SongPage,
  type SongPageRequest,
} from './library-queries';

export interface SongReadDb {
  selectObjects(sql:string,bind?:(string|number)[]):Record<string,unknown>[];
}
export type WithSongs=<T>(read:(db:SongReadDb,source:{id:string;sourceSnapshot:string})=>T)=>Promise<T>;

export function songPage(withSongs:WithSongs,request:SongPageRequest):Promise<SongPage> {
  const plan=songPageQuery(request);
  return withSongs((db,source)=>{
    const records=db.selectObjects(plan.sql,plan.bind);
    const hasMore=records.length>plan.limit;
    const rows=mapSongBrowseRows(records.slice(0,plan.limit));
    return {sourceSnapshot:source.sourceSnapshot,rows,hasMore,nextOffset:hasMore?plan.offset+rows.length:null};
  });
}

export function songBrowseBySlugs(withSongs:WithSongs,slugs:string[]):Promise<SongBrowseRow[]> {
  const plan=songBrowseBySlugsQuery(slugs);
  return withSongs(db=>mapSongBrowseRows(db.selectObjects(plan.sql,plan.bind)));
}

export function songAlphabeticalGroupCounts(withSongs:WithSongs,filterText:string):Promise<SongBrowseGroupCount[]> {
  const plan=alphabeticalGroupCountsQuery(filterText);
  return withSongs(db=>mapGroupCounts(db.selectObjects(plan.sql,plan.bind)));
}

export function songSongsInAlphabeticalGroup(withSongs:WithSongs,groupKey:string,filterText:string):Promise<SongBrowseRow[]> {
  const plan=songsInAlphabeticalGroupQuery(groupKey,filterText);
  return withSongs(db=>mapBrowseEntryRows(db.selectObjects(plan.sql,plan.bind)));
}
