'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  DEFAULT_MAX_BATCH_BYTES,
  DEFAULT_OVERHEAD_DENOMINATOR,
  DEFAULT_OVERHEAD_NUMERATOR,
  DEFAULT_RESERVE_BYTES,
  StoragePreflightError,
  assertStoragePreflight,
  storeLocalArtifact,
} = require('../../../lib/midi-corpus/storage');

async function withTempDir(callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midi-storage-test-'));
  try {
    return await callback(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('storage preflight reports exact reserve shortfall and batch excess', async () => {
  await assert.rejects(
    assertStoragePreflight({ storeRoot: '.', availableBytes: 1_000n }),
    /requires at least one explicit byte component/,
  );
  await assert.rejects(
    assertStoragePreflight({
      storeRoot: '.',
      batchBytes: 100n,
      maximumBatchBytes: 1_000n,
      reserveBytes: 200n,
      availableBytes: 250n,
    }),
    (error) => error instanceof StoragePreflightError
      && error.code === 'INSUFFICIENT_STORAGE_RESERVE'
      && error.details.shortfall_bytes === '75'
      && error.details.estimated_peak_bytes === '125',
  );
  await assert.rejects(
    assertStoragePreflight({
      storeRoot: '.',
      batchBytes: 1_001n,
      maximumBatchBytes: 1_000n,
      reserveBytes: 200n,
      availableBytes: 9_999n,
    }),
    (error) => error.code === 'BATCH_LIMIT_EXCEEDED'
      && error.details.batch_excess_bytes === '1',
  );
  const passed = await assertStoragePreflight({
    storeRoot: '.',
    batchBytes: 100n,
    maximumBatchBytes: 1_000n,
    reserveBytes: 200n,
    availableBytes: 325n,
  });
  assert.equal(passed.shortfall_bytes, '0');
  assert.equal(DEFAULT_MAX_BATCH_BYTES, 5n * 1024n * 1024n * 1024n);
  assert.equal(DEFAULT_RESERVE_BYTES, 20n * 1024n * 1024n * 1024n);
  assert.equal(DEFAULT_OVERHEAD_NUMERATOR, 5n);
  assert.equal(DEFAULT_OVERHEAD_DENOMINATOR, 4n);
});

test('storage preflight sums download, extraction, indexes, and temporary files before overhead', async () => {
  const passed = await assertStoragePreflight({
    storeRoot: '.',
    downloadBytes: 100n,
    extractedBytes: 200n,
    indexBytes: 30n,
    temporaryBytes: 70n,
    maximumBatchBytes: 100n,
    reserveBytes: 500n,
    availableBytes: 1_000n,
  });
  assert.equal(passed.download_bytes, '100');
  assert.equal(passed.extracted_bytes, '200');
  assert.equal(passed.index_bytes, '30');
  assert.equal(passed.temporary_bytes, '70');
  assert.equal(passed.component_total_bytes, '400');
  assert.equal(passed.estimated_peak_bytes, '500');
  assert.equal(passed.required_bytes, '1000');
});

test('local artifact ingest is rights-gated, content-addressed, and deduplicated', async () => {
  await withTempDir(async (root) => {
    const midiPath = path.join(root, 'fixture.mid');
    const storeRoot = path.join(root, 'store');
    await fs.writeFile(midiPath, Buffer.from('4d546864000000060000000101e04d54726b0000000400ff2f00', 'hex'));
    const common = {
      storeRoot,
      filePath: midiPath,
      sourceId: 'mutopia',
      rightsStatus: 'public_domain_verified',
      purpose: 'research',
      availableBytes: 30n * 1024n * 1024n * 1024n,
    };
    const first = await storeLocalArtifact(common);
    const second = await storeLocalArtifact(common);
    assert.match(first.storage_relpath, /^objects\/sha256\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{64}$/);
    assert.equal(first.deduplicated, false);
    assert.equal(second.deduplicated, true);
    assert.deepEqual(await fs.readFile(first.storage_path), await fs.readFile(midiPath));

    await assert.rejects(
      storeLocalArtifact({
        ...common,
        sourceId: 'musescore',
        rightsStatus: 'unknown',
      }),
      (error) => error.code === 'RIGHTS_POLICY_DENIED',
    );
  });
});
