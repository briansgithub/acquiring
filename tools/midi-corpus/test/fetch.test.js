'use strict';

const assert = require('node:assert/strict');
const { Readable, Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const test = require('node:test');
const { initializeAcquisitionDb } = require('../../../lib/midi-corpus/acquisition-db');
const {
  byteLimitTransform,
  createDownloadPlan,
  isPrivateHostname,
  validateRemoteUrl,
} = require('../../../lib/midi-corpus/fetch');

function seedItem(db, overrides = {}) {
  db.prepare(`
    INSERT INTO metadata_imports (
      import_id, source_id, source_path, source_sha256, source_bytes, format
    ) VALUES ('fixture-import', 'pdmx', 'fixture', ?, 1, 'json')
  `).run('a'.repeat(64));
  db.prepare(`
    INSERT INTO source_items (
      source_id, source_item_id, artist, title, canonical_artist, canonical_title,
      artifact_locator, rights_status, usability_class, metadata_sha256, metadata_json, import_id
    ) VALUES ('pdmx', 'fixture', 'A', 'T', 'a', 't', ?, ?, 'product_usable', ?, '{}', 'fixture-import')
  `).run(
    overrides.locator || 'https://zenodo.org/records/15571083/files/example.mid',
    overrides.rightsStatus || 'public_domain_verified',
    'b'.repeat(64),
  );
}

test('fetch plan is rights/host gated and preflights download plus staging space', async () => {
  const db = initializeAcquisitionDb(':memory:');
  seedItem(db);
  try {
    const fetchImpl = async (_url, init) => {
      assert.equal(init.method, 'HEAD');
      return new Response(null, { status: 200, headers: { 'content-length': '100' } });
    };
    const plan = await createDownloadPlan(db, {
      sourceId: 'pdmx',
      sourceItemId: 'fixture',
      storeRoot: '.',
      fetchImpl,
      availableBytes: 1_000n,
      reserveBytes: 200n,
    });
    assert.equal(plan.expected_bytes, '100');
    assert.equal(plan.rights_decision.usability_class, 'product_usable');
    assert.equal(plan.preflight.download_bytes, '100');
    assert.equal(plan.preflight.temporary_bytes, '100');
    assert.equal(plan.preflight.component_total_bytes, '200');
    assert.equal(plan.preflight.estimated_peak_bytes, '250');
    assert.equal(plan.preflight.required_bytes, '450');
  } finally {
    db.close();
  }
});

test('remote URL validation rejects private and unapproved hosts', () => {
  assert.equal(isPrivateHostname('127.0.0.1'), true);
  assert.throws(
    () => validateRemoteUrl('https://127.0.0.1/file.mid', new Set(['127.0.0.1'])),
    { code: 'PRIVATE_ARTIFACT_HOST' },
  );
  assert.throws(
    () => validateRemoteUrl('https://example.invalid/file.mid', new Set(['zenodo.org'])),
    { code: 'UNAPPROVED_ARTIFACT_HOST' },
  );
});

test('streaming download aborts as soon as it exceeds the preflight ceiling', async () => {
  const sink = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  await assert.rejects(
    pipeline(Readable.from([Buffer.alloc(3), Buffer.alloc(3)]), byteLimitTransform(5n), sink),
    (error) => error.code === 'DOWNLOAD_EXCEEDS_PREFLIGHT'
      && error.details.received_bytes === '6',
  );
});
