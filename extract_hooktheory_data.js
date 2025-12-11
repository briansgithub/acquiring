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

function getCacheKey(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

function getCachePath(url) {
  const key = getCacheKey(url);
  return path.join(CACHE_DIR, `${key}.json`);
}

function loadFromCache(url) {
  const cachePath = getCachePath(url);
  if (fs.existsSync(cachePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      console.log('✓ Loaded from cache');
      return data;
    } catch (e) {
      console.log('✗ Cache file corrupted, fetching fresh data');
      return null;
    }
  }
  return null;
}

function saveToCache(url, data) {
  const cachePath = getCachePath(url);
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
  console.log('✓ Saved to cache');
}

function clearCache(url) {
  const cachePath = getCachePath(url);
  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath);
    console.log('✓ Cache cleared');
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

async function findAllSongIdsFromPage(url) {
  console.log('Launching browser to extract all section song IDs...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    const capturedSongIds = new Set();
    
    // Monitor network requests to capture ALL song IDs from API calls
    page.on('response', async (response) => {
      const responseUrl = response.url();
      if (responseUrl.includes('api.hooktheory.com/v1/songs/public/')) {
        const match = responseUrl.match(/\/songs\/public\/([a-zA-Z0-9_-]+)/);
        if (match) {
          capturedSongIds.add(match[1]);
        }
      }
    });
    
    // Navigate to the page
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Find all section elements (anchors, h2s, tab divs)
    console.log('Finding section elements...');
    const sectionElements = await page.evaluate(() => {
      const sections = [];
      
      // Find section anchors
      const anchors = Array.from(document.querySelectorAll('a[name]'));
      anchors.forEach(anchor => {
        const name = anchor.getAttribute('name');
        const sectionNames = ['intro', 'verse', 'chorus', 'bridge', 'outro'];
        
        if (sectionNames.some(s => name.toLowerCase().includes(s))) {
          const rect = anchor.getBoundingClientRect();
          sections.push({
            name: name,
            type: 'anchor',
            y: rect.y,
            height: rect.height
          });
        }
      });
      
      // Find h2 section titles
      const h2s = Array.from(document.querySelectorAll('h2'));
      h2s.forEach(h2 => {
        const text = h2.textContent.trim().toLowerCase();
        const sectionNames = ['intro', 'verse', 'chorus', 'bridge', 'outro'];
        
        if (sectionNames.some(s => text.includes(s))) {
          const rect = h2.getBoundingClientRect();
          sections.push({
            name: text,
            type: 'h2',
            y: rect.y,
            height: rect.height
          });
        }
      });
      
      // Find tab divs
      const tabDivs = Array.from(document.querySelectorAll('div[id^="tab-"]'));
      tabDivs.forEach(div => {
        const rect = div.getBoundingClientRect();
        sections.push({
          name: div.id,
          type: 'tab',
          y: rect.y,
          height: rect.height
        });
      });
      
      return sections.sort((a, b) => a.y - b.y);
    });
    
    console.log(`Found ${sectionElements.length} section elements`);
    
    // Scroll each section into viewport one at a time to trigger lazy loading
    console.log('Scrolling sections into viewport to trigger lazy loading...');
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    
    for (let i = 0; i < sectionElements.length; i++) {
      const section = sectionElements[i];
      const beforeCount = capturedSongIds.size;
      
      // Scroll to center the section in viewport
      await page.evaluate((targetY, vh) => {
        const scrollY = targetY - (vh / 2) + (targetY / 2);
        window.scrollTo({
          top: scrollY,
          behavior: 'smooth'
        });
      }, section.y, viewportHeight);
      
      // Wait for intersection observer to trigger
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if new song IDs were captured
      const afterCount = capturedSongIds.size;
      if (afterCount > beforeCount) {
        console.log(`  ✓ Section ${i + 1}/${sectionElements.length} triggered ${afterCount - beforeCount} new section(s)`);
      }
    }
    
    // Also scroll back to top slowly to catch any remaining sections
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
    
    const songIds = Array.from(capturedSongIds);
    console.log(`✓ Captured ${songIds.length} unique song IDs: ${songIds.join(', ')}`);
    
    if (songIds.length === 0) {
      throw new Error('Could not find any song IDs in page');
    }
    
    return songIds;
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
  // Check cache first (unless --newcache flag)
  if (!useNewCache) {
    const cached = loadFromCache(url);
    if (cached) {
      return cached;
    }
  } else {
    clearCache(url);
  }
  
  console.log(`Fetching data from: ${url}`);
  
  // Extract all song IDs from page using Strategy 4 (Intersection Observer)
  console.log('\nExtracting all section song IDs from page...');
  const songIds = await findAllSongIdsFromPage(url);
  
  // Fetch song data for each section
  console.log(`\nFetching data for ${songIds.length} section(s)...`);
  const sections = {};
  let totalChords = 0;
  let totalNotes = 0;
  
  for (let i = 0; i < songIds.length; i++) {
    const songId = songIds[i];
    console.log(`  [${i + 1}/${songIds.length}] Fetching ${songId}...`);
    
    try {
      const apiResponse = await fetchSongData(songId);
      const extracted = extractChordAndMelodyObjects(apiResponse);
      
      sections[songId] = {
        songId: extracted.songId,
        songInfo: extracted.songInfo,
        chords: extracted.chords,
        notes: extracted.notes,
        metadata: extracted.metadata
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
    sections: sections,
    summary: {
      totalSections: Object.keys(sections).length,
      totalChords: totalChords,
      totalNotes: totalNotes,
      songIds: songIds
    }
  };
  
  console.log(`\n✓ Extracted ${result.summary.totalSections} section(s) with ${totalChords} total chords and ${totalNotes} total notes`);
  
  // Save to cache
  saveToCache(url, result);
  
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

