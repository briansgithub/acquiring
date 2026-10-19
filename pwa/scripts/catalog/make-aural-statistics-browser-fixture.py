"""Tiny selected-range statistics SQLite bundles backed by unchanged native output.
--variant bad-confidence is browser refusal evidence only; expected remains native.
No native capture, score/count arithmetic, SQL simulation or production worker.
"""
import argparse,gzip,hashlib,importlib.util,json,re,sqlite3,struct,uuid
from contextlib import closing
from pathlib import Path


def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--probe',required=True);parser.add_argument('--snapshot',required=True)
 parser.add_argument('--variant',choices=['bad-confidence']);args=parser.parse_args()
 if not re.fullmatch('[0-9a-f]{64}',args.snapshot):parser.error('Expected fixture snapshot SHA256')
 native_path=Path(__file__).resolve().parents[2]/'src/domain/catalog/fixtures/native-statistics.json'
 native=json.loads(native_path.read_text(encoding='utf-8'))
 found=[p for g in native['cases']if g['kind']=='stats'for p in g['probes']if p['name']==args.probe and not p.get('statsWrapper')]
 if len(found)!=1:parser.error('Expected one accepted native statsMatching probe')
 probe=found[0]
 changed=next((i for i,p in enumerate(probe['popularity'])if p['score']is not None),None)
 if args.variant and changed is None:parser.error('bad-confidence requires a nonnull native popularity score')
 path=Path(__file__).with_name('package_catalog.py');spec=importlib.util.spec_from_file_location('producer',path)
 producer=importlib.util.module_from_spec(spec);spec.loader.exec_module(producer)
 root=Path.cwd()/'.artifacts/pwa-port/aural-statistics-fixture'/str(uuid.uuid4())
 source=root/'source';source.mkdir(parents=True,exist_ok=False);entries=[]
 for name in sorted(producer.REQUIRED['aural']):
  path=source/name
  metadata=({'schema_version':'aural-catalog-3','snapshot_id':args.snapshot,'sequence_reduction_version':'unique-transitions-1'}if name=='aural-catalog.db'else{'catalog_snapshot':args.snapshot}if name=='aural-evidence.db'else{'snapshotId':'statistics-fixture-popularity','provider':'acceptance-fixture'})
  with closing(sqlite3.connect(path))as db:
   db.execute('CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT)')
   db.executemany('INSERT INTO metadata VALUES (?,?)',metadata.items())
   if name=='aural-catalog.db':
    db.execute('CREATE TABLE catalog_array(name TEXT PRIMARY KEY,data BLOB)')
    pairs=[n for row in probe['occurrences']for n in [row['runId'],row['offset']]]
    db.execute('INSERT INTO catalog_array VALUES (?,?)',('suffix_locations',struct.pack('<'+'i'*len(pairs),*pairs)))
    db.execute('CREATE TABLE catalog_run(id INTEGER PRIMARY KEY,song_id TEXT,section_id TEXT)')
    db.executemany('INSERT INTO catalog_run VALUES (?,?,?)',[(row['id'],row['songId'],row['sectionId'])for row in probe['runs']])
    db.execute('CREATE TABLE catalog_song(id TEXT)')
    db.executemany('INSERT INTO catalog_song VALUES (?)',[(id,)for id in probe['validSongIds']])
   elif name=='aural-popularity.db':
    db.execute('CREATE TABLE popularity(song_id TEXT,score REAL,confidence REAL,measured_at TEXT)')
    db.executemany('INSERT INTO popularity VALUES (?,?,?,?)',[(row['songId'],row['score'],'invalid'if args.variant and i==changed else row['confidence'],'2026-10-19T00:00:00Z')for i,row in enumerate(probe['popularity'])])
   db.commit()
  raw=path.read_bytes();compressed=gzip.compress(raw,mtime=0);(source/(name+'.gz')).write_bytes(compressed)
  entries.append({'name':name,'byteSize':len(raw),'checksum':hashlib.sha256(raw).hexdigest(),'compressedByteSize':len(compressed),'compressedChecksum':hashlib.sha256(compressed).hexdigest()})
 manifest=source/'source.json'
 manifest.write_text(json.dumps({'schemaVersion':'aural-catalog-3','snapshotId':args.snapshot,'files':entries}),encoding='utf-8',newline='\n')
 output=root/'bundle';producer.package(manifest,output,'aural')
 # These are copied native values, never recomputed from SQLite or variant data.
 request={'range':{'sourceSnapshot':args.snapshot,'start':0,'end':len(probe['occurrences'])-1,'length':probe['targetLength']},'settings':probe['settings'],'recentSongIds':probe['recentSongIds'],'favoriteSongIds':probe['favoriteSongIds'],'minimumPopularityPercent':probe.get('minimumPopularityPercent')}
 print(json.dumps({'directory':str(output),'manifest':json.loads((output/'manifest.json').read_text(encoding='utf-8')),'request':request,'expected':probe['expected'],'nativeProbe':args.probe,'browserVariant':args.variant}))


if __name__=='__main__':main()
