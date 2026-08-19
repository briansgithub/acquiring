const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;
const DEFAULT_MAX_EVENTS = 5_000_000;

function apiError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

async function readBoundedBody(req, maxBytes = DEFAULT_MAX_BYTES) {
  const declaredLength = Number(req.headers?.["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw apiError("MIDI_TOO_LARGE", `Request exceeds ${maxBytes} bytes`, 413);
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw apiError("MIDI_TOO_LARGE", `Request exceeds ${maxBytes} bytes`, 413);
    }
    chunks.push(buffer);
  }
  if (!total) throw apiError("EMPTY_MIDI", "The request body is empty");
  return Buffer.concat(chunks, total);
}

async function spoolBoundedRequest(req, targetPath, maxBytes = DEFAULT_MAX_BYTES) {
  const declaredLength = Number(req.headers?.["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw apiError("MIDI_TOO_LARGE", `Request exceeds ${maxBytes} bytes`, 413);
  }
  const handle = await fsp.open(targetPath, "wx");
  let total = 0;
  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) throw apiError("MIDI_TOO_LARGE", `Request exceeds ${maxBytes} bytes`, 413);
      await handle.write(buffer);
    }
  } finally {
    await handle.close();
  }
  if (!total) throw apiError("EMPTY_MIDI", "The request body is empty");
  return { path: targetPath, byteLength: total };
}

function parseContentDisposition(value = "") {
  const name = /(?:^|;)\s*name="([^"]+)"/i.exec(value)?.[1] || null;
  const filename = /(?:^|;)\s*filename="([^"]*)"/i.exec(value)?.[1] || null;
  return { name, filename };
}

function parseMultipartMidi(body, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType)?.slice(1).find(Boolean);
  if (!boundary) throw apiError("INVALID_MULTIPART", "Multipart boundary is missing");
  const delimiter = Buffer.from(`--${boundary}`);
  const headerEnd = Buffer.from("\r\n\r\n");
  let cursor = body.indexOf(delimiter);
  if (cursor < 0) throw apiError("INVALID_MULTIPART", "Multipart boundary was not found");

  while (cursor >= 0) {
    cursor += delimiter.length;
    if (body.subarray(cursor, cursor + 2).equals(Buffer.from("--"))) break;
    if (body.subarray(cursor, cursor + 2).equals(Buffer.from("\r\n"))) cursor += 2;
    const headersEndAt = body.indexOf(headerEnd, cursor);
    if (headersEndAt < 0) throw apiError("INVALID_MULTIPART", "Multipart headers are incomplete");
    const headerText = body.subarray(cursor, headersEndAt).toString("utf8");
    const headers = Object.fromEntries(headerText.split("\r\n").map((line) => {
      const separator = line.indexOf(":");
      return separator < 0
        ? [line.toLowerCase(), ""]
        : [line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()];
    }));
    const disposition = parseContentDisposition(headers["content-disposition"]);
    const dataStart = headersEndAt + headerEnd.length;
    const nextBoundary = body.indexOf(Buffer.from(`\r\n--${boundary}`), dataStart);
    if (nextBoundary < 0) throw apiError("INVALID_MULTIPART", "Multipart file content is incomplete");
    if (disposition.name === "file") {
      const midi = body.subarray(dataStart, nextBoundary);
      if (!midi.length) throw apiError("EMPTY_MIDI", "The uploaded MIDI file is empty");
      return {
        buffer: midi,
        filename: path.basename(disposition.filename || "upload.mid"),
        contentType: headers["content-type"] || "application/octet-stream",
      };
    }
    cursor = nextBoundary + 2;
  }
  throw apiError("MISSING_MIDI_FILE", 'Multipart form must contain a "file" part');
}

function extractMidiPayload(body, contentType = "") {
  if (/^multipart\/form-data\b/i.test(contentType)) {
    return parseMultipartMidi(body, contentType);
  }
  if (/^(audio\/(midi|mid)|application\/(midi|x-midi|octet-stream))\b/i.test(contentType)) {
    return { buffer: body, filename: "upload.mid", contentType };
  }
  throw apiError(
    "UNSUPPORTED_CONTENT_TYPE",
    "Use multipart/form-data with a file field, audio/midi, or application/octet-stream",
    415,
  );
}

function multipartBoundary(contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType)?.slice(1).find(Boolean);
  if (!boundary) throw apiError("INVALID_MULTIPART", "Multipart boundary is missing");
  if (boundary.length > 200 || /[\r\n]/.test(boundary)) throw apiError("INVALID_MULTIPART", "Multipart boundary is invalid");
  return boundary;
}

async function extractMultipartMidiFile(requestPath, contentType, outputPath) {
  const boundary = multipartBoundary(contentType);
  const delimiter = Buffer.from(`--${boundary}`);
  const nextDelimiter = Buffer.from(`\r\n--${boundary}`);
  const headerEnd = Buffer.from("\r\n\r\n");
  let pending = Buffer.alloc(0);
  let state = "first-boundary";
  let selected = false;
  let output = null;
  let filename = "upload.mid";
  let mediaType = "application/octet-stream";
  let byteLength = 0;
  const writeSelected = async (buffer) => {
    if (!selected || !buffer.length) return;
    await output.write(buffer);
    byteLength += buffer.length;
  };
  try {
    for await (const chunk of fs.createReadStream(requestPath)) {
      pending = Buffer.concat([pending, chunk]);
      let progressed = true;
      while (progressed) {
        progressed = false;
        if (state === "first-boundary") {
          const at = pending.indexOf(delimiter);
          if (at < 0) {
            pending = pending.subarray(Math.max(0, pending.length - delimiter.length));
            break;
          }
          pending = pending.subarray(at + delimiter.length);
          state = "boundary-suffix";
          progressed = true;
        }
        if (state === "boundary-suffix") {
          if (pending.length < 2) break;
          if (pending.subarray(0, 2).equals(Buffer.from("--"))) break;
          if (!pending.subarray(0, 2).equals(Buffer.from("\r\n"))) {
            throw apiError("INVALID_MULTIPART", "Multipart boundary terminator is invalid");
          }
          pending = pending.subarray(2);
          state = "headers";
          progressed = true;
        }
        if (state === "headers") {
          const at = pending.indexOf(headerEnd);
          if (at < 0) {
            if (pending.length > 64 * 1024) throw apiError("INVALID_MULTIPART", "Multipart headers are too large");
            break;
          }
          const headerText = pending.subarray(0, at).toString("utf8");
          const headers = Object.fromEntries(headerText.split("\r\n").map((line) => {
            const separator = line.indexOf(":");
            return separator < 0
              ? [line.toLowerCase(), ""]
              : [line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()];
          }));
          const disposition = parseContentDisposition(headers["content-disposition"]);
          selected = disposition.name === "file";
          if (selected) {
            filename = path.basename(disposition.filename || "upload.mid");
            mediaType = headers["content-type"] || mediaType;
            output = await fsp.open(outputPath, "wx");
          }
          pending = pending.subarray(at + headerEnd.length);
          state = "data";
          progressed = true;
        }
        if (state === "data") {
          const at = pending.indexOf(nextDelimiter);
          if (at >= 0) {
            await writeSelected(pending.subarray(0, at));
            if (selected) {
              await output.close();
              output = null;
              if (!byteLength) throw apiError("EMPTY_MIDI", "The uploaded MIDI file is empty");
              return { input: outputPath, filename, contentType: mediaType, byteLength };
            }
            pending = pending.subarray(at + nextDelimiter.length);
            state = "boundary-suffix";
            progressed = true;
          } else {
            const safeBytes = pending.length - (nextDelimiter.length - 1);
            if (safeBytes > 0) {
              await writeSelected(pending.subarray(0, safeBytes));
              pending = pending.subarray(safeBytes);
            }
            break;
          }
        }
      }
    }
  } finally {
    if (output) await output.close();
  }
  throw apiError("MISSING_MIDI_FILE", 'Multipart form must contain a complete "file" part');
}

async function streamedMidiPayload(req, contentType, directory, maxBytes) {
  const requestPath = path.join(directory, "request-body.bin");
  const request = await spoolBoundedRequest(req, requestPath, maxBytes);
  if (/^multipart\/form-data\b/i.test(contentType)) {
    return extractMultipartMidiFile(request.path, contentType, path.join(directory, "upload.mid"));
  }
  if (/^(audio\/(midi|mid)|application\/(midi|x-midi|octet-stream))\b/i.test(contentType)) {
    return { input: request.path, filename: "upload.mid", contentType, byteLength: request.byteLength };
  }
  throw apiError(
    "UNSUPPORTED_CONTENT_TYPE",
    "Use multipart/form-data with a file field, audio/midi, or application/octet-stream",
    415,
  );
}

let analyzerPromise = null;
async function loadAnalyzer() {
  if (!analyzerPromise) {
    const analyzerUrl = pathToFileURL(path.join(__dirname, "..", "lib", "midi", "analyze", "index.js")).href;
    analyzerPromise = import(analyzerUrl).then((module) => module.analyzeMidi || module.default);
  }
  return analyzerPromise;
}

function sendJson(res, statusCode, value) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}

function parseRequestedTopK(reqUrl) {
  const raw = reqUrl.searchParams.get("topK");
  if (raw === null || raw === "") return 5;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 20) {
    const error = new Error("topK must be an integer from 1 through 20");
    error.code = "INVALID_ANALYSIS_OPTIONS";
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function createMidiAnalyzeHandler({
  analyze = null,
  maxBytes = DEFAULT_MAX_BYTES,
  maxEvents = DEFAULT_MAX_EVENTS,
} = {}) {
  const boundedMaxBytes = Math.min(
    DEFAULT_MAX_BYTES,
    Number.isFinite(Number(maxBytes)) && Number(maxBytes) > 0 ? Math.floor(Number(maxBytes)) : DEFAULT_MAX_BYTES,
  );
  const boundedMaxEvents = Math.min(
    DEFAULT_MAX_EVENTS,
    Number.isFinite(Number(maxEvents)) && Number(maxEvents) > 0 ? Math.floor(Number(maxEvents)) : DEFAULT_MAX_EVENTS,
  );
  return async function handleMidiAnalyze(req, reqUrl, res) {
    const uploadDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), "diatonic-midi-upload-"));
    try {
      const topK = parseRequestedTopK(reqUrl);
      const payload = await streamedMidiPayload(
        req,
        req.headers?.["content-type"] || "",
        uploadDirectory,
        boundedMaxBytes,
      );
      const analyzeMidi = analyze || await loadAnalyzer();
      const result = await analyzeMidi(payload.input, {
        filename: payload.filename,
        topK,
        maxBytes: boundedMaxBytes,
        maxEvents: boundedMaxEvents,
      });
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, error.statusCode || 422, {
        error: {
          code: error.code || "MIDI_ANALYSIS_FAILED",
          message: error.message,
        },
      });
    } finally {
      await fsp.rm(uploadDirectory, { recursive: true, force: true });
    }
  };
}

const handleMidiAnalyze = createMidiAnalyzeHandler();

module.exports = {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_EVENTS,
  createMidiAnalyzeHandler,
  extractMidiPayload,
  handleMidiAnalyze,
  parseRequestedTopK,
  parseMultipartMidi,
  readBoundedBody,
  spoolBoundedRequest,
  streamedMidiPayload,
};
