/**
 * Write .hooktheory_cache/ from harvested scrape.json (no browser/network).
 */

const fs = require('fs').promises;
const path = require('path');
const CacheManager = require('../../../lib/cache/cacheManager');
const { extractArtistAndSongFromUrl } = require('../../../lib/parser/urlParser');
const { markSongFromCache } = require('./cacheSync');
const { nowIso } = require('./db');

function songTitleFromHarvest(scrape) {
  for (const sec of scrape.sections || []) {
    if (sec.json?.songInfo) return sec.json.songInfo;
  }
  return scrape.title?.split(' Chords')[0]?.trim() || null;
}

async function writeSectionFile(songDir, sectionName, numericId, stringSongId, sectionData) {
  const cachePath = CacheManager.getSectionCachePath(songDir, sectionName, numericId, stringSongId);
  const sectionToSave = {
    ...sectionData,
    stringSongId,
    numericId,
    sectionName,
    cachedAt: new Date().toISOString(),
  };
  await fs.writeFile(cachePath, JSON.stringify(sectionToSave, null, 2));
  return cachePath;
}

async function writeProcessedCacheFromHarvest(harvest) {
  const { scrape } = harvest;
  const url = scrape.url;
  const songTitle = songTitleFromHarvest(scrape);
  if (!songTitle) throw new Error('could not determine song title from harvest');

  const { artist } = extractArtistAndSongFromUrl(url);
  const songDir = CacheManager.getSongCacheDir(artist, songTitle);
  await fs.mkdir(songDir, { recursive: true });

  const sectionsData = {};
  const songIds = [];
  const sectionMapping = {};
  const sectionMeta = [];

  await Promise.all((scrape.sections || []).map(async (sec, index) => {
    if (!sec.json || !sec.songId) return;
    const numericId = sec.json.songId;
    const stringSongId = sec.songId;
    const sectionData = {
      songId: stringSongId,
      numericId,
      sectionName: sec.name,
      songInfo: sec.json.songInfo,
      chords: sec.json.chords || [],
      notes: sec.json.notes ?? null,
      metadata: { ...sec.json.metadata, numericId },
    };
    sectionsData[stringSongId] = sectionData;
    songIds.push(stringSongId);
    sectionMapping[stringSongId] = sec.name;
    sectionMeta.push({ index, songId: stringSongId, sectionName: sec.name, numericId });
    await writeSectionFile(songDir, sec.name, numericId, stringSongId, sectionData);
  }));

  if (!Object.keys(sectionsData).length) {
    throw new Error('harvest has no section json for processed cache');
  }

  const metadataPath = path.join(songDir, '_metadata.json');
  await fs.writeFile(metadataPath, JSON.stringify({
    url,
    songTitle,
    artist,
    timestamp: new Date().toISOString(),
    songIds,
    sectionMapping,
    sections: sectionMeta,
  }, null, 2));

  const cacheDirName = path.basename(songDir);
  return { url, songTitle, cacheDirName, songDir, sectionsData };
}

function commitProcessed(db, slug, procResult) {
  markSongFromCache(db, procResult.url, procResult.cacheDirName, nowIso());
}

module.exports = { writeProcessedCacheFromHarvest, commitProcessed, songTitleFromHarvest };
