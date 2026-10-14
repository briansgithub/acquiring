"""Generate tiny real SQLite catalogs under ignored artifacts, never app public assets."""
import argparse
import re
from contextlib import closing
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import uuid

producer_path = Path(__file__).with_name('package_catalog.py')
spec = importlib.util.spec_from_file_location('producer', producer_path)
producer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(producer)
root = Path.cwd() / '.artifacts' / 'pwa-port' / 'browser-catalog' / str(uuid.uuid4())
source, output = root / 'source', root / 'bundle'
source.mkdir(parents=True)
parser = argparse.ArgumentParser()
parser.add_argument('--snapshot', default='d' * 64)
args = parser.parse_args()
snapshot = args.snapshot
if not re.fullmatch('[0-9a-f]{64}', snapshot):
    parser.error('Expected lowercase SHA256 snapshot')
entries = []
for name in sorted(producer.REQUIRED['aural']):
    path = source / name
    metadata = ({'schema_version': 'aural-catalog-3', 'snapshot_id': snapshot} if name == 'aural-catalog.db' else {'catalog_snapshot': snapshot} if name == 'aural-evidence.db' else {'snapshotId': 'fixture-popularity-1', 'provider': 'acceptance-fixture'})
    with closing(sqlite3.connect(path)) as db:
        db.execute('CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL)')
        db.executemany('INSERT INTO metadata VALUES (?,?)', metadata.items())
        db.execute('CREATE TABLE fixture(value TEXT)')
        db.execute("INSERT INTO fixture VALUES ('preserved-browser-catalog')")
        db.commit()
    raw = path.read_bytes()
    compressed = gzip.compress(raw, mtime=0)
    (source / (name + '.gz')).write_bytes(compressed)
    entries.append({'name': name, 'byteSize': len(raw), 'checksum': hashlib.sha256(raw).hexdigest(), 'compressedByteSize': len(compressed), 'compressedChecksum': hashlib.sha256(compressed).hexdigest()})
source_manifest = source / 'source.json'
source_manifest.write_text(json.dumps({'schemaVersion': 'aural-catalog-3', 'snapshotId': snapshot, 'files': entries}), encoding='utf-8')
result = producer.package(source_manifest, output, 'aural')
print(json.dumps({'directory': str(output), 'manifest': json.loads((output / 'manifest.json').read_text(encoding='utf-8')), 'result': result}))
