import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { catalogSongs } from './source.mjs';
import { buildPopularitySnapshot, exportPopularityWeights, validateProviderImport, POPULARITY_VERSION } from './popularity.mjs';
import { compactArtifact, validatePopularityArtifact } from './popularity-cli.mjs';
import { openDatabase, stableJson, transaction } from './common.mjs';

const versionConflict = /\b(live|remix|remixed|karaoke|instrumental|acoustic|demo|cover|version|edit|re-recorded)\b/i;
const nameKey = text => String(text ?? '').normalize('NFKD').toLowerCase().replace(/[ø]/g,'o').replace(/[ł]/g,'l').replace(/[đð]/g,'d').replace(/ß/g,'ss').replace(/[^a-z0-9]/g,'');
export function chooseCanonical(song, candidates = [], dumpVersion) {
  candidates = candidates.filter(row => nameKey(song.artist) && nameKey(song.title) && nameKey(row.artist_credit_name) === nameKey(song.artist) && nameKey(row.recording_name) === nameKey(song.title));
  const ids = [...new Set(candidates.map(row => row.recording_mbid))];
  const conflict = versionConflict.test(song.title) || candidates.some(row => versionConflict.test(row.recording_name) || /\b(live|karaoke|tribute|ao vivo|en vivo|en direct|in concert|bootleg|mixed by)\b/i.test(row.release_name));
  const confirmed = ids.length === 1 && !conflict;
  return { songId: song.slug, ...(confirmed ? { providerTrackId: ids[0] } : {}), versionKind: confirmed ? 'canonical' : 'unknown',
    match: { status: confirmed ? 'confirmed' : ids.length ? 'ambiguous' : 'unmatched', confidence: confirmed ? .85 : 0,
      reviewed: false, artistMatched: ids.length > 0, titleMatched: ids.length > 0, versionMatched: confirmed,
      method: 'canonical_metadata' },
    identityEvidence: { source: 'MusicBrainz canonical CC0', candidateCount: ids.length, explicitVersionConflict: conflict, dumpVersion,
      recordingScope: 'canonical representative; not verification of the exact recording used by the song section', candidates }, measurements: [] };
}
export async function fetchCounts(ids, { fetchImpl = fetch, wait = sleep } = {}) {
  for(let attempt=0;attempt<5;attempt++) {
    try {
      const response = await fetchImpl('https://api.listenbrainz.org/1/popularity/recording', { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recording_mbids:ids}),signal:AbortSignal.timeout(60000) });
      if(response.status===429 || response.status>=500) { await wait(Math.max(1000*2**attempt,Number(response.headers.get('retry-after'))*1000 || 0)); continue; }
      if(!response.ok) throw Error(`ListenBrainz HTTP ${response.status}`);
      const rows=await response.json();
      if(!Array.isArray(rows) || rows.length !== ids.length || rows.some((r,i)=>r.recording_mbid!==ids[i])) throw Error('Unexpected recording response');
      for(const row of rows) for(const field of ['total_user_count','total_listen_count']) if(row[field]!=null && (!Number.isSafeInteger(row[field]) || row[field]<0)) throw Error('Invalid count');
      return rows;
    } catch(error) { if(attempt===4) throw error; await wait(1000*2**attempt); }
  }
  throw Error('ListenBrainz unavailable; checkpoint retained');
}
export async function acquireListenbrainz({ catalog, candidatesFile, outputDirectory, pilotFile, fetchImpl=fetch }) {
  fs.mkdirSync(outputDirectory,{recursive:true});
  const songs=catalogSongs(catalog), candidates=JSON.parse(fs.readFileSync(candidatesFile,'utf8'));
  const selected=pilotFile ? new Set(JSON.parse(fs.readFileSync(pilotFile,'utf8')).selected.map(s=>s.id)) : null;
  const observations=songs.map(song=>chooseCanonical(song,selected && !selected.has(song.slug) ? [] : candidates.candidates[song.slug],candidates.source));
  const owners=new Map();
  for(const row of observations.filter(o=>o.providerTrackId)) { if(!owners.has(row.providerTrackId)) owners.set(row.providerTrackId,[]); owners.get(row.providerTrackId).push(row); }
  for(const rows of owners.values()) if(rows.length>1) for(const row of rows) { row.match.status='ambiguous'; row.match.confidence=0; delete row.providerTrackId; }
  const checkpoint=path.join(outputDirectory,'counts.json');
  const counts=fs.existsSync(checkpoint) ? JSON.parse(fs.readFileSync(checkpoint,'utf8')) : {};
  const ids=observations.filter(o=>o.match.status==='confirmed').map(o=>o.providerTrackId).filter(id=>!counts[id] || Date.now()-Date.parse(counts[id].observedAt)>30*86400000);
  for(let offset=0;offset<ids.length;offset+=500) {
    const rows=await fetchCounts(ids.slice(offset,offset+500),{fetchImpl}); const observedAt=new Date().toISOString();
    for(const row of rows) counts[row.recording_mbid]={...row,observedAt};
    fs.writeFileSync(checkpoint+'.tmp',stableJson(counts)); fs.renameSync(checkpoint+'.tmp',checkpoint);
    await sleep(1000);
  }
  for(const row of observations) {
    if(row.match.status!=='confirmed') continue;
    const count=counts[row.providerTrackId];
    for(const [field,metric,weight] of [['total_user_count','lifetime-listeners',.8],['total_listen_count','lifetime-listens',.2]]) if(count?.[field]!=null)
      row.measurements.push({metric,category:'enduring',value:count[field],weight,unit:'count',territory:'global',timeWindow:'lifetime',observedAt:count.observedAt});
  }
  const input={schemaVersion:1,provider:'listenbrainz',dataVersion:candidates.source,collectedAt:new Date().toISOString(),
    rights:{allowDerivedRedistribution:true,allowRawStorage:true,basis:'MusicBrainz canonical metadata CC0-1.0; ListenBrainz listen counts CC0-1.0'},observations};
  validateProviderImport(input);
  const snapshot=buildPopularitySnapshot(input,{songIds:songs.map(s=>s.slug)}), weights=exportPopularityWeights(snapshot);
  const prefix=(pilotFile?'pilot':'full')+'-'+snapshot.snapshotId;
  const artifact={version:POPULARITY_VERSION,...snapshot}; validatePopularityArtifact(artifact);
  for(const [name,data] of Object.entries({observations:input,snapshot:artifact,weights:compactArtifact(snapshot)})) fs.writeFileSync(path.join(outputDirectory,`${prefix}-${name}.json`),stableJson(data));
  const overlay=path.join(outputDirectory,`${prefix}-popularity.db`), stage=overlay+`.${Date.now()}.tmp`;
  const db=openDatabase(stage);
  try {
    db.exec('CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE popularity(song_id TEXT PRIMARY KEY,score REAL,confidence REAL,provider_url TEXT,measured_at TEXT)');
    transaction(db,()=>{
      const stmt=db.prepare('INSERT INTO popularity VALUES (?,?,?,?,?)'), bySong=new Map(observations.map(o=>[o.songId,o]));
      for(const row of weights.songs) { const o=bySong.get(row.songId); stmt.run(row.songId,row.score,row.confidence,o.providerTrackId ? `https://musicbrainz.org/recording/${o.providerTrackId}` : null,o.measurements[0]?.observedAt ?? null); }
      const meta=db.prepare('INSERT INTO metadata VALUES (?,?)');
      for(const [key,value] of Object.entries({snapshotId:weights.snapshotId,provider:'ListenBrainz',attribution:'MusicBrainz + ListenBrainz (CC0)',matched:weights.songs.filter(s=>s.score!=null).length,total:songs.length,collectedAt:input.collectedAt})) meta.run(key,String(value));
    });
  } finally {db.close();}
  fs.renameSync(stage,overlay);
  return {overlay,snapshotId:weights.snapshotId,scored:weights.songs.filter(s=>s.score!=null).length,confirmed:observations.filter(s=>s.match.status==='confirmed').length,ambiguous:observations.filter(s=>s.match.status==='ambiguous').length,total:songs.length};
}
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  const [catalog,candidatesFile,outputDirectory,pilotFile]=process.argv.slice(2);
  if(!outputDirectory) throw Error('Usage: listenbrainz.mjs <catalog.db> <candidates.json> <output-dir> [pilot.json]');
  console.log(JSON.stringify(await acquireListenbrainz({catalog,candidatesFile,outputDirectory,pilotFile})));
}
