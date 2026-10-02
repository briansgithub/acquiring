import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashFile, openDatabase } from './common.mjs';
import { prepareDelivery, verifyDelivery } from './prepare-delivery.mjs';

test('release assets round-trip to the validated source bundle and reject corruption', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aural-delivery-test-'));
  try {
    const catalog = path.join(directory, 'catalog.db');
    const evidence = path.join(directory, 'evidence.db');
    const popularity = path.join(directory, 'popularity.db');
    for (const [file, metadata] of [
      [catalog, { schema_version: 'aural-catalog-3', snapshot_id: 'test-snapshot' }],
      [evidence, { catalog_snapshot: 'test-snapshot' }],
      [popularity, { snapshotId: 'pop-test', provider: 'ListenBrainz' }],
    ]) {
      const db = openDatabase(file);
      db.exec('CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT)');
      for (const [key, value] of Object.entries(metadata)) db.prepare('INSERT INTO metadata VALUES (?,?)').run(key, value);
      db.close();
    }
    const manifest = path.join(directory, 'catalog.json');
    fs.writeFileSync(manifest, JSON.stringify({ file: 'catalog.db', snapshotId: 'test-snapshot', checksum: hashFile(catalog) }));
    const output = path.join(directory, 'assets');
    const prepared = await prepareDelivery({ manifest, popularity, evidence, output, tag: 'test-release' });
    assert.deepEqual(await verifyDelivery(output), prepared);
    assert.equal(prepared.files.length, 3);
    assert.equal(prepared.schemaVersion, 'aural-catalog-3');
    await assert.rejects(prepareDelivery({ manifest, popularity, evidence, output, tag: 'test-release' }), /already exists/);
    fs.appendFileSync(path.join(output, 'aural-catalog.db.gz'), 'corruption');
    await assert.rejects(verifyDelivery(output), /checksum mismatch/);
  } finally {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    fs.rmSync(directory, { recursive: true });
  }
});
