import { CatalogError } from './protocol';
interface CatalogReader { selectValue(sql: string): unknown; selectObjects(sql: string): Record<string, unknown>[] }
// Android801cf798 AppDatabase/Song/SongBrowse schema v3 and DatabaseDownloader floors.
const tables = {
  songs: [['slug','TEXT',1,1],['artist','TEXT',0,0],['title','TEXT',0,0],['url','TEXT',1,0],['status','TEXT',1,0],['dataBlob','BLOB',0,0]],
  song_browse_entries: [['slug','TEXT',1,1],['artist','TEXT',0,0],['title','TEXT',0,0],['alphaGroup','TEXT',1,0],['complexityRating','REAL',0,0],['complexityBucket','INTEGER',0,0]],
  song_browse_modes: [['slug','TEXT',1,1],['mode','TEXT',1,2]],
} as const;
const indexes = [
  ['song_browse_entries','index_song_browse_entries_alphaGroup','alphaGroup'],
  ['song_browse_entries','index_song_browse_entries_complexityBucket','complexityBucket'],
  ['song_browse_modes','index_song_browse_modes_mode','mode'],
] as const;
export function validateSongCatalog(db: CatalogReader): Record<string, string> {
  if (db.selectValue('PRAGMA user_version') !== 3) throw new CatalogError('INTEGRITY', 'Song catalog schema mismatch');
  for (const [table, required] of Object.entries(tables)) {
    const columns = db.selectObjects(`PRAGMA table_info(${table})`);
    if (columns.length !== required.length || required.some(([name,type,notNull,pk]) => {
      const found = columns.find(column => column.name === name);
      return !found || String(found.type).toUpperCase() !== type || Number(found.notnull) !== notNull || Number(found.pk) !== pk;
    })) throw new CatalogError('INTEGRITY', 'Song catalog column definition mismatch');
  }
  for (const [table,name,column] of indexes) {
    const index = db.selectObjects(`PRAGMA index_list(${table})`).find(index => index.name === name);
    const columns = db.selectObjects(`PRAGMA index_info(${name})`);
    if (!index || Number(index.unique) !== 0 || Number(index.partial) !== 0 || columns.length !== 1 || columns[0]!.name !== column) throw new CatalogError('INTEGRITY', 'Song catalog index definition mismatch');
  }
  const songCount = Number(db.selectValue('SELECT COUNT(*) FROM songs'));
  const browseRowCount = Number(db.selectValue('SELECT COUNT(*) FROM song_browse_entries'));
  const playableBrowseRows = Number(db.selectValue('SELECT COUNT(*) FROM song_browse_entries AS entries INNER JOIN songs ON songs.slug = entries.slug WHERE songs.dataBlob IS NOT NULL'));
  if (songCount < 40609 || browseRowCount < 40609 || playableBrowseRows !== browseRowCount) throw new CatalogError('INTEGRITY', 'Song catalog is incomplete or has missing chord payloads');
  return { songCount: String(songCount), browseRowCount: String(browseRowCount), playableBrowseRows: String(playableBrowseRows) };
}
