"""Generate bounded SQLite cases from native matching-test sources, or verify frozen cases.
No Swift execution or parity assertion. Run --generate only to intentionally update fixtures.
"""
import argparse, gzip, hashlib, json, math, pathlib, sqlite3, struct, subprocess, tempfile
ROOT = pathlib.Path(__file__).resolve().parents[2]
DEST = ROOT / 'contracts/aural-corpus/ios-b07'
SOURCES = [(['I','V','I','V','I'],.9), (['IV','V','vi','ii'],.8), (['♭II','V','I','iii','IV','V'],.2), (['i','IV','VII'],None), (['ii','V7','I'],.95)]
def generate():
 for version in (1,2,3):
  folder=DEST/f'v{version}'; folder.mkdir(exist_ok=True)
  with tempfile.TemporaryDirectory() as temp:
   manifest={'schemaVersion':f'aural-catalog-{version}','snapshotId':f'b07-v{version}','files':[]}
   for name in ['aural-catalog.db','aural-evidence.db','aural-popularity.db']:
    path=pathlib.Path(temp)/name
    with sqlite3.connect(path) as db:
     db.execute('CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT)')
     meta={'schema_version':manifest['schemaVersion'],'snapshot_id':manifest['snapshotId'],'sequence_reduction_version':'unique-transitions-1'} if name=='aural-catalog.db' else {'catalog_snapshot':manifest['snapshotId']} if name=='aural-evidence.db' else {'snapshotId':'measurements-1','provider':'native-matching-test'}
     db.executemany('INSERT INTO metadata VALUES (?,?)',meta.items())
     if name=='aural-catalog.db':
      db.executescript('CREATE TABLE catalog_array(name TEXT PRIMARY KEY,data BLOB); CREATE TABLE catalog_song(id TEXT PRIMARY KEY,title TEXT,artist TEXT); CREATE TABLE catalog_suffix(rank INTEGER PRIMARY KEY,run_id INTEGER,offset INTEGER,start_index INTEGER,end_index INTEGER); CREATE TABLE catalog_token(token TEXT,label TEXT,inversion_label TEXT);')
      db.execute('CREATE TABLE catalog_run(id INTEGER PRIMARY KEY,stable_id TEXT,view TEXT,song_id TEXT,section_id TEXT,revision TEXT,tokens BLOB,positions BLOB,key_json TEXT'+(',source_key_json TEXT' if version>1 else '')+')')
      db.execute('CREATE TABLE catalog_range(id INTEGER PRIMARY KEY,view TEXT,start INTEGER,end INTEGER,min_length INTEGER,max_length INTEGER,songs INTEGER,upper_score REAL'+(',mode TEXT' if version>1 else '')+(',start_group TEXT,start_group_label TEXT' if version>2 else '')+')')
      locations=sorted([(i,o) for i,(labels,_) in enumerate(SOURCES) for o in range(len(labels))],key=lambda x:SOURCES[x[0]][0][x[1]:])
      db.execute('INSERT INTO catalog_array VALUES (?,?)',('suffix_locations',b''.join(struct.pack('<ii',*x) for x in locations)))
      db.executemany('INSERT INTO catalog_suffix VALUES (?,?,?,?,?)',[(rank,i,o,o,o) for rank,(i,o) in enumerate(locations)])
      for i,(labels,_) in enumerate(SOURCES):
       positions=[dict(startIndex=o,endIndex=o,startBeat=float(o),endBeat=float(o+1),degree=l,roman=l,notes=[60],rootMidi=60,bassMidi=60) for o,l in enumerate(labels)]
       values=[i,f'run{i}','harmony',f'song{i}',f'section{i}','r1',gzip.compress(json.dumps(labels).encode(),mtime=0),gzip.compress(json.dumps(positions).encode(),mtime=0),'{"tonic":"C","scale":"major"}']
       if version>1:values+=['{"tonic":"D","scale":"minor"}']
       db.execute('INSERT INTO catalog_run VALUES ('+','.join('?'*len(values))+')',values)
       db.execute('INSERT INTO catalog_song VALUES (?,?,?)',(f'song{i}',f'Song {i}','Artist'))
      tokens=sorted(set(l for labels,_ in SOURCES for l in labels));db.executemany('INSERT INTO catalog_token VALUES (?,?,?)',[(x,x,x) for x in tokens])
      patterns=sorted(set(tuple(labels[o:e]) for labels,_ in SOURCES for o in range(len(labels)) for e in range(o+2,len(labels)+1)))
      for id,pattern in enumerate(patterns):
       ranks=[rank for rank,(i,o) in enumerate(locations) if tuple(SOURCES[i][0][o:o+len(pattern)])==pattern]
       label=pattern[0];degree=['I','II','III','IV','V','VI','VII'].index(label.lstrip('♭').rstrip('7').upper())+1
       group=f'{"♭" if label.startswith("♭") else "natural"}:{degree}:{"upper" if label.upper()==label else "lower"}:{"major" if label.upper()==label else "minor"}:{"minor" if label.endswith("7") else "none"}'
       values=[id,'harmony',min(ranks),max(ranks),len(pattern),len(pattern),len(set(locations[r][0] for r in ranks)),100.0]
       if version>1:values+=['major']
       if version>2:values+=[group,label]
       db.execute('INSERT INTO catalog_range VALUES ('+','.join('?'*len(values))+')',values)
     elif name=='aural-popularity.db':
      db.execute('CREATE TABLE popularity(song_id TEXT,score REAL,confidence REAL,measured_at TEXT)')
      db.executemany('INSERT INTO popularity VALUES (?,?,1,?)',[(f'song{i}',score,'2026-09-25') for i,(_,score) in enumerate(SOURCES)])
    data=path.read_bytes();(folder/(name+'.gz')).write_bytes(gzip.compress(data,mtime=0))
    manifest['files'].append(dict(name=name,url='https://fixture.invalid/'+name+'.gz',checksum=hashlib.sha256(data).hexdigest(),byteSize=len(data)))
   (folder/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
def verify():
 provenance=json.loads((DEST/'provenance.json').read_text())
 for path,expected in provenance['sha256'].items():assert hashlib.sha256(subprocess.check_output(['git','show',provenance['authority']+':'+path],cwd=ROOT)).hexdigest()==expected
 identity=json.loads((DEST/'identity.json').read_text());assert hashlib.sha256((ROOT/identity['source']).read_bytes()).hexdigest()==identity['sourceSha256']
 for c in identity['cases']:
  h=[0]*4
  for token in c['tokens']:
   words=struct.unpack('<4I',hashlib.sha256(token.encode()).digest()[:16]);h=[(a*m+b)&0xffffffff for a,m,b in zip(h,[16777619,2246822519,3266489917,668265263],words)]
  actual='p_'+hashlib.sha256(('aural-normalizer-1\0'+c['view']).encode()).hexdigest()[:12]+'_'+str(len(c['tokens']))+'_'+''.join(f'{x:08x}' for x in h)
  assert actual==c['expected']
 for version in (1,2,3):
  folder=DEST/f'v{version}';manifest=json.loads((folder/'manifest.json').read_text())
  with tempfile.TemporaryDirectory() as temp:
   for f in manifest['files']:
    data=gzip.decompress((folder/(f['name']+'.gz')).read_bytes());assert len(data)==f['byteSize'];assert hashlib.sha256(data).hexdigest()==f['checksum']
    path=pathlib.Path(temp)/f['name'];path.write_bytes(data)
    with sqlite3.connect(path) as db:assert db.execute('PRAGMA quick_check').fetchall()==[('ok',)]
   with sqlite3.connect(pathlib.Path(temp)/'aural-catalog.db') as db:
    packed=db.execute("SELECT data FROM catalog_array").fetchone()[0];locations=list(struct.iter_unpack('<ii',packed));assert len(locations)==21
    ranks=[r for r,(i,o) in enumerate(locations) if SOURCES[i][0][o:o+2]==['I','V']];assert len(ranks)==2
    assert {locations[r][0] for r in ranks}=={0}
    assert db.execute('SELECT count(*) FROM catalog_run').fetchone()[0]==5
    assert ('source_key_json' in [c[1] for c in db.execute('PRAGMA table_info(catalog_run)')])==(version>1)
 print(f'PASS: pinned sources, {len(identity["cases"])} native identities, 9 hashed gzip/SQLite files, v1-v3 key columns and native I-V occurrence case. Swift unrun.')
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--generate',action='store_true');args=parser.parse_args()
 if args.generate:generate()
 verify()
