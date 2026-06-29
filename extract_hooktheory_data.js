/**
 * Extract chord and melody objects from Hooktheory song URLs
 * Supports caching and --newcache flag to bypass cache
 */

const CacheManager = require('./lib/cache/cacheManager');
const { findAllSongIdsFromPage } = require('./lib/scraper/pageScraper');
const { fetchSongData } = require('./lib/api/hooktheoryApi');
const { extractChordAndMelodyObjects } = require('./lib/extractor/dataExtractor');
const { calculateSummary, formatOutput } = require('./lib/utils/summaryUtils');

async function extractFromUrl(url, useNewCache = false) {
  console.log(`Fetching data from: ${url}`);
  
  // Extract all song IDs from page using Strategy 4 (Intersection Observer)
  console.log('\nExtracting all section song IDs from page...');
  const { songIds, sectionMapping } = await findAllSongIdsFromPage(url);
  
  // Fetch first section to get song title
  let songTitle = null;
  if (songIds.length > 0) {
    try {
      const firstApiResponse = await fetchSongData(songIds[0]);
      songTitle = firstApiResponse.song;
      console.log(`\nSong title: "${songTitle}"`);
    } catch (e) {
      console.log(`  ⚠ Could not fetch song title: ${e.message}`);
    }
  }
  
  // If we don't have song title, we can't use the new cache structure
  if (!songTitle) {
    throw new Error('Could not determine song title from API response');
  }
  
  // Check cache first (unless --newcache flag)
  if (!useNewCache) {
    const cached = CacheManager.loadFromCache(url, songTitle);
    if (cached) {
      return cached;
    }
  } else {
    CacheManager.clearCache(url, songTitle);
  }
  
  // Fetch song data for each section
  console.log(`\nFetching data for ${songIds.length} section(s)...`);
  const sections = {};
  
  for (let i = 0; i < songIds.length; i++) {
    const stringSongId = songIds[i];
    const sectionName = sectionMapping[stringSongId] || 'Unknown';
    console.log(`  [${i + 1}/${songIds.length}] Fetching ${stringSongId} (${sectionName})...`);
    
    try {
      const apiResponse = await fetchSongData(stringSongId);
      const extracted = await extractChordAndMelodyObjects(apiResponse);
      
      // Get numeric ID from API response
      const numericId = apiResponse.ID;
      
      sections[stringSongId] = {
        songId: stringSongId,
        numericId: numericId,
        sectionName: sectionName,
        songInfo: extracted.songInfo,
        chords: extracted.chords,
        notes: extracted.notes,
        metadata: {
          ...extracted.metadata,
          numericId: numericId
        }
      };
      
      const chordCount = extracted.chords.length;
      let noteCount = 0;
      if (Array.isArray(extracted.notes)) {
        noteCount = extracted.notes.length;
      } else if (typeof extracted.notes === 'object' && extracted.notes !== null) {
        noteCount = Object.values(extracted.notes).reduce((sum, melody) => 
          sum + (Array.isArray(melody) ? melody.length : 0), 0
        );
      }
      
      console.log(`    ✓ ${chordCount} chords, ${Array.isArray(extracted.notes) ? extracted.notes.length : 'multiple'} notes`);
    } catch (e) {
      console.log(`    ✗ Error: ${e.message}`);
    }
  }
  
  const summary = calculateSummary(sections);
  summary.songIds = songIds; // Ensure songIds array matches the order from scraping
  
  const result = {
    url: url,
    timestamp: new Date().toISOString(),
    songTitle: songTitle,
    sections: sections,
    summary: summary
  };
  
  console.log(`\n✓ Extracted ${result.summary.totalSections} section(s) with ${result.summary.totalChords} total chords and ${result.summary.totalNotes} total notes`);
  
  // Save to cache using new structure
  CacheManager.saveToCache(url, songTitle, sections);
  
  // Save song metadata including section order
  CacheManager.saveSongMetadata(url, songTitle, {
    songIds: songIds, // Array preserving the order sections appear on webpage
    sectionMapping: sectionMapping, // Maps songId to section name
    sections: songIds.map((songId, index) => ({
      index: index,
      songId: songId,
      sectionName: sectionMapping[songId] || 'Unknown',
      numericId: sections[songId]?.numericId || null
    }))
  });

  try {
    const pathMod = require('path');
    const { openDb } = require('./_Research_testing/hooktheory_catalog/lib/db');
    const { markSongFromCache } = require('./_Research_testing/hooktheory_catalog/lib/cacheSync');
    const { extractArtistAndSongFromUrl } = require('./lib/parser/urlParser');
    const { artist } = extractArtistAndSongFromUrl(url);
    const cacheDirName = pathMod.basename(CacheManager.getSongCacheDir(artist, songTitle));
    markSongFromCache(openDb(), url, cacheDirName);
  } catch (_) {
    // catalog sync is best-effort
  }
  
  return result;
}

// Main execution
const args = process.argv.slice(2);
const urlIndex = args.findIndex(arg => !arg.startsWith('--'));
const url = urlIndex >= 0 ? args[urlIndex] : null;
const useNewCache = args.includes('--newcache');

if (!url) {
  console.error('Usage: node extract_hooktheory_data.js <hooktheory_url> [--newcache]');
  console.error('');
  console.error('Example:');
  console.error('  node extract_hooktheory_data.js https://www.hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag');
  console.error('  node extract_hooktheory_data.js https://www.hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag --newcache');
  process.exit(1);
}

if (!url.includes('hooktheory.com/theorytab/view/')) {
  console.error('Error: URL must be a Hooktheory theorytab URL');
  console.error('Expected format: https://www.hooktheory.com/theorytab/view/artist/song');
  process.exit(1);
}

extractFromUrl(url, useNewCache)
  .then((data) => {
    formatOutput(data);
  })
  .catch((error) => {
    console.error('\n✗ Error:', error.message);
    process.exit(1);
  });
