'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { pipeline } = require('node:stream/promises');

const { resolveDataRoot } = require('../dataRoot');
const {
  DEFAULT_RESERVE_BYTES,
  StoragePreflightError,
  assertStoragePreflight,
} = require('../midi-corpus/storage');
const { hashFile } = require('../midi-corpus/hash');
const { stableStringify } = require('../midi-corpus/stable-json');

const SCHEMA_VERSION = 1;
const INDEX_GROWTH_BYTES = 64n * 1024n;
const SOURCE_TYPES = new Set(['midi', 'theory']);

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS library_objects (
  sha256 TEXT PRIMARY KEY CHECK (length(sha256) = 64),
  byte_count INTEGER NOT NULL CHECK (byte_count >= 0),
  media_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS library_items (
  id TEXT PRIMARY KEY,
  ingest_key TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK (source_type IN ('midi', 'theory')),
  filename TEXT NOT NULL,
  display_filename TEXT NOT NULL COLLATE NOCASE UNIQUE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  source_sha256 TEXT NOT NULL REFERENCES library_objects(sha256),
  theory_sha256 TEXT NOT NULL REFERENCES library_objects(sha256),
  playable_sha256 TEXT NOT NULL REFERENCES library_objects(sha256),
  source_media_type TEXT NOT NULL,
  theory_media_type TEXT NOT NULL,
  analyzer_version TEXT,
  section_count INTEGER NOT NULL CHECK (section_count > 0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS library_items_created_at_idx
  ON library_items(created_at DESC, id DESC);
`;

class LocalLibraryError extends Error {
  constructor(code, message, statusCode = 500, details = undefined) {
    super(message);
    this.name = 'LocalLibraryError';
    this.code = code;
    this.statusCode = statusCode;
    if (details !== undefined) this.details = details;
  }
}

function safeFilename(value, fallback) {
  const leaf = path.basename(String(value || fallback).replace(/\\/g, '/'));
  const cleaned = leaf.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return cleaned.slice(0, 240) || fallback;
}

function normalizeUuid(value) {
  const id = String(value || '').toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    throw new LocalLibraryError('INVALID_LIBRARY_ID', 'The local-library id is not a valid UUID', 400);
  }
  return id;
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function objectPath(root, digest) {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new TypeError('Invalid SHA-256 digest');
  return path.join(root, 'objects', digest.slice(0, 2), digest);
}

function jsonBuffer(value) {
  return Buffer.from(`${stableStringify(value, 2)}\n`, 'utf8');
}

function mediaTypeForSource(sourceType) {
  return sourceType === 'midi' ? 'audio/midi' : 'application/json';
}

function ingestKey(sourceType, sourceSha256, analyzerVersion) {
  return sourceType === 'midi'
    ? `midi:${sourceSha256}:${analyzerVersion || 'unknown'}`
    : `theory:${sourceSha256}`;
}

function withLocalIdentity(song, id) {
  return {
    ...song,
    id: `local:${id}`,
    key: `local:${id}`,
    localId: id,
    url: null,
    sections: song.sections.map((section, index) => ({
      ...section,
      sectionIndex: Number.isInteger(section.sectionIndex) ? section.sectionIndex : index,
    })),
  };
}

function publicItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: `local:${row.id}`,
    sourceType: row.source_type,
    filename: row.filename,
    displayFilename: row.display_filename,
    title: row.title,
    artist: row.artist,
    sectionCount: Number(row.section_count),
    analyzerVersion: row.analyzer_version || null,
    createdAt: row.created_at,
    sourceBytes: Number(row.source_bytes),
    theoryBytes: Number(row.theory_bytes),
  };
}

async function inspectInput({ sourcePath, sourceBuffer }) {
  if (sourceBuffer !== undefined) {
    const buffer = Buffer.isBuffer(sourceBuffer) ? sourceBuffer : Buffer.from(sourceBuffer);
    return { buffer, sha256: sha256Buffer(buffer), bytes: buffer.length };
  }
  if (!sourcePath) throw new TypeError('sourcePath or sourceBuffer is required');
  const absolutePath = path.resolve(sourcePath);
  const stat = await fsp.stat(absolutePath);
  if (!stat.isFile()) throw new TypeError('sourcePath must identify a regular file');
  const inspected = await hashFile(absolutePath);
  return { path: absolutePath, sha256: inspected.sha256, bytes: inspected.bytes };
}

async function validateObject(targetPath, expectedSha256, expectedBytes) {
  const inspected = await hashFile(targetPath);
  if (inspected.sha256 !== expectedSha256 || inspected.bytes !== expectedBytes) {
    throw new LocalLibraryError(
      'LOCAL_OBJECT_INTEGRITY_ERROR',
      'A content-addressed local-library object failed integrity validation',
      500,
      { expectedSha256, expectedBytes, actualSha256: inspected.sha256, actualBytes: inspected.bytes },
    );
  }
}

async function stageObject(root, descriptor) {
  const targetPath = objectPath(root, descriptor.sha256);
  try {
    await validateObject(targetPath, descriptor.sha256, descriptor.bytes);
    return { targetPath, created: false };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const stagingRoot = path.join(root, 'staging');
  await fsp.mkdir(stagingRoot, { recursive: true });
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  const stagingPath = path.join(
    stagingRoot,
    `${descriptor.sha256}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`,
  );
  try {
    if (descriptor.path) {
      await pipeline(
        fs.createReadStream(descriptor.path),
        fs.createWriteStream(stagingPath, { flags: 'wx', mode: 0o600 }),
      );
    } else {
      await fsp.writeFile(stagingPath, descriptor.buffer, { flag: 'wx', mode: 0o600 });
    }
    await validateObject(stagingPath, descriptor.sha256, descriptor.bytes);
    try {
      await fsp.rename(stagingPath, targetPath);
      try { await fsp.chmod(targetPath, 0o444); } catch {}
      return { targetPath, created: true };
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error.code)) throw error;
      await validateObject(targetPath, descriptor.sha256, descriptor.bytes);
      return { targetPath, created: false };
    }
  } finally {
    try { await fsp.unlink(stagingPath); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function initializeDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  const version = Number(db.prepare('PRAGMA user_version').get().user_version || 0);
  if (version > SCHEMA_VERSION) {
    db.close();
    throw new LocalLibraryError(
      'LOCAL_LIBRARY_SCHEMA_TOO_NEW',
      `Local-library schema ${version} is newer than supported schema ${SCHEMA_VERSION}`,
      500,
    );
  }
  db.exec(SCHEMA_SQL);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return db;
}

function makeDisplayFilename(db, filename) {
  const exists = db.prepare('SELECT 1 FROM library_items WHERE display_filename = ? COLLATE NOCASE');
  if (!exists.get(filename)) return filename;
  const extension = path.extname(filename);
  const stem = filename.slice(0, filename.length - extension.length) || 'file';
  for (let suffix = 2; suffix < 100_000; suffix += 1) {
    const candidate = `${stem} (${suffix})${extension}`;
    if (!exists.get(candidate)) return candidate;
  }
  throw new LocalLibraryError('DISPLAY_NAME_EXHAUSTED', 'Could not assign a unique local filename', 500);
}

function createLocalLibraryStore(options = {}) {
  const root = path.resolve(options.root || path.join(options.dataRoot || resolveDataRoot(), 'local-library'));
  const databasePath = path.join(root, 'library.db');
  const now = options.now || (() => new Date().toISOString());
  const makeUuid = options.randomUUID || crypto.randomUUID;
  let db = null;

  const database = () => {
    if (!db) db = initializeDatabase(databasePath);
    return db;
  };

  async function preflight(descriptors) {
    const objectBytes = descriptors.reduce((total, item) => total + BigInt(item.bytes), 0n);
    try {
      return await (options.assertStoragePreflight || assertStoragePreflight)({
        storeRoot: root,
        downloadBytes: objectBytes,
        indexBytes: INDEX_GROWTH_BYTES,
        temporaryBytes: objectBytes,
        reserveBytes: options.reserveBytes ?? DEFAULT_RESERVE_BYTES,
        availableBytes: options.availableBytes,
        filesystemProbePath: options.filesystemProbePath,
      });
    } catch (error) {
      if (error instanceof StoragePreflightError || error.code === 'INSUFFICIENT_STORAGE_RESERVE') {
        throw new LocalLibraryError(
          'INSUFFICIENT_STORAGE_RESERVE',
          error.message,
          507,
          {
            ...error.details,
            required_bytes: error.details?.required_bytes,
            available_bytes: error.details?.available_bytes,
            additional_bytes: error.details?.shortfall_bytes,
          },
        );
      }
      throw error;
    }
  }

  async function loadSongForRow(row) {
    const raw = await fsp.readFile(objectPath(root, row.playable_sha256), 'utf8');
    return JSON.parse(raw);
  }

  async function existingResult(row) {
    return { item: publicItem(row), song: await loadSongForRow(row), deduplicated: true };
  }

  async function save({
    sourceType,
    filename,
    sourcePath,
    sourceBuffer,
    theoryBuffer,
    playableSong,
    analyzerVersion = null,
    sourceMediaType = null,
  }) {
    if (!SOURCE_TYPES.has(sourceType)) throw new TypeError('sourceType must be midi or theory');
    if (!playableSong || !Array.isArray(playableSong.sections) || playableSong.sections.length === 0) {
      throw new TypeError('playableSong must contain at least one section');
    }
    const source = await inspectInput({ sourcePath, sourceBuffer });
    const normalizedTheory = Buffer.isBuffer(theoryBuffer) ? theoryBuffer : Buffer.from(theoryBuffer || '');
    if (!normalizedTheory.length) throw new TypeError('theoryBuffer must not be empty');
    const version = sourceType === 'midi' ? String(analyzerVersion || 'unknown') : null;
    const identity = ingestKey(sourceType, source.sha256, version);
    const connection = database();
    const duplicateRow = connection.prepare(`
      SELECT item.*,
        source_object.byte_count AS source_bytes,
        theory_object.byte_count AS theory_bytes
      FROM library_items AS item
      JOIN library_objects AS source_object ON source_object.sha256 = item.source_sha256
      JOIN library_objects AS theory_object ON theory_object.sha256 = item.theory_sha256
      WHERE item.ingest_key = ?
    `).get(identity);
    if (duplicateRow) return existingResult(duplicateRow);

    const id = normalizeUuid(makeUuid());
    const localSong = withLocalIdentity(playableSong, id);
    const playableBuffer = jsonBuffer(localSong);
    const descriptors = [
      { ...source, mediaType: sourceMediaType || mediaTypeForSource(sourceType) },
      {
        buffer: normalizedTheory,
        sha256: sha256Buffer(normalizedTheory),
        bytes: normalizedTheory.length,
        mediaType: 'application/json',
      },
      {
        buffer: playableBuffer,
        sha256: sha256Buffer(playableBuffer),
        bytes: playableBuffer.length,
        mediaType: 'application/json',
      },
    ];
    await preflight(descriptors);

    const staged = [];
    try {
      for (const descriptor of descriptors) staged.push(await stageObject(root, descriptor));
      const originalFilename = safeFilename(filename, sourceType === 'midi' ? 'upload.mid' : 'upload.json');
      const displayFilename = makeDisplayFilename(connection, originalFilename);
      const createdAt = now();
      connection.exec('BEGIN IMMEDIATE');
      try {
        const insertObject = connection.prepare(`
          INSERT OR IGNORE INTO library_objects (sha256, byte_count, media_type, created_at)
          VALUES (?, ?, ?, ?)
        `);
        for (const descriptor of descriptors) {
          insertObject.run(descriptor.sha256, descriptor.bytes, descriptor.mediaType, createdAt);
          const objectRow = connection.prepare(
            'SELECT byte_count FROM library_objects WHERE sha256 = ?',
          ).get(descriptor.sha256);
          if (!objectRow || Number(objectRow.byte_count) !== descriptor.bytes) {
            throw new LocalLibraryError(
              'LOCAL_OBJECT_INTEGRITY_ERROR',
              'The object index conflicts with immutable content storage',
              500,
            );
          }
        }
        if (options.beforeInsert) options.beforeInsert({ id, identity, connection });
        connection.prepare(`
          INSERT INTO library_items (
            id, ingest_key, source_type, filename, display_filename, title, artist,
            source_sha256, theory_sha256, playable_sha256, source_media_type,
            theory_media_type, analyzer_version, section_count, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          identity,
          sourceType,
          originalFilename,
          displayFilename,
          String(localSong.title || path.parse(originalFilename).name || 'Local file'),
          String(localSong.artist || (sourceType === 'midi' ? 'Local MIDI' : 'Local Theory')),
          descriptors[0].sha256,
          descriptors[1].sha256,
          descriptors[2].sha256,
          descriptors[0].mediaType,
          descriptors[1].mediaType,
          version,
          localSong.sections.length,
          createdAt,
        );
        connection.exec('COMMIT');
      } catch (error) {
        try { connection.exec('ROLLBACK'); } catch {}
        throw error;
      }
    } catch (error) {
      // Content objects are safe if left orphaned, but remove newly-created objects
      // when no committed row references them so a failed import is fully invisible.
      for (let index = 0; index < staged.length; index += 1) {
        if (!staged[index].created) continue;
        const digest = descriptors[index].sha256;
        let referenced = false;
        try {
          referenced = Boolean(database().prepare(`
            SELECT 1 FROM library_items
            WHERE source_sha256 = ? OR theory_sha256 = ? OR playable_sha256 = ? LIMIT 1
          `).get(digest, digest, digest));
        } catch {}
        if (!referenced) {
          try { await fsp.unlink(staged[index].targetPath); } catch {}
        }
      }
      // A second request may have committed the same immutable import while this
      // request was staging. Treat that unique-key race exactly like an ordinary
      // duplicate instead of surfacing a transient server error.
      const concurrentDuplicate = connection.prepare(`
        SELECT item.*,
          source_object.byte_count AS source_bytes,
          theory_object.byte_count AS theory_bytes
        FROM library_items AS item
        JOIN library_objects AS source_object ON source_object.sha256 = item.source_sha256
        JOIN library_objects AS theory_object ON theory_object.sha256 = item.theory_sha256
        WHERE item.ingest_key = ?
      `).get(identity);
      if (concurrentDuplicate) return existingResult(concurrentDuplicate);
      throw error;
    }

    const row = connection.prepare(`
      SELECT item.*,
        source_object.byte_count AS source_bytes,
        theory_object.byte_count AS theory_bytes
      FROM library_items AS item
      JOIN library_objects AS source_object ON source_object.sha256 = item.source_sha256
      JOIN library_objects AS theory_object ON theory_object.sha256 = item.theory_sha256
      WHERE item.id = ?
    `).get(id);
    return { item: publicItem(row), song: localSong, deduplicated: false };
  }

  function list() {
    const rows = database().prepare(`
      SELECT item.*,
        source_object.byte_count AS source_bytes,
        theory_object.byte_count AS theory_bytes
      FROM library_items AS item
      JOIN library_objects AS source_object ON source_object.sha256 = item.source_sha256
      JOIN library_objects AS theory_object ON theory_object.sha256 = item.theory_sha256
      ORDER BY item.created_at DESC, item.id DESC
    `).all();
    return rows.map(publicItem);
  }

  async function get(id) {
    const normalizedId = normalizeUuid(id);
    const row = database().prepare(`
      SELECT item.*,
        source_object.byte_count AS source_bytes,
        theory_object.byte_count AS theory_bytes
      FROM library_items AS item
      JOIN library_objects AS source_object ON source_object.sha256 = item.source_sha256
      JOIN library_objects AS theory_object ON theory_object.sha256 = item.theory_sha256
      WHERE item.id = ?
    `).get(normalizedId);
    if (!row) throw new LocalLibraryError('LOCAL_LIBRARY_ITEM_NOT_FOUND', 'Local file was not found', 404);
    return { item: publicItem(row), song: await loadSongForRow(row) };
  }

  function download(id, kind) {
    const normalizedId = normalizeUuid(id);
    if (!['source', 'theory'].includes(kind)) throw new TypeError('kind must be source or theory');
    const row = database().prepare('SELECT * FROM library_items WHERE id = ?').get(normalizedId);
    if (!row) throw new LocalLibraryError('LOCAL_LIBRARY_ITEM_NOT_FOUND', 'Local file was not found', 404);
    const digest = kind === 'source' ? row.source_sha256 : row.theory_sha256;
    let filename;
    if (kind === 'source' || row.source_type === 'theory') {
      filename = row.filename;
    } else {
      const extension = path.extname(row.filename);
      filename = `${row.filename.slice(0, row.filename.length - extension.length) || 'analysis'}.analysis.json`;
    }
    return {
      path: objectPath(root, digest),
      filename: safeFilename(filename, kind === 'source' ? 'source.bin' : 'theory.json'),
      mediaType: kind === 'source' ? row.source_media_type : row.theory_media_type,
      sha256: digest,
    };
  }

  function close() {
    if (db) db.close();
    db = null;
  }

  return {
    root,
    databasePath,
    save,
    list,
    get,
    download,
    close,
  };
}

module.exports = {
  INDEX_GROWTH_BYTES,
  LocalLibraryError,
  SCHEMA_VERSION,
  createLocalLibraryStore,
  normalizeUuid,
  objectPath,
  safeFilename,
};
