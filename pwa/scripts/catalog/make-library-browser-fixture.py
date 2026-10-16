"""Native SongDao edge rows in a validated v3 catalog; all output remains ignored."""
import argparse,gzip,hashlib,importlib.util,json,sqlite3,uuid
from contextlib import closing
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--variant',choices=['old','new'],default='old');parser.add_argument('--details',action='store_true');args=parser.parse_args()
root=Path.cwd()/'.artifacts/pwa-port/browser-library'/str(uuid.uuid4());source=root/'source';source.mkdir(parents=True);path=source/'catalog.db'
with closing(sqlite3.connect(path)) as db:
    db.executescript("""
    PRAGMA user_version=3;
    CREATE TABLE songs(slug TEXT NOT NULL PRIMARY KEY,artist TEXT,title TEXT,url TEXT NOT NULL,status TEXT NOT NULL,dataBlob BLOB);
    CREATE TABLE song_browse_entries(slug TEXT NOT NULL PRIMARY KEY,artist TEXT,title TEXT,alphaGroup TEXT NOT NULL,complexityRating REAL,complexityBucket INTEGER);
    CREATE TABLE song_browse_modes(slug TEXT NOT NULL,mode TEXT NOT NULL,PRIMARY KEY(slug,mode));
    CREATE INDEX index_song_browse_entries_alphaGroup ON song_browse_entries(alphaGroup);
    CREATE INDEX index_song_browse_entries_complexityBucket ON song_browse_entries(complexityBucket);
    CREATE INDEX index_song_browse_modes_mode ON song_browse_modes(mode);
    """)
    db.executemany('INSERT INTO songs VALUES(?,?,?,?,?,?)',((f'filler-{i:05}','Filler Artist',f'ZZ Filler {i}','https://example.test','complete',b'fixture') for i in range(40609)))
    rows=[('a-alpha','Artist-A','Alpha Song',b'X'*2_000_000),('b-alpha','Artist B','alpha-song',b'fixture'),
          ('c-alpha','Artist C','Alpha_Song',b'fixture'),('n-alpha',None,'Alpha Bare',b'fixture'),
          ('e-alpha','Empty Artist','Alpha Empty',b''),('ghost','Ghost Artist','Alpha Ghost',None),
          ('quote','Quote_Artist',"O'Brien 100%_Title",b'fixture'),
          ('null-title','Ordering',None,b'fixture'),('empty-title','Ordering','',b'fixture'),
          ('a-order','Ordering','Alpha',b'fixture'),('z-order','Ordering','Zulu',b'fixture'),
          ('case-artist','artist a','ArtistTitle',b'fixture')]
    if args.details:
        payload=json.dumps({'10':{'sectionName':'Chorus','sectionIndex':1,'chords':[]},'2':{'sectionName':'Verse','sectionIndex':0,'chords':[]}}).encode('utf-8')
        rows.extend([('detail-gzip','Detail Artist','Detail_Gzip',gzip.compress(payload,mtime=0)),('detail-raw',None,'Detail Raw',payload),('detail-broken',None,'Detail Broken',b'{broken'),('detail-oversize',None,'Detail Oversize',b'Z'*(8*1024*1024+1))])
    for slug,artist,title,blob in rows:
        db.execute('INSERT INTO songs VALUES(?,?,?,?,?,?)',(slug,artist,'Updated Search' if args.variant=='new' and slug=='a-alpha' else title,'https://example.test','complete',blob))
    for slug,artist,title in db.execute('SELECT slug,artist,title FROM songs WHERE dataBlob IS NOT NULL').fetchall():
        first=(title or '').strip()[:1].upper();alpha=first if len(first)==1 and first in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' else '#'
        db.execute('INSERT INTO song_browse_entries VALUES(?,?,?,?,?,?)',(slug,artist,title,alpha,77.,7))
    db.commit()
raw=path.read_bytes();compressed=gzip.compress(raw,mtime=0);(source/'catalog.db.gz').write_bytes(compressed)
manifest={'schemaVersion':3,'snapshotId':hashlib.sha256(raw).hexdigest(),'files':[{'name':'catalog.db','byteSize':len(raw),'checksum':hashlib.sha256(raw).hexdigest(),'compressedByteSize':len(compressed),'compressedChecksum':hashlib.sha256(compressed).hexdigest()}]}
source_manifest=source/'source.json';source_manifest.write_text(json.dumps(manifest),encoding='utf-8')
spec=importlib.util.spec_from_file_location('producer',Path(__file__).with_name('package_catalog.py'));producer=importlib.util.module_from_spec(spec);spec.loader.exec_module(producer)
output=root/'bundle';producer.package(source_manifest,output,'songs')
print(json.dumps({'directory':str(output),'manifest':json.loads((output/'manifest.json').read_text(encoding='utf-8'))}))
