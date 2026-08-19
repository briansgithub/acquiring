'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { pipeline } = require('node:stream/promises');

const {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_EVENTS,
  parseRequestedTopK,
  spoolBoundedRequest,
  streamedMidiPayload,
} = require('./midiAnalysisApi');
const { createLocalLibraryStore, LocalLibraryError } = require('../lib/local-library/store');
const { stableStringify } = require('../lib/midi-corpus/stable-json');

const BASE_PATH = '/api/v1/local-library';

let analyzerPromise;
let normalizerPromise;

function loadAnalyzer() {
  if (!analyzerPromise) {
    analyzerPromise = import(pathToFileURL(path.join(__dirname, '..', 'lib', 'midi', 'analyze', 'index.js')).href)
      .then((module) => module.analyzeMidi || module.default);
  }
  return analyzerPromise;
}

function loadNormalizer() {
  if (!normalizerPromise) {
    normalizerPromise = import(pathToFileURL(path.join(__dirname, 'lib', 'theoryImport.js')).href)
      .then((module) => module.normalizeTheoryDocument);
  }
  return normalizerPromise;
}

function apiError(code, message, statusCode = 400, details = undefined) {
  return new LocalLibraryError(code, message, statusCode, details);
}

function sendJson(res, statusCode, value, extraHeaders = {}) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders });
  res.end(JSON.stringify(value));
}

function boundedLimit(value, ceiling) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.min(Math.floor(numeric), ceiling) : ceiling;
}

function isLoopback(value) {
  const address = String(value || '').toLowerCase();
  return address === '127.0.0.1'
    || address === '::1'
    || address === '[::1]'
    || address === 'localhost'
    || address.startsWith('127.')
    || address.startsWith('::ffff:127.');
}

function assertLocalOrigin(req) {
  const origin = req.headers?.origin;
  const host = req.headers?.host;
  if (origin) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw apiError('LOCAL_ORIGIN_REQUIRED', 'Local-library imports require the local web app origin', 403);
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || !isLoopback(parsed.hostname)) {
      throw apiError('LOCAL_ORIGIN_REQUIRED', 'Local-library imports require the local web app origin', 403);
    }
    if (!host || parsed.host.toLowerCase() !== String(host).toLowerCase()) {
      throw apiError('ORIGIN_MISMATCH', 'The request origin does not match the local web app', 403);
    }
    return;
  }
  if (!isLoopback(req.socket?.remoteAddress)) {
    throw apiError('LOCAL_ORIGIN_REQUIRED', 'Local-library imports are accepted only from this computer', 403);
  }
}

function matchLocalLibraryRoute(pathname, method = 'GET') {
  const verb = String(method || 'GET').toUpperCase();
  const exact = new Map([
    [BASE_PATH, { action: 'list', allowed: ['GET'] }],
    [`${BASE_PATH}/midi`, { action: 'midi', allowed: ['POST'] }],
    [`${BASE_PATH}/theory`, { action: 'import-theory', allowed: ['POST'] }],
  ]);
  const known = exact.get(pathname);
  if (known) return { ...known, methodAllowed: known.allowed.includes(verb) };
  const detail = new RegExp(`^${BASE_PATH}/([^/]+)(?:/(source|theory))?$`).exec(pathname);
  if (!detail) return null;
  const action = detail[2] ? `${detail[2]}-download` : 'detail';
  return { action, id: detail[1], allowed: ['GET'], methodAllowed: verb === 'GET' };
}

function parseJsonBuffer(buffer) {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    throw apiError('INVALID_JSON', 'The selected theory file is not valid JSON', 422, {
      reason: String(error.message || '').slice(0, 240),
    });
  }
}

async function streamedTheoryPayload(req, contentType, directory, maxBytes) {
  if (/^multipart\/form-data\b/i.test(contentType)) {
    return streamedMidiPayload(req, contentType, directory, maxBytes);
  }
  if (!/^(application\/(json|octet-stream)|text\/json)\b/i.test(contentType)) {
    throw apiError(
      'UNSUPPORTED_CONTENT_TYPE',
      'Use multipart/form-data with a file field or application/json',
      415,
    );
  }
  const target = path.join(directory, 'upload.json');
  const saved = await spoolBoundedRequest(req, target, maxBytes);
  return {
    input: saved.path,
    byteLength: saved.byteLength,
    filename: path.basename(String(req.headers?.['x-filename'] || 'upload.json').replace(/\\/g, '/')),
    contentType,
  };
}

function contentDisposition(filename) {
  const cleaned = path.basename(filename).replace(/[\r\n"]/g, '_');
  const ascii = cleaned.replace(/[^\x20-\x7e]/g, '_') || 'download';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(cleaned)}`;
}

async function sendDownload(res, artifact) {
  const stat = await fsp.stat(artifact.path);
  res.writeHead(200, {
    'Content-Type': artifact.mediaType,
    'Content-Length': String(stat.size),
    'Content-Disposition': contentDisposition(artifact.filename),
    'X-Content-Type-Options': 'nosniff',
    ETag: `"sha256-${artifact.sha256}"`,
  });
  await pipeline(fs.createReadStream(artifact.path), res);
}

function errorDocument(error) {
  const details = error.details || (error.issues ? { issues: error.issues } : undefined);
  return {
    error: {
      code: error.code || 'LOCAL_LIBRARY_FAILED',
      message: error.message || 'Local-library operation failed',
      ...(details === undefined ? {} : { details }),
    },
  };
}

function normalizeRequestError(error, req, route) {
  const uploadRoute = route?.action === 'midi' || route?.action === 'import-theory';
  const abortCodes = new Set([
    'ABORT_ERR',
    'ECONNRESET',
    'EPIPE',
    'ERR_STREAM_ABORTED',
    'ERR_STREAM_PREMATURE_CLOSE',
  ]);
  if (uploadRoute && (req.aborted || abortCodes.has(error?.code) || error?.name === 'AbortError')) {
    return apiError(
      'UPLOAD_ABORTED',
      'The upload ended before the complete file was received',
      400,
    );
  }
  return error;
}

function createLocalLibraryHandler(options = {}) {
  const maxBytes = boundedLimit(options.maxBytes, DEFAULT_MAX_BYTES);
  const maxEvents = boundedLimit(options.maxEvents, DEFAULT_MAX_EVENTS);
  let ownedStore = null;
  const store = () => options.store || (ownedStore ||= createLocalLibraryStore(options.storeOptions));
  const analyze = options.analyze || loadAnalyzer;
  const normalize = options.normalizeTheory || loadNormalizer;
  const tempRoot = options.tempRoot || os.tmpdir();

  return async function handleLocalLibrary(req, reqUrl, res, matchedRoute = null) {
    const route = matchedRoute || matchLocalLibraryRoute(reqUrl.pathname, req.method);
    if (!route) return false;
    if (!route.methodAllowed) {
      sendJson(res, 405, errorDocument(apiError('METHOD_NOT_ALLOWED', `${route.allowed.join(' or ')} required`, 405)), {
        Allow: route.allowed.join(', '),
      });
      return true;
    }

    let uploadDirectory = null;
    try {
      if (route.action === 'list') {
        sendJson(res, 200, { items: store().list() });
        return true;
      }
      if (route.action === 'detail') {
        sendJson(res, 200, await store().get(route.id));
        return true;
      }
      if (route.action === 'source-download' || route.action === 'theory-download') {
        await sendDownload(res, store().download(route.id, route.action.replace('-download', '')));
        return true;
      }

      assertLocalOrigin(req);
      uploadDirectory = await fsp.mkdtemp(path.join(tempRoot, 'diatonic-local-library-'));
      if (route.action === 'midi') {
        const topK = parseRequestedTopK(reqUrl);
        const payload = await streamedMidiPayload(
          req,
          req.headers?.['content-type'] || '',
          uploadDirectory,
          maxBytes,
        );
        if (!/^multipart\/form-data\b/i.test(req.headers?.['content-type'] || '') && req.headers?.['x-filename']) {
          payload.filename = path.basename(String(req.headers['x-filename']).replace(/\\/g, '/'));
        }
        const analyzeMidi = typeof analyze === 'function' && options.analyze ? analyze : await analyze();
        const analysis = await analyzeMidi(payload.input, {
          filename: payload.filename,
          topK,
          maxBytes,
          maxEvents,
        });
        const normalizeTheoryDocument = typeof normalize === 'function' && options.normalizeTheory
          ? normalize
          : await normalize();
        const playable = normalizeTheoryDocument(analysis, {
          fileName: payload.filename,
          sourceKind: 'midi',
        });
        const saved = await store().save({
          sourceType: 'midi',
          filename: payload.filename,
          sourcePath: payload.input,
          sourceMediaType: payload.contentType || 'audio/midi',
          theoryBuffer: Buffer.from(`${stableStringify(analysis, 2)}\n`, 'utf8'),
          playableSong: playable,
          analyzerVersion: analysis.analyzer?.version || analysis.sections?.[0]?.analysis?.analyzerVersion || 'unknown',
        });
        let preservedAnalysis = analysis;
        if (saved.deduplicated) {
          preservedAnalysis = JSON.parse(await fsp.readFile(store().download(saved.item.id, 'theory').path, 'utf8'));
        }
        sendJson(res, 200, { ...saved, analysis: preservedAnalysis });
        return true;
      }

      if (route.action === 'import-theory') {
        const payload = await streamedTheoryPayload(
          req,
          req.headers?.['content-type'] || '',
          uploadDirectory,
          maxBytes,
        );
        const sourceBuffer = await fsp.readFile(payload.input);
        const sourceDocument = parseJsonBuffer(sourceBuffer);
        const normalizeTheoryDocument = typeof normalize === 'function' && options.normalizeTheory
          ? normalize
          : await normalize();
        const playable = normalizeTheoryDocument(sourceDocument, {
          fileName: payload.filename,
          sourceKind: 'theory',
        });
        const saved = await store().save({
          sourceType: 'theory',
          filename: payload.filename,
          sourceBuffer,
          sourceMediaType: payload.contentType || 'application/json',
          theoryBuffer: sourceBuffer,
          playableSong: playable,
        });
        sendJson(res, 200, saved);
        return true;
      }
      throw apiError('LOCAL_LIBRARY_ROUTE_FAILED', 'Unknown local-library operation', 404);
    } catch (error) {
      const normalizedError = normalizeRequestError(error, req, route);
      const statusCode = Number(normalizedError.statusCode) || 500;
      sendJson(res, statusCode, errorDocument(normalizedError));
      return true;
    } finally {
      if (uploadDirectory) await fsp.rm(uploadDirectory, { recursive: true, force: true });
    }
  };
}

const handleLocalLibrary = createLocalLibraryHandler();

module.exports = {
  BASE_PATH,
  assertLocalOrigin,
  contentDisposition,
  createLocalLibraryHandler,
  errorDocument,
  handleLocalLibrary,
  matchLocalLibraryRoute,
  normalizeRequestError,
  parseJsonBuffer,
  streamedTheoryPayload,
};
