'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { writeMidi } = require('midi-file');
const { initializeAcquisitionDb } = require('../../../lib/midi-corpus/acquisition-db');
const {
  EVENT_FINGERPRINT_VERSION,
  fingerprintMidiBytes,
} = require('../../../lib/midi-corpus/event-fingerprint');
const { sha256Buffer } = require('../../../lib/midi-corpus/hash');
const { storeLocalArtifact } = require('../../../lib/midi-corpus/storage');

function midiFixture({ ppq = 480, scale = 1, pitch = 60 } = {}, writeOptions = {}) {
  return Buffer.from(writeMidi({
    header: { format: 0, ticksPerBeat: ppq },
    tracks: [[
      { deltaTime: 0, type: 'programChange', channel: 0, programNumber: 0 },
      { deltaTime: 0, type: 'noteOn', channel: 0, noteNumber: pitch, velocity: 90 },
      { deltaTime: 120 * scale, type: 'noteOn', channel: 0, noteNumber: 64, velocity: 80 },
      { deltaTime: 120 * scale, type: 'noteOff', channel: 0, noteNumber: pitch, velocity: 0 },
      { deltaTime: 0, type: 'noteOff', channel: 0, noteNumber: 64, velocity: 0 },
      { deltaTime: 0, type: 'endOfTrack' },
    ]],
  }, writeOptions));
}

function seedSourceItem(db) {
  db.prepare(`
    INSERT INTO metadata_imports (
      import_id, source_id, source_path, source_sha256, source_bytes, format
    ) VALUES ('fingerprint-import', 'pdmx', 'fixture', ?, 1, 'json')
  `).run('a'.repeat(64));
  db.prepare(`
    INSERT INTO source_items (
      source_id, source_item_id, artist, title, canonical_artist, canonical_title,
      artifact_locator, rights_status, usability_class, metadata_sha256, metadata_json, import_id
    ) VALUES ('pdmx', 'fingerprint-item', 'A', 'T', 'a', 't', NULL,
      'public_domain_verified', 'product_usable', ?, '{}', 'fingerprint-import')
  `).run('b'.repeat(64));
}

test('event fingerprint ignores running status and scaled PPQ encoding differences', () => {
  const explicitStatus = midiFixture({}, { running: false });
  const runningStatus = midiFixture({}, { running: true });
  const noteOnZeroOffs = midiFixture({}, { running: false, useByte9ForNoteOff: true });
  const doubledResolution = midiFixture({ ppq: 960, scale: 2 }, { running: false });

  assert.notEqual(sha256Buffer(explicitStatus), sha256Buffer(runningStatus));
  assert.notEqual(sha256Buffer(explicitStatus), sha256Buffer(noteOnZeroOffs));
  assert.notEqual(sha256Buffer(explicitStatus), sha256Buffer(doubledResolution));
  const fingerprints = [
    explicitStatus,
    runningStatus,
    noteOnZeroOffs,
    doubledResolution,
  ].map(fingerprintMidiBytes);
  assert.equal(new Set(fingerprints.map((value) => value.event_fingerprint_sha256)).size, 1);
  assert.equal(fingerprints[0].algorithm_version, EVENT_FINGERPRINT_VERSION);
  assert.equal(fingerprints[0].normalized_event_count, 5);

  const changedPitch = fingerprintMidiBytes(midiFixture({ pitch: 61 }, { running: false }));
  assert.notEqual(changedPitch.event_fingerprint_sha256, fingerprints[0].event_fingerprint_sha256);
});

test('content store keeps raw SHA identities while indexing normalized event duplicates', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midi-event-fingerprint-test-'));
  try {
    const firstPath = path.join(root, 'explicit.mid');
    const secondPath = path.join(root, 'running.mid');
    await fs.writeFile(firstPath, midiFixture({}, { running: false }));
    await fs.writeFile(secondPath, midiFixture({}, { running: true }));
    const db = initializeAcquisitionDb(path.join(root, 'acquisition.db'));
    try {
      seedSourceItem(db);
      const common = {
        db,
        sourceItemId: 'fingerprint-item',
        storeRoot: path.join(root, 'store'),
        sourceId: 'pdmx',
        rightsStatus: 'public_domain_verified',
        purpose: 'research',
        availableBytes: 30n * 1024n * 1024n * 1024n,
      };
      const first = await storeLocalArtifact({ ...common, filePath: firstPath });
      const second = await storeLocalArtifact({ ...common, filePath: secondPath });
      assert.notEqual(first.sha256, second.sha256);
      assert.equal(
        first.event_fingerprint.event_fingerprint_sha256,
        second.event_fingerprint.event_fingerprint_sha256,
      );
      assert.equal(db.prepare('SELECT count(*) count FROM artifacts').get().count, 2);
      assert.equal(db.prepare('SELECT count(*) count FROM artifact_event_fingerprints').get().count, 2);
      const rightsRows = db.prepare(`
        SELECT rights_status, usability_class, rights_decision_json FROM item_artifacts
      `).all();
      assert.equal(rightsRows.length, 2);
      assert.ok(rightsRows.every((row) => row.rights_status === 'public_domain_verified'));
      assert.ok(rightsRows.every((row) => row.usability_class === 'product_usable'));
      assert.ok(rightsRows.every((row) => (
        JSON.parse(row.rights_decision_json).usability_class === 'product_usable'
      )));
      assert.throws(
        () => db.prepare(`UPDATE item_artifacts SET usability_class = 'training'`).run(),
        /CHECK constraint failed/,
      );
      const duplicate = db.prepare('SELECT * FROM artifact_event_duplicate_groups').get();
      assert.equal(duplicate.algorithm_version, EVENT_FINGERPRINT_VERSION);
      assert.equal(duplicate.artifact_count, 2);
    } finally {
      db.close();
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('normalized event duplicates cannot be auto-accepted across split groups', () => {
  const db = initializeAcquisitionDb(':memory:');
  try {
    db.prepare(`
      INSERT INTO metadata_imports (
        import_id, source_id, source_path, source_sha256, source_bytes, format
      ) VALUES ('leakage-import', 'pdmx', 'fixture', ?, 1, 'json')
    `).run('1'.repeat(64));
    const insertItem = db.prepare(`
      INSERT INTO source_items (
        source_id, source_item_id, canonical_artist, canonical_title,
        rights_status, usability_class, metadata_sha256, metadata_json, import_id
      ) VALUES ('pdmx', ?, 'artist', 'title', 'public_domain_verified',
        'product_usable', ?, '{}', 'leakage-import')
    `);
    insertItem.run('item-train', '2'.repeat(64));
    insertItem.run('item-test', '3'.repeat(64));
    db.prepare(`
      INSERT INTO catalog_manifests (
        manifest_id, manifest_path, source_fingerprint_sha256, records_sha256, record_count
      ) VALUES ('manifest', 'fixture', ?, ?, 2)
    `).run('4'.repeat(64), '5'.repeat(64));
    const insertRecord = db.prepare(`
      INSERT INTO catalog_records (
        manifest_id, record_id, slug, canonical_artist, canonical_title,
        composition_group_id, split, source_row_sha256
      ) VALUES ('manifest', ?, ?, 'artist', 'title', ?, ?, ?)
    `);
    insertRecord.run('train-record', 'train', 'group-train', 'train', '6'.repeat(64));
    insertRecord.run('test-record', 'test', 'group-test', 'test', '7'.repeat(64));
    const insertMatch = db.prepare(`
      INSERT INTO metadata_matches (
        manifest_id, record_id, source_id, source_item_id, algorithm_version,
        score, tier, evidence_json
      ) VALUES ('manifest', ?, 'pdmx', ?, 'metadata-v1', 1.0, 'exact', '{}')
    `);
    insertMatch.run('train-record', 'item-train');
    insertMatch.run('test-record', 'item-test');

    const trainSha = '8'.repeat(64);
    const testSha = '9'.repeat(64);
    const insertArtifact = db.prepare(`
      INSERT INTO artifacts (sha256, byte_count, media_type, storage_relpath)
      VALUES (?, 1, 'audio/midi', ?)
    `);
    insertArtifact.run(trainSha, `objects/${trainSha}`);
    insertArtifact.run(testSha, `objects/${testSha}`);
    const insertFingerprint = db.prepare(`
      INSERT INTO artifact_event_fingerprints (
        artifact_sha256, algorithm_version, event_fingerprint_sha256,
        normalized_event_count, track_count, canonical_byte_count
      ) VALUES (?, ?, ?, 1, 1, 1)
    `);
    insertFingerprint.run(trainSha, EVENT_FINGERPRINT_VERSION, 'a'.repeat(64));
    insertFingerprint.run(testSha, EVENT_FINGERPRINT_VERSION, 'a'.repeat(64));
    db.prepare(`
      INSERT INTO verification_calibrations (
        calibration_id, verifier_algorithm_version, calibration_set_sha256,
        case_count, known_positive_count, known_negative_count, selected_threshold,
        true_positive_count, false_positive_count, empirical_precision,
        wilson_precision_lower_bound, known_positive_coverage, valid, frozen,
        requirements_json, result_json, provenance_json
      ) VALUES ('calibration', 'verifier-v1', ?, 100, 100, 0, 0.5,
        100, 0, 1.0, 0.99, 1.0, 1, 1, '{}', '{}', '{}')
    `).run('b'.repeat(64));

    const insertVerification = db.prepare(`
      INSERT INTO content_verification_results (
        verification_id, manifest_id, record_id, source_id, source_item_id,
        metadata_algorithm_version, verifier_algorithm_version,
        reference_sha256, candidate_sha256, feature_parameters_sha256,
        harmonic_score, total_score, transposition_semitones, calibration_id,
        applied_threshold, disposition, reference_provenance_json,
        candidate_provenance_json, result_json
      ) VALUES (?, 'manifest', ?, 'pdmx', ?, 'metadata-v1', 'verifier-v1',
        ?, ?, ?, 1.0, 1.0, 0, 'calibration', 0.5, 'auto_accept', '{}', '{}', '{}')
    `);
    insertVerification.run(
      'verification-train', 'train-record', 'item-train', 'c'.repeat(64), trainSha, 'd'.repeat(64),
    );
    assert.throws(
      () => insertVerification.run(
        'verification-test', 'test-record', 'item-test', 'e'.repeat(64), testSha, 'f'.repeat(64),
      ),
      /normalized external MIDI cannot cross composition groups or splits/,
    );
    assert.equal(
      db.prepare('SELECT count(*) count FROM external_artifact_event_fingerprint_assignments').get().count,
      1,
    );
  } finally {
    db.close();
  }
});
