import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { Readable, Writable } from 'node:stream';

import { buildMidi, type2Fixture } from '../tests/midi-analyze/fixtures.mjs';

import { analyzeMidi } from '../lib/midi/analyze/index.js';
import { renderSectionToMidi } from '../lib/midi/render/index.mjs';

const require = createRequire(import.meta.url);
const { GIB } = require('../lib/midi-corpus/storage');
const { createLocalLibraryStore } = require('../lib/local-library/store');
const {
  createLocalLibraryHandler,
  matchLocalLibraryRoute,
} = require('./localLibraryApi');

const UUIDS = [
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
];

class CaptureResponse extends Writable {
  constructor() {
    super();
    this.statusCode = null;
    this.headers = {};
    this.chunks = [];
  }

  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    this.headers = { ...headers };
    return this;
  }

  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  get body() {
    return Buffer.concat(this.chunks);
  }

  get json() {
    return JSON.parse(this.body.toString('utf8'));
  }
}

function request(body = Buffer.alloc(0), {
  method = 'GET',
  contentType,
  filename,
  origin = 'http://127.0.0.1:3000',
  remoteAddress = '127.0.0.1',
} = {}) {
  const req = Readable.from(body.length ? [body] : []);
  req.method = method;
  req.headers = {
    host: '127.0.0.1:3000',
    ...(origin === null ? {} : { origin }),
    ...(contentType ? { 'content-type': contentType } : {}),
    ...(body.length ? { 'content-length': String(body.length) } : {}),
    ...(filename ? { 'x-filename': filename } : {}),
  };
  req.socket = { remoteAddress };
  return req;
}

function normalizedSong(fileName = 'fixture.json') {
  return {
    schemaVersion: 'diatonic-ring.playable-song.v1',
    title: path.parse(fileName).name,
    artist: 'Local Theory',
    warnings: [],
    sections: [{
      sectionName: 'Verse',
      sectionIndex: 0,
      inlineData: {
        sectionName: 'Verse',
        chords: [],
        notes: [{ beat: 1, duration: 1, sd: 1, octave: 0 }],
        metadata: {
          keys: [{ beat: 1, tonic: 'C', scale: 'major' }],
          tempos: [{ beat: 1, bpm: 120 }],
          meters: [{ beat: 1, numerator: 4, denominator: 4 }],
          endBeat: 2,
        },
      },
    }],
  };
}

async function apiFixture(t, overrides = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'local-library-api-test-'));
  const uploadRoot = path.join(root, 'uploads');
  await fs.mkdir(uploadRoot);
  let uuid = 0;
  const store = createLocalLibraryStore({
    root: path.join(root, 'library'),
    availableBytes: 30n * GIB,
    randomUUID: () => UUIDS[uuid++],
    now: () => `2026-08-19T00:00:0${uuid}.000Z`,
  });
  const handler = createLocalLibraryHandler({
    store,
    tempRoot: uploadRoot,
    normalizeTheory: (_document, { fileName }) => normalizedSong(fileName),
    ...overrides,
  });
  t.after(async () => {
    store.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  return { handler, store, uploadRoot };
}

async function call(handler, pathname, req) {
  const res = new CaptureResponse();
  const reqUrl = new URL(pathname, 'http://127.0.0.1:3000');
  const route = matchLocalLibraryRoute(reqUrl.pathname, req.method);
  await handler(req, reqUrl, res, route);
  return res;
}

test('route matcher distinguishes imports, detail, downloads, and methods', () => {
  assert.deepEqual(matchLocalLibraryRoute('/api/v1/local-library', 'GET'), {
    action: 'list', allowed: ['GET'], methodAllowed: true,
  });
  assert.equal(matchLocalLibraryRoute('/api/v1/local-library/theory', 'POST').action, 'import-theory');
  assert.equal(matchLocalLibraryRoute('/api/v1/local-library/id/source', 'GET').action, 'source-download');
  assert.equal(matchLocalLibraryRoute('/api/v1/local-library/id/theory', 'GET').action, 'theory-download');
  assert.equal(matchLocalLibraryRoute('/api/v1/local-library/midi', 'GET').methodAllowed, false);
  assert.equal(matchLocalLibraryRoute('/unrelated', 'GET'), null);
});

test('theory endpoint preserves source bytes and serves list, detail, and downloads', async (t) => {
  const { handler, store, uploadRoot } = await apiFixture(t);
  const source = Buffer.from('{\n  "songInfo": {"name": "Exact bytes"}\n}\n');
  const imported = await call(
    handler,
    '/api/v1/local-library/theory',
    request(source, { method: 'POST', contentType: 'application/json', filename: 'theory.json' }),
  );
  assert.equal(imported.statusCode, 200);
  assert.equal(imported.json.item.sourceType, 'theory');
  assert.equal(imported.json.song.key, imported.json.item.key);
  assert.equal(imported.json.song.sections[0].inlineData.sectionName, 'Verse');
  assert.deepEqual(await fs.readdir(uploadRoot), []);

  const listed = await call(handler, '/api/v1/local-library', request());
  assert.deepEqual(listed.json.items, [imported.json.item]);

  const id = imported.json.item.id;
  const detail = await call(handler, `/api/v1/local-library/${id}`, request());
  assert.equal(detail.json.song.key, `local:${id}`);

  const sourceDownload = await call(handler, `/api/v1/local-library/${id}/source`, request());
  assert.equal(sourceDownload.statusCode, 200);
  assert.deepEqual(sourceDownload.body, source);
  assert.match(sourceDownload.headers['Content-Disposition'], /theory\.json/);

  const theoryDownload = store.download(id, 'theory');
  assert.deepEqual(await fs.readFile(theoryDownload.path), source);
});

test('theory endpoint dynamically loads the production normalizer', async (t) => {
  const { handler } = await apiFixture(t, { normalizeTheory: undefined });
  const source = Buffer.from(JSON.stringify({
    sectionName: 'Imported Verse',
    songInfo: 'Real Normalizer',
    chords: [{ root: 1, beat: 1, duration: 4, type: 5, inversion: 0, applied: 0 }],
    notes: [],
    metadata: {
      keys: [{ tonic: 'C', scale: 'major', beat: 1 }],
      tempos: [{ bpm: 120, beat: 1 }],
      meters: [{ numBeats: 4, beatUnit: 1, beat: 1 }],
      endBeat: 5,
    },
  }));
  const response = await call(
    handler,
    '/api/v1/local-library/theory',
    request(source, { method: 'POST', contentType: 'application/json', filename: 'real.json' }),
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.json.song.title, 'Real Normalizer');
  assert.equal(response.json.song.sections[0].sectionName, 'Imported Verse');
});

test('MIDI endpoint analyzes multipart bytes, persists full analysis, and deduplicates', async (t) => {
  const midi = Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0xff]);
  const analysis = {
    schemaVersion: 'hooktheory.midi-analysis.v1',
    analyzer: { version: '1.0-test' },
    sections: [{ hooktheory: normalizedSong().sections[0].inlineData }],
  };
  const analyzerCalls = [];
  const { handler, uploadRoot } = await apiFixture(t, {
    analyze: async (inputPath, options) => {
      analyzerCalls.push({ bytes: await fs.readFile(inputPath), options });
      return analysis;
    },
  });
  const boundary = 'local-library-boundary';
  const multipart = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="song.mid"\r\nContent-Type: audio/midi\r\n\r\n`),
    midi,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const importOnce = () => call(
    handler,
    '/api/v1/local-library/midi?topK=3',
    request(multipart, { method: 'POST', contentType: `multipart/form-data; boundary=${boundary}` }),
  );
  const first = await importOnce();
  const second = await importOnce();

  assert.equal(first.statusCode, 200);
  assert.deepEqual(analyzerCalls[0].bytes, midi);
  assert.equal(analyzerCalls[0].options.topK, 3);
  assert.deepEqual(first.json.analysis, analysis);
  assert.equal(first.json.item.filename, 'song.mid');
  assert.equal(first.json.deduplicated, false);
  assert.equal(second.json.deduplicated, true);
  assert.equal(second.json.item.id, first.json.item.id);
  assert.deepEqual(second.json.analysis, analysis);
  assert.deepEqual(await fs.readdir(uploadRoot), []);

  const sourceDownload = await call(
    handler,
    `/api/v1/local-library/${first.json.item.id}/source`,
    request(),
  );
  assert.deepEqual(sourceDownload.body, Buffer.from(midi));
});

test('production renderer and analyzer round-trip into a persistent playable local song', async (t) => {
  const section = {
    sectionName: 'Full Song',
    chords: [
      { root: 1, type: 5, beat: 1, duration: 1 },
      { root: 4, type: 5, beat: 2, duration: 1 },
      { root: 5, type: 7, beat: 3, duration: 1 },
      { root: 1, type: 5, beat: 4, duration: 1 },
    ],
    notes: [
      { sd: '1', octave: 0, beat: 1, duration: 1 },
      { sd: '4', octave: 0, beat: 2, duration: 1 },
      { sd: '5', octave: 0, beat: 3, duration: 1 },
      { sd: '1', octave: 1, beat: 4, duration: 1 },
    ],
    metadata: {
      keys: [{ tonic: 'C', scale: 'major', beat: 1 }],
      tempos: [{ bpm: 120, beat: 1 }],
      meters: [{ numBeats: 4, beatUnit: 1, beat: 1 }],
      endBeat: 5,
    },
  };
  const midi = renderSectionToMidi(section).bytes;
  const { handler } = await apiFixture(t, {
    analyze: analyzeMidi,
    normalizeTheory: undefined,
  });

  const imported = await call(
    handler,
    '/api/v1/local-library/midi?topK=5',
    request(midi, { method: 'POST', contentType: 'audio/midi', filename: 'roundtrip.mid' }),
  );

  assert.equal(imported.statusCode, 200);
  assert.equal(imported.json.analysis.schemaVersion, 'hooktheory.midi-analysis.v1');
  assert.equal(imported.json.song.key, `local:${imported.json.item.id}`);
  assert.equal(imported.json.song.title, 'roundtrip');
  assert.ok(imported.json.song.sections[0].inlineData.chords.length > 0);
  assert.ok(imported.json.song.sections[0].inlineData.notes.length > 0);

  const sourceDownload = await call(
    handler,
    `/api/v1/local-library/${imported.json.item.id}/source`,
    request(),
  );
  assert.deepEqual(sourceDownload.body, Buffer.from(midi));

  const theoryDownload = await call(
    handler,
    `/api/v1/local-library/${imported.json.item.id}/theory`,
    request(),
  );
  assert.deepEqual(JSON.parse(theoryDownload.body), imported.json.analysis);
});

test('imports enforce local origin, bounded uploads, and structured errors', async (t) => {
  const { handler } = await apiFixture(t, { maxBytes: 8 });
  const foreign = await call(
    handler,
    '/api/v1/local-library/theory',
    request(Buffer.from('{}'), {
      method: 'POST', contentType: 'application/json', origin: 'https://example.com',
    }),
  );
  assert.equal(foreign.statusCode, 403);
  assert.equal(foreign.json.error.code, 'LOCAL_ORIGIN_REQUIRED');

  const oversized = await call(
    handler,
    '/api/v1/local-library/theory',
    request(Buffer.alloc(9), { method: 'POST', contentType: 'application/json' }),
  );
  assert.equal(oversized.statusCode, 413);
  assert.equal(oversized.json.error.code, 'MIDI_TOO_LARGE');

  const wrongMethod = await call(handler, '/api/v1/local-library/midi', request());
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.headers.Allow, 'POST');
  assert.equal(wrongMethod.json.error.code, 'METHOD_NOT_ALLOWED');
});

test('normalization issues remain bounded structured API details', async (t) => {
  const issueError = Object.assign(new Error('Theory document has invalid events'), {
    code: 'INVALID_THEORY_DOCUMENT',
    statusCode: 422,
    issues: [{ path: 'sections[1].chords[3].duration', code: 'INVALID_DURATION', message: 'must be positive' }],
  });
  const { handler } = await apiFixture(t, {
    normalizeTheory: () => { throw issueError; },
  });
  const response = await call(
    handler,
    '/api/v1/local-library/theory',
    request(Buffer.from('{}'), { method: 'POST', contentType: 'application/json' }),
  );
  assert.equal(response.statusCode, 422);
  assert.deepEqual(response.json.error.details.issues, issueError.issues);
});

test('production analyzer rejects SMF type 2 without persisting files', async (t) => {
  const { handler, store, uploadRoot } = await apiFixture(t);
  const response = await call(
    handler,
    '/api/v1/local-library/midi',
    request(Buffer.from(type2Fixture()), {
      method: 'POST', contentType: 'audio/midi', filename: 'asynchronous.mid',
    }),
  );

  assert.equal(response.statusCode, 422);
  assert.equal(response.json.error.code, 'UNSUPPORTED_MIDI_FORMAT');
  assert.match(response.json.error.message, /type 2/i);
  assert.deepEqual(store.list(), []);
  assert.deepEqual(await fs.readdir(uploadRoot), []);
});

test('production analyzer rejects SMPTE division without persisting files', async (t) => {
  const { handler, store, uploadRoot } = await apiFixture(t);
  const smpte = Buffer.from(buildMidi(0, [{ events: [], endTick: 0 }]));
  smpte.writeUInt16BE(0xe728, 12);
  const response = await call(
    handler,
    '/api/v1/local-library/midi',
    request(smpte, {
      method: 'POST', contentType: 'audio/midi', filename: 'film-timed.mid',
    }),
  );

  assert.equal(response.statusCode, 422);
  assert.equal(response.json.error.code, 'UNSUPPORTED_MIDI_TIMING');
  assert.match(response.json.error.message, /SMPTE/i);
  assert.deepEqual(store.list(), []);
  assert.deepEqual(await fs.readdir(uploadRoot), []);
});

test('aborted upload returns a structured 4xx and removes partial bytes', async (t) => {
  const { handler, store, uploadRoot } = await apiFixture(t);
  const socketError = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
  const req = Readable.from((async function* interruptedUpload() {
    yield Buffer.from('{"partial":');
    throw socketError;
  }()));
  req.method = 'POST';
  req.headers = {
    host: '127.0.0.1:3000',
    origin: 'http://127.0.0.1:3000',
    'content-type': 'application/json',
    'content-length': '100',
    'x-filename': 'interrupted.json',
  };
  req.socket = { remoteAddress: '127.0.0.1' };

  const response = await call(handler, '/api/v1/local-library/theory', req);
  assert.equal(response.statusCode, 400);
  assert.equal(response.json.error.code, 'UPLOAD_ABORTED');
  assert.match(response.json.error.message, /before the complete file/i);
  assert.deepEqual(store.list(), []);
  assert.deepEqual(await fs.readdir(uploadRoot), []);
});
