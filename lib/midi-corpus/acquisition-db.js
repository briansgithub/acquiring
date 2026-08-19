'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const {
  classifyUsabilityClass,
  listSourcePolicies,
  sourcePolicyHash,
} = require('./source-policies');
const { stableStringify } = require('./stable-json');

const ACQUISITION_SCHEMA_VERSION = 5;
const USABILITY_CLASS_SQL = "('product_usable', 'research_only', 'metadata_only', 'excluded')";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS source_policies (
  source_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  policy_sha256 TEXT NOT NULL,
  metadata_mode TEXT NOT NULL,
  automation_policy TEXT NOT NULL,
  artifact_mode TEXT NOT NULL,
  default_rights_status TEXT NOT NULL,
  policy_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS metadata_imports (
  import_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES source_policies(source_id),
  source_path TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  source_bytes INTEGER NOT NULL CHECK (source_bytes >= 0),
  format TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  rejected_count INTEGER NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS source_items (
  source_id TEXT NOT NULL REFERENCES source_policies(source_id),
  source_item_id TEXT NOT NULL,
  artist TEXT,
  title TEXT,
  canonical_artist TEXT NOT NULL,
  canonical_title TEXT NOT NULL,
  recording_mbid TEXT,
  work_mbid TEXT,
  isrc TEXT,
  artifact_locator TEXT,
  rights_status TEXT NOT NULL,
  usability_class TEXT NOT NULL CHECK (usability_class IN ${USABILITY_CLASS_SQL}),
  rights_evidence TEXT,
  metadata_sha256 TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  import_id TEXT NOT NULL REFERENCES metadata_imports(import_id),
  PRIMARY KEY (source_id, source_item_id)
);
CREATE INDEX IF NOT EXISTS source_items_title_artist_idx
  ON source_items(source_id, canonical_title, canonical_artist);
CREATE INDEX IF NOT EXISTS source_items_artist_title_idx
  ON source_items(source_id, canonical_artist, canonical_title);
CREATE INDEX IF NOT EXISTS source_items_recording_mbid_idx
  ON source_items(recording_mbid) WHERE recording_mbid IS NOT NULL;

CREATE TABLE IF NOT EXISTS catalog_manifests (
  manifest_id TEXT PRIMARY KEY,
  manifest_path TEXT NOT NULL,
  source_fingerprint_sha256 TEXT NOT NULL,
  records_sha256 TEXT NOT NULL,
  record_count INTEGER NOT NULL CHECK (record_count >= 0),
  registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS catalog_records (
  manifest_id TEXT NOT NULL REFERENCES catalog_manifests(manifest_id),
  record_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  artist TEXT,
  title TEXT,
  canonical_artist TEXT NOT NULL,
  canonical_title TEXT NOT NULL,
  composition_group_id TEXT NOT NULL,
  split TEXT NOT NULL CHECK (split IN ('train', 'validation', 'test')),
  source_row_sha256 TEXT NOT NULL,
  PRIMARY KEY (manifest_id, record_id)
);
CREATE INDEX IF NOT EXISTS catalog_records_title_artist_idx
  ON catalog_records(manifest_id, canonical_title, canonical_artist);
CREATE INDEX IF NOT EXISTS catalog_records_group_idx
  ON catalog_records(manifest_id, composition_group_id);

CREATE TABLE IF NOT EXISTS metadata_matches (
  manifest_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_item_id TEXT NOT NULL,
  algorithm_version TEXT NOT NULL,
  score REAL NOT NULL CHECK (score >= 0.0 AND score <= 1.0),
  tier TEXT NOT NULL CHECK (tier IN ('exact', 'strong', 'candidate')),
  evidence_json TEXT NOT NULL,
  matched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (manifest_id, record_id, source_id, source_item_id, algorithm_version),
  FOREIGN KEY (manifest_id, record_id) REFERENCES catalog_records(manifest_id, record_id),
  FOREIGN KEY (source_id, source_item_id) REFERENCES source_items(source_id, source_item_id)
);
CREATE INDEX IF NOT EXISTS metadata_matches_score_idx
  ON metadata_matches(manifest_id, source_id, score DESC);

CREATE TABLE IF NOT EXISTS acquisition_jobs (
  job_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_item_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  rights_status TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('planned', 'approved', 'stored', 'rejected', 'failed')),
  expected_bytes INTEGER CHECK (expected_bytes IS NULL OR expected_bytes >= 0),
  storage_preflight_json TEXT,
  rights_decision_json TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_id, source_item_id) REFERENCES source_items(source_id, source_item_id)
);

CREATE TABLE IF NOT EXISTS artifacts (
  sha256 TEXT PRIMARY KEY CHECK (length(sha256) = 64),
  byte_count INTEGER NOT NULL CHECK (byte_count >= 0),
  media_type TEXT NOT NULL,
  storage_relpath TEXT NOT NULL UNIQUE,
  first_stored_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS item_artifacts (
  source_id TEXT NOT NULL,
  source_item_id TEXT NOT NULL,
  artifact_sha256 TEXT NOT NULL REFERENCES artifacts(sha256),
  rights_status TEXT NOT NULL,
  usability_class TEXT NOT NULL CHECK (usability_class IN ${USABILITY_CLASS_SQL}),
  rights_decision_json TEXT NOT NULL,
  source_file_sha256 TEXT NOT NULL,
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_id, source_item_id, artifact_sha256),
  FOREIGN KEY (source_id, source_item_id) REFERENCES source_items(source_id, source_item_id)
);

CREATE TABLE IF NOT EXISTS artifact_event_fingerprints (
  artifact_sha256 TEXT NOT NULL REFERENCES artifacts(sha256),
  algorithm_version TEXT NOT NULL,
  event_fingerprint_sha256 TEXT NOT NULL CHECK (length(event_fingerprint_sha256) = 64),
  normalized_event_count INTEGER NOT NULL CHECK (normalized_event_count >= 0),
  track_count INTEGER NOT NULL CHECK (track_count >= 0),
  canonical_byte_count INTEGER NOT NULL CHECK (canonical_byte_count >= 0),
  fingerprinted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (artifact_sha256, algorithm_version)
);
CREATE INDEX IF NOT EXISTS artifact_event_fingerprint_idx
  ON artifact_event_fingerprints(algorithm_version, event_fingerprint_sha256);

CREATE TABLE IF NOT EXISTS verification_calibrations (
  calibration_id TEXT PRIMARY KEY,
  verifier_algorithm_version TEXT NOT NULL,
  calibration_set_sha256 TEXT NOT NULL,
  case_count INTEGER NOT NULL CHECK (case_count >= 0),
  known_positive_count INTEGER NOT NULL CHECK (known_positive_count >= 0),
  known_negative_count INTEGER NOT NULL CHECK (known_negative_count >= 0),
  selected_threshold REAL CHECK (selected_threshold IS NULL OR (selected_threshold >= 0.0 AND selected_threshold <= 1.0)),
  true_positive_count INTEGER NOT NULL CHECK (true_positive_count >= 0),
  false_positive_count INTEGER NOT NULL CHECK (false_positive_count >= 0),
  empirical_precision REAL NOT NULL CHECK (empirical_precision >= 0.0 AND empirical_precision <= 1.0),
  wilson_precision_lower_bound REAL NOT NULL CHECK (wilson_precision_lower_bound >= 0.0 AND wilson_precision_lower_bound <= 1.0),
  known_positive_coverage REAL NOT NULL CHECK (known_positive_coverage >= 0.0 AND known_positive_coverage <= 1.0),
  valid INTEGER NOT NULL CHECK (valid IN (0, 1)),
  frozen INTEGER NOT NULL CHECK (frozen IN (0, 1)),
  requirements_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (valid = 0 OR (frozen = 1 AND selected_threshold IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS verification_calibration_cases (
  calibration_id TEXT NOT NULL REFERENCES verification_calibrations(calibration_id),
  case_id TEXT NOT NULL,
  verification_id TEXT,
  known_positive INTEGER NOT NULL CHECK (known_positive IN (0, 1)),
  score REAL NOT NULL CHECK (score >= 0.0 AND score <= 1.0),
  case_provenance_json TEXT NOT NULL,
  PRIMARY KEY (calibration_id, case_id)
);

CREATE TABLE IF NOT EXISTS active_verification_calibrations (
  verifier_algorithm_version TEXT PRIMARY KEY,
  calibration_id TEXT NOT NULL UNIQUE REFERENCES verification_calibrations(calibration_id),
  activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS content_verification_results (
  verification_id TEXT PRIMARY KEY,
  manifest_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_item_id TEXT NOT NULL,
  metadata_algorithm_version TEXT NOT NULL,
  verifier_algorithm_version TEXT NOT NULL,
  reference_sha256 TEXT NOT NULL CHECK (length(reference_sha256) = 64),
  candidate_sha256 TEXT NOT NULL CHECK (length(candidate_sha256) = 64),
  feature_parameters_sha256 TEXT NOT NULL CHECK (length(feature_parameters_sha256) = 64),
  harmonic_score REAL NOT NULL CHECK (harmonic_score >= 0.0 AND harmonic_score <= 1.0),
  melody_score REAL CHECK (melody_score IS NULL OR (melody_score >= 0.0 AND melody_score <= 1.0)),
  rhythm_score REAL CHECK (rhythm_score IS NULL OR (rhythm_score >= 0.0 AND rhythm_score <= 1.0)),
  total_score REAL NOT NULL CHECK (total_score >= 0.0 AND total_score <= 1.0),
  transposition_semitones INTEGER NOT NULL CHECK (transposition_semitones BETWEEN -6 AND 5),
  calibration_id TEXT REFERENCES verification_calibrations(calibration_id),
  applied_threshold REAL CHECK (applied_threshold IS NULL OR (applied_threshold >= 0.0 AND applied_threshold <= 1.0)),
  disposition TEXT NOT NULL CHECK (disposition IN (
    'auto_accept', 'quarantine_no_frozen_calibration', 'quarantine_below_threshold'
  )),
  reference_provenance_json TEXT NOT NULL,
  candidate_provenance_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (disposition != 'auto_accept' OR (
    calibration_id IS NOT NULL AND applied_threshold IS NOT NULL AND total_score >= applied_threshold
  )),
  FOREIGN KEY (
    manifest_id, record_id, source_id, source_item_id, metadata_algorithm_version
  ) REFERENCES metadata_matches (
    manifest_id, record_id, source_id, source_item_id, algorithm_version
  )
);
CREATE INDEX IF NOT EXISTS content_verification_match_idx ON content_verification_results (
  manifest_id, record_id, source_id, source_item_id, metadata_algorithm_version, verified_at DESC
);

CREATE TRIGGER IF NOT EXISTS content_verification_auto_accept_guard_insert
BEFORE INSERT ON content_verification_results
WHEN NEW.disposition = 'auto_accept'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM verification_calibrations AS calibration
    WHERE calibration.calibration_id = NEW.calibration_id
      AND calibration.verifier_algorithm_version = NEW.verifier_algorithm_version
      AND calibration.valid = 1
      AND calibration.frozen = 1
      AND calibration.selected_threshold = NEW.applied_threshold
  ) THEN RAISE(ABORT, 'auto_accept requires a valid frozen calibration') END;
END;

CREATE TRIGGER IF NOT EXISTS content_verification_auto_accept_guard_update
BEFORE UPDATE ON content_verification_results
WHEN NEW.disposition = 'auto_accept'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM verification_calibrations AS calibration
    WHERE calibration.calibration_id = NEW.calibration_id
      AND calibration.verifier_algorithm_version = NEW.verifier_algorithm_version
      AND calibration.valid = 1
      AND calibration.frozen = 1
      AND calibration.selected_threshold = NEW.applied_threshold
  ) THEN RAISE(ABORT, 'auto_accept requires a valid frozen calibration') END;
END;

CREATE TRIGGER IF NOT EXISTS content_verification_split_guard_insert
BEFORE INSERT ON content_verification_results
WHEN NEW.disposition = 'auto_accept'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM content_verification_results AS prior
    JOIN catalog_records AS prior_record
      ON prior_record.manifest_id = prior.manifest_id
     AND prior_record.record_id = prior.record_id
    JOIN catalog_records AS new_record
      ON new_record.manifest_id = NEW.manifest_id
     AND new_record.record_id = NEW.record_id
    WHERE prior.disposition = 'auto_accept'
      AND (prior.candidate_sha256 = NEW.candidate_sha256 OR (
        prior.source_id = NEW.source_id AND prior.source_item_id = NEW.source_item_id
      ))
      AND (
        prior_record.split != new_record.split
        OR prior_record.composition_group_id != new_record.composition_group_id
      )
  ) THEN RAISE(ABORT, 'external MIDI cannot cross composition groups or splits') END;
END;

CREATE TRIGGER IF NOT EXISTS content_verification_split_guard_update
BEFORE UPDATE ON content_verification_results
WHEN NEW.disposition = 'auto_accept'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM content_verification_results AS prior
    JOIN catalog_records AS prior_record
      ON prior_record.manifest_id = prior.manifest_id
     AND prior_record.record_id = prior.record_id
    JOIN catalog_records AS new_record
      ON new_record.manifest_id = NEW.manifest_id
     AND new_record.record_id = NEW.record_id
    WHERE prior.verification_id != OLD.verification_id
      AND prior.disposition = 'auto_accept'
      AND (prior.candidate_sha256 = NEW.candidate_sha256 OR (
        prior.source_id = NEW.source_id AND prior.source_item_id = NEW.source_item_id
      ))
      AND (
        prior_record.split != new_record.split
        OR prior_record.composition_group_id != new_record.composition_group_id
      )
  ) THEN RAISE(ABORT, 'external MIDI cannot cross composition groups or splits') END;
END;

CREATE TRIGGER IF NOT EXISTS content_verification_event_fingerprint_split_guard_insert
BEFORE INSERT ON content_verification_results
WHEN NEW.disposition = 'auto_accept'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM content_verification_results AS prior
    JOIN catalog_records AS prior_record
      ON prior_record.manifest_id = prior.manifest_id
     AND prior_record.record_id = prior.record_id
    JOIN catalog_records AS new_record
      ON new_record.manifest_id = NEW.manifest_id
     AND new_record.record_id = NEW.record_id
    JOIN artifact_event_fingerprints AS prior_fingerprint
      ON prior_fingerprint.artifact_sha256 = prior.candidate_sha256
    JOIN artifact_event_fingerprints AS new_fingerprint
      ON new_fingerprint.artifact_sha256 = NEW.candidate_sha256
     AND new_fingerprint.algorithm_version = prior_fingerprint.algorithm_version
     AND new_fingerprint.event_fingerprint_sha256 = prior_fingerprint.event_fingerprint_sha256
    WHERE prior.disposition = 'auto_accept'
      AND (
        prior_record.split != new_record.split
        OR prior_record.composition_group_id != new_record.composition_group_id
      )
  ) THEN RAISE(ABORT, 'normalized external MIDI cannot cross composition groups or splits') END;
END;

CREATE TRIGGER IF NOT EXISTS content_verification_event_fingerprint_split_guard_update
BEFORE UPDATE ON content_verification_results
WHEN NEW.disposition = 'auto_accept'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM content_verification_results AS prior
    JOIN catalog_records AS prior_record
      ON prior_record.manifest_id = prior.manifest_id
     AND prior_record.record_id = prior.record_id
    JOIN catalog_records AS new_record
      ON new_record.manifest_id = NEW.manifest_id
     AND new_record.record_id = NEW.record_id
    JOIN artifact_event_fingerprints AS prior_fingerprint
      ON prior_fingerprint.artifact_sha256 = prior.candidate_sha256
    JOIN artifact_event_fingerprints AS new_fingerprint
      ON new_fingerprint.artifact_sha256 = NEW.candidate_sha256
     AND new_fingerprint.algorithm_version = prior_fingerprint.algorithm_version
     AND new_fingerprint.event_fingerprint_sha256 = prior_fingerprint.event_fingerprint_sha256
    WHERE prior.verification_id != OLD.verification_id
      AND prior.disposition = 'auto_accept'
      AND (
        prior_record.split != new_record.split
        OR prior_record.composition_group_id != new_record.composition_group_id
      )
  ) THEN RAISE(ABORT, 'normalized external MIDI cannot cross composition groups or splits') END;
END;

CREATE TRIGGER IF NOT EXISTS frozen_calibration_immutable
BEFORE UPDATE ON verification_calibrations
WHEN OLD.frozen = 1
BEGIN
  SELECT RAISE(ABORT, 'frozen calibration rows are immutable');
END;

CREATE TRIGGER IF NOT EXISTS calibration_case_development_only
BEFORE INSERT ON verification_calibration_cases
BEGIN
  SELECT CASE WHEN COALESCE(json_extract(NEW.case_provenance_json, '$.benchmark_partition'), '') != 'development'
    THEN RAISE(ABORT, 'calibration cases must come from a development partition') END;
  SELECT CASE WHEN COALESCE(json_extract(NEW.case_provenance_json, '$.benchmark_source_id'), '') = ''
    THEN RAISE(ABORT, 'calibration cases require a benchmark source id') END;
END;

CREATE TRIGGER IF NOT EXISTS frozen_calibration_case_immutable_update
BEFORE UPDATE ON verification_calibration_cases
WHEN EXISTS (
  SELECT 1 FROM verification_calibrations
  WHERE calibration_id = OLD.calibration_id AND frozen = 1
)
BEGIN
  SELECT RAISE(ABORT, 'frozen calibration cases are immutable');
END;

CREATE TRIGGER IF NOT EXISTS frozen_calibration_case_immutable_delete
BEFORE DELETE ON verification_calibration_cases
WHEN EXISTS (
  SELECT 1 FROM verification_calibrations
  WHERE calibration_id = OLD.calibration_id AND frozen = 1
)
BEGIN
  SELECT RAISE(ABORT, 'frozen calibration cases are immutable');
END;

CREATE TABLE IF NOT EXISTS metadata_match_verification_state (
  manifest_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_item_id TEXT NOT NULL,
  metadata_algorithm_version TEXT NOT NULL,
  verification_id TEXT NOT NULL REFERENCES content_verification_results(verification_id),
  disposition TEXT NOT NULL CHECK (disposition IN (
    'auto_accept', 'quarantine_no_frozen_calibration', 'quarantine_below_threshold'
  )),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (manifest_id, record_id, source_id, source_item_id, metadata_algorithm_version),
  FOREIGN KEY (
    manifest_id, record_id, source_id, source_item_id, metadata_algorithm_version
  ) REFERENCES metadata_matches (
    manifest_id, record_id, source_id, source_item_id, algorithm_version
  )
);

CREATE TRIGGER IF NOT EXISTS metadata_match_state_auto_accept_guard_insert
BEFORE INSERT ON metadata_match_verification_state
WHEN NEW.disposition = 'auto_accept'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM content_verification_results AS verification
    WHERE verification.verification_id = NEW.verification_id
      AND verification.disposition = 'auto_accept'
  ) THEN RAISE(ABORT, 'auto_accept state requires an auto-accepted verification') END;
END;

CREATE TRIGGER IF NOT EXISTS metadata_match_state_auto_accept_guard_update
BEFORE UPDATE ON metadata_match_verification_state
WHEN NEW.disposition = 'auto_accept'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM content_verification_results AS verification
    WHERE verification.verification_id = NEW.verification_id
      AND verification.disposition = 'auto_accept'
  ) THEN RAISE(ABORT, 'auto_accept state requires an auto-accepted verification') END;
END;

CREATE TRIGGER IF NOT EXISTS active_calibration_guard_insert
BEFORE INSERT ON active_verification_calibrations
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM verification_calibrations AS calibration
    WHERE calibration.calibration_id = NEW.calibration_id
      AND calibration.verifier_algorithm_version = NEW.verifier_algorithm_version
      AND calibration.valid = 1
      AND calibration.frozen = 1
  ) THEN RAISE(ABORT, 'active calibration must be valid and frozen') END;
END;

CREATE TRIGGER IF NOT EXISTS active_calibration_guard_update
BEFORE UPDATE ON active_verification_calibrations
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM verification_calibrations AS calibration
    WHERE calibration.calibration_id = NEW.calibration_id
      AND calibration.verifier_algorithm_version = NEW.verifier_algorithm_version
      AND calibration.valid = 1
      AND calibration.frozen = 1
  ) THEN RAISE(ABORT, 'active calibration must be valid and frozen') END;
END;

CREATE VIEW IF NOT EXISTS metadata_match_gate AS
SELECT
  matches.*,
  COALESCE(state.disposition, 'quarantine_unverified') AS content_disposition,
  state.verification_id AS content_verification_id
FROM metadata_matches AS matches
LEFT JOIN metadata_match_verification_state AS state
  ON state.manifest_id = matches.manifest_id
 AND state.record_id = matches.record_id
 AND state.source_id = matches.source_id
 AND state.source_item_id = matches.source_item_id
 AND state.metadata_algorithm_version = matches.algorithm_version;

CREATE VIEW IF NOT EXISTS external_artifact_split_assignments AS
SELECT DISTINCT
  verification.candidate_sha256 AS artifact_sha256,
  verification.source_id,
  verification.source_item_id,
  record.composition_group_id,
  record.split,
  verification.manifest_id
FROM content_verification_results AS verification
JOIN catalog_records AS record
  ON record.manifest_id = verification.manifest_id
 AND record.record_id = verification.record_id
WHERE verification.disposition = 'auto_accept';

CREATE VIEW IF NOT EXISTS artifact_event_duplicate_groups AS
SELECT
  algorithm_version,
  event_fingerprint_sha256,
  count(*) AS artifact_count,
  sum(artifact.byte_count) AS total_bytes
FROM artifact_event_fingerprints AS fingerprint
JOIN artifacts AS artifact ON artifact.sha256 = fingerprint.artifact_sha256
GROUP BY algorithm_version, event_fingerprint_sha256
HAVING count(*) > 1;

CREATE VIEW IF NOT EXISTS external_artifact_event_fingerprint_assignments AS
SELECT DISTINCT
  fingerprint.algorithm_version,
  fingerprint.event_fingerprint_sha256,
  verification.candidate_sha256 AS artifact_sha256,
  verification.source_id,
  verification.source_item_id,
  record.composition_group_id,
  record.split,
  verification.manifest_id
FROM content_verification_results AS verification
JOIN catalog_records AS record
  ON record.manifest_id = verification.manifest_id
 AND record.record_id = verification.record_id
JOIN artifact_event_fingerprints AS fingerprint
  ON fingerprint.artifact_sha256 = verification.candidate_sha256
WHERE verification.disposition = 'auto_accept';
`;

function tableHasColumn(db, tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all()
    .some((column) => column.name === columnName);
}

function safelyClassifyUsability(sourceId, rightsStatus, entity) {
  try {
    return classifyUsabilityClass({ sourceId, rightsStatus, entity });
  } catch {
    return 'excluded';
  }
}

function migrateUsabilityClasses(db) {
  if (!tableHasColumn(db, 'source_items', 'usability_class')) {
    db.exec(`
      ALTER TABLE source_items ADD COLUMN usability_class TEXT NOT NULL DEFAULT 'excluded'
        CHECK (usability_class IN ${USABILITY_CLASS_SQL})
    `);
  }
  if (!tableHasColumn(db, 'item_artifacts', 'usability_class')) {
    db.exec(`
      ALTER TABLE item_artifacts ADD COLUMN usability_class TEXT NOT NULL DEFAULT 'excluded'
        CHECK (usability_class IN ${USABILITY_CLASS_SQL})
    `);
  }

  const updateSourceItem = db.prepare(`
    UPDATE source_items SET usability_class = ? WHERE source_id = ? AND source_item_id = ?
  `);
  for (const row of db.prepare(`
    SELECT source_id, source_item_id, rights_status FROM source_items
  `).all()) {
    updateSourceItem.run(
      safelyClassifyUsability(row.source_id, row.rights_status, 'source_item'),
      row.source_id,
      row.source_item_id,
    );
  }

  const updateArtifact = db.prepare(`
    UPDATE item_artifacts SET usability_class = ?
    WHERE source_id = ? AND source_item_id = ? AND artifact_sha256 = ?
  `);
  for (const row of db.prepare(`
    SELECT source_id, source_item_id, artifact_sha256, rights_status FROM item_artifacts
  `).all()) {
    updateArtifact.run(
      safelyClassifyUsability(row.source_id, row.rights_status, 'artifact'),
      row.source_id,
      row.source_item_id,
      row.artifact_sha256,
    );
  }
}

function syncSourcePolicies(db) {
  const statement = db.prepare(`
    INSERT INTO source_policies (
      source_id, display_name, policy_version, policy_sha256, metadata_mode,
      automation_policy, artifact_mode, default_rights_status, policy_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id) DO UPDATE SET
      display_name = excluded.display_name,
      policy_version = excluded.policy_version,
      policy_sha256 = excluded.policy_sha256,
      metadata_mode = excluded.metadata_mode,
      automation_policy = excluded.automation_policy,
      artifact_mode = excluded.artifact_mode,
      default_rights_status = excluded.default_rights_status,
      policy_json = excluded.policy_json
  `);
  for (const policy of listSourcePolicies()) {
    statement.run(
      policy.source_id,
      policy.display_name,
      policy.policy_version,
      sourcePolicyHash(policy.source_id),
      policy.metadata_mode,
      policy.automation_policy,
      policy.artifact_mode,
      policy.default_rights_status,
      stableStringify(policy),
    );
  }
}

function initializeAcquisitionDb(dbPath) {
  const isMemory = dbPath === ':memory:';
  const absolutePath = isMemory ? dbPath : path.resolve(dbPath);
  if (!isMemory) fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const db = new DatabaseSync(absolutePath);
  db.exec('PRAGMA foreign_keys = ON');
  if (!isMemory) db.exec('PRAGMA journal_mode = WAL');
  const currentVersion = Number(db.prepare('PRAGMA user_version').get().user_version ?? 0);
  if (currentVersion > ACQUISITION_SCHEMA_VERSION) {
    db.close();
    const error = new Error(`Acquisition DB schema ${currentVersion} is newer than supported ${ACQUISITION_SCHEMA_VERSION}`);
    error.code = 'SCHEMA_TOO_NEW';
    throw error;
  }
  db.exec(SCHEMA_SQL);
  migrateUsabilityClasses(db);
  const recordMigration = db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES (?)');
  for (let version = 1; version <= ACQUISITION_SCHEMA_VERSION; version += 1) recordMigration.run(version);
  db.exec(`PRAGMA user_version = ${ACQUISITION_SCHEMA_VERSION}`);
  syncSourcePolicies(db);
  return db;
}

function transaction(db, callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

module.exports = {
  ACQUISITION_SCHEMA_VERSION,
  SCHEMA_SQL,
  initializeAcquisitionDb,
  syncSourcePolicies,
  transaction,
};
