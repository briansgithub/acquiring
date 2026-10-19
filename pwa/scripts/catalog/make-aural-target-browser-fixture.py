"""Tiny native target fixtures plus explicit browser transport/refusal mutations."""
import argparse,base64,gzip,hashlib,importlib.util,json,re,sqlite3,struct,uuid
from contextlib import closing
from pathlib import Path

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--probe',required=True);parser.add_argument('--snapshot',required=True);parser.add_argument('--text-case',choices=['nul-header','nul-key','large-metadata']);args=parser.parse_args()
 if not re.fullmatch('[0-9a-f]{64}',args.snapshot):parser.error('Expected fixture snapshot SHA256')
 native=json.loads((Path(__file__).resolve().parents[2]/'src/domain/catalog/fixtures/native-target.json').read_text(encoding='utf-8'))
 found=[p for g in native['cases'] for p in g['probes'] if p['name']==args.probe]
 if len(found)!=1 or not found[0]['supportsModeAnalysis']:parser.error('Expected modern accepted native probe')
 row=found[0]
 path=Path(__file__).with_name('package_catalog.py');spec=importlib.util.spec_from_file_location('producer',path);producer=importlib.util.module_from_spec(spec);spec.loader.exec_module(producer)
 root=Path.cwd()/'.artifacts/pwa-port/aural-target-fixture'/str(uuid.uuid4());source=root/'source';source.mkdir(parents=True);entries=[]
 for name in sorted(producer.REQUIRED['aural']):
  path=source/name;metadata=({'schema_version':'aural-catalog-3','snapshot_id':args.snapshot,'sequence_reduction_version':'unique-transitions-1'} if name=='aural-catalog.db' else {'catalog_snapshot':args.snapshot} if name=='aural-evidence.db' else {'snapshotId':'target-fixture-popularity','provider':'acceptance-fixture'})
  with closing(sqlite3.connect(path)) as db:
   db.execute('CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT)');db.executemany('INSERT INTO metadata VALUES (?,?)',metadata.items())
   if name=='aural-catalog.db':
    db.execute('CREATE TABLE catalog_array(name TEXT PRIMARY KEY,data BLOB)');db.execute('INSERT INTO catalog_array VALUES (?,?)',('suffix_locations',struct.pack('<'+'i'*len(row['suffix']),*row['suffix'])))
    db.execute('CREATE TABLE catalog_run(id INTEGER PRIMARY KEY,stable_id TEXT UNIQUE,view TEXT,song_id TEXT,section_id TEXT,revision TEXT,tokens TEXT,positions TEXT,key_json TEXT,source_key_json TEXT)')
    db.execute('INSERT INTO catalog_run VALUES (?,?,?,?,?,?,?,?,?,?)',(row['rowId'],row['stableId'],row['view'],row['song'],row['section'],row['revision'],base64.b64decode(row['tokensGzip']),base64.b64decode(row['positionsGzip']),row['keyRaw'],row['sourceKeyRaw']))
    # Browser transport refusal fixtures only; unchanged default remains the accepted native oracle.
    if args.text_case=='nul-header':db.execute("UPDATE metadata SET value=? WHERE key='sequence_reduction_version'",('unique-transitions-1\0junk',))
    if args.text_case=='nul-key':db.execute('UPDATE catalog_run SET key_json=?',(row['keyRaw']+'\0junk',))
    if args.text_case=='large-metadata':db.execute('UPDATE catalog_run SET stable_id=?',('\0'+'x'*20000,))
   db.commit()
  raw=path.read_bytes();compressed=gzip.compress(raw,mtime=0);(source/(name+'.gz')).write_bytes(compressed);entries.append({'name':name,'byteSize':len(raw),'checksum':hashlib.sha256(raw).hexdigest(),'compressedByteSize':len(compressed),'compressedChecksum':hashlib.sha256(compressed).hexdigest()})
 manifest=source/'source.json';manifest.write_text(json.dumps({'schemaVersion':'aural-catalog-3','snapshotId':args.snapshot,'files':entries}),encoding='utf-8');output=root/'bundle';producer.package(manifest,output,'aural')
 expected=row['expected'].get('target',row['expected'])
 if not expected.get('failure'):expected={**expected,'snapshotId':args.snapshot}
 # Default fixture changes only the installed snapshot envelope; --text-case variants are browser-only transport/refusal cases, not new native expectations.
 print(json.dumps({'directory':str(output),'manifest':json.loads((output/'manifest.json').read_text(encoding='utf-8')),'request':{'sourceSnapshot':args.snapshot,'start':row['start'],'end':row['end'],'length':row['length']},'expected':expected,'nativeProbe':args.probe,'browserTextCase':args.text_case}))

if __name__=='__main__':main()
