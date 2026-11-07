/** Read-only equivalent of native HarvestLedger replay: songs + unrated browse entry + modes.
 * SQLite evaluates native predicates/order/page bounds over the combined relation.
 * Catalog slug presence wins even for ghost rows or absent browse metadata.
 * Only metadata crosses JSON; no catalog writes or harvested blobs in browse queries.
 */
import {decodeModes,type HarvestedSong} from '../../domain/harvest/harvested-song';
import type {SongReadDb} from './catalog-song-reads';

export function harvestQueryOverlay(db:SongReadDb,overlay:ReadonlyMap<string,HarvestedSong>):SongReadDb {
  if(!overlay.size)return db;
  const metadata=JSON.stringify([...overlay.values()].map(song=>({slug:song.slug,artist:song.artist,title:song.title,
    alphaGroup:song.alphaGroup,modes:[...decodeModes(song.modes)]})));
  const prefix=`WITH harvest_candidates AS (
    SELECT json_extract(value,'$.slug') AS slug,json_extract(value,'$.artist') AS artist,
      json_extract(value,'$.title') AS title,json_extract(value,'$.alphaGroup') AS alphaGroup,
      json_extract(value,'$.modes') AS modes FROM json_each(?)
  ), restored AS (
    SELECT * FROM harvest_candidates AS h WHERE NOT EXISTS (SELECT 1 FROM main.songs AS s WHERE s.slug=h.slug)
  ), songs AS (
    SELECT slug,artist,title,dataBlob FROM main.songs
    UNION ALL SELECT slug,artist,title,X'' AS dataBlob FROM restored
  ), song_browse_entries AS (
    SELECT slug,artist,title,alphaGroup,complexityRating,complexityBucket FROM main.song_browse_entries
      WHERE slug NOT IN (SELECT slug FROM restored)
    UNION ALL SELECT slug,artist,title,alphaGroup,NULL,NULL FROM restored
  ), song_browse_modes AS (
    SELECT slug,mode FROM main.song_browse_modes WHERE slug NOT IN (SELECT slug FROM restored)
    UNION ALL SELECT restored.slug,mode.value FROM restored,json_each(restored.modes) AS mode
  ) `;
  return {selectObjects:(sql,bind=[])=>db.selectObjects(prefix+sql,[metadata,...bind])};
}
