"""Real Android-v3-shaped song catalogs, including adversarial acceptance cases."""
import argparse,gzip,hashlib,importlib.util,json,sqlite3,uuid
from contextlib import closing
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--defect',choices=['none','missing-index','wrong-index','missing-payload','nullable-key'],default='none')
args=parser.parse_args()
root=Path.cwd()/'.artifacts'/'pwa-port'/'browser-songs'/str(uuid.uuid4())
source=root/'source';source.mkdir(parents=True);path=source/'catalog.db'
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
    db.executemany('INSERT INTO songs VALUES (?,?,?,?,?,?)',((f'song-{i:05}','Artist',f'Song {i}',f'https://example.test/song/{i}','complete',b'fixture-payload') for i in range(40609)))
    db.execute("INSERT INTO song_browse_entries SELECT slug,artist,title,'S',1.0,1 FROM songs")
    if args.defect=='missing-index':db.execute('DROP INDEX index_song_browse_entries_alphaGroup')
    if args.defect=='wrong-index':db.executescript('DROP INDEX index_song_browse_modes_mode; CREATE INDEX index_song_browse_modes_mode ON song_browse_modes(slug);')
    if args.defect=='missing-payload':db.execute('UPDATE songs SET dataBlob=NULL WHERE slug=?',('song-00000',))
    if args.defect=='nullable-key':
        db.executescript('ALTER TABLE songs RENAME TO old_songs; CREATE TABLE songs(slug TEXT PRIMARY KEY,artist TEXT,title TEXT,url TEXT NOT NULL,status TEXT NOT NULL,dataBlob BLOB); INSERT INTO songs SELECT * FROM old_songs; DROP TABLE old_songs;')
    db.commit()
raw=path.read_bytes();compressed=gzip.compress(raw,mtime=0);(source/'catalog.db.gz').write_bytes(compressed)
manifest={'schemaVersion':3,'snapshotId':hashlib.sha256(raw).hexdigest(),'files':[{'name':'catalog.db','byteSize':len(raw),'checksum':hashlib.sha256(raw).hexdigest(),'compressedByteSize':len(compressed),'compressedChecksum':hashlib.sha256(compressed).hexdigest()}]}
source_manifest=source/'source.json';source_manifest.write_text(json.dumps(manifest),encoding='utf-8')
spec=importlib.util.spec_from_file_location('producer',Path(__file__).with_name('package_catalog.py'));producer=importlib.util.module_from_spec(spec);spec.loader.exec_module(producer)
output=root/'bundle';producer.package(source_manifest,output,'songs')
print(json.dumps({'directory':str(output),'manifest':json.loads((output/'manifest.json').read_text(encoding='utf-8'))}))
