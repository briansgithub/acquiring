/**
 * In-memory async jobs for pipeline forward operations.
 */

const { openDb } = require('./db');
const { runPipelineAction } = require('./pipelineOps');
const { addSongFromUrl } = require('./addSongPipeline');

const jobs = new Map();
const activeBySlug = new Map();
let nextId = 1;

class JobConflictError extends Error {
  constructor() {
    super('pipeline job already running for this song');
    this.status = 409;
  }
}

function getJob(jobId) {
  return jobs.get(String(jobId)) || null;
}

function applyJobResult(job, result) {
  job.status = result.ok ? 'done' : 'error';
  job.error = result.error || null;
  job.flags = result.flags ?? null;
  job.canLoad = result.canLoad ?? null;
  job.loadGateMissing = result.loadGateMissing ?? null;
  job.oracleSummary = result.oracleSummary ?? null;
  job.oracleOutDir = result.oracleOutDir ?? null;
  job.deleted = !!result.deleted;
}

function startJob(slug, action) {
  if (activeBySlug.has(slug)) throw new JobConflictError();
  const jobId = String(nextId++);
  const job = {
    id: jobId,
    slug,
    action,
    status: 'running',
    startedAt: new Date().toISOString(),
    error: null,
    flags: null,
    canLoad: null,
    loadGateMissing: null,
    oracleSummary: null,
    oracleOutDir: null,
    deleted: false,
  };
  jobs.set(jobId, job);
  activeBySlug.set(slug, jobId);

  const db = openDb();
  runPipelineAction(db, slug, action)
    .then((result) => applyJobResult(job, result))
    .catch((err) => {
      job.status = 'error';
      job.error = err.message;
    })
    .finally(() => {
      activeBySlug.delete(slug);
    });

  return jobId;
}

function startAddJob(url) {
  const { parseTheoryTabUrl } = require('./catalogUtils');
  const parsed = parseTheoryTabUrl(url);
  if (!parsed) {
    throw Object.assign(new Error('invalid TheoryTab URL'), { status: 400 });
  }
  const slug = parsed.slug;
  if (activeBySlug.has(slug)) throw new JobConflictError();

  const jobId = String(nextId++);
  const job = {
    id: jobId,
    slug,
    action: 'add',
    status: 'running',
    startedAt: new Date().toISOString(),
    error: null,
    flags: null,
    canLoad: null,
    loadGateMissing: null,
    oracleSummary: null,
    oracleOutDir: null,
    deleted: false,
  };
  jobs.set(jobId, job);
  activeBySlug.set(slug, jobId);

  const db = openDb();
  addSongFromUrl(db, url)
    .then((result) => applyJobResult(job, result))
    .catch((err) => {
      job.status = 'error';
      job.error = err.message;
    })
    .finally(() => {
      activeBySlug.delete(slug);
    });

  return jobId;
}

module.exports = { JobConflictError, getJob, startJob, startAddJob };
