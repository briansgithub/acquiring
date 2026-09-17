import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export const NORMALIZER_VERSION = 'aural-normalizer-1';
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])]));
  return value;
}
export const stableJson = value => JSON.stringify(canonical(value));
export const hash = value => createHash('sha256').update(typeof value === 'string' || ArrayBuffer.isView(value) ? value : stableJson(value)).digest('hex');
export function hashFile(file) {
  const fd = fs.openSync(file, 'r'), buffer = Buffer.allocUnsafe(1024 * 1024), digest = createHash('sha256');
  try { let count; while ((count = fs.readSync(fd, buffer)) > 0) digest.update(buffer.subarray(0, count)); return digest.digest('hex'); }
  finally { fs.closeSync(fd); }
}
export function openDatabase(file, readOnly = false) { return new DatabaseSync(file, { readOnly }); }
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
