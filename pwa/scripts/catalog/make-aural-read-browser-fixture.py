"""Tiny actual SQLite header/array fixtures; no public catalogs or existing proof mutation."""
import argparse,gzip,hashlib,importlib.util,json,re,sqlite3,struct,uuid
from contextlib import closing
from pathlib import Path

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--snapshot',default='d'*64);parser.add_argument('--suffix-count',type=int,default=2);parser.add_argument('--bad-array',action='store_true');args=parser.parse_args()
 if not re.fullmatch('[0-9a-f]{64}',args.snapshot) or not 0<=args.suffix_count<=16:parser.error('Expected bounded fixture arguments')
 path=Path(__file__).with_name('package_catalog.py');spec=importlib.util.spec_from_file_location('producer',path);producer=importlib.util.module_from_spec(spec);spec.loader.exec_module(producer)
 root=Path.cwd()/'.artifacts/pwa-port/aural-read-fixture'/str(uuid.uuid4());source=root/'source';source.mkdir(parents=True);entries=[]
 for name in sorted(producer.REQUIRED['aural']):
  path=source/name
  metadata=({'schema_version':'aural-catalog-3','snapshot_id':args.snapshot,'sequence_reduction_version':'unique-transitions-1'} if name=='aural-catalog.db' else {'catalog_snapshot':args.snapshot} if name=='aural-evidence.db' else {'snapshotId':'header-fixture-popularity','provider':'acceptance-fixture'})
  with closing(sqlite3.connect(path)) as db:
   db.execute('CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT)');db.executemany('INSERT INTO metadata VALUES (?,?)',metadata.items())
   if name=='aural-catalog.db':
    db.execute('CREATE TABLE catalog_array(name TEXT PRIMARY KEY,data BLOB)')
    data='not-a-blob' if args.bad_array else b''.join(struct.pack('<ii',index,index+3) for index in range(args.suffix_count))
    db.execute('INSERT INTO catalog_array VALUES (?,?)',('suffix_locations',data))
   db.commit()
  raw=path.read_bytes();compressed=gzip.compress(raw,mtime=0);(source/(name+'.gz')).write_bytes(compressed)
  entries.append({'name':name,'byteSize':len(raw),'checksum':hashlib.sha256(raw).hexdigest(),'compressedByteSize':len(compressed),'compressedChecksum':hashlib.sha256(compressed).hexdigest()})
 manifest=source/'source.json';manifest.write_text(json.dumps({'schemaVersion':'aural-catalog-3','snapshotId':args.snapshot,'files':entries}),encoding='utf-8')
 output=root/'bundle';producer.package(manifest,output,'aural');print(json.dumps({'directory':str(output),'manifest':json.loads((output/'manifest.json').read_text(encoding='utf-8'))}))

if __name__=='__main__':main()
