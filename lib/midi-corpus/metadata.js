'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');
const { hashFile, sha256String } = require('./hash');
const { normalizeArtist, normalizeTitle } = require('./normalize');
const { classifyUsabilityClass, getSourcePolicy } = require('./source-policies');
const { stableStringify } = require('./stable-json');

const METADATA_EXTENSIONS = new Set(['.csv', '.json', '.jsonl', '.ndjson', '.tsv']);

async function discoverMetadataFiles(roots, options = {}) {
  const extensions = new Set((options.extensions || [...METADATA_EXTENSIONS]).map((item) => item.toLowerCase()));
  const results = [];

  async function visit(candidate) {
    const absolute = path.resolve(candidate);
    const stat = await fsp.lstat(absolute);
    if (stat.isSymbolicLink()) return;
    if (stat.isFile()) {
      if (extensions.has(path.extname(absolute).toLowerCase())) results.push(absolute);
      return;
    }
    if (!stat.isDirectory()) return;
    const entries = await fsp.readdir(absolute, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      await visit(path.join(absolute, entry.name));
    }
  }

  for (const root of [...roots].map((item) => path.resolve(item)).sort()) await visit(root);
  return [...new Set(results)].sort((left, right) => left.localeCompare(right, 'en'));
}

function metadataFormat(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.ndjson' || extension === '.jsonl') return 'ndjson';
  if (extension === '.json') return 'json';
  if (extension === '.csv') return 'csv';
  if (extension === '.tsv') return 'tsv';
  const error = new Error(`Unsupported metadata file extension: ${extension || '(none)'}`);
  error.code = 'UNSUPPORTED_METADATA_FORMAT';
  throw error;
}

function parseDelimitedRow(line, delimiter) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === delimiter) {
      values.push(value);
      value = '';
    } else {
      value += character;
    }
  }
  if (quoted) {
    const error = new Error('Multiline or unterminated quoted fields are not supported; convert to NDJSON');
    error.code = 'UNSUPPORTED_MULTILINE_CSV';
    throw error;
  }
  values.push(value);
  return values;
}

async function* parseDelimitedFile(filePath, delimiter) {
  const input = fs.createReadStream(filePath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let headers = null;
  for await (const line of lines) {
    if (!headers) {
      if (!line.trim()) continue;
      headers = parseDelimitedRow(line.replace(/^\uFEFF/, ''), delimiter);
      continue;
    }
    if (!line.trim()) continue;
    const values = parseDelimitedRow(line, delimiter);
    const record = {};
    for (let index = 0; index < headers.length; index += 1) {
      record[headers[index]] = values[index] ?? '';
    }
    yield record;
  }
}

async function* parseMetadataRecords(filePath, format = metadataFormat(filePath)) {
  if (format === 'ndjson') {
    const input = fs.createReadStream(filePath, { encoding: 'utf8' });
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    let lineNumber = 0;
    for await (const line of lines) {
      lineNumber += 1;
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line.replace(/^\uFEFF/, ''));
      } catch (error) {
        error.message = `${filePath}:${lineNumber}: ${error.message}`;
        throw error;
      }
    }
    return;
  }
  if (format === 'json') {
    const parsed = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    const records = Array.isArray(parsed)
      ? parsed
      : (parsed && typeof parsed === 'object'
        ? (parsed.records || parsed.items || parsed.data || [parsed])
        : [parsed]);
    if (!Array.isArray(records)) throw new TypeError('JSON metadata container must resolve to an array');
    for (const record of records) yield record;
    return;
  }
  if (format === 'csv') {
    yield* parseDelimitedFile(filePath, ',');
    return;
  }
  if (format === 'tsv') {
    yield* parseDelimitedFile(filePath, '\t');
    return;
  }
  throw new Error(`Unsupported metadata format: ${format}`);
}

function valueAt(record, candidate) {
  let value = record;
  for (const part of candidate.split('.')) {
    if (!value || typeof value !== 'object' || !(part in value)) return undefined;
    value = value[part];
  }
  return value;
}

function firstValue(record, candidates) {
  for (const candidate of candidates) {
    const value = valueAt(record, candidate);
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return null;
}

function normalizeMetadataRecord(record, policy) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const metadataJson = stableStringify(record);
  const metadataSha256 = sha256String(metadataJson);
  const artist = firstValue(record, [
    'artist', 'artist_name', 'artistName', 'creator', 'metadata.artist', 'metadata.artist_name',
  ]);
  const title = firstValue(record, [
    'title', 'song_name', 'songName', 'track_name', 'trackName', 'name', 'metadata.title',
  ]);
  const sourceItemId = firstValue(record, [
    'source_item_id', 'item_id', 'id', 'md5', 'midi_md5', 'midi_id', 'track_id',
    'path', 'midi_path', 'midi_filename', 'metadata.id',
  ]) || `metadata-sha256:${metadataSha256}`;
  const rightsEvidence = {};
  for (const key of ['license', 'license_url', 'rights', 'copyright', 'attribution']) {
    const value = firstValue(record, [key, `metadata.${key}`]);
    if (value) rightsEvidence[key] = value;
  }
  const rightsStatus = firstValue(record, ['rights_status']) || policy.default_rights_status;
  return {
    sourceItemId,
    artist,
    title,
    canonicalArtist: normalizeArtist(artist),
    canonicalTitle: normalizeTitle(title),
    recordingMbid: firstValue(record, ['recording_mbid', 'musicbrainz_recording_id', 'mbid']),
    workMbid: firstValue(record, ['work_mbid', 'musicbrainz_work_id']),
    isrc: firstValue(record, ['isrc', 'external_ids.isrc']),
    artifactLocator: firstValue(record, ['artifact_locator', 'midi_path', 'midi_url', 'download_url', 'path']),
    rightsStatus,
    usabilityClass: classifyUsabilityClass({
      sourceId: policy.source_id,
      rightsStatus,
      entity: 'source_item',
    }),
    rightsEvidence: Object.keys(rightsEvidence).length > 0 ? stableStringify(rightsEvidence) : null,
    metadataSha256,
    metadataJson,
  };
}

async function importMetadataFile(db, options) {
  const sourceId = options.sourceId;
  const policy = getSourcePolicy(sourceId);
  const filePath = path.resolve(options.filePath);
  const format = options.format || metadataFormat(filePath);
  const fileHash = await hashFile(filePath);
  const importId = `sha256:${sha256String(`${sourceId}\0${format}\0${fileHash.sha256}`)}`;
  const existing = db.prepare('SELECT row_count, rejected_count FROM metadata_imports WHERE import_id = ?').get(importId);
  if (existing) {
    return {
      import_id: importId,
      source_id: sourceId,
      rows: Number(existing.row_count),
      rejected: Number(existing.rejected_count),
      already_imported: true,
    };
  }

  const insertImport = db.prepare(`
    INSERT INTO metadata_imports (
      import_id, source_id, source_path, source_sha256, source_bytes, format
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const upsertItem = db.prepare(`
    INSERT INTO source_items (
      source_id, source_item_id, artist, title, canonical_artist, canonical_title,
      recording_mbid, work_mbid, isrc, artifact_locator, rights_status,
      usability_class, rights_evidence, metadata_sha256, metadata_json, import_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id, source_item_id) DO UPDATE SET
      artist = excluded.artist,
      title = excluded.title,
      canonical_artist = excluded.canonical_artist,
      canonical_title = excluded.canonical_title,
      recording_mbid = excluded.recording_mbid,
      work_mbid = excluded.work_mbid,
      isrc = excluded.isrc,
      artifact_locator = excluded.artifact_locator,
      rights_status = excluded.rights_status,
      usability_class = excluded.usability_class,
      rights_evidence = excluded.rights_evidence,
      metadata_sha256 = excluded.metadata_sha256,
      metadata_json = excluded.metadata_json,
      import_id = excluded.import_id
  `);

  let rows = 0;
  let rejected = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    insertImport.run(importId, sourceId, filePath, fileHash.sha256, fileHash.bytes, format);
    for await (const rawRecord of parseMetadataRecords(filePath, format)) {
      const record = normalizeMetadataRecord(rawRecord, policy);
      if (!record) {
        rejected += 1;
        continue;
      }
      upsertItem.run(
        sourceId,
        record.sourceItemId,
        record.artist,
        record.title,
        record.canonicalArtist,
        record.canonicalTitle,
        record.recordingMbid,
        record.workMbid,
        record.isrc,
        record.artifactLocator,
        record.rightsStatus,
        record.usabilityClass,
        record.rightsEvidence,
        record.metadataSha256,
        record.metadataJson,
        importId,
      );
      rows += 1;
    }
    db.prepare('UPDATE metadata_imports SET row_count = ?, rejected_count = ? WHERE import_id = ?')
      .run(rows, rejected, importId);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }

  return {
    import_id: importId,
    source_id: sourceId,
    rows,
    rejected,
    already_imported: false,
  };
}

function metadataDiscoveryPlan(sourceId, roots) {
  const policy = getSourcePolicy(sourceId);
  return {
    source_id: sourceId,
    policy_version: policy.policy_version,
    metadata_mode: policy.metadata_mode,
    automation_policy: policy.automation_policy,
    offline_only: true,
    roots: roots.map((item) => path.resolve(item)).sort(),
    supported_extensions: [...METADATA_EXTENSIONS].sort(),
  };
}

module.exports = {
  METADATA_EXTENSIONS,
  discoverMetadataFiles,
  importMetadataFile,
  metadataDiscoveryPlan,
  metadataFormat,
  normalizeMetadataRecord,
  parseDelimitedRow,
  parseMetadataRecords,
};
