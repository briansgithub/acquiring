/**
 * Resolve oracle summary for Song Selector — DB JSON plus report.json fallback.
 */

const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./paths');
const { attrBuckets, rowMetrics } = require('../../../_Decode_oracle/report');

function statsFromReportSections(sections) {
  const sectionStats = [];
  const matrix = new Map();
  let total = 0;
  let romanExact = 0;
  let romanCore = 0;
  let notesOk = 0;
  let discrepancies = 0;

  for (const sec of sections || []) {
    const st = { name: sec.name, total: 0, romanExact: 0, romanCore: 0, notesOk: 0, browserOk: 0 };
    for (const r of sec.rows || []) {
      total++;
      st.total++;
      const m = rowMetrics(r);
      if (m.romanExact) { romanExact++; st.romanExact++; }
      if (m.romanCore) { romanCore++; st.romanCore++; }
      if (m.notesOk) { notesOk++; st.notesOk++; }
      if (m.browserOk) st.browserOk++;
      const browserGate = r.browserOk == null || m.browserOk;
      if (!(m.romanCore && m.notesOk && browserGate)) discrepancies++;
      for (const [k, v] of attrBuckets(r.chord)) {
        const key = `${k}=${v}`;
        if (!matrix.has(key)) {
          matrix.set(key, { total: 0, romanExact: 0, romanCore: 0, notesOk: 0, browserOk: 0 });
        }
        const e = matrix.get(key);
        e.total++;
        if (m.romanExact) e.romanExact++;
        if (m.romanCore) e.romanCore++;
        if (m.notesOk) e.notesOk++;
        if (m.browserOk) e.browserOk++;
      }
    }
    sectionStats.push(st);
  }

  const attributeStats = [...matrix.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, e]) => ({ key, ...e }));

  return {
    total,
    romanExact,
    romanCore,
    notesOk,
    discrepancies,
    sections: sectionStats,
    attributes: attributeStats,
  };
}

function resolveOracleSummary(song) {
  if (!song?.oracle_tested_at && !song?.oracle_summary_json) return null;

  let summary = null;
  if (song.oracle_summary_json) {
    try {
      summary = JSON.parse(song.oracle_summary_json);
    } catch (_) {
      summary = null;
    }
  }

  if (summary?.sections?.length && summary?.attributes?.length) return summary;

  const rel = song.oracle_out_dir;
  if (!rel) return summary;

  const reportPath = path.join(REPO_ROOT, rel, 'report.json');
  if (!fs.existsSync(reportPath)) return summary;

  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const computed = statsFromReportSections(report.sections);
    return { ...summary, ...computed };
  } catch (_) {
    return summary;
  }
}

module.exports = { resolveOracleSummary, statsFromReportSections };
