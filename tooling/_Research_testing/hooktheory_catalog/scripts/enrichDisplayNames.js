#!/usr/bin/env node
// Recover display metadata without altering catalog identities or source artifacts.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const Database = require('better-sqlite3');
const { slugify, hooktheorySlug, slugForUrl, buildTheoryTabUrl, parseTheoryTabUrl } = require('../lib/catalogUtils');
const { normalizeDisplayText, fallbackDisplayName } = require('../lib/catalogDisplayNames');
const { alphabeticalGroup: alphaGroup } = require('../lib/androidCatalogSections');

const SEARCH_URL = 'https://search.hooktheory.com/indexes/theorytabs/search';
const PAGE_SIZE = 1000;
const PAGE_SUFFIX = / Chords, Melody, and Music Theory Analysis\s*[-–—]\s*Hooktheory\s*$/i;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const urlKey = value => String(value || '').replace(/\/+$/, '');
const nameKeys = value => [...new Set([slugify(value), slugify(hooktheorySlug(value))])].filter(Boolean);

function parsePageTitle(rawTitle, song) {
  if (!rawTitle || !PAGE_SUFFIX.test(rawTitle)) return null;
  const title = normalizeDisplayText(rawTitle.replace(PAGE_SUFFIX, ''));
  const expectedTitles = new Set([song.title_slug, song.sourceTitle, song.title].filter(Boolean).flatMap(nameKeys));
  const candidates = [];
  for (const match of title.matchAll(/ by /g)) {
    const songTitle = title.slice(0, match.index);
    const artist = title.slice(match.index + 4);
    if (songTitle && artist && nameKeys(artist).includes(song.artist_slug) && nameKeys(songTitle).some(key => expectedTitles.has(key))) {
      candidates.push({ title: songTitle, artist });
    }
  }
  return candidates.length === 1 ? candidates[0] : null;
}

function parseHeaderText(header) {
  const field = name => {
    const match = header.match(new RegExp('"' + name + '"\\s*:\\s*("(?:\\\\.|[^"\\\\])*"|null)'));
    return match ? JSON.parse(match[1]) : null;
  };
  return { title: field('title'), url: field('url') };
}

function readPageHeader(file) {
  // The source writer emits url/title before large musical payloads. Never load
  // those payloads merely to recover names; missing headers remain reportable.
  const descriptor = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(16384);
    const length = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    return parseHeaderText(buffer.toString('utf8', 0, length));
  } finally { fs.closeSync(descriptor); }
}

async function savedHeaders(options, rows) {
  const file = path.join(options.outputDir, 'saved-headers.json');
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  let snapshot = { fingerprint, headers: {} };
  if (options.resume && fs.existsSync(file)) {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (cached.fingerprint === fingerprint) snapshot = cached;
  }
  let cursor = 0;
  let completed = 0;
  await Promise.all(Array.from({ length: 16 }, async () => {
    while (cursor < rows.length) {
      const song = rows[cursor++];
      if (!Object.hasOwn(snapshot.headers, song.slug)) {
        const headers = [];
        for (const folder of new Set([song.slug, slugForUrl(song.url)])) {
          const candidate = path.resolve(options.harvestRoot, folder, 'scrape.json');
          if (!candidate.startsWith(path.resolve(options.harvestRoot) + path.sep)) throw new Error('Harvest path escapes its source directory');
          let handle;
          try {
            handle = await fs.promises.open(candidate, 'r');
            const buffer = Buffer.alloc(16384);
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
            headers.push({ ...parseHeaderText(buffer.toString('utf8', 0, bytesRead)), file: candidate });
          } catch (error) {
            if (error.code !== 'ENOENT') headers.push({ error: error.message, file: candidate });
          } finally { if (handle) await handle.close(); }
        }
        snapshot.headers[song.slug] = headers;
      }
      if (++completed % 5000 === 0) {
        atomicJSON(file, snapshot);
        console.log(`Inspected ${completed}/${rows.length} saved metadata headers`);
      }
    }
  }));
  atomicJSON(file, snapshot);
  return snapshot.headers;
}

function addCandidate(index, key, value, source, priority) {
  value = normalizeDisplayText(value);
  if (!value || !key) return;
  const candidates = index.get(key) || [];
  if (!candidates.some(candidate => candidate.value === value && candidate.source === source)) {
    candidates.push({ value, source, priority });
    index.set(key, candidates);
  }
}

function chooseCandidate(candidates, fallback) {
  if (!candidates?.length) return { value: fallbackDisplayName(fallback), source: 'fallback', conflicts: [] };
  const ordered = [...candidates].sort((a, b) => b.priority - a.priority || a.source.localeCompare(b.source) || a.value.localeCompare(b.value));
  const best = ordered[0];
  const tiedValues = new Set(ordered.filter(c => c.priority === best.priority).map(c => c.value));
  // Equivalent-rank conflicting identities are unresolved; never pick arbitrarily.
  if (tiedValues.size > 1) return { value: fallbackDisplayName(fallback), source: 'conflict', conflicts: ordered };
  return { ...best, conflicts: ordered.filter(c => c.value !== best.value) };
}

function atomicJSON(file, value) {
  const temporary = file + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temporary, file);
}

async function recoverSearchPages(options, consume) {
  const cache = path.join(options.outputDir, 'search-pages');
  fs.mkdirSync(cache, { recursive: true });
  let offset = 0;
  let pages = 0;
  let auth;
  const signatures = new Set();
  while (true) {
    if (pages >= 1000) return { complete: false, status: 'page-limit', pages, nextOffset: offset };
    const file = path.join(cache, `page-${String(offset).padStart(7, '0')}.json`);
    let page;
    if (fs.existsSync(file)) {
      page = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (page.offset !== offset || (page.responseOffset != null && page.responseOffset !== offset) || !Array.isArray(page.hits)) throw new Error(`Invalid search checkpoint ${file}`);
    } else {
      if (options.offline) return { complete: false, status: 'offline', pages, nextOffset: offset };
      if (!options.authCache) return { complete: false, status: 'auth-unavailable', pages, nextOffset: offset };
      if (!auth) auth = JSON.parse(fs.readFileSync(options.authCache, 'utf8')).auth;
      if (!auth) return { complete: false, status: 'auth-unavailable', pages, nextOffset: offset };
      let failure;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(SEARCH_URL, {
            method: 'POST',
            headers: { authorization: auth, 'content-type': 'application/json', referer: 'https://www.hooktheory.com/' },
            body: JSON.stringify({ q: '', limit: PAGE_SIZE, offset, attributesToRetrieve: ['artist', 'song', 'id'] }),
            signal: AbortSignal.timeout(30000),
          });
          if (!response.ok) {
            const error = new Error(`Search HTTP ${response.status}`);
            error.retryable = response.status === 429 || response.status >= 500;
            const retryAfter = response.headers.get('retry-after');
            error.retryAfter = retryAfter && Number.isFinite(Number(retryAfter)) ? Number(retryAfter) * 1000
              : retryAfter && Number.isFinite(Date.parse(retryAfter)) ? Math.max(0, Date.parse(retryAfter) - Date.now()) : 30000;
            if (error.retryAfter > 60000) error.retryable = false; // Checkpoint instead of retrying earlier than requested.
            throw error;
          }
          const body = await response.json();
          if (!Array.isArray(body.hits)) throw new Error('Search response omitted hits');
          if (body.offset != null && body.offset !== offset) {
            const error = new Error('Search returned a different page offset'); error.retryable = false; throw error;
          }
          page = { offset, responseOffset: body.offset, responseLimit: body.limit,
            total: body.nbHits ?? body.estimatedTotalHits ?? body.totalHits,
            fetchedAt: new Date().toISOString(), hits: body.hits.map(({ artist, song, id }) => ({ artist, song, id })) };
          atomicJSON(file, page);
          failure = null;
          break;
        } catch (error) {
          failure = error;
          if (error.retryable === false || /HTTP (401|403|404)/.test(error.message)) break;
          if (attempt < 2) await sleep(error.retryAfter || 1000 * 2 ** attempt);
        }
      }
      if (failure) return { complete: false, status: 'fetch-failed', error: failure.message, pages, nextOffset: offset,
        ...(failure.retryAfter ? { retryAfterMilliseconds: failure.retryAfter } : {}) };
      // One sequential request every two seconds; no concurrent page crawling.
      await sleep(2000);
    }
    const signature = crypto.createHash('sha256').update(JSON.stringify(page.hits)).digest('hex');
    if (signatures.has(signature)) return { complete: false, status: 'repeated-page', pages, nextOffset: offset };
    signatures.add(signature);
    consume(page.hits, page.fetchedAt);
    pages++;
    if (pages % 20 === 0) console.log(`Recovered ${offset + page.hits.length} search records (${pages} cached pages)`);
    if (page.hits.length < PAGE_SIZE) {
      const records = offset + page.hits.length;
      const complete = page.total == null || records >= page.total;
      return { complete, status: complete ? 'complete' : 'pagination-incomplete', pages, records, reportedTotal: page.total };
    }
    offset += page.hits.length;
  }
}

function invariantDigest(db) {
  const hash = crypto.createHash('sha256');
  for (const row of db.prepare('SELECT slug,url,status,dataBlob FROM songs ORDER BY slug').iterate()) {
    hash.update(JSON.stringify([row.slug, row.url, row.status]));
    hash.update(row.dataBlob ?? '<null>');
  }
  for (const row of db.prepare('SELECT slug,complexityRating,complexityBucket FROM song_browse_entries ORDER BY slug').iterate()) hash.update(JSON.stringify(row));
  for (const row of db.prepare('SELECT slug,mode FROM song_browse_modes ORDER BY slug,mode').iterate()) hash.update(JSON.stringify(row));
  return hash.digest('hex');
}

async function stageCatalog(options, songs) {
  const destination = path.join(options.outputDir, 'catalog.db');
  if ([options.sourceDb, options.catalog].some(file => path.resolve(file).toLowerCase() === destination.toLowerCase())) {
    throw new Error('Output must not overwrite an input database');
  }
  if (fs.existsSync(destination) && !options.resume) throw new Error('Output exists; use --resume within the same staging directory');
  const source = new Database(options.catalog, { readonly: true, fileMustExist: true });
  const temporary = destination + `.building-${process.pid}`;
  let baseline;
  try {
    if (source.pragma('user_version', { simple: true }) !== 3) throw new Error('Expected catalog schema version 3');
    baseline = invariantDigest(source);
    await source.backup(temporary);
  } finally { source.close(); }
  const staged = new Database(temporary);
  let changed = 0;
  let exported = 0;
  try {
    const rows = staged.prepare('SELECT slug,artist,title FROM songs').all();
    const songUpdate = staged.prepare('UPDATE songs SET artist=?,title=? WHERE slug=?');
    const browseUpdate = staged.prepare('UPDATE song_browse_entries SET artist=?,title=?,alphaGroup=? WHERE slug=?');
    staged.transaction(() => {
      for (const row of rows) {
        const names = songs[row.slug];
        if (!names) throw new Error(`Exported song absent from enrichment source: ${row.slug}`);
        if (row.artist !== names.artist || row.title !== names.title) changed++;
        songUpdate.run(names.artist, names.title, row.slug);
        browseUpdate.run(names.artist, names.title, alphaGroup(names.title), row.slug);
        exported++;
      }
    })();
    if (staged.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Staged database failed quick_check');
    if (invariantDigest(staged) !== baseline) throw new Error('Identity, URL, payload, rating, or mode changed');
    const mismatches = staged.prepare('SELECT COUNT(*) AS n FROM song_browse_entries b JOIN songs s ON s.slug=b.slug WHERE b.artist IS NOT s.artist OR b.title IS NOT s.title').get().n;
    if (mismatches) throw new Error('Song/browse names differ');
  } finally { staged.close(); }
  fs.renameSync(temporary, destination);
  const archive = destination + '.gz';
  fs.writeFileSync(archive + '.tmp', zlib.gzipSync(fs.readFileSync(destination), { level: 9 }));
  fs.renameSync(archive + '.tmp', archive);
  return { exported, changed, schemaVersion: 3, preservedDataSHA256: baseline, database: destination, archive };
}

async function enrich(options) {
  fs.mkdirSync(options.outputDir, { recursive: true });
  const checkpoint = path.join(options.outputDir, 'inputs.json');
  const inputs = { sourceDb: path.resolve(options.sourceDb), catalog: path.resolve(options.catalog), harvestRoot: path.resolve(options.harvestRoot) };
  if (fs.existsSync(checkpoint)) {
    if (!options.resume) throw new Error('Staging directory already initialized; use --resume');
    if (JSON.stringify(JSON.parse(fs.readFileSync(checkpoint))) !== JSON.stringify(inputs)) throw new Error('Resume inputs do not match staging checkpoint');
  } else atomicJSON(checkpoint, inputs);

  const db = new Database(options.sourceDb, { readonly: true, fileMustExist: true });
  let rows;
  try {
    rows = db.prepare('SELECT s.slug,s.artist_slug,s.title_slug,s.artist,s.title,s.url,d.hooktheory_song_name AS sourceTitle FROM songs s LEFT JOIN song_details d ON d.slug=s.slug ORDER BY s.slug').all();
  } finally { db.close(); }
  // Older distributed catalogs can contain songs absent from today's discovery
  // database. Recover their labels too; never remove existing installed songs.
  const sourceSongCount = rows.length;
  const sourceIDs = new Set(rows.map(song => song.slug));
  const exported = new Database(options.catalog, { readonly: true, fileMustExist: true });
  try {
    for (const song of exported.prepare('SELECT slug,artist,title,url FROM songs').iterate()) {
      if (sourceIDs.has(song.slug)) continue;
      const divider = song.slug.indexOf('__');
      rows.push({ ...song, artist_slug: divider >= 0 ? song.slug.slice(0, divider) : slugify(song.artist),
        title_slug: divider >= 0 ? song.slug.slice(divider + 2) : slugify(song.title),
        sourceTitle: normalizeDisplayText(song.title), sourceTitleOrigin: 'catalog:existing-export-title' });
    }
  } finally { exported.close(); }
  rows.sort((a, b) => a.slug.localeCompare(b.slug));
  const titleCandidates = new Map();
  const artistCandidates = new Map();
  const knownSlugs = new Map(rows.map(song => [song.slug, song]));
  const knownArtists = new Set(rows.map(song => song.artist_slug));
  const byURL = new Map();
  for (const song of rows) {
    const key = urlKey(song.url);
    byURL.set(key, [...(byURL.get(key) || []), song]);
  }
  const sourceErrors = [];
  let pageNames = 0;
  const headersBySlug = await savedHeaders(options, rows);
  for (const song of rows) {
    if (song.sourceTitle) addCandidate(titleCandidates, song.slug, song.sourceTitle, song.sourceTitleOrigin || 'catalog:public-section-title', song.sourceTitleOrigin ? 20 : 50);
    for (const header of headersBySlug[song.slug]) {
      if (header.error) { sourceErrors.push({ slug: song.slug, source: header.file, error: header.error }); continue; }
      if (urlKey(header.url) !== urlKey(song.url)) continue;
      const names = parsePageTitle(header.title, song);
      if (names) {
        addCandidate(titleCandidates, song.slug, names.title, `page:${song.url}`, 70);
        addCandidate(artistCandidates, song.artist_slug, names.artist, `page:${song.url}`, 70);
        pageNames++;
      }
    }
  }
  console.log(`Read ${rows.length} source songs; recovered ${pageNames} cached page headings and ${artistCandidates.size} artist identities`);
  const network = await recoverSearchPages(options, hits => {
    for (const hit of hits) {
      if (typeof hit.artist !== 'string' || typeof hit.song !== 'string') continue;
      // A search index row ID is not a public section ID. Match the established
      // catalog key and reject collisions, rather than treating IDs as song IDs.
      const artistKeys = nameKeys(hit.artist);
      const source = `search:${SEARCH_URL}#${hit.id}`;
      for (const key of artistKeys) if (knownArtists.has(key)) addCandidate(artistCandidates, key, hit.artist, source, 60);
      let matches = byURL.get(urlKey(buildTheoryTabUrl(hit.artist, hit.song))) || [];
      if (!matches.length) {
        const candidateKeys = new Set(artistKeys.flatMap(artist => nameKeys(hit.song).map(title => `${artist}__${title}`)));
        matches = [...candidateKeys].map(key => knownSlugs.get(key)).filter(song => song && candidateKeys.has(parseTheoryTabUrl(song.url)?.slug));
      }
      if (matches.length === 1) addCandidate(titleCandidates, matches[0].slug, hit.song, source, 60);
    }
  });
  if (options.corrections) {
    const corrections = JSON.parse(fs.readFileSync(options.corrections, 'utf8'));
    for (const [slug, correction] of Object.entries(corrections.songs || {})) {
      const song = knownSlugs.get(slug);
      if (!song || !/^https:\/\//.test(correction.source || '')) throw new Error(`Correction needs a known slug and source URL: ${slug}`);
      if (correction.title) addCandidate(titleCandidates, slug, correction.title, correction.source, 100);
      if (correction.artist) addCandidate(artistCandidates, song.artist_slug, correction.artist, correction.source, 100);
    }
  }
  const songs = {};
  const unresolved = [];
  const conflicts = [];
  const counts = { songs: rows.length, discoverySongs: sourceSongCount, existingExportOnlySongs: rows.length - sourceSongCount,
    titlesRecovered: 0, artistsRecovered: 0, bothRecovered: 0, fallbackTitles: 0, fallbackArtists: 0 };
  for (const song of rows) {
    const title = chooseCandidate(titleCandidates.get(song.slug), song.title || song.title_slug);
    const artist = chooseCandidate(artistCandidates.get(song.artist_slug), song.artist || song.artist_slug);
    const titleExact = !['fallback', 'conflict'].includes(title.source);
    const artistExact = !['fallback', 'conflict'].includes(artist.source);
    counts[titleExact ? 'titlesRecovered' : 'fallbackTitles']++;
    counts[artistExact ? 'artistsRecovered' : 'fallbackArtists']++;
    if (titleExact && artistExact) counts.bothRecovered++;
    songs[song.slug] = { title: title.value || 'Unknown Title', artist: artist.value || 'Unknown Artist', titleSource: title.source, artistSource: artist.source };
    if (!titleExact || !artistExact) unresolved.push({ slug: song.slug, title: songs[song.slug].title, artist: songs[song.slug].artist, fields: [...(!titleExact ? ['title'] : []), ...(!artistExact ? ['artist'] : [])], reason: title.source === 'conflict' || artist.source === 'conflict' ? 'conflicting-source-names' : network.complete ? 'source-name-unavailable' : 'recovery-incomplete' });
    if (title.conflicts.length || artist.conflicts.length) conflicts.push({ slug: song.slug, title: title.conflicts, artist: artist.conflicts });
  }
  const document = { version: 1, generatedAt: new Date().toISOString(), inputs, songs };
  atomicJSON(path.join(options.outputDir, 'names.json'), document);
  const staged = await stageCatalog(options, songs);
  const report = { generatedAt: document.generatedAt, counts, network, sourceErrors, staged, unresolved, conflicts };
  atomicJSON(path.join(options.outputDir, 'report.json'), report);
  fs.writeFileSync(path.join(options.outputDir, 'README.md'), `# Catalog display-name enrichment\n\n${counts.songs} source songs assessed; ${counts.bothRecovered} have source-backed titles and artists.\n${unresolved.length} songs retain one or more unresolved fields. See report.json for provenance conflicts and remaining gaps; names.json records chosen values and sources.\n\nSearch recovery: ${network.status}. ${sourceErrors.length} local source errors.\nStaged ${staged.exported} existing playable songs; ${staged.changed} labels changed. Song identities, URLs, status, musical payloads, ratings, and modes match the input digest ${staged.preservedDataSHA256}. Schema remains version 3.\n\nNothing was published. Originals were opened read-only. This directory contains the staged catalog.db and catalog.db.gz for review.\n`);
  console.log(JSON.stringify({ counts, unresolved: unresolved.length, conflicts: conflicts.length, network, sourceErrors: sourceErrors.length, staged }, null, 2));
  return report;
}

function parseArguments(args) {
  const options = {};
  const flags = { '--source-db': 'sourceDb', '--catalog': 'catalog', '--harvest-root': 'harvestRoot', '--output-dir': 'outputDir', '--auth-cache': 'authCache', '--corrections': 'corrections' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--resume') options.resume = true;
    else if (args[i] === '--offline') options.offline = true;
    else if (flags[args[i]] && args[i + 1] && !args[i + 1].startsWith('--')) options[flags[args[i]]] = path.resolve(args[++i]);
    else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  for (const name of ['sourceDb', 'catalog', 'harvestRoot', 'outputDir']) if (!options[name]) throw new Error(`Missing ${name}. Usage: node enrichDisplayNames.js --source-db <source.db> --catalog <catalog.db> --harvest-root <harvest> --output-dir <staging> [--auth-cache <existing-cache>] [--offline] [--resume] [--corrections <json>]`);
  return options;
}

if (require.main === module) enrich(parseArguments(process.argv.slice(2))).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { enrich, parsePageTitle, chooseCandidate, readPageHeader, invariantDigest, alphaGroup, parseArguments, recoverSearchPages, nameKeys };
