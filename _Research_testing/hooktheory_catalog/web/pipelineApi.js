/**
 * Pipeline run/clear/job HTTP handlers for Song Selector.
 */

const { openDb } = require('../lib/db');
const { isAction, clearPipelineAction } = require('../lib/pipelineOps');
const { startJob, getJob, JobConflictError } = require('../lib/pipelineJobs');
const { resetCacheSync } = require('../lib/library');

function parsePipelinePath(pathname) {
  // /api/library/pipeline/:action or /api/library/pipeline/:action/clear
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('pipeline');
  if (idx < 0) return null;
  const action = parts[idx + 1];
  const isClear = parts[idx + 2] === 'clear';
  if (!action || !isAction(action)) return null;
  return { action, isClear };
}

function handlePipelineRun(reqUrl, res) {
  const parsed = parsePipelinePath(reqUrl.pathname);
  if (!parsed || parsed.isClear) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }
  const slug = reqUrl.searchParams.get('slug');
  if (!slug) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'slug query param required' }));
    return;
  }
  try {
    openDb();
    const jobId = startJob(slug, parsed.action);
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, jobId, action: parsed.action, slug }));
  } catch (err) {
    const status = err.status || 500;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handlePipelineClear(reqUrl, res) {
  const parsed = parsePipelinePath(reqUrl.pathname);
  if (!parsed || !parsed.isClear) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }
  const slug = reqUrl.searchParams.get('slug');
  if (!slug) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'slug query param required' }));
    return;
  }
  try {
    const db = openDb();
    const result = clearPipelineAction(db, slug, parsed.action);
    if (parsed.action === 'processed') {
      resetCacheSync();
    }
    const status = result.ok ? 200 : (result.status || 500);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handlePipelineJob(reqUrl, res) {
  const jobId = reqUrl.searchParams.get('id');
  if (!jobId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'id query param required' }));
    return;
  }
  const job = getJob(jobId);
  if (!job) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'job not found' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    id: job.id,
    slug: job.slug,
    action: job.action,
    status: job.status,
    message: job.message,
    error: job.error,
    flags: job.flags,
    canLoad: job.canLoad,
    loadGateMissing: job.loadGateMissing,
    oracleSummary: job.oracleSummary,
    oracleOutDir: job.oracleOutDir,
    deleted: job.deleted,
  }));
}

function matchPipelineRoute(pathname, method) {
  if (!pathname.startsWith('/api/library/pipeline/')) return false;
  if (pathname.endsWith('/clear') && method === 'POST') return 'clear';
  if (!pathname.includes('/clear') && method === 'POST') return 'run';
  if (pathname === '/api/library/pipeline/job' && method === 'GET') return 'job';
  return false;
}

module.exports = {
  handlePipelineRun,
  handlePipelineClear,
  handlePipelineJob,
  matchPipelineRoute,
};
