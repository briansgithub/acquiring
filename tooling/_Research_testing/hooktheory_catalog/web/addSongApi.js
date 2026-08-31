/**
 * POST /api/library/add — upsert URL and run full pipeline job.
 */

const { openDb } = require('../lib/db');
const { parseTheoryTabUrl } = require('../lib/catalogUtils');
const { startAddJob, JobConflictError } = require('../lib/pipelineJobs');
const { resetCacheSync } = require('../lib/library');

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(Object.assign(new Error('invalid JSON body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

async function handleAddSong(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    res.writeHead(err.status || 400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
    return;
  }

  const url = String(payload.url || '').trim();
  if (!url) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'url required' }));
    return;
  }

  const parsed = parseTheoryTabUrl(url);
  if (!parsed) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid TheoryTab URL' }));
    return;
  }

  try {
    openDb();
    const jobId = startAddJob(url);
    resetCacheSync();
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, jobId, slug: parsed.slug, url: parsed.url }));
  } catch (err) {
    const status = err.status || 500;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

module.exports = { handleAddSong };
