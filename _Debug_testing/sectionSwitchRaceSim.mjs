import fs from "fs";
import path from "path";

const LOG = path.resolve("debug-db5cc4.log");
const CACHE = path.resolve("sacred_ring_data/playback/.hooktheory_cache");

function log(location, message, data, hypothesisId) {
  fs.appendFileSync(
    LOG,
    JSON.stringify({
      sessionId: "db5cc4",
      location,
      message,
      data,
      timestamp: Date.now(),
      hypothesisId,
      runId: "sim-race",
    }) + "\n"
  );
}

async function loadLibraryEntry(artistName) {
  const artistPath = path.join(CACHE, artistName);
  const files = await fs.promises.readdir(artistPath);
  let metadata = null;
  const metadataPath = path.join(artistPath, "_metadata.json");
  if (fs.existsSync(metadataPath)) {
    metadata = JSON.parse(await fs.promises.readFile(metadataPath, "utf8"));
  }
  const sectionJsonFiles = files.filter((f) => f.endsWith(".json") && f !== "_metadata.json");

  function sectionEntryFromFile(file) {
    const parts = file.split(" - ");
    const sectionName = parts[0] || "Unknown";
    const numericId = parts[1] ? parseInt(parts[1], 10) : 0;
    const songId = parts.length >= 3 ? parts[2].replace(".json", "") : null;
    const relPath = path.join(artistName, file).split(path.sep).join("/");
    return { sectionName, file, relPath, numericId, songId };
  }

  function findFileForMeta(meta) {
    const byId = sectionJsonFiles.filter((f) => f.endsWith(` - ${meta.songId}.json`));
    if (!byId.length) return null;
    if (meta.sectionName) {
      const want = meta.sectionName.toLowerCase();
      const named = byId.find((f) => f.split(" - ")[0].toLowerCase() === want);
      if (named) return named;
    }
    return byId[0];
  }

  let sections;
  if (metadata?.sections?.length) {
    const seenSongIds = new Set();
    sections = [];
    const sortedMeta = [...metadata.sections].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    for (const meta of sortedMeta) {
      if (!meta.songId || seenSongIds.has(meta.songId)) continue;
      seenSongIds.add(meta.songId);
      const file = findFileForMeta(meta);
      if (!file) continue;
      const entry = sectionEntryFromFile(file);
      entry.sectionName = meta.sectionName || entry.sectionName;
      sections.push(entry);
    }
  } else {
    sections = sectionJsonFiles.map(sectionEntryFromFile);
  }

  return {
    artist: artistName,
    title: artistName.split(" - ").slice(1).join(" ").trim() || artistName,
    sections,
  };
}

const WEIRD_AL = "weird-al-yankovic - Everything_You_Know_Is_Wrong";

// Simulate pre-init user load
let library = [];
const weirdAlEntry = await loadLibraryEntry(WEIRD_AL);
library.push(weirdAlEntry);
let currentSongIdx = library.length - 1;
const loadedCacheKey = WEIRD_AL;

log("sim:onLoad", "user loaded before init", {
  cacheKey: loadedCacheKey,
  idx: currentSongIdx,
  libraryLen: library.length,
  libraryArtistAtIdx: library[currentSongIdx]?.artist,
}, "A");

// Instrumental section (index 4) — works with pushed entry
const instrumental = library[currentSongIdx].sections[4];
log("sim:loadSection", "instrumental load (pre-init)", {
  songIndex: currentSongIdx,
  sectionIndex: 4,
  songArtist: library[currentSongIdx].artist,
  sectionName: instrumental?.sectionName,
  relPath: instrumental?.relPath,
}, "A");

// init() completes — full library replaces array
const artists = await fs.promises.readdir(CACHE, { withFileTypes: true });
library = [];
for (const e of artists) {
  if (e.isDirectory()) library.push(await loadLibraryEntry(e.name));
}
library.sort((a, b) => (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" }));

const resolvedIdx = library.findIndex((s) => s.artist === loadedCacheKey);
const staleSong = library[currentSongIdx];
const chorusIdx = 3;
log("sim:init:pre-fix", "library fetch completed (bug)", {
  libraryLen: library.length,
  currentSongIdx,
  artistAtCurrentIdx: staleSong?.artist ?? null,
  resolvedIdx,
  mismatch: resolvedIdx >= 0 && resolvedIdx !== currentSongIdx,
}, "A");
log("sim:handleSectionChange:pre-fix", "chorus switch with stale index", {
  sectionIdx: chorusIdx,
  libArtist: staleSong?.artist,
  targetSectionName: staleSong?.sections?.[chorusIdx]?.sectionName,
}, "A,D");

function resolveSongIndex(preferredIndex) {
  if (!loadedCacheKey || !library.length) return preferredIndex;
  const idx = library.findIndex((s) => s.artist === loadedCacheKey);
  return idx >= 0 ? idx : preferredIndex;
}

// post-fix: re-resolve after init
if (loadedCacheKey) {
  const idx = resolveSongIndex(currentSongIdx);
  if (idx !== currentSongIdx) currentSongIdx = idx;
}

log("sim:init:post-fix", "library fetch completed (fixed)", {
  libraryLen: library.length,
  hadSong: true,
  currentSongIdx,
  loadedCacheKey,
  artistAtCurrentIdx: library[currentSongIdx]?.artist ?? null,
  resolvedIdx,
  mismatch: resolvedIdx >= 0 && resolvedIdx !== currentSongIdx,
}, "A");

// User switches to Chorus (index 3) — fixed index
const songIdx = resolveSongIndex(currentSongIdx);
const fixedSong = library[songIdx];
const fixedSection = fixedSong?.sections?.[chorusIdx];
log("sim:handleSectionChange", "chorus switch after fix", {
  sectionIdx: chorusIdx,
  songIdx,
  currentSongIdx,
  loadedCacheKey,
  libArtist: fixedSong?.artist,
  libTitle: fixedSong?.title,
  targetSectionName: fixedSection?.sectionName,
  relPath: fixedSection?.relPath,
  resolvedIdx,
}, "fix");

console.log("Simulation complete. See debug-db5cc4.log");
