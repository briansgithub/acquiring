import {alphabeticalGroups,complexityGroups,modeGroups,UNRATED_KEY,type AllSongsSortMode,type SongBrowseRow} from '../../features/library/grouping';
import { CatalogError } from './protocol';

export interface SongPageRequest { mode:'search'|'artist'|'artistSearch'; text:string; limit?:number; offset?:number }
export interface SongPage { sourceSnapshot:string; rows:SongBrowseRow[]; hasMore:boolean; nextOffset:number|null }
export interface ArtistSuggestionsRequest { query:string; limit?:number; offset?:number }
export interface ArtistSuggestionsPage { sourceSnapshot:string; names:string[]; hasMore:boolean; nextOffset:number|null }
export interface SongBrowseGroupCount { groupKey:string; songCount:number }
export const MAX_SONG_PAGE_SIZE=100;
export const MAX_SONG_QUERY_LENGTH=512;
export const MAX_BROWSE_SLUGS=1000;
export type SongBrowseSortMode=AllSongsSortMode;
const SORT_MODES=new Set<SongBrowseSortMode>(['alphabetical','complexity','mode']);
const ALPHA_GROUP_KEYS=new Set(alphabeticalGroups.map(group=>group.key));
const COMPLEXITY_GROUP_KEYS=new Set(complexityGroups.map(group=>group.key));
const MODE_GROUP_KEYS=new Set(modeGroups.map(group=>group.key));
const TITLE_ORDER=`CASE WHEN title IS NULL OR TRIM(title) = '' THEN 1 ELSE 0 END, title COLLATE NOCASE, artist COLLATE NOCASE, slug COLLATE NOCASE, slug`;
const ENTRY_TITLE_ORDER=`CASE WHEN entries.title IS NULL OR TRIM(entries.title) = '' THEN 1 ELSE 0 END, entries.title COLLATE NOCASE, entries.artist COLLATE NOCASE, entries.slug COLLATE NOCASE, entries.slug`;
/** Frozen SongDao BROWSE_FILTER_SQL: title/artist INSTR after stripping space/hyphen/underscore. */
const BROWSE_FILTER_SQL=`(
  TRIM(?) = '' OR
  INSTR(REPLACE(REPLACE(REPLACE(LOWER(COALESCE(title, '')), ' ', ''), '-', ''), '_', ''),
    REPLACE(REPLACE(REPLACE(LOWER(TRIM(?)), ' ', ''), '-', ''), '_', '')) > 0 OR
  INSTR(REPLACE(REPLACE(REPLACE(LOWER(COALESCE(artist, '')), ' ', ''), '-', ''), '_', ''),
    REPLACE(REPLACE(REPLACE(LOWER(TRIM(?)), ' ', ''), '-', ''), '_', '')) > 0
)`;

export function mapSongBrowseRows(records:readonly Record<string,unknown>[]):SongBrowseRow[] {
  return records.map(row=>({slug:String(row.slug),artist:row.artist==null?null:String(row.artist),title:row.title==null?null:String(row.title),complexityRating:null}));
}

export function mapBrowseEntryRows(records:readonly Record<string,unknown>[]):SongBrowseRow[] {
  return records.map(row=>{
    const rating=row.complexityRating;
    return {slug:String(row.slug),artist:row.artist==null?null:String(row.artist),title:row.title==null?null:String(row.title),
      complexityRating:typeof rating==='number'&&Number.isFinite(rating)?rating:null};
  });
}

export function mapGroupCounts(records:readonly Record<string,unknown>[]):SongBrowseGroupCount[] {
  return records.map(row=>({groupKey:String(row.groupKey),songCount:Number(row.songCount)}));
}

function browseFilter(text:unknown):string {
  if(typeof text!=='string'||text.length>MAX_SONG_QUERY_LENGTH||text.includes('\0')) {
    throw new CatalogError('INVALID_REQUEST','Invalid song browse filter');
  }
  return text;
}

/** Frozen SongDao.getBrowseSongsBySlugs: IN-list, no payload filter; missing slugs return no row. */
export function songBrowseBySlugsQuery(slugs:readonly string[]):{sql:string;bind:string[]} {
  if(!Array.isArray(slugs)||slugs.length>MAX_BROWSE_SLUGS)throw new CatalogError('INVALID_REQUEST','Invalid song slug list');
  for(const slug of slugs){
    if(typeof slug!=='string'||!slug||slug.length>MAX_SONG_QUERY_LENGTH||slug.includes('\0'))throw new CatalogError('INVALID_REQUEST','Invalid song slug list');
  }
  if(slugs.length===0)return {sql:'SELECT slug,artist,title,NULL AS complexityRating FROM songs WHERE 0',bind:[]};
  return {sql:`SELECT slug,artist,title,NULL AS complexityRating FROM songs WHERE slug IN (${slugs.map(()=>'?').join(',')})`,bind:[...slugs]};
}

function pageBounds(limit:unknown,offset:unknown):{limit:number;offset:number} {
  const size=limit===undefined?20:limit,start=offset===undefined?0:offset;
  if(typeof size!=='number'||!Number.isInteger(size)||size<1||size>MAX_SONG_PAGE_SIZE
    ||typeof start!=='number'||!Number.isInteger(start)||start<0||start>1_000_000) {
    throw new CatalogError('INVALID_REQUEST','Invalid song page bounds');
  }
  return {limit:size,offset:start};
}

/** Fixed projections from native SongDao; no chord payload ever crosses this RPC. */
export function songPageQuery(request:SongPageRequest):{sql:string;bind:(string|number)[];limit:number;offset:number} {
  if(!request||typeof request!=='object'||!['search','artist','artistSearch'].includes(request.mode)
    ||typeof request.text!=='string'||request.text.length>MAX_SONG_QUERY_LENGTH||request.text.includes('\0')) {
    throw new CatalogError('INVALID_REQUEST','Invalid song page query');
  }
  const {limit,offset}=pageBounds(request.limit,request.offset);
  if(request.mode==='artistSearch'&&!request.text.trim())throw new CatalogError('INVALID_REQUEST','Invalid song page query');
  const condition=request.mode==='search'
    ? "(REPLACE(title, '-', ' ') LIKE '%' || REPLACE(TRIM(?), '-', ' ') || '%' OR REPLACE(artist, '-', ' ') LIKE '%' || REPLACE(TRIM(?), '-', ' ') || '%')"
    : request.mode==='artistSearch'
      ? "REPLACE(artist, '-', ' ') LIKE '%' || REPLACE(TRIM(?), '-', ' ') || '%'"
      : "REPLACE(artist, '-', ' ') = REPLACE(?, '-', ' ')";
  const bind:(string|number)[]=request.mode==='search'?[request.text,request.text]:[request.text];
  const artistOrder=request.mode==='artist'?'':'artist COLLATE NOCASE,';
  return {
    sql:`SELECT slug,artist,title,NULL AS complexityRating FROM songs
      WHERE dataBlob IS NOT NULL AND ${condition}
      ORDER BY CASE WHEN title IS NULL OR TRIM(title) = '' THEN 1 ELSE 0 END,
        title COLLATE NOCASE,${artistOrder}slug COLLATE NOCASE,slug LIMIT ? OFFSET ?`,
    bind:[...bind,limit+1,offset],limit,offset,
  };
}

/** Frozen SongDao.getArtistSuggestions. ORDER BY COLLATE NOCASE is a paging-stability extension; native SQL is unordered DISTINCT. Local catalog worker only — not a remote deploy. */
export function artistSuggestionsQuery(request:ArtistSuggestionsRequest):{sql:string;bind:(string|number)[];limit:number;offset:number} {
  if(!request||typeof request!=='object'||typeof request.query!=='string'
    ||!request.query.trim()||request.query.length>MAX_SONG_QUERY_LENGTH||request.query.includes('\0')) {
    throw new CatalogError('INVALID_REQUEST','Invalid artist suggestions query');
  }
  const {limit,offset}=pageBounds(request.limit,request.offset);
  return {
    sql:`SELECT DISTINCT REPLACE(artist, '-', ' ') AS artistName FROM songs
      WHERE dataBlob IS NOT NULL AND artist IS NOT NULL
        AND REPLACE(artist, '-', ' ') LIKE '%' || REPLACE(TRIM(?), '-', ' ') || '%'
      ORDER BY artistName COLLATE NOCASE,artistName LIMIT ? OFFSET ?`,
    bind:[request.query,limit+1,offset],limit,offset,
  };
}

function browseSortMode(sortMode:unknown):SongBrowseSortMode {
  if(typeof sortMode!=='string'||!SORT_MODES.has(sortMode as SongBrowseSortMode)) {
    throw new CatalogError('INVALID_REQUEST','Invalid All Songs sort mode');
  }
  return sortMode as SongBrowseSortMode;
}

function filterBind(filterText:unknown):string[] {
  const text=browseFilter(filterText??'');
  return [text,text,text];
}

/** Frozen SongDao.getAlphabeticalGroupCounts / getComplexityGroupCounts / getModeGroupCounts. */
export function browseGroupCountsQuery(sortMode:unknown,filterText:unknown):{sql:string;bind:string[]} {
  const mode=browseSortMode(sortMode),bind=filterBind(filterText);
  if(mode==='alphabetical') {
    return {sql:`SELECT alphaGroup AS groupKey, COUNT(*) AS songCount FROM song_browse_entries WHERE ${BROWSE_FILTER_SQL} GROUP BY alphaGroup`,bind};
  }
  if(mode==='complexity') {
    return {sql:`SELECT COALESCE(CAST(complexityBucket AS TEXT), '${UNRATED_KEY}') AS groupKey, COUNT(*) AS songCount FROM song_browse_entries WHERE ${BROWSE_FILTER_SQL} GROUP BY complexityBucket`,bind};
  }
  return {sql:`SELECT modes.mode AS groupKey, COUNT(*) AS songCount FROM song_browse_modes AS modes INNER JOIN song_browse_entries AS entries ON entries.slug = modes.slug WHERE ${BROWSE_FILTER_SQL} GROUP BY modes.mode`,bind};
}

/** Frozen SongDao membership for one All Songs heading. */
export function browseGroupSongsQuery(sortMode:unknown,groupKey:unknown,filterText:unknown):{sql:string;bind:(string|number)[]} {
  const mode=browseSortMode(sortMode),filter=filterBind(filterText);
  if(typeof groupKey!=='string')throw new CatalogError('INVALID_REQUEST','Invalid All Songs group');
  if(mode==='alphabetical') {
    if(!ALPHA_GROUP_KEYS.has(groupKey))throw new CatalogError('INVALID_REQUEST','Invalid alphabetical group');
    return {sql:`SELECT slug,artist,title,complexityRating FROM song_browse_entries WHERE alphaGroup = ? AND ${BROWSE_FILTER_SQL} ORDER BY ${TITLE_ORDER}`,bind:[groupKey,...filter]};
  }
  if(mode==='complexity') {
    if(!COMPLEXITY_GROUP_KEYS.has(groupKey))throw new CatalogError('INVALID_REQUEST','Invalid complexity group');
    if(groupKey===UNRATED_KEY) {
      return {sql:`SELECT slug,artist,title,complexityRating FROM song_browse_entries WHERE complexityBucket IS NULL AND ${BROWSE_FILTER_SQL} ORDER BY ${TITLE_ORDER}`,bind:filter};
    }
    return {sql:`SELECT slug,artist,title,complexityRating FROM song_browse_entries WHERE complexityBucket = ? AND ${BROWSE_FILTER_SQL} ORDER BY complexityRating ASC, ${TITLE_ORDER}`,bind:[Number(groupKey),...filter]};
  }
  if(!MODE_GROUP_KEYS.has(groupKey))throw new CatalogError('INVALID_REQUEST','Invalid mode group');
  return {sql:`SELECT entries.slug,entries.artist,entries.title,entries.complexityRating FROM song_browse_entries AS entries INNER JOIN song_browse_modes AS modes ON modes.slug = entries.slug WHERE modes.mode = ? AND ${BROWSE_FILTER_SQL} ORDER BY ${ENTRY_TITLE_ORDER}`,bind:[groupKey,...filter]};
}

