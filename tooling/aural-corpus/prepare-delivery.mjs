/** Prepare verified GitHub assets without modifying the source databases. */
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { inspectBundle } from './install-android.mjs';
import { hashFile } from './common.mjs';
import { CATALOG_VERSION } from './catalog.mjs';

export async function prepareDelivery({ manifest, popularity, evidence, output, tag }) {
  if (!/^[a-zA-Z0-9._-]+$/.test(tag)) throw Error('Invalid release tag');
  const source = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const files = inspectBundle(manifest, popularity, evidence);
  fs.mkdirSync(output, { recursive: true });
  const entries = [];
  for (const entry of files) {
    const destination = path.join(output, `${entry.name}.gz`);
    if (fs.existsSync(destination)) throw Error(`Delivery asset already exists: ${destination}`);
    const temporary = destination + '.tmp';
    if (fs.existsSync(temporary)) throw Error(`Inspect incomplete delivery asset before retry: ${temporary}`);
    await pipeline(fs.createReadStream(entry.file), createGzip({ level: 6 }), fs.createWriteStream(temporary, { flags: 'wx' }));
    fs.renameSync(temporary, destination);
    entries.push({
      name: entry.name,
      url: `https://github.com/briansgithub/acquiring/releases/download/${tag}/${entry.name}.gz`,
      checksum: entry.checksum,
      byteSize: fs.statSync(entry.file).size,
      compressedByteSize: fs.statSync(destination).size,
      compressedChecksum: hashFile(destination),
    });
    console.log(`Prepared ${entry.name}.gz: ${entries.at(-1).compressedByteSize} bytes`);
  }
  const bundle = { schemaVersion: CATALOG_VERSION, snapshotId: source.snapshotId, files: entries };
  fs.writeFileSync(path.join(output, 'aural-catalog-manifest.json'), JSON.stringify(bundle, null, 2) + '\n', { flag: 'wx' });
  return bundle;
}

export async function verifyDelivery(output) {
  const bundle = JSON.parse(fs.readFileSync(path.join(output, 'aural-catalog-manifest.json'), 'utf8'));
  for (const entry of bundle.files) {
    if (!['aural-catalog.db', 'aural-evidence.db', 'aural-popularity.db'].includes(entry.name)) throw Error('Invalid asset name');
    const asset = path.join(output, entry.name + '.gz');
    if (hashFile(asset) !== entry.compressedChecksum) throw Error('Compressed asset checksum mismatch');
    const digest = createHash('sha256');
    let size = 0;
    const decompressed = fs.createReadStream(asset).pipe(createGunzip());
    for await (const chunk of decompressed) { digest.update(chunk); size += chunk.length; }
    if (size !== entry.byteSize || digest.digest('hex') !== entry.checksum) throw Error('Decompressed asset checksum mismatch');
  }
  return bundle;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifest, popularity, evidence, output, tag] = process.argv.slice(2);
  if (!tag) throw Error('Usage: prepare-delivery.mjs <catalog.db.json> <popularity.db> <evidence.db> <output> <release-tag>');
  await prepareDelivery({ manifest, popularity, evidence, output, tag });
}
