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
const {
  CALIBRATION_REQUIREMENTS,
  persistCalibration,
  selectCalibrationThreshold,
  wilsonLowerBound,
} = require('../../../lib/midi-corpus/calibration');
const {
  FEATURE_SCHEMA_VERSION,
  VERIFIER_ALGORITHM_VERSION,
  compareMusicalFeatures,
  extractMusicalFeatures,
  loadFeatureInput,
  verifyContentMatch,
} = require('../../../lib/midi-corpus/content-verification');

function pitchClasses(root) {
  return [root, (root + 4) % 12, (root + 7) % 12].sort((left, right) => left - right);
}

function featureDocument(roots, pitches, options = {}) {
  const start = options.startBeat || 0;
  const spacing = options.spacing || 2;
  return {
    schema_version: FEATURE_SCHEMA_VERSION,
    harmony: roots.map((root, index) => ({
      root_pc: root,
      pitch_classes: pitchClasses(root),
      quality: 'major',
      beat: start + index * spacing,
      duration: spacing,
    })),
    melody: pitches.map((pitch, index) => ({
      pitch,
      beat: start + index * (spacing / 2),
      duration: spacing / 2,
    })),
  };
}

function fixtureMatchDb(dbPath = ':memory:') {
  const db = initializeAcquisitionDb(dbPath);
  db.prepare(`
    INSERT INTO metadata_imports (
      import_id, source_id, source_path, source_sha256, source_bytes, format, row_count
    ) VALUES ('import-1', 'pdmx', 'fixture.ndjson', ?, 1, 'ndjson', 1)
  `).run('a'.repeat(64));
  db.prepare(`
    INSERT INTO source_items (
      source_id, source_item_id, artist, title, canonical_artist, canonical_title,
      rights_status, usability_class, metadata_sha256, metadata_json, import_id
    ) VALUES ('pdmx', 'item-1', 'Example', 'Song', 'example', 'song',
      'public_domain_verified', 'product_usable', ?, '{}', 'import-1')
  `).run('b'.repeat(64));
  db.prepare(`
    INSERT INTO catalog_manifests (
      manifest_id, manifest_path, source_fingerprint_sha256, records_sha256, record_count
    ) VALUES ('manifest-1', 'fixture', ?, ?, 1)
  `).run('c'.repeat(64), 'd'.repeat(64));
  db.prepare(`
    INSERT INTO catalog_records (
      manifest_id, record_id, slug, artist, title, canonical_artist, canonical_title,
      composition_group_id, split, source_row_sha256
    ) VALUES ('manifest-1', 'hooktheory:example__song', 'example__song', 'Example', 'Song',
      'example', 'song', ?, 'test', ?)
  `).run('e'.repeat(64), 'f'.repeat(64));
  db.prepare(`
    INSERT INTO metadata_matches (
      manifest_id, record_id, source_id, source_item_id, algorithm_version,
      score, tier, evidence_json
    ) VALUES ('manifest-1', 'hooktheory:example__song', 'pdmx', 'item-1',
      'artist-title-metadata-v1', 1.0, 'exact', '{}')
  `).run();
  return db;
}

function verificationOptions(reference, candidate) {
  return {
    manifestId: 'manifest-1',
    recordId: 'hooktheory:example__song',
    sourceId: 'pdmx',
    sourceItemId: 'item-1',
    metadataAlgorithmVersion: 'artist-title-metadata-v1',
    reference,
    candidate,
  };
}

function validCalibrationCases() {
  const cases = [];
  for (let index = 0; index < 220; index += 1) {
    cases.push({ case_id: `positive-${index}`, known_positive: true, score: 0.90 + (index % 10) / 1000, benchmark_source_id: 'multtipop', benchmark_partition: 'development' });
  }
  for (let index = 0; index < 60; index += 1) {
    cases.push({ case_id: `negative-${index}`, known_positive: false, score: 0.20 + (index % 20) / 100, benchmark_source_id: 'multtipop', benchmark_partition: 'development' });
  }
  return cases;
}

test('harmonic alignment tolerates global transposition and candidate subsequences', () => {
  const reference = featureDocument([0, 5, 7, 0], [60, 62, 64, 65, 67]);
  const candidate = featureDocument([4, 2, 7, 9, 2, 11], [55, 62, 64, 66, 67, 69, 72], { startBeat: -2 });
  const result = compareMusicalFeatures(reference, candidate);
  assert.equal(result.harmonic.transposition_semitones, -2);
  assert.deepEqual(result.harmonic.reference_span, [0, 4]);
  assert.deepEqual(result.harmonic.candidate_span, [1, 5]);
  assert.equal(result.harmonic.coverage, 1);
  assert.ok(result.harmonic.score > 0.99, JSON.stringify(result.harmonic));
  assert.ok(result.melody.score > 0.99, JSON.stringify(result.melody));
  assert.ok(result.rhythm.score > 0.99, JSON.stringify(result.rhythm));
  assert.ok(result.total_score > 0.99, JSON.stringify(result));

  const wrong = featureDocument([1, 6, 11, 4], [72, 65, 59, 54, 48], { spacing: 3 });
  const wrongResult = compareMusicalFeatures(reference, wrong);
  assert.ok(wrongResult.total_score < result.total_score - 0.25, JSON.stringify(wrongResult));
});

test('feature extraction accepts Hooktheory sections and MIDI analyzer documents', () => {
  const referenceSection = {
    sectionName: 'Chorus',
    chords: [1, 4, 5, 1].map((root, index) => ({
      root, type: 5, applied: 0, beat: 1 + index * 2, duration: 2,
    })),
    notes: [1, 2, 3, 4, 5].map((sd, index) => ({
      sd: String(sd), octave: 0, beat: 1 + index, duration: 1,
    })),
    metadata: { keys: [{ tonic: 'C', scale: 'major', beat: 1 }] },
  };
  const analyzerDocument = {
    schemaVersion: 'hooktheory.midi-analysis.v1',
    sections: [{
      name: 'Detected Chorus',
      hooktheory: {
        ...referenceSection,
        sectionName: 'Detected Chorus',
        metadata: { keys: [{ tonic: 'D', scale: 'major', beat: 1 }] },
      },
    }],
  };
  const reference = extractMusicalFeatures(referenceSection).features;
  const candidate = extractMusicalFeatures(analyzerDocument).features;
  const result = compareMusicalFeatures(reference, candidate);
  assert.equal(reference.section, 'Chorus');
  assert.equal(candidate.section, 'Detected Chorus');
  assert.equal(result.harmonic.transposition_semitones, -2);
  assert.ok(result.total_score > 0.99, JSON.stringify(result));
});

test('feature loader analyzes a local MIDI candidate without an intermediate JSON file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midi-feature-input-'));
  try {
    const { renderSectionToMidi } = await import('../../../lib/midi/render/index.mjs');
    const rendered = renderSectionToMidi({
      sectionName: 'Candidate',
      chords: [{ root: 1, type: 5, beat: 1, duration: 2 }],
      notes: [{ sd: '1', octave: 0, beat: 1, duration: 1 }],
      metadata: {
        keys: [{ tonic: 'C', scale: 'major', beat: 1 }],
        tempos: [{ bpm: 120, beat: 1 }],
        meters: [{ numBeats: 4, beatUnit: 1, beat: 1 }],
        endBeat: 3,
      },
    });
    const midiPath = path.join(root, 'candidate.mid');
    await fs.writeFile(midiPath, rendered.bytes);
    const loaded = await loadFeatureInput(midiPath);
    assert.equal(loaded.provenance.kind, 'local_midi_file');
    assert.equal(loaded.provenance.analyzer_schema_version, 'hooktheory.midi-analysis.v1');
    assert.ok(loaded.features.harmony.length >= 1);
    assert.match(loaded.provenance.document_sha256, /^[a-f0-9]{64}$/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('calibration threshold requires both strict Wilson precision and positive coverage', () => {
  const valid = selectCalibrationThreshold(validCalibrationCases());
  assert.equal(valid.valid, true);
  assert.equal(valid.frozen, true);
  assert.ok(valid.wilson_precision_lower_bound >= 0.98);
  assert.ok(valid.known_positive_coverage >= 0.50);
  assert.equal(valid.false_positive_count, 0);
  assert.equal(valid.selected_threshold, 0.90);

  const tooSmall = [];
  for (let index = 0; index < 60; index += 1) {
    tooSmall.push({ case_id: `p-${index}`, known_positive: true, score: 0.99, benchmark_source_id: 'multtipop', benchmark_partition: 'development' });
  }
  for (let index = 0; index < 20; index += 1) {
    tooSmall.push({ case_id: `n-${index}`, known_positive: false, score: 0.1, benchmark_source_id: 'multtipop', benchmark_partition: 'development' });
  }
  const invalid = selectCalibrationThreshold(tooSmall);
  assert.equal(invalid.valid, false);
  assert.equal(invalid.frozen, false);
  assert.equal(invalid.selected_threshold, null);
  assert.ok(invalid.failure_reasons.includes('wilson_precision_lower_bound_below_0.98'));
  assert.ok(wilsonLowerBound(60, 60) < CALIBRATION_REQUIREMENTS.minimum_wilson_precision_lower_bound);
  assert.throws(
    () => selectCalibrationThreshold([{
      case_id: 'frozen-test-case',
      known_positive: true,
      score: 1,
      benchmark_source_id: 'multtipop',
      benchmark_partition: 'test',
    }]),
    (error) => error.code === 'CALIBRATION_TEST_LEAKAGE',
  );
});

test('accepted external MIDI cannot cross composition groups or frozen splits', async () => {
  const db = fixtureMatchDb();
  try {
    persistCalibration(db, validCalibrationCases());
    const reference = featureDocument([0, 5, 7, 0], [60, 62, 64, 65, 67]);
    const candidate = featureDocument([4, 2, 7, 9, 2, 11], [55, 62, 64, 66, 67, 69, 72], { startBeat: -2 });
    const first = await verifyContentMatch(db, verificationOptions(reference, candidate));
    assert.equal(first.disposition, 'auto_accept');
    db.prepare(`
      INSERT INTO catalog_records (
        manifest_id, record_id, slug, artist, title, canonical_artist, canonical_title,
        composition_group_id, split, source_row_sha256
      ) VALUES ('manifest-1', 'hooktheory:other__song', 'other__song', 'Other', 'Song',
        'other', 'song', ?, 'train', ?)
    `).run('1'.repeat(64), '2'.repeat(64));
    db.prepare(`
      INSERT INTO metadata_matches (
        manifest_id, record_id, source_id, source_item_id, algorithm_version,
        score, tier, evidence_json
      ) VALUES ('manifest-1', 'hooktheory:other__song', 'pdmx', 'item-1',
        'artist-title-metadata-v1', 1.0, 'exact', '{}')
    `).run();
    await assert.rejects(
      verifyContentMatch(db, {
        ...verificationOptions(reference, candidate),
        recordId: 'hooktheory:other__song',
      }),
      /external MIDI cannot cross composition groups or splits/,
    );
    assert.equal(db.prepare('SELECT count(*) count FROM external_artifact_split_assignments').get().count, 1);
  } finally {
    db.close();
  }
});

test('verification persists provenance and cannot auto-accept without valid frozen calibration', async () => {
  const db = fixtureMatchDb();
  try {
    const reference = featureDocument([0, 5, 7, 0], [60, 62, 64, 65, 67]);
    const candidate = featureDocument([4, 2, 7, 9, 2, 11], [55, 62, 64, 66, 67, 69, 72], { startBeat: -2 });
    assert.equal(
      db.prepare('SELECT content_disposition FROM metadata_match_gate').get().content_disposition,
      'quarantine_unverified',
    );
    const uncalibrated = await verifyContentMatch(db, verificationOptions(reference, candidate));
    assert.equal(uncalibrated.disposition, 'quarantine_no_frozen_calibration');
    assert.equal(uncalibrated.calibration, null);
    assert.match(uncalibrated.reference_provenance.feature_sha256, /^[a-f0-9]{64}$/);
    assert.equal(
      db.prepare('SELECT content_disposition FROM metadata_match_gate').get().content_disposition,
      'quarantine_no_frozen_calibration',
    );
    assert.throws(
      () => db.prepare(`
        UPDATE content_verification_results
        SET disposition = 'auto_accept', applied_threshold = 0.5
        WHERE verification_id = ?
      `).run(uncalibrated.verification_id),
      /auto_accept|CHECK constraint failed/,
    );

    const invalidCases = [];
    for (let index = 0; index < 40; index += 1) {
      invalidCases.push({ case_id: `small-p-${index}`, known_positive: true, score: 0.99, benchmark_source_id: 'multtipop', benchmark_partition: 'development' });
    }
    invalidCases.push({ case_id: 'small-n', known_positive: false, score: 0.1, benchmark_source_id: 'multtipop', benchmark_partition: 'development' });
    const invalid = persistCalibration(db, invalidCases);
    assert.equal(invalid.valid, false);
    assert.equal(invalid.active, false);
    assert.equal(db.prepare('SELECT count(*) count FROM active_verification_calibrations').get().count, 0);

    const calibrated = persistCalibration(db, validCalibrationCases());
    assert.equal(calibrated.valid, true);
    assert.equal(calibrated.active, true);
    assert.ok(calibrated.wilson_precision_lower_bound >= 0.98);
    const accepted = await verifyContentMatch(db, verificationOptions(reference, candidate));
    assert.equal(accepted.disposition, 'auto_accept');
    assert.equal(accepted.calibration.calibration_id, calibrated.calibration_id);
    assert.equal(accepted.calibration.frozen, true);
    assert.throws(
      () => db.prepare(`
        UPDATE verification_calibrations SET selected_threshold = 0
        WHERE calibration_id = ?
      `).run(calibrated.calibration_id),
      /frozen calibration rows are immutable/,
    );
    const persisted = db.prepare(`
      SELECT disposition, reference_provenance_json, candidate_provenance_json
      FROM content_verification_results WHERE verification_id = ?
    `).get(accepted.verification_id);
    assert.equal(persisted.disposition, 'auto_accept');
    assert.equal(JSON.parse(persisted.reference_provenance_json).kind, 'inline_json');
    assert.equal(JSON.parse(persisted.candidate_provenance_json).kind, 'inline_json');
    assert.equal(
      db.prepare('SELECT content_disposition FROM metadata_match_gate').get().content_disposition,
      'auto_accept',
    );
  } finally {
    db.close();
  }
});

test('schema version 1 databases migrate to the current guarded verification and rights schema', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midi-corpus-migration-test-'));
  const dbPath = path.join(root, 'acquisition.db');
  try {
    const legacy = new DatabaseSync(dbPath);
    legacy.exec('PRAGMA user_version = 1');
    legacy.close();
    const migrated = initializeAcquisitionDb(dbPath);
    try {
      assert.equal(
        Number(migrated.prepare('PRAGMA user_version').get().user_version),
        ACQUISITION_SCHEMA_VERSION,
      );
      const tables = new Set(migrated.prepare(`
        SELECT name FROM sqlite_master WHERE type IN ('table', 'view')
      `).all().map((row) => row.name));
      assert.ok(tables.has('verification_calibrations'));
      assert.ok(tables.has('content_verification_results'));
      assert.ok(tables.has('metadata_match_gate'));
      assert.ok(tables.has('external_artifact_split_assignments'));
      assert.ok(tables.has('artifact_event_fingerprints'));
      assert.ok(tables.has('artifact_event_duplicate_groups'));
      assert.deepEqual(
        migrated.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((row) => row.version),
        Array.from({ length: ACQUISITION_SCHEMA_VERSION }, (_value, index) => index + 1),
      );
    } finally {
      migrated.close();
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('verification CLI exposes offline verify and calibrate commands', () => {
  assert.equal(VERIFIER_ALGORITHM_VERSION, 'musical-content-local-alignment/v1');
  const cli = require('../cli');
  assert.match(cli.HELP, /\bverify\b/);
  assert.match(cli.HELP, /\bcalibrate\b/);
  assert.match(cli.HELP, /98% Wilson precision lower bound/);
});

test('verification CLI calibrates and verifies using local files only', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midi-content-cli-test-'));
  try {
    const dbPath = path.join(root, 'acquisition.db');
    fixtureMatchDb(dbPath).close();
    const referencePath = path.join(root, 'reference.json');
    const candidatePath = path.join(root, 'candidate.json');
    const labelsPath = path.join(root, 'labels.json');
    await fs.writeFile(referencePath, JSON.stringify(
      featureDocument([0, 5, 7, 0], [60, 62, 64, 65, 67]),
    ));
    await fs.writeFile(candidatePath, JSON.stringify(
      featureDocument([4, 2, 7, 9, 2, 11], [55, 62, 64, 66, 67, 69, 72], { startBeat: -2 }),
    ));
    await fs.writeFile(labelsPath, JSON.stringify(validCalibrationCases()));
    const cliPath = path.resolve(__dirname, '../cli.js');
    const calibrated = spawnSync(process.execPath, [
      cliPath, 'calibrate', '--db', dbPath, '--labels', labelsPath,
    ], { encoding: 'utf8' });
    assert.equal(calibrated.status, 0, calibrated.stderr);
    assert.equal(JSON.parse(calibrated.stdout).valid, true);
    const verified = spawnSync(process.execPath, [
      cliPath,
      'verify',
      '--db', dbPath,
      '--manifest-id', 'manifest-1',
      '--record-id', 'hooktheory:example__song',
      '--source', 'pdmx',
      '--source-item-id', 'item-1',
      '--metadata-algorithm', 'artist-title-metadata-v1',
      '--reference', referencePath,
      '--candidate', candidatePath,
    ], { encoding: 'utf8' });
    assert.equal(verified.status, 0, verified.stderr);
    const result = JSON.parse(verified.stdout);
    assert.equal(result.disposition, 'auto_accept');
    assert.equal(result.reference_provenance.kind, 'local_json_file');
    assert.equal(result.candidate_provenance.kind, 'local_json_file');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
