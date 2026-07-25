/**
 * HTTP handlers for progression search API.
 */

const { searchProgressions, getProgressionIndexStatus } = require('../lib/progression/searchProgressions');

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function handleProgressionSearch(reqUrl, res) {
  try {
    const q = reqUrl.searchParams;
    const filters = q.get('filter') || q.get('filters') || '';
    const result = searchProgressions({
      mode: q.get('mode') || 'functional',
      sequence: q.get('sequence') || '',
      length: q.get('length') ? Number(q.get('length')) : undefined,
      sectionType: q.get('sectionType') || q.get('section_type') || null,
      beatThreshold: q.get('beatThreshold') ? Number(q.get('beatThreshold')) : 0,
      filters: filters ? filters.split(',') : [],
      limit: q.get('limit') ? Number(q.get('limit')) : 50,
    });
    sendJson(res, 200, result);
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}

function handleProgressionStatus(res) {
  try {
    sendJson(res, 200, getProgressionIndexStatus());
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}

module.exports = {
  handleProgressionSearch,
  handleProgressionStatus,
};
