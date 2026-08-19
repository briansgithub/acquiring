'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');
const { hashFile, sha256String } = require('./hash');
const { stableStringify } = require('./stable-json');
const { VERIFIER_ALGORITHM_VERSION } = require('./content-verification');

const CALIBRATION_REQUIREMENTS = Object.freeze({
  confidence_level: 0.95,
  wilson_z: 1.959963984540054,
  minimum_wilson_precision_lower_bound: 0.98,
  minimum_known_positive_coverage: 0.50,
  threshold_rule: 'score-greater-than-or-equal',
  selection_rule: 'maximum-coverage-then-wilson-bound-then-threshold',
});

function round(value, places = 12) {
  const factor = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function wilsonLowerBound(successes, trials, z = CALIBRATION_REQUIREMENTS.wilson_z) {
  if (!Number.isInteger(successes) || !Number.isInteger(trials)
    || successes < 0 || trials < 0 || successes > trials) {
    throw new RangeError('Wilson inputs must satisfy 0 <= successes <= trials');
  }
  if (trials === 0) return 0;
  const proportion = successes / trials;
  const zSquared = z * z;
  const denominator = 1 + zSquared / trials;
  const center = proportion + zSquared / (2 * trials);
  const margin = z * Math.sqrt(
    (proportion * (1 - proportion) + zSquared / (4 * trials)) / trials,
  );
  return Math.max(0, (center - margin) / denominator);
}

function knownPositive(value) {
  if (value === true || value === 1 || value === '1' || value === 'positive' || value === 'match') return true;
  if (value === false || value === 0 || value === '0' || value === 'negative' || value === 'nonmatch') return false;
  throw new TypeError(`Calibration label must be an explicit known positive/negative, received ${value}`);
}

function normalizeCalibrationCases(rawCases, db) {
  if (!Array.isArray(rawCases) || rawCases.length === 0) {
    throw new TypeError('Calibration requires a non-empty labeled case array');
  }
  const seen = new Set();
  return rawCases.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new TypeError(`Calibration case ${index} must be an object`);
    }
    const verificationId = raw.verification_id ? String(raw.verification_id) : null;
    let score = raw.score;
    let scoreSource = 'labeled_file';
    if (verificationId && score === undefined) {
      if (!db) throw new TypeError(`Calibration case ${index} needs a DB to resolve verification_id`);
      const row = db.prepare(`
        SELECT total_score, verifier_algorithm_version
        FROM content_verification_results WHERE verification_id = ?
      `).get(verificationId);
      if (!row) throw new Error(`Unknown verification_id in calibration case: ${verificationId}`);
      if (row.verifier_algorithm_version !== VERIFIER_ALGORITHM_VERSION) {
        throw new Error(`Verification ${verificationId} uses incompatible algorithm ${row.verifier_algorithm_version}`);
      }
      score = row.total_score;
      scoreSource = 'persisted_verification_result';
    }
    score = Number(score);
    if (!Number.isFinite(score) || score < 0 || score > 1) {
      throw new RangeError(`Calibration case ${index} score must be within 0..1`);
    }
    const labelValue = raw.known_positive ?? raw.label ?? raw.is_match;
    const label = knownPositive(labelValue);
    const benchmarkSourceId = String(raw.benchmark_source_id || raw.benchmark_source || '').trim();
    const benchmarkPartition = String(raw.benchmark_partition || raw.partition || '').trim().toLowerCase();
    if (!benchmarkSourceId) {
      throw new TypeError(`Calibration case ${index} requires benchmark_source_id`);
    }
    if (benchmarkPartition !== 'development') {
      const error = new Error(`Calibration case ${index} must be from the development partition, received ${benchmarkPartition || 'missing'}`);
      error.code = 'CALIBRATION_TEST_LEAKAGE';
      throw error;
    }
    const caseId = String(raw.case_id || verificationId || `case-${index}`);
    if (seen.has(caseId)) throw new Error(`Duplicate calibration case_id: ${caseId}`);
    seen.add(caseId);
    return {
      case_id: caseId,
      verification_id: verificationId,
      known_positive: label,
      score: round(score),
      provenance: {
        score_source: scoreSource,
        benchmark_source_id: benchmarkSourceId,
        benchmark_partition: benchmarkPartition,
        source_row_index: index,
        source_row_sha256: sha256String(stableStringify(raw)),
      },
    };
  }).sort((left, right) => left.case_id.localeCompare(right.case_id, 'en'));
}

function evaluateThreshold(cases, threshold, positiveCount) {
  let truePositives = 0;
  let falsePositives = 0;
  for (const item of cases) {
    if (item.score < threshold) continue;
    if (item.known_positive) truePositives += 1;
    else falsePositives += 1;
  }
  const accepted = truePositives + falsePositives;
  const precision = accepted ? truePositives / accepted : 0;
  const wilson = wilsonLowerBound(truePositives, accepted);
  const coverage = positiveCount ? truePositives / positiveCount : 0;
  return {
    threshold: round(threshold),
    accepted_count: accepted,
    true_positive_count: truePositives,
    false_positive_count: falsePositives,
    empirical_precision: round(precision),
    wilson_precision_lower_bound: round(wilson),
    known_positive_coverage: round(coverage),
    meets_precision: wilson >= CALIBRATION_REQUIREMENTS.minimum_wilson_precision_lower_bound,
    meets_coverage: coverage >= CALIBRATION_REQUIREMENTS.minimum_known_positive_coverage,
  };
}

function selectCalibrationThreshold(rawCases, options = {}) {
  const cases = options.normalized ? rawCases : normalizeCalibrationCases(rawCases, options.db);
  const positiveCount = cases.filter((item) => item.known_positive).length;
  const negativeCount = cases.length - positiveCount;
  if (positiveCount === 0) throw new Error('Calibration requires at least one known-positive case');
  if (negativeCount === 0) throw new Error('Calibration requires at least one known-negative case');
  const thresholds = [...new Set(cases.map((item) => item.score))].sort((left, right) => right - left);
  const evaluations = thresholds.map((threshold) => evaluateThreshold(cases, threshold, positiveCount));
  const valid = evaluations.filter((evaluation) => evaluation.meets_precision && evaluation.meets_coverage);
  valid.sort((left, right) => (
    right.known_positive_coverage - left.known_positive_coverage
    || right.wilson_precision_lower_bound - left.wilson_precision_lower_bound
    || right.threshold - left.threshold
  ));
  const diagnostic = [...evaluations].sort((left, right) => (
    Number(right.meets_coverage) - Number(left.meets_coverage)
    || right.wilson_precision_lower_bound - left.wilson_precision_lower_bound
    || right.known_positive_coverage - left.known_positive_coverage
    || right.threshold - left.threshold
  ))[0];
  const selected = valid[0] || null;
  return {
    valid: Boolean(selected),
    frozen: Boolean(selected),
    selected_threshold: selected?.threshold ?? null,
    case_count: cases.length,
    known_positive_count: positiveCount,
    known_negative_count: negativeCount,
    true_positive_count: selected?.true_positive_count ?? diagnostic.true_positive_count,
    false_positive_count: selected?.false_positive_count ?? diagnostic.false_positive_count,
    empirical_precision: selected?.empirical_precision ?? diagnostic.empirical_precision,
    wilson_precision_lower_bound: selected?.wilson_precision_lower_bound ?? diagnostic.wilson_precision_lower_bound,
    known_positive_coverage: selected?.known_positive_coverage ?? diagnostic.known_positive_coverage,
    thresholds_evaluated: evaluations.length,
    requirements: CALIBRATION_REQUIREMENTS,
    failure_reasons: selected ? [] : [
      diagnostic.wilson_precision_lower_bound < CALIBRATION_REQUIREMENTS.minimum_wilson_precision_lower_bound
        ? 'wilson_precision_lower_bound_below_0.98'
        : null,
      diagnostic.known_positive_coverage < CALIBRATION_REQUIREMENTS.minimum_known_positive_coverage
        ? 'known_positive_coverage_below_0.50'
        : null,
    ].filter(Boolean),
    cases,
  };
}

function persistCalibration(db, rawCases, options = {}) {
  const cases = normalizeCalibrationCases(rawCases, db);
  const result = selectCalibrationThreshold(cases, { normalized: true });
  const calibrationSetSha256 = sha256String(stableStringify(cases.map((item) => ({
    case_id: item.case_id,
    verification_id: item.verification_id,
    known_positive: item.known_positive,
    score: item.score,
    benchmark_source_id: item.provenance.benchmark_source_id,
    benchmark_partition: item.provenance.benchmark_partition,
  }))));
  const calibrationIdentity = {
    verifier_algorithm_version: VERIFIER_ALGORITHM_VERSION,
    calibration_set_sha256: calibrationSetSha256,
    requirements: CALIBRATION_REQUIREMENTS,
  };
  const calibrationId = `sha256:${sha256String(stableStringify(calibrationIdentity))}`;
  const provenance = {
    kind: options.provenance?.kind || 'inline_labeled_cases',
    ...options.provenance,
    calibration_set_sha256: calibrationSetSha256,
    verifier_algorithm_version: VERIFIER_ALGORITHM_VERSION,
  };
  const publicResult = {
    calibration_id: calibrationId,
    verifier_algorithm_version: VERIFIER_ALGORITHM_VERSION,
    calibration_set_sha256: calibrationSetSha256,
    valid: result.valid,
    frozen: result.frozen,
    selected_threshold: result.selected_threshold,
    case_count: result.case_count,
    known_positive_count: result.known_positive_count,
    known_negative_count: result.known_negative_count,
    true_positive_count: result.true_positive_count,
    false_positive_count: result.false_positive_count,
    empirical_precision: result.empirical_precision,
    wilson_precision_lower_bound: result.wilson_precision_lower_bound,
    known_positive_coverage: result.known_positive_coverage,
    thresholds_evaluated: result.thresholds_evaluated,
    requirements: result.requirements,
    failure_reasons: result.failure_reasons,
    active: Boolean(result.valid && options.activate !== false),
  };

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT OR IGNORE INTO verification_calibrations (
        calibration_id, verifier_algorithm_version, calibration_set_sha256,
        case_count, known_positive_count, known_negative_count, selected_threshold,
        true_positive_count, false_positive_count, empirical_precision,
        wilson_precision_lower_bound, known_positive_coverage, valid, frozen,
        requirements_json, result_json, provenance_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      calibrationId,
      VERIFIER_ALGORITHM_VERSION,
      calibrationSetSha256,
      result.case_count,
      result.known_positive_count,
      result.known_negative_count,
      result.selected_threshold,
      result.true_positive_count,
      result.false_positive_count,
      result.empirical_precision,
      result.wilson_precision_lower_bound,
      result.known_positive_coverage,
      result.valid ? 1 : 0,
      result.frozen ? 1 : 0,
      stableStringify(CALIBRATION_REQUIREMENTS),
      stableStringify(publicResult),
      stableStringify(provenance),
    );
    const insertCase = db.prepare(`
      INSERT OR IGNORE INTO verification_calibration_cases (
        calibration_id, case_id, verification_id, known_positive, score, case_provenance_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const item of cases) {
      insertCase.run(
        calibrationId,
        item.case_id,
        item.verification_id,
        item.known_positive ? 1 : 0,
        item.score,
        stableStringify(item.provenance),
      );
    }
    if (result.valid && options.activate !== false) {
      db.prepare(`
        INSERT INTO active_verification_calibrations (verifier_algorithm_version, calibration_id)
        VALUES (?, ?)
        ON CONFLICT(verifier_algorithm_version) DO UPDATE SET
          calibration_id = excluded.calibration_id,
          activated_at = CURRENT_TIMESTAMP
      `).run(VERIFIER_ALGORITHM_VERSION, calibrationId);
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
  return publicResult;
}

async function readCalibrationFile(filePath) {
  const absolutePath = path.resolve(filePath);
  const extension = path.extname(absolutePath).toLowerCase();
  let cases;
  if (extension === '.ndjson' || extension === '.jsonl') {
    cases = [];
    const lines = readline.createInterface({
      input: fs.createReadStream(absolutePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    let lineNumber = 0;
    for await (const line of lines) {
      lineNumber += 1;
      if (!line.trim()) continue;
      try { cases.push(JSON.parse(line)); } catch (error) {
        error.message = `${absolutePath}:${lineNumber}: ${error.message}`;
        throw error;
      }
    }
  } else {
    const parsed = JSON.parse(await fsp.readFile(absolutePath, 'utf8'));
    cases = Array.isArray(parsed) ? parsed : parsed?.cases;
  }
  if (!Array.isArray(cases)) throw new TypeError('Calibration file must be an array or an object with a cases array');
  const hashed = await hashFile(absolutePath);
  return {
    cases,
    provenance: {
      kind: 'local_labeled_calibration_file',
      path: absolutePath,
      bytes: hashed.bytes,
      file_sha256: hashed.sha256,
    },
  };
}

async function calibrateFromFile(db, filePath, options = {}) {
  const loaded = await readCalibrationFile(filePath);
  return persistCalibration(db, loaded.cases, {
    activate: options.activate,
    provenance: loaded.provenance,
  });
}

module.exports = {
  CALIBRATION_REQUIREMENTS,
  calibrateFromFile,
  evaluateThreshold,
  normalizeCalibrationCases,
  persistCalibration,
  readCalibrationFile,
  selectCalibrationThreshold,
  wilsonLowerBound,
};
