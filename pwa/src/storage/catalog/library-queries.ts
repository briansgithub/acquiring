import type { SongBrowseRow } from '../../features/library/grouping';
import { CatalogError } from './protocol';

export interface SongPageRequest { mode:'search'|'artist'; text:string; limit?:number; offset?:number }
export interface SongPage { sourceSnapshot:string; rows:SongBrowseRow[]; hasMore:boolean; nextOffset:number|null }
export const MAX_SONG_PAGE_SIZE=100;
export const MAX_SONG_QUERY_LENGTH=512;
export const MAX_BROWSE_SLUGS=1000;

export function mapSongBrowseRows(records:readonly Record<string,unknown>[]):SongBrowseRow[] {
  return records.map(row=>({slug:String(row.slug),artist:row.artist==null?null:String(row.artist),title:row.title==null?null:String(row.title),complexityRating:null}));
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

/** Fixed projections from native SongDao; no chord payload ever crosses this RPC. */
export function songPageQuery(request:SongPageRequest):{sql:string;bind:(string|number)[];limit:number;offset:number} {
  if(!request||typeof request!=='object'||!['search','artist'].includes(request.mode)
    ||typeof request.text!=='string'||request.text.length>MAX_SONG_QUERY_LENGTH||request.text.includes('\0')) {
    throw new CatalogError('INVALID_REQUEST','Invalid song page query');
  }
  const limit=request.limit===undefined?20:request.limit,offset=request.offset===undefined?0:request.offset;
  if(!Number.isInteger(limit)||limit<1||limit>MAX_SONG_PAGE_SIZE
    ||!Number.isInteger(offset)||offset<0||offset>1_000_000) {
    throw new CatalogError('INVALID_REQUEST','Invalid song page bounds');
  }
  const condition=request.mode==='search'
    ? "(REPLACE(title, '-', ' ') LIKE '%' || REPLACE(TRIM(?), '-', ' ') || '%' OR REPLACE(artist, '-', ' ') LIKE '%' || REPLACE(TRIM(?), '-', ' ') || '%')"
    : "REPLACE(artist, '-', ' ') = REPLACE(?, '-', ' ')";
  const bind:(string|number)[]=request.mode==='search'?[request.text,request.text]:[request.text];
  const artistOrder=request.mode==='search'?'artist COLLATE NOCASE,':'';
  return {
    sql:`SELECT slug,artist,title,NULL AS complexityRating FROM songs
      WHERE dataBlob IS NOT NULL AND ${condition}
      ORDER BY CASE WHEN title IS NULL OR TRIM(title) = '' THEN 1 ELSE 0 END,
        title COLLATE NOCASE,${artistOrder}slug COLLATE NOCASE LIMIT ? OFFSET ?`,
    bind:[...bind,limit+1,offset],limit,offset,
  };
}
