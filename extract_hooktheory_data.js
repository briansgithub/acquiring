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

async function findSongIdFromPage(url) {
  console.log('Launching browser to extract song ID...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    let songId = null;
    
    // Monitor network requests to capture the song ID from API calls
    page.on('response', async (response) => {
      const responseUrl = response.url();
      if (responseUrl.includes('api.hooktheory.com/v1/songs/public/')) {
        const match = responseUrl.match(/\/songs\/public\/([a-zA-Z0-9_-]+)/);
        if (match && !songId) {
          songId = match[1];
        }
      }
    });
    
    // Navigate to the page
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait a bit for API calls to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // If we didn't get it from network, try to extract from page
    if (!songId) {
      songId = await page.evaluate(() => {
        // Look for song ID in various places
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
          const content = script.textContent || script.innerHTML;
          const match = content.match(/api\.hooktheory\.com\/v1\/songs\/public\/([a-zA-Z0-9_-]+)/);
          if (match) return match[1];
        }
        
        // Look for data attributes
        const elements = document.querySelectorAll('[data-song-id], [data-id]');
        for (const el of elements) {
          const id = el.getAttribute('data-song-id') || el.getAttribute('data-id');
          if (id && id.length > 5) return id;
        }
        
        return null;
      });
    }
    
    await browser.close();
    
    if (!songId) {
      throw new Error('Could not find song ID in page');
    }
    
    return songId;
  } catch (e) {
    await browser.close();
    throw new Error(`Failed to extract song ID: ${e.message}`);
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
  
  // Extract song ID from page
  console.log('Extracting song ID from page...');
  const songId = await findSongIdFromPage(url);
  console.log(`✓ Found song ID: ${songId}`);
  
  // Fetch song data from API
  console.log('Fetching song data from API...');
  const apiResponse = await fetchSongData(songId);
  console.log('✓ API data fetched');
  
  // Extract chord and melody objects
  console.log('Extracting chord and melody objects...');
  const extracted = extractChordAndMelodyObjects(apiResponse);
  console.log(`✓ Extracted ${extracted.chords.length} chords`);
  
  if (Array.isArray(extracted.notes)) {
    console.log(`✓ Extracted ${extracted.notes.length} notes`);
  } else if (typeof extracted.notes === 'object' && extracted.notes !== null) {
    const noteCount = Object.values(extracted.notes).reduce((sum, melody) => 
      sum + (Array.isArray(melody) ? melody.length : 0), 0
    );
    console.log(`✓ Extracted ${noteCount} notes across ${Object.keys(extracted.notes).length} melodies`);
  }
  
  // Save to cache
  saveToCache(url, extracted);
  
  return extracted;
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
    console.log(`\nSong ID: ${data.songId}`);
    console.log(`Song: ${data.songInfo?.title || 'N/A'}`);
    console.log(`Artist: ${data.songInfo?.artist || 'N/A'}`);
    console.log(`\nChords: ${data.chords.length}`);
    console.log(`Notes: ${Array.isArray(data.notes) ? data.notes.length : 'Multiple melodies'}`);
    console.log(`\nData structure:`);
    console.log(`  - chords: Array[${data.chords.length}]`);
    if (Array.isArray(data.notes)) {
      console.log(`  - notes: Array[${data.notes.length}]`);
    } else if (data.notes) {
      console.log(`  - notes: Object with ${Object.keys(data.notes).length} melodies`);
    } else {
      console.log(`  - notes: null`);
    }
    
    // Output sample data
    if (data.chords.length > 0) {
      console.log(`\nSample chord object:`);
      console.log(JSON.stringify(data.chords[0], null, 2));
    }
    
    if (data.notes) {
      let sampleNote;
      if (Array.isArray(data.notes) && data.notes.length > 0) {
        sampleNote = data.notes[0];
      } else if (typeof data.notes === 'object') {
        const firstMelody = Object.values(data.notes)[0];
        if (Array.isArray(firstMelody) && firstMelody.length > 0) {
          sampleNote = firstMelody[0];
        }
      }
      
      if (sampleNote) {
        console.log(`\nSample note object:`);
        console.log(JSON.stringify(sampleNote, null, 2));
      }
    }
  })
  .catch((error) => {
    console.error('\n✗ Error:', error.message);
    process.exit(1);
  });

