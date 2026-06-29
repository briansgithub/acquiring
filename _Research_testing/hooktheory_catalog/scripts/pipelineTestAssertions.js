/**
 * Assertions for pipeline closed-loop tests.
 */

const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('../lib/paths');

function fail(msg, ctx = {}) {
  const err = new Error(msg);
  err.context = ctx;
  throw err;
}

function assertFlags(flags, expected, label) {
  for (const [k, v] of Object.entries(expected)) {
    if (flags[k] !== v) {
      fail(`${label}: flags.${k} expected ${v}, got ${flags[k]}`, { flags, expected });
    }
  }
}

function getRow(db, slug) {
  return db.prepare(`
    SELECT slug, url, status, cache_dir, processed_at, oracle_tested_at,
      oracle_out_dir, oracle_summary_json
    FROM songs WHERE slug = ?
  `).get(slug);
}

function assertRow(db, slug, expected, label) {
  const row = getRow(db, slug);
  if (!expected && row) fail(`${label}: expected no row`, { slug });
  if (expected === null) {
    if (row) fail(`${label}: expected row missing`, { slug });
    return null;
  }
  if (!row) fail(`${label}: row not found`, { slug });
  for (const [k, v] of Object.entries(expected)) {
    if (k === 'has_metrics') {
      const m = db.prepare('SELECT 1 FROM song_metrics WHERE slug = ?').get(slug);
      const has = !!m;
      if (has !== v) fail(`${label}: has_metrics expected ${v}`, { slug });
      continue;
    }
    const actual = row[k];
    if (v === undefined) continue;
    if (actual !== v && !(v === null && (actual === undefined || actual === null))) {
      fail(`${label}: row.${k} expected ${JSON.stringify(v)}, got ${JSON.stringify(actual)}`, { row });
    }
  }
  return row;
}

function assertFsExists(relPath, label) {
  const abs = path.isAbsolute(relPath) ? relPath : path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(abs)) fail(`${label}: path missing ${relPath}`);
}

function assertFsMissing(relPath, label) {
  const abs = path.isAbsolute(relPath) ? relPath : path.join(REPO_ROOT, relPath);
  if (fs.existsSync(abs)) fail(`${label}: path should be gone ${relPath}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = {
  fail,
  assertFlags,
  assertRow,
  getRow,
  assertFsExists,
  assertFsMissing,
  sleep,
};
