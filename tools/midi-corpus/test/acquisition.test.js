'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const {
  ACQUISITION_SCHEMA_VERSION,
  initializeAcquisitionDb,
} = require('../../../lib/midi-corpus/acquisition-db');
const { buildCatalogManifest } = require('../../../lib/midi-corpus/catalog-manifest');
const { matchManifestMetadata } = require('../../../lib/midi-corpus/matching');
const { discoverMetadataFiles, importMetadataFile } = require('../../../lib/midi-corpus/metadata');
const {
  USABILITY_CLASSES,
  classifyUsabilityClass,
  evaluateArtifactRights,
} = require('../../../lib/midi-corpus/source-policies');
const { createCatalogFixture } = require('../../corpus/test/fixtures');

async function withTempDir(callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midi-acquisition-test-'));
  try {
    return await callback(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('acquisition schema imports offline metadata and stores metadata-only matches', async () => {
  await withTempDir(async (root) => {
    const catalogPath = createCatalogFixture(path.join(root, 'android', 'catalog.db'));
    const manifestDir = path.join(root, 'manifest');
    await buildCatalogManifest({ catalogPath, outputDir: manifestDir });
    const metadataDir = path.join(root, 'metadata');
    await fs.mkdir(metadataDir);
    const metadataPath = path.join(metadataDir, 'pdmx.ndjson');
    await fs.writeFile(metadataPath, [
      JSON.stringify({
        id: 'pdmx-1',
        artist_name: 'Example Band',
        song_name: 'Same Song - Remastered',
        rights_status: 'public_domain_verified',
        license_url: 'https://creativecommons.org/publicdomain/mark/1.0/',
        midi_path: 'mid/example.mid',
      }),
      JSON.stringify({ id: 'pdmx-2', artist: 'Unmatched Artist', title: 'Unknown Work' }),
      JSON.stringify('reject scalar'),
    ].join('\n') + '\n');

    assert.deepEqual(await discoverMetadataFiles([metadataDir]), [metadataPath]);
    const db = initializeAcquisitionDb(path.join(root, 'acquisition.db'));
    try {
      assert.equal(Number(db.prepare('PRAGMA user_version').get().user_version), ACQUISITION_SCHEMA_VERSION);
      assert.ok(Number(db.prepare('SELECT count(*) count FROM source_policies').get().count) >= 10);
      const imported = await importMetadataFile(db, { sourceId: 'pdmx', filePath: metadataPath });
      assert.equal(imported.rows, 2);
      assert.equal(imported.rejected, 1);
      const repeated = await importMetadataFile(db, { sourceId: 'pdmx', filePath: metadataPath });
      assert.equal(repeated.already_imported, true);
      const rightsRows = db.prepare(`
        SELECT source_item_id, rights_status, usability_class, rights_evidence
        FROM source_items ORDER BY source_item_id
      `).all();
      assert.deepEqual(rightsRows.map((row) => [row.source_item_id, row.usability_class]), [
        ['pdmx-1', 'product_usable'],
        ['pdmx-2', 'metadata_only'],
      ]);
      assert.equal(rightsRows[0].rights_status, 'public_domain_verified');
      assert.match(rightsRows[0].rights_evidence, /creativecommons\.org/);
      assert.throws(
        () => db.prepare(`UPDATE source_items SET usability_class = 'training'`).run(),
        /CHECK constraint failed/,
      );

      const matches = await matchManifestMetadata(db, {
        sourceId: 'pdmx',
        manifestDir,
        minimumScore: 0.9,
      });
      assert.equal(matches.content_verification_required, true);
      assert.equal(matches.matched_records, 2);
      const stored = db.prepare(`
        SELECT score, tier, evidence_json FROM metadata_matches ORDER BY record_id
      `).all();
      assert.equal(stored.length, 2);
      assert.ok(stored.every((row) => row.score === 1 && row.tier === 'exact'));
      assert.ok(stored.every((row) => JSON.parse(row.evidence_json).requires_content_verification));
    } finally {
      db.close();
    }
  });
});

test('policy registry separates open, research, contract, and blocked sources', () => {
  assert.deepEqual([...USABILITY_CLASSES], [
    'product_usable', 'research_only', 'metadata_only', 'excluded',
  ]);
  const openDecision = evaluateArtifactRights({
    sourceId: 'pdmx', rightsStatus: 'public_domain_verified', purpose: 'product',
  });
  assert.equal(openDecision.allowed, true);
  assert.equal(openDecision.usability_class, 'product_usable');
  assert.equal(evaluateArtifactRights({
    sourceId: 'lakh', rightsStatus: 'research_only_unverified', purpose: 'research',
  }).allowed, true);
  assert.equal(evaluateArtifactRights({
    sourceId: 'lakh', rightsStatus: 'research_only_unverified', purpose: 'product',
  }).allowed, false);
  assert.equal(evaluateArtifactRights({
    sourceId: 'musescore', rightsStatus: 'public_domain_verified', purpose: 'research',
  }).allowed, false);
  assert.equal(classifyUsabilityClass({
    sourceId: 'pdmx', rightsStatus: 'public_domain_verified', entity: 'source_item',
  }), 'product_usable');
  assert.equal(classifyUsabilityClass({
    sourceId: 'lakh', rightsStatus: 'research_only_unverified', entity: 'source_item',
  }), 'research_only');
  assert.equal(classifyUsabilityClass({
    sourceId: 'musicbrainz', rightsStatus: 'metadata_only', entity: 'source_item',
  }), 'metadata_only');
  assert.equal(classifyUsabilityClass({
    sourceId: 'spotify', rightsStatus: 'platform_restricted', entity: 'source_item',
  }), 'excluded');
  assert.equal(classifyUsabilityClass({
    sourceId: 'musicbrainz', rightsStatus: 'metadata_only', entity: 'artifact',
  }), 'excluded');
});

test('schema v4 databases migrate constrained source-item and artifact usability classes', async () => {
  await withTempDir(async (root) => {
    const dbPath = path.join(root, 'legacy-v4.db');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      PRAGMA user_version = 4;
      CREATE TABLE source_policies (
        source_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, policy_version TEXT NOT NULL,
        policy_sha256 TEXT NOT NULL, metadata_mode TEXT NOT NULL, automation_policy TEXT NOT NULL,
        artifact_mode TEXT NOT NULL, default_rights_status TEXT NOT NULL, policy_json TEXT NOT NULL
      );
      CREATE TABLE metadata_imports (
        import_id TEXT PRIMARY KEY, source_id TEXT NOT NULL, source_path TEXT NOT NULL,
        source_sha256 TEXT NOT NULL, source_bytes INTEGER NOT NULL, format TEXT NOT NULL,
        row_count INTEGER NOT NULL DEFAULT 0, rejected_count INTEGER NOT NULL DEFAULT 0,
        imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE source_items (
        source_id TEXT NOT NULL, source_item_id TEXT NOT NULL, artist TEXT, title TEXT,
        canonical_artist TEXT NOT NULL, canonical_title TEXT NOT NULL, recording_mbid TEXT,
        work_mbid TEXT, isrc TEXT, artifact_locator TEXT, rights_status TEXT NOT NULL,
        rights_evidence TEXT, metadata_sha256 TEXT NOT NULL, metadata_json TEXT NOT NULL,
        import_id TEXT NOT NULL, PRIMARY KEY (source_id, source_item_id)
      );
      CREATE TABLE artifacts (
        sha256 TEXT PRIMARY KEY, byte_count INTEGER NOT NULL, media_type TEXT NOT NULL,
        storage_relpath TEXT NOT NULL UNIQUE, first_stored_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE item_artifacts (
        source_id TEXT NOT NULL, source_item_id TEXT NOT NULL, artifact_sha256 TEXT NOT NULL,
        rights_status TEXT NOT NULL, rights_decision_json TEXT NOT NULL,
        source_file_sha256 TEXT NOT NULL, linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (source_id, source_item_id, artifact_sha256)
      );
      INSERT INTO metadata_imports (
        import_id, source_id, source_path, source_sha256, source_bytes, format
      ) VALUES ('legacy-import', 'pdmx', 'fixture', '${'a'.repeat(64)}', 1, 'json');
      INSERT INTO source_items (
        source_id, source_item_id, canonical_artist, canonical_title, rights_status,
        metadata_sha256, metadata_json, import_id
      ) VALUES ('pdmx', 'open', 'artist', 'title', 'public_domain_verified',
        '${'b'.repeat(64)}', '{}', 'legacy-import');
      INSERT INTO artifacts (sha256, byte_count, media_type, storage_relpath)
      VALUES ('${'c'.repeat(64)}', 1, 'audio/midi', 'objects/cc');
      INSERT INTO item_artifacts (
        source_id, source_item_id, artifact_sha256, rights_status,
        rights_decision_json, source_file_sha256
      ) VALUES ('pdmx', 'open', '${'c'.repeat(64)}', 'public_domain_verified',
        '{"raw":"preserved"}', '${'c'.repeat(64)}');
    `);
    legacy.close();

    const migrated = initializeAcquisitionDb(dbPath);
    try {
      assert.equal(Number(migrated.prepare('PRAGMA user_version').get().user_version), 5);
      assert.deepEqual(
        { ...migrated.prepare(`SELECT rights_status, usability_class FROM source_items`).get() },
        { rights_status: 'public_domain_verified', usability_class: 'product_usable' },
      );
      assert.deepEqual(
        { ...migrated.prepare(`SELECT rights_status, usability_class, rights_decision_json FROM item_artifacts`).get() },
        {
          rights_status: 'public_domain_verified',
          usability_class: 'product_usable',
          rights_decision_json: '{"raw":"preserved"}',
        },
      );
    } finally {
      migrated.close();
    }
  });
});

test('both CLI modules are directly runnable', () => {
  const corpusCli = path.resolve(__dirname, '../../corpus/cli.js');
  const acquisitionCli = path.resolve(__dirname, '../cli.js');
  for (const cli of [corpusCli, acquisitionCli]) {
    const result = spawnSync(process.execPath, [cli, 'help'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage:/);
  }
});
