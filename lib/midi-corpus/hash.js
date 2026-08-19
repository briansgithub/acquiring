'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { Readable, Transform } = require('node:stream');
const zlib = require('node:zlib');

const DEFAULT_MAX_DECODED_BYTES = 64 * 1024 * 1024;

function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256String(value) {
  return sha256Buffer(Buffer.from(value, 'utf8'));
}

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  for await (const chunk of fs.createReadStream(filePath)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { sha256: hash.digest('hex'), bytes };
}

async function* chunkBuffer(buffer, chunkSize = 64 * 1024) {
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    yield buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length));
  }
}

class DecodeLimitError extends Error {
  constructor(limitBytes) {
    super(`Decoded gzip payload exceeds ${limitBytes} bytes`);
    this.name = 'DecodeLimitError';
    this.code = 'DECODE_LIMIT_EXCEEDED';
    this.limitBytes = limitBytes;
  }
}

/**
 * Incrementally decompresses one SQLite BLOB. SQLite still returns one row BLOB
 * as a Buffer, but this keeps decompression and hashing chunked and ensures the
 * caller never retains decoded data for more than one row.
 */
async function decodeGzipBlob(blob, options = {}) {
  const input = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  const maxDecodedBytes = options.maxDecodedBytes ?? DEFAULT_MAX_DECODED_BYTES;
  const compressedHash = crypto.createHash('sha256');
  const decodedHash = crypto.createHash('sha256');
  const chunks = [];
  let decodedBytes = 0;

  const tee = new Transform({
    transform(chunk, _encoding, callback) {
      compressedHash.update(chunk);
      callback(null, chunk);
    },
  });

  const stream = Readable.from(chunkBuffer(input)).pipe(tee).pipe(zlib.createGunzip());
  for await (const chunk of stream) {
    decodedBytes += chunk.length;
    if (decodedBytes > maxDecodedBytes) {
      stream.destroy(new DecodeLimitError(maxDecodedBytes));
      throw new DecodeLimitError(maxDecodedBytes);
    }
    decodedHash.update(chunk);
    chunks.push(chunk);
  }

  return {
    compressedBytes: input.length,
    compressedSha256: compressedHash.digest('hex'),
    decodedBytes,
    decodedSha256: decodedHash.digest('hex'),
    decoded: Buffer.concat(chunks, decodedBytes),
  };
}

module.exports = {
  DEFAULT_MAX_DECODED_BYTES,
  DecodeLimitError,
  decodeGzipBlob,
  hashFile,
  sha256Buffer,
  sha256String,
};
