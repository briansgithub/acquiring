import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { createRequire } from "node:module";
import { Readable } from "node:stream";

const require = createRequire(import.meta.url);
const {
  createMidiAnalyzeHandler,
  extractMidiPayload,
  readBoundedBody,
} = require("./midiAnalysisApi.js");

test("extractMidiPayload preserves binary multipart contents", () => {
  const boundary = "midi-boundary";
  const midi = Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 255, 1, 2]);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.mid"\r\nContent-Type: audio/midi\r\n\r\n`),
    midi,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const result = extractMidiPayload(body, `multipart/form-data; boundary=${boundary}`);
  assert.equal(result.filename, "test.mid");
  assert.deepEqual(result.buffer, midi);
});

test("bounded request reading fails before retaining an oversized upload", async () => {
  const request = Readable.from([Buffer.alloc(6), Buffer.alloc(6)]);
  request.headers = {};
  await assert.rejects(() => readBoundedBody(request, 10), { code: "MIDI_TOO_LARGE", statusCode: 413 });
});

test("handler passes bounded options and returns analyzer JSON", async () => {
  const request = Readable.from([Buffer.from("MThd")]);
  request.headers = { "content-type": "audio/midi", "content-length": "4" };
  const writes = [];
  const response = {
    writeHead: (status, headers) => writes.push({ status, headers }),
    end: (body) => writes.push(JSON.parse(body)),
  };
  const handler = createMidiAnalyzeHandler({
    maxBytes: 200 * 1024 * 1024,
    maxEvents: 10_000_000,
    analyze: async (inputPath, options) => ({
      bytes: (await fs.stat(inputPath)).size,
      filename: options.filename,
      topK: options.topK,
      maxBytes: options.maxBytes,
      maxEvents: options.maxEvents,
    }),
  });
  await handler(request, new URL("http://localhost/api/v1/midi/analyze?topK=7"), response);
  assert.equal(writes[0].status, 200);
  assert.deepEqual(writes[1], {
    bytes: 4,
    filename: "upload.mid",
    topK: 7,
    maxBytes: 100 * 1024 * 1024,
    maxEvents: 5_000_000,
  });
});

test("handler rejects invalid topK consistently with the library and CLI", async () => {
  const request = Readable.from([Buffer.from("MThd")]);
  request.headers = { "content-type": "audio/midi", "content-length": "4" };
  const writes = [];
  const response = {
    writeHead: (status) => writes.push({ status }),
    end: (body) => writes.push(JSON.parse(body)),
  };
  let analyzed = false;
  const handler = createMidiAnalyzeHandler({
    analyze: async () => {
      analyzed = true;
      return {};
    },
  });

  await handler(request, new URL("http://localhost/api/v1/midi/analyze?topK=21"), response);
  assert.equal(analyzed, false);
  assert.equal(writes[0].status, 400);
  assert.equal(writes[1].error.code, "INVALID_ANALYSIS_OPTIONS");
});

test("multipart handler streams a boundary split across chunks into an ephemeral file", async () => {
  const boundary = "streaming-boundary";
  const midi = Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 1, 2, 3]);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="description"\r\n\r\nfixture\r\n--${boundary}\r\n`),
    Buffer.from('Content-Disposition: form-data; name="file"; filename="nested/test.mid"\r\nContent-Type: audio/midi\r\n\r\n'),
    midi,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const request = Readable.from(Array.from(body, (byte) => Buffer.from([byte])));
  request.headers = { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": String(body.length) };
  const writes = [];
  let ephemeralPath;
  const response = {
    writeHead: (status) => writes.push({ status }),
    end: (value) => writes.push(JSON.parse(value)),
  };
  const handler = createMidiAnalyzeHandler({
    analyze: async (inputPath, options) => {
      ephemeralPath = inputPath;
      return { bytes: (await fs.readFile(inputPath)).length, filename: options.filename };
    },
  });
  await handler(request, new URL("http://localhost/api/v1/midi/analyze"), response);
  assert.equal(writes[0].status, 200);
  assert.deepEqual(writes[1], { bytes: midi.length, filename: "test.mid" });
  await assert.rejects(fs.stat(ephemeralPath), { code: "ENOENT" });
});
