/**
 * Extract chord and melody objects from Hooktheory song URLs
 * Supports caching and --newcache flag to bypass cache
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer');

const CACHE_DIR = path.join(__dirname, '.hooktheory_cache');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function extractArtistAndSongFromUrl(url) {
  const match = url.match(/theorytab\/view\/([^\/]+)\/([^\/\?]+)/);
  if (!match) {
    throw new Error('Invalid Hooktheory URL format');
  }
  return { artist: match[1], songSlug: match[2] };
}

function getSongCacheDir(artist, songTitle) {
  // Sanitize for filesystem: replace spaces with underscores, remove special chars
  const safeArtist = artist.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeTitle = songTitle.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/\s+/g, '_');
  return path.join(CACHE_DIR, `${safeArtist}-${safeTitle}`);
}

function getSectionCachePath(songDir, sectionName, numericId, stringSongId) {
  const safeSectionName = sectionName.charAt(0).toUpperCase() + sectionName.slice(1).toLowerCase();
  const filename = `${safeSectionName}_${numericId}_${stringSongId}.json`;
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

function extractSongIdFromUrl(url) {
  // URL format: https://www.hooktheory.com/theorytab/view/artist/song
  // We need to find the song ID from the page or API
  // For now, we'll need to fetch the page first to get the song ID
  const match = url.match(/theorytab\/view\/([^\/]+)\/([^\/\?]+)/);
  if (!match) {
    throw new Error('Invalid Hooktheory URL format');
  }
  return { artist: match[1], song: match[2] };
}

function extractSectionNameFromH2(h2Text) {
  // Extract the actual section name from H2 text
  // Use the H2 text as-is (preserves case, hyphens, etc.)
  // H2 text is the authoritative section name
  return h2Text.trim();
}

function isSectionH2(h2Text) {
  // Check if an H2 is likely a section title
  // Section titles are usually short and not page headings
  const text = h2Text.trim();
  return text.length > 0 && 
         text.length < 50 && 
         !text.includes('by ') && 
         !text.toLowerCase().includes('chords and melody');
}

async function findAllSongIdsFromPage(url) {
  console.log('Launching browser to extract all section song IDs...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    const allCapturedSongIds = [];
    
    // Monitor network requests to capture ALL song IDs from API calls
    page.on('response', async (response) => {
      const responseUrl = response.url();
      if (responseUrl.includes('api.hooktheory.com/v1/songs/public/')) {
        const match = responseUrl.match(/\/songs\/public\/([a-zA-Z0-9_-]+)/);
        if (match) {
          const songId = match[1];
          if (!allCapturedSongIds.includes(songId)) {
            allCapturedSongIds.push(songId);
          }
        }
      }
    });
    
    // Navigate to the page and wait for initial load
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const initialSongIds = [...allCapturedSongIds];
    console.log(`Initial page load captured ${initialSongIds.length} song ID(s): ${initialSongIds.join(', ')}`);
    
    // Find H2 section elements (authoritative source for section names)
    console.log('Finding H2 section elements...');
    const h2Sections = await page.evaluate(() => {
      const h2s = Array.from(document.querySelectorAll('h2'));
      const sections = [];
      
      h2s.forEach((h2, index) => {
        const text = h2.textContent.trim();
        const rect = h2.getBoundingClientRect();
        
        // Include all visible H2s that look like section titles
        if (rect.height > 0 && text.length > 0 && text.length < 50) {
          // Filter out page headings
          const isPageHeading = text.includes('by ') || 
                                text.toLowerCase().includes('chords and melody');
          
          if (!isPageHeading) {
            sections.push({
              index: index,
              text: text,
              y: rect.y,
              height: rect.height
            });
          }
        }
      });
      
      return sections.sort((a, b) => a.y - b.y);
    });
    
    console.log(`Found ${h2Sections.length} H2 section elements:`);
    h2Sections.forEach((sec, i) => {
      console.log(`  ${i + 1}. "${sec.text}"`);
    });
    
    if (h2Sections.length === 0) {
      throw new Error('No H2 section elements found on page');
    }
    
    // Scroll to each H2 section and track which song IDs are loaded
    console.log('\nScrolling to each H2 section to trigger lazy loading...');
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const sectionToSongIdMap = []; // Track which song IDs load for each H2 section
    
    for (let i = 0; i < h2Sections.length; i++) {
      const h2Section = h2Sections[i];
      const sectionName = extractSectionNameFromH2(h2Section.text);
      
      const beforeCount = allCapturedSongIds.length;
      
      // Scroll to center the H2 in viewport
      await page.evaluate((targetY, vh) => {
        const scrollY = targetY - (vh / 2);
        window.scrollTo({
          top: Math.max(0, scrollY),
          behavior: 'smooth'
        });
      }, h2Section.y, viewportHeight);
      
      // Wait for intersection observer to trigger and API calls to complete
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check which new song IDs were captured
      const newSongIds = allCapturedSongIds.slice(beforeCount);
      
      sectionToSongIdMap.push({
        sectionName: sectionName,
        h2Text: h2Section.text,
        h2Index: h2Section.index,
        newSongIds: newSongIds
      });
      
      if (newSongIds.length > 0) {
        console.log(`  ✓ ${sectionName}: Loaded ${newSongIds.length} new song ID(s): ${newSongIds.join(', ')}`);
      } else {
        console.log(`  - ${sectionName}: No new song IDs (already loaded)`);
      }
    }
   
    /* // Removed full page scroll as it is not needed
    // Do a full page scroll to catch any remaining sections that might load
    console.log('\nDoing full page scroll to catch remaining sections...');
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < pageHeight; y += viewportHeight / 2) {
      await page.evaluate((scrollY) => {
        window.scrollTo(0, scrollY);
      }, y);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
      */
    
    // Scroll back to top
    await page.evaluate(() => {
      return new Promise((resolve) => {
        let currentScroll = window.pageYOffset || document.documentElement.scrollTop;
        const scrollStep = 200;
        const delay = 300;
        
        const timer = setInterval(() => {
          currentScroll = Math.max(0, currentScroll - scrollStep);
          window.scrollTo(0, currentScroll);
          
          if (currentScroll <= 0) {
            clearInterval(timer);
            setTimeout(resolve, 1000);
          }
        }, delay);
      });
    });
    
    // Final wait for any remaining requests
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await browser.close();
    
    const songIds = [...new Set(allCapturedSongIds)];
    console.log(`\n✓ Captured ${songIds.length} unique song IDs: ${songIds.join(', ')}`);
    
    if (songIds.length === 0) {
      throw new Error('Could not find any song IDs in page');
    }
    
    // Build section mapping: assign song IDs to H2 sections
    const sectionMapping = {};
    const mappedSongIds = new Set();
    
    // Get H2 section names in order (use actual H2 text)
    const h2SectionNames = h2Sections.map(sec => extractSectionNameFromH2(sec.text));
    
    // First pass: Map song IDs that were triggered by specific H2 sections
    for (const mapping of sectionToSongIdMap) {
      for (const songId of mapping.newSongIds) {
        if (!sectionMapping[songId]) {
          sectionMapping[songId] = mapping.sectionName;
          mappedSongIds.add(songId);
        }
      }
    }
    
    // Second pass: Assign unmapped song IDs to H2 sections in order
    // This handles initial load IDs and IDs that loaded during full scroll
    const unmappedIds = songIds.filter(id => !mappedSongIds.has(id));
    if (unmappedIds.length > 0) {
      // Get already used section names
      const usedSections = new Set(Object.values(sectionMapping));
      
      // Assign unmapped IDs to unused H2 sections in order
      let sectionIndex = 0;
      for (const id of unmappedIds) {
        // Find next unused H2 section
        while (sectionIndex < h2SectionNames.length && 
               usedSections.has(h2SectionNames[sectionIndex])) {
          sectionIndex++;
        }
        
        if (sectionIndex < h2SectionNames.length) {
          sectionMapping[id] = h2SectionNames[sectionIndex];
          mappedSongIds.add(id);
          usedSections.add(h2SectionNames[sectionIndex]);
          sectionIndex++;
        } else {
          // If we run out of H2 sections, assign to the last one
          // This ensures we never use "Unknown"
          sectionMapping[id] = h2SectionNames[h2SectionNames.length - 1];
          mappedSongIds.add(id);
        }
      }
    }
    
    // Verify all song IDs are mapped
    const stillUnmapped = songIds.filter(id => !sectionMapping[id]);
    if (stillUnmapped.length > 0) {
      // Fallback: assign to H2 sections in round-robin fashion
      for (let i = 0; i < stillUnmapped.length; i++) {
        sectionMapping[stillUnmapped[i]] = h2SectionNames[i % h2SectionNames.length];
      }
    }
    
    console.log('\nSection Mapping:');
    Object.entries(sectionMapping).forEach(([songId, section]) => {
      console.log(`  ${songId} -> ${section}`);
    });
    
    return {
      songIds: songIds,
      sectionMapping: sectionMapping
    };
  } catch (e) {
    await browser.close();
    throw new Error(`Failed to extract song IDs: ${e.message}`);
  }
}

function fetchSongData(songId) {
  return new Promise((resolve, reject) => {
    const apiUrl = `https://api.hooktheory.com/v1/songs/public/${songId}?fields=ID,xmlData,song,jsonData`;
    
    https.get(apiUrl, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error(`Failed to parse API response: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

function extractChordAndMelodyObjects(apiResponse) {
  if (!apiResponse.jsonData) {
    throw new Error('No jsonData in API response');
  }
  
  let jsonData;
  try {
    jsonData = typeof apiResponse.jsonData === 'string' 
      ? JSON.parse(apiResponse.jsonData) 
      : apiResponse.jsonData;
  } catch (e) {
    throw new Error(`Failed to parse jsonData: ${e.message}`);
  }
  
  const result = {
    songId: apiResponse.ID,
    songInfo: apiResponse.song,
    chords: jsonData.chords || [],
    notes: jsonData.notes || null,
    metadata: {
      version: jsonData.version,
      keys: jsonData.keys,
      tempos: jsonData.tempos,
      meters: jsonData.meters,
      sections: jsonData.sections,
      endBeat: jsonData.endBeat
    }
  };
  
  return result;
}

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
    const cached = loadFromCache(url, songTitle);
    if (cached) {
      return cached;
    }
  } else {
    clearCache(url, songTitle);
  }
  
  // Fetch song data for each section
  console.log(`\nFetching data for ${songIds.length} section(s)...`);
  const sections = {};
  let totalChords = 0;
  let totalNotes = 0;
  
  for (let i = 0; i < songIds.length; i++) {
    const stringSongId = songIds[i];
    const sectionName = sectionMapping[stringSongId] || 'Unknown';
    console.log(`  [${i + 1}/${songIds.length}] Fetching ${stringSongId} (${sectionName})...`);
    
    try {
      const apiResponse = await fetchSongData(stringSongId);
      const extracted = extractChordAndMelodyObjects(apiResponse);
      
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
      
      totalChords += extracted.chords.length;
      
      if (Array.isArray(extracted.notes)) {
        totalNotes += extracted.notes.length;
      } else if (typeof extracted.notes === 'object' && extracted.notes !== null) {
        const noteCount = Object.values(extracted.notes).reduce((sum, melody) => 
          sum + (Array.isArray(melody) ? melody.length : 0), 0
        );
        totalNotes += noteCount;
      }
      
      console.log(`    ✓ ${extracted.chords.length} chords, ${Array.isArray(extracted.notes) ? extracted.notes.length : 'multiple'} notes`);
    } catch (e) {
      console.log(`    ✗ Error: ${e.message}`);
    }
  }
  
  const result = {
    url: url,
    timestamp: new Date().toISOString(),
    songTitle: songTitle,
    sections: sections,
    summary: {
      totalSections: Object.keys(sections).length,
      totalChords: totalChords,
      totalNotes: totalNotes,
      songIds: songIds
    }
  };
  
  console.log(`\n✓ Extracted ${result.summary.totalSections} section(s) with ${totalChords} total chords and ${totalNotes} total notes`);
  
  // Save to cache using new structure
  saveToCache(url, songTitle, sections);
  
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
    console.log('\n' + '='.repeat(60));
    console.log('EXTRACTION COMPLETE');
    console.log('='.repeat(60));
    console.log(`\nTotal Sections: ${data.summary.totalSections}`);
    console.log(`Total Chords: ${data.summary.totalChords}`);
    console.log(`Total Notes: ${data.summary.totalNotes}`);
    console.log(`\nSong IDs: ${data.summary.songIds.join(', ')}`);
    
    // Output per-section summary
    console.log(`\nSection Breakdown:`);
    for (const [songId, section] of Object.entries(data.sections)) {
      const chordCount = section.chords ? section.chords.length : 0;
      let noteCount = 0;
      if (Array.isArray(section.notes)) {
        noteCount = section.notes.length;
      } else if (typeof section.notes === 'object' && section.notes !== null) {
        noteCount = Object.values(section.notes).reduce((sum, melody) => 
          sum + (Array.isArray(melody) ? melody.length : 0), 0
        );
      }
      
      console.log(`  ${songId}:`);
      console.log(`    Song: ${section.songInfo || 'N/A'}`);
      console.log(`    Chords: ${chordCount}`);
      console.log(`    Notes: ${noteCount}`);
    }
    
    // Output sample data from first section
    const firstSection = Object.values(data.sections)[0];
    if (firstSection) {
      console.log(`\nSample Data (from first section):`);
      console.log(`\nSample chord object:`);
      if (firstSection.chords && firstSection.chords.length > 0) {
        console.log(JSON.stringify(firstSection.chords[0], null, 2));
      }
      
      if (firstSection.notes) {
        let sampleNote;
        if (Array.isArray(firstSection.notes) && firstSection.notes.length > 0) {
          sampleNote = firstSection.notes[0];
        } else if (typeof firstSection.notes === 'object') {
          const firstMelody = Object.values(firstSection.notes)[0];
          if (Array.isArray(firstMelody) && firstMelody.length > 0) {
            sampleNote = firstMelody[0];
          }
        }
        
        if (sampleNote) {
          console.log(`\nSample note object:`);
          console.log(JSON.stringify(sampleNote, null, 2));
        }
      }
    }
  })
  .catch((error) => {
    console.error('\n✗ Error:', error.message);
    process.exit(1);
  });

