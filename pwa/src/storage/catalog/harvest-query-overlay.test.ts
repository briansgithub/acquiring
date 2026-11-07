import {DatabaseSync} from 'node:sqlite';
import {expect,it} from 'vitest';
import {harvestQueryOverlay} from './harvest-query-overlay';
import {songPageQuery,artistSuggestionsQuery,browseGroupCountsQuery,browseGroupSongsQuery,songBrowseBySlugsQuery} from './library-queries';
import type {HarvestedSong} from '../../domain/harvest/harvested-song';

it('readonly query overlay equals native replay tables across SQLite predicates, groups and page boundaries',()=>{
  const catalog=new DatabaseSync(':memory:'),replayed=new DatabaseSync(':memory:');
  const overlay=new Map<string,HarvestedSong>();
  for(const [slug,title,artist] of [['mine','Écho_A-B','Artist-X'],['Tie','Same','Shared'],['tie','Same','Shared'],['rated','Stale','Wrong'],['ghost','Stale','Wrong']]) {
    overlay.set(slug!,{slug:slug!,title:title!,artist:artist!,url:'https://example.test',status:'enriched',dataBlob:new Uint8Array([1]),alphaGroup:'S',modes:'ionian\ndorian\nionian',harvestedAt:1});
  }
  try {
    for(const db of [catalog,replayed]) {
      db.exec(`CREATE TABLE songs(slug TEXT PRIMARY KEY,artist TEXT,title TEXT,dataBlob BLOB);
        CREATE TABLE song_browse_entries(slug TEXT PRIMARY KEY,artist TEXT,title TEXT,alphaGroup TEXT,complexityRating REAL,complexityBucket INTEGER);
        CREATE TABLE song_browse_modes(slug TEXT,mode TEXT,PRIMARY KEY(slug,mode));
        INSERT INTO songs VALUES('rated','Catalog','Rated',X'01'),('ghost','Ghost','Ghost',NULL);
        INSERT INTO song_browse_entries VALUES('rated','Catalog','Rated','R',77,7);
        INSERT INTO song_browse_modes VALUES('rated','ionian');`);
    }
    // Frozen HarvestLedger.replay: songExists guards the entire song/entry/modes write.
    for(const song of overlay.values()) {
      if(replayed.prepare('SELECT 1 FROM songs WHERE slug=?').get(song.slug))continue;
      replayed.prepare('INSERT INTO songs VALUES(?,?,?,?)').run(song.slug,song.artist,song.title,song.dataBlob);
      replayed.prepare('INSERT OR REPLACE INTO song_browse_entries VALUES(?,?,?,?,NULL,NULL)').run(song.slug,song.artist,song.title,song.alphaGroup);
      replayed.prepare('DELETE FROM song_browse_modes WHERE slug=?').run(song.slug);
      for(const mode of new Set(song.modes.split('\n').filter(Boolean)))replayed.prepare('INSERT INTO song_browse_modes VALUES(?,?)').run(song.slug,mode);
    }
    catalog.exec('PRAGMA query_only=ON');
    const view=harvestQueryOverlay({selectObjects:(sql,bind=[])=>catalog.prepare(sql).all(...bind)},overlay);
    const compare=(plan:{sql:string;bind:(string|number)[]})=>expect(view.selectObjects(plan.sql,plan.bind)).toEqual(replayed.prepare(plan.sql).all(...plan.bind));
    for(const text of ['','%','_','Écho','écho',"' OR 1=1 --",'A B','stale','Shared']) {
      for(const mode of ['search','artist','artistSearch'] as const) {
        if(mode==='artistSearch'&&!text.trim())continue;
        for(const offset of [0,1,2,3])compare(songPageQuery({mode,text,limit:1,offset}));
      }
      if(text.trim())for(const offset of [0,1,2])compare(artistSuggestionsQuery({query:text,limit:1,offset}));
      for(const mode of ['alphabetical','complexity','mode'] as const)compare(browseGroupCountsQuery(mode,text));
      for(const [mode,key] of [['alphabetical','S'],['complexity','unrated'],['complexity','7'],['mode','ionian'],['mode','dorian']] as const)compare(browseGroupSongsQuery(mode,key,text));
    }
    const membership=songBrowseBySlugsQuery(['mine','mine','ghost','rated','absent']);
    const bySlug=(rows:Record<string,unknown>[])=>rows.sort((a,b)=>String(a.slug).localeCompare(String(b.slug)));
    expect(bySlug(view.selectObjects(membership.sql,membership.bind))).toEqual(bySlug(replayed.prepare(membership.sql).all(...membership.bind)));
    const unicode= songPageQuery({mode:'search',text:'écho'});
    expect(view.selectObjects(unicode.sql,unicode.bind)).toEqual([]); // SQLite NOCASE/LIKE does not Unicode-fold É
    expect(catalog.prepare('SELECT COUNT(*) AS n FROM songs').get()!.n).toBe(2);
    expect(harvestQueryOverlay(view,new Map())).toBe(view);
  } finally {catalog.close();replayed.close();}
});
