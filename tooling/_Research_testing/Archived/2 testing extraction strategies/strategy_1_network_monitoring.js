/**
 * Strategy 1: Network Request Monitoring
 * Monitor all API calls to capture song IDs as they're loaded
 * This is the most reliable method - capture data as it's requested
 */

const puppeteer = require('puppeteer');
const https = require('https');
const fs = require('fs');
const path = require('path');

const TEST_URL = 'https://www.hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag';
const OUTPUT_DIR = path.join(__dirname);
const RESULTS_FILE = path.join(OUTPUT_DIR, 'strategy_1_results.json');

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
          reject(new Error(`Failed to parse: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

function parseJsonData(jsonDataString) {
  try {
    return typeof jsonDataString === 'string' 
      ? JSON.parse(jsonDataString) 
      : jsonDataString;
  } catch (e) {
    return null;
  }
}

async function strategy1_NetworkMonitoring() {
  console.log('='.repeat(60));
  console.log('STRATEGY 1: Network Request Monitoring');
  console.log('='.repeat(60));
  console.log('\nApproach: Monitor all network requests to capture song IDs');
  console.log('as sections are lazy-loaded\n');
  console.log('Timeout: 60 seconds\n');
  
  const timeout = 60000; // 1 minute
  const startTime = Date.now();
  let timedOut = false;
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  // Timeout handler
  const timeoutId = setTimeout(() => {
    timedOut = true;
    console.log('\n⚠ Timeout reached (60s). Ending strategy execution...');
  }, timeout);
  
  const capturedSongIds = new Set();
  const songIdTimestamps = {};
  const sectionData = {};
  
  try {
    const page = await browser.newPage();
    
    // Monitor ALL network responses
    page.on('response', async (response) => {
      const url = response.url();
      
      if (url.includes('api.hooktheory.com/v1/songs/public/')) {
        const match = url.match(/\/songs\/public\/([a-zA-Z0-9_-]+)/);
        if (match) {
          const songId = match[1];
          const timestamp = Date.now();
          
          if (!capturedSongIds.has(songId)) {
            capturedSongIds.add(songId);
            songIdTimestamps[songId] = timestamp;
            console.log(`  [${new Date(timestamp).toLocaleTimeString()}] Captured: ${songId}`);
            
            // Try to get the response data
            try {
              const data = await response.json();
              if (data.jsonData) {
                const jsonData = parseJsonData(data.jsonData);
                if (jsonData) {
                  sectionData[songId] = {
                    songId,
                    timestamp,
                    chordCount: jsonData.chords ? jsonData.chords.length : 0,
                    noteCount: jsonData.notes ? (Array.isArray(jsonData.notes) ? jsonData.notes.length : 'object') : 0,
                    hasChords: !!(jsonData.chords && jsonData.chords.length > 0),
                    hasNotes: !!jsonData.notes
                  };
                }
              }
            } catch (e) {
              // Response already consumed or not JSON
            }
          }
        }
      }
    });
    
    console.log('Loading page...');
    await page.goto(TEST_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('\nSlow scrolling to trigger lazy loads...');
    await page.evaluate(() => {
      return new Promise((resolve) => {
        let position = 0;
        const scrollStep = 100;
        const delay = 500;
        
        const timer = setInterval(() => {
          window.scrollBy(0, scrollStep);
          position += scrollStep;
          
          if (position >= document.body.scrollHeight) {
            clearInterval(timer);
            setTimeout(resolve, 2000);
          }
        }, delay);
      });
    });
    
    // Wait for any final requests (check timeout)
    if (!timedOut) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    if (!timedOut) {
      await browser.close();
    } else {
      try { await browser.close(); } catch (e) {}
    }
    
    console.log(`\n✓ Captured ${capturedSongIds.size} unique song IDs`);
    
    // Fetch full data for each song ID (only if not timed out)
    const fullSectionData = {};
    if (!timedOut) {
      console.log('\nFetching full data for each section...');
      
      for (const songId of capturedSongIds) {
        if (timedOut) break;
        console.log(`  Fetching ${songId}...`);
        try {
          const apiData = await fetchSongData(songId);
          const jsonData = parseJsonData(apiData.jsonData);
          
          fullSectionData[songId] = {
            songId,
            songInfo: apiData.song,
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
          console.log(`    ✓ ${fullSectionData[songId].chords.length} chords, ${Array.isArray(fullSectionData[songId].notes) ? fullSectionData[songId].notes.length : 'multiple'} notes`);
        } catch (e) {
          console.log(`    ✗ Error: ${e.message}`);
        }
      }
    } else {
      console.log('\n⚠ Timeout reached - skipping full data fetch');
    }
    
    const results = {
      strategy: 'Network Request Monitoring',
      timestamp: new Date().toISOString(),
      url: TEST_URL,
      timedOut: timedOut,
      capturedSongIds: Array.from(capturedSongIds),
      songIdTimestamps,
      sectionData,
      fullSectionData,
      summary: {
        totalSections: capturedSongIds.size,
        sectionsWithChords: Object.values(fullSectionData).filter(s => s.chords && s.chords.length > 0).length,
        sectionsWithNotes: Object.values(fullSectionData).filter(s => s.notes).length
      }
    };
    
    clearTimeout(timeoutId);
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
    console.log(`\n✓ Results saved to: ${RESULTS_FILE}`);
    
    return results;
  } catch (error) {
    clearTimeout(timeoutId);
    await browser.close();
    throw error;
  }
}

strategy1_NetworkMonitoring().catch(console.error);

