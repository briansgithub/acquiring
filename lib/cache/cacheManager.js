/**
 * Cache management for Hooktheory song data
 * Handles loading, saving, and clearing cached section data
 */

const fs = require('fs');
const path = require('path');
const { extractArtistAndSongFromUrl } = require('../parser/urlParser');

const CACHE_DIR = path.join(__dirname, '../../.hooktheory_cache');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function getSongCacheDir(artist, songTitle) {
  // Sanitize for filesystem: replace spaces with underscores, remove special chars
  const safeArtist = artist.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeTitle = songTitle.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/\s+/g, '_');
  return path.join(CACHE_DIR, `${safeArtist} - ${safeTitle}`);
}

function getSectionCachePath(songDir, sectionName, numericId, stringSongId) {
  const safeSectionName = sectionName.charAt(0).toUpperCase() + sectionName.slice(1).toLowerCase();
  const filename = `${safeSectionName} - ${numericId} - ${stringSongId}.json`;
  return path.join(songDir, filename);
}

function loadFromCache(url, songTitle) {
  try {
    const { artist } = extractArtistAndSongFromUrl(url);
    const songDir = getSongCacheDir(artist, songTitle);
    
    if (!fs.existsSync(songDir)) {
      return null;
    }
    
    // Load all section files
    const sectionFiles = fs.readdirSync(songDir).filter(f => f.endsWith('.json'));
    if (sectionFiles.length === 0) {
      return null;
    }
    
    const sections = {};
    const songIds = [];
    
    for (const file of sectionFiles) {
      try {
        const filePath = path.join(songDir, file);
        const sectionData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const stringSongId = sectionData.songId || sectionData.stringSongId;
        if (stringSongId) {
          sections[stringSongId] = sectionData;
          songIds.push(stringSongId);
        }
      } catch (e) {
        console.log(`  ⚠ Skipping corrupted cache file: ${file}`);
      }
    }
    
    if (Object.keys(sections).length === 0) {
      return null;
    }
    
    // Reconstruct summary
    let totalChords = 0;
    let totalNotes = 0;
    for (const section of Object.values(sections)) {
      totalChords += (section.chords || []).length;
      if (Array.isArray(section.notes)) {
        totalNotes += section.notes.length;
      } else if (typeof section.notes === 'object' && section.notes !== null) {
        const noteCount = Object.values(section.notes).reduce((sum, melody) => 
          sum + (Array.isArray(melody) ? melody.length : 0), 0
        );
        totalNotes += noteCount;
      }
    }
    
    const result = {
      url: url,
      timestamp: new Date().toISOString(),
      sections: sections,
      summary: {
        totalSections: Object.keys(sections).length,
        totalChords: totalChords,
        totalNotes: totalNotes,
        songIds: songIds
      }
    };
    
    console.log('✓ Loaded from cache');
    return result;
  } catch (e) {
    console.log('✗ Cache load error:', e.message);
    return null;
  }
}

function saveToCache(url, songTitle, sectionsData) {
  try {
    const { artist } = extractArtistAndSongFromUrl(url);
    const songDir = getSongCacheDir(artist, songTitle);
    
    // Ensure song directory exists
    if (!fs.existsSync(songDir)) {
      fs.mkdirSync(songDir, { recursive: true });
    }
    
    // Save each section as a separate file
    let savedCount = 0;
    for (const [stringSongId, sectionData] of Object.entries(sectionsData)) {
      const numericId = sectionData.numericId || sectionData.metadata?.numericId || 'unknown';
      const sectionName = sectionData.sectionName || 'Unknown';
      const cachePath = getSectionCachePath(songDir, sectionName, numericId, stringSongId);
      
      // Prepare section data for saving
      const sectionToSave = {
        ...sectionData,
        stringSongId: stringSongId,
        numericId: numericId,
        sectionName: sectionName,
        cachedAt: new Date().toISOString()
      };
      
      fs.writeFileSync(cachePath, JSON.stringify(sectionToSave, null, 2));
      savedCount++;
    }
    
    console.log(`✓ Saved ${savedCount} section(s) to cache`);
  } catch (e) {
    console.log('✗ Cache save error:', e.message);
  }
}

function clearCache(url, songTitle) {
  try {
    const { artist } = extractArtistAndSongFromUrl(url);
    const songDir = getSongCacheDir(artist, songTitle);
    
    if (fs.existsSync(songDir)) {
      fs.rmSync(songDir, { recursive: true, force: true });
      console.log('✓ Cache cleared');
    }
  } catch (e) {
    console.log('✗ Cache clear error:', e.message);
  }
}

module.exports = {
  loadFromCache,
  saveToCache,
  clearCache,
  getSongCacheDir,
  getSectionCachePath,
  CACHE_DIR
};

