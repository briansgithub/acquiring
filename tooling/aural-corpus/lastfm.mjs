import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { catalogSongs } from './source.mjs';
import { createPopularityPilot } from './popularity.mjs';
import { hash, openDatabase, stableJson, transaction } from './common.mjs';

export const LASTFM_VERSION = 'lastfm-listeners80-plays20-v1';
const identity = text => String(text ?? '').normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
const count = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
export function matchLastfm(song, data, at) {
  const track = data?.track;
  const common = { songId: song.id ?? song.slug, measuredAt: at, status: 'unmatched', confidence: 0 };
  if (!track) return common;
  const title = track.name, artist = typeof track.artist === 'string' ? track.artist : track.artist?.name;
  // No stripping qualifiers, cover performers, punctuation, or version labels.
  if (identity(song.title) !== identity(title) || identity(song.artist) !== identity(artist))
    return { ...common, status: 'ambiguous', returnedTitle: title, returnedArtist: artist };
  const listeners = count(track.listeners), plays = count(track.playcount);
  if (listeners == null || plays == null || !/^https?:\/\/(www\.)?last\.fm\//.test(track.url ?? '')) return { ...common, status: 'invalid' };
  return { ...common, status: 'matched', confidence: .9, listeners, plays, providerUrl: track.url, mbid: track.mbid || null,
    method: 'exact-artist-title-with-version-qualifiers', returnedTitle: title, returnedArtist: artist };
}
function ranks(rows, field) {
  const ordered = [...rows].sort((a, b) => a[field] - b[field] || a.songId.localeCompare(b.songId)), map = new Map();
  for (let i = 0; i < ordered.length;) {
    let j = i + 1; while (j < ordered.length && ordered[j][field] === ordered[i][field]) j++;
    const percentile = ordered.length === 1 ? .5 : (i + j - 1) / 2 / (ordered.length - 1);
    for (let k = i; k < j; k++) map.set(ordered[k].songId, percentile); i = j;
  }
  return map;
}
export function scoreLastfm(observations, songIds) {
  const bySong = new Map(observations.map(row => [row.songId, row]));
  const eligible = [...bySong.values()].filter(row => row.status === 'matched' && songIds.includes(row.songId));
  const listeners = ranks(eligible, 'listeners'), plays = ranks(eligible, 'plays');
  const songs = [...new Set(songIds)].sort().map(songId => {
    const row = bySong.get(songId), known = listeners.has(songId);
    return { songId, score: known ? .8 * listeners.get(songId) + .2 * plays.get(songId) : null,
      confidence: known ? row.confidence : 0, providerUrl: known ? row.providerUrl : null, measuredAt: row?.measuredAt ?? null, status: row?.status ?? 'unqueried' };
  });
  const result = { schemaVersion: 1, scoringVersion: LASTFM_VERSION, provider: 'Last.fm', useProfile: 'personal-noncommercial',
    attribution: 'Popularity data from Last.fm', terms: 'https://www.last.fm/api/tos', componentWeights: { cumulativeListeners: .8, cumulativePlays: .2 },
    matched: eligible.length, total: songs.length, songs };
  return { ...result, snapshotId: hash(result) };
}
export async function fetchLastfm(song, { apiKey, fetchImpl = fetch, wait = sleep, now = () => new Date().toISOString(), maxAttempts = 5 } = {}) {
  if (!apiKey) throw Error('Set LASTFM_API_KEY locally; do not put the key in command arguments.');
  const url = new URL('https://ws.audioscrobbler.com/2.0/');
  for (const [key, value] of Object.entries({ method: 'track.getInfo', artist: song.artist, track: song.title, autocorrect: '0', format: 'json', api_key: apiKey })) url.searchParams.set(key, value);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let response, data;
    try { response = await fetchImpl(url, { signal: AbortSignal.timeout(30000) }); data = await response.json(); }
    catch { if (attempt + 1 === maxAttempts) throw Error('Last.fm request failed after retries; checkpoint retained.'); await wait(1000 * 2 ** attempt); continue; }
    if ([10, 26].includes(data.error)) throw Error('Last.fm API key rejected; checkpoint retained.');
    if (response.status === 429 || response.status >= 500 || [11, 16, 29].includes(data.error)) {
      if (attempt + 1 === maxAttempts) throw Error('Last.fm temporarily unavailable; checkpoint retained.');
      await wait(Math.max(Number(response.headers.get('retry-after')) * 1000 || 0, 1000 * 2 ** attempt)); continue;
    }
    if (!response.ok || data.error && data.error !== 6) throw Error('Last.fm returned an unexpected response; checkpoint retained.');
    const row = matchLastfm(song, data, now());
    const cache = response.headers.get('cache-control') ?? '';
    if (/no-store/i.test(cache)) return { songId: row.songId, status: 'storage-disallowed', confidence: 0, measuredAt: row.measuredAt };
    const maxAge = cache.match(/max-age=(\d+)/i)?.[1];
    const ttl = /no-cache/i.test(cache) ? 0 : maxAge == null ? 30 * 86400000 : Number(maxAge) * 1000;
    return { ...row, cacheControl: cache, refreshAfter: new Date(Date.parse(row.measuredAt) + ttl).toISOString() };
  }
}
export async function acquireLastfm({ catalog, checkpoint, output, pilot = false, apiKey = process.env.LASTFM_API_KEY ?? process.env.LAST_FM_API_KEY, fetchImpl = fetch, wait = sleep, log = () => {} }) {
  if (!apiKey) throw Error('LASTFM_API_KEY is not configured.');
  const all = catalogSongs(catalog).map(s => ({ ...s, id: s.slug }));
  const songs = pilot ? createPopularityPilot(all, { limit: 500 }).selected : all;
  fs.mkdirSync(path.dirname(checkpoint), { recursive: true });
  const db = openDatabase(checkpoint);
  try {
    db.exec('CREATE TABLE IF NOT EXISTS observation(song_id TEXT PRIMARY KEY,identity TEXT NOT NULL,payload TEXT NOT NULL)');
    const get = db.prepare('SELECT identity,payload FROM observation WHERE song_id=?'), put = db.prepare('INSERT OR REPLACE INTO observation VALUES (?,?,?)');
    let queried = 0;
    for (const song of songs) {
      const signature = hash([song.artist, song.title]), old = get.get(song.id);
      if (old && old.identity === signature && Date.parse(JSON.parse(old.payload).refreshAfter) > Date.now()) continue;
      const row = await fetchLastfm(song, { apiKey, fetchImpl, wait }); put.run(song.id, signature, stableJson(row));
      if (fs.statSync(checkpoint).size > 80 * 1024 * 1024) throw Error('Popularity storage budget reached; checkpoint retained.');
      if (++queried % 50 === 0) log({ queried, target: songs.length });
      await wait(1000);
    }
    const observations = db.prepare('SELECT payload FROM observation ORDER BY song_id').all().map(row => JSON.parse(row.payload));
    const result = scoreLastfm(observations, all.map(s => s.id));
    fs.writeFileSync(output + '.tmp', stableJson(result)); fs.renameSync(output + '.tmp', output);
    return { queried, matched: result.matched, total: result.total, snapshotId: result.snapshotId };
  } finally { db.close(); }
}
/** Publish a separately replaceable, compact popularity overlay, not a corpus rebuild. */
export function exportLastfmOverlay(input, output) {
  const result = JSON.parse(fs.readFileSync(input, 'utf8'));
  if (result.scoringVersion !== LASTFM_VERSION || result.useProfile !== 'personal-noncommercial') throw Error('Unsupported popularity profile');
  const stage = output + '.tmp'; if (fs.existsSync(stage)) throw Error('Previous overlay stage exists; inspect it first.');
  const db = openDatabase(stage);
  try {
    db.exec('CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE popularity(song_id TEXT PRIMARY KEY,score REAL,confidence REAL,provider_url TEXT,measured_at TEXT)');
    transaction(db, () => {
      const insert = db.prepare('INSERT INTO popularity VALUES (?,?,?,?,?)');
      for (const row of result.songs) insert.run(row.songId, row.score, row.confidence, row.providerUrl, row.measuredAt);
      const meta = db.prepare('INSERT INTO metadata VALUES (?,?)');
      for (const key of ['snapshotId','scoringVersion','useProfile','attribution','terms','matched','total']) meta.run(key, String(result[key]));
    });
  } finally { db.close(); }
  fs.renameSync(stage, output);
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [command, catalog, checkpoint, output] = process.argv.slice(2);
  if (command === 'overlay') exportLastfmOverlay(catalog, checkpoint);
  else if (['pilot','acquire'].includes(command) && output) console.log(await acquireLastfm({ catalog, checkpoint, output, pilot: command === 'pilot', log: value => console.log(JSON.stringify(value)) }));
  else throw Error('Usage: lastfm.mjs pilot|acquire <catalog.db> <checkpoint.db> <weights.json>; or overlay <weights.json> <overlay.db>');
}
