/**
 * Strategy 4: Intersection Observer Simulation
 * Simulate intersection observer behavior by scrolling sections into view
 * Monitor when sections become visible and trigger their loading
 */

const puppeteer = require('puppeteer');
const https = require('https');
const fs = require('fs');
const path = require('path');

const TEST_URL = 'https://www.hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag';
const OUTPUT_DIR = path.join(__dirname);
const RESULTS_FILE = path.join(OUTPUT_DIR, 'strategy_4_results.json');

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

async function strategy4_IntersectionObserver() {
  console.log('='.repeat(60));
  console.log('STRATEGY 4: Intersection Observer Simulation');
  console.log('='.repeat(60));
  console.log('\nApproach: Scroll each section into viewport to trigger');
  console.log('intersection observer-based lazy loading\n');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const capturedSongIds = new Set();
  const sectionVisibility = {};
  
  try {
    const page = await browser.newPage();
    
    // Monitor network requests
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('api.hooktheory.com/v1/songs/public/')) {
        const match = url.match(/\/songs\/public\/([a-zA-Z0-9_-]+)/);
        if (match) {
          capturedSongIds.add(match[1]);
        }
      }
    });
    
    console.log('Loading page...');
    await page.goto(TEST_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Find all section elements
    console.log('\nFinding section elements...');
    const sectionElements = await page.evaluate(() => {
      const sections = [];
      
      // Find section anchors
      const anchors = Array.from(document.querySelectorAll('a[name]'));
      anchors.forEach(anchor => {
        const name = anchor.getAttribute('name');
        const sectionNames = ['intro', 'verse', 'chorus', 'bridge', 'outro'];
        
        if (sectionNames.some(s => name.toLowerCase().includes(s))) {
          // Get bounding rect
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
    
    // Scroll each section into view one at a time
    console.log('\nScrolling sections into viewport...');
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    
    for (let i = 0; i < sectionElements.length; i++) {
      const section = sectionElements[i];
      const beforeCount = capturedSongIds.size;
      
      console.log(`  [${i + 1}/${sectionElements.length}] Scrolling to ${section.name}...`);
      
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
        console.log(`    ✓ Triggered loading (${afterCount - beforeCount} new sections)`);
        sectionVisibility[section.name] = {
          triggered: true,
          newSections: afterCount - beforeCount
        };
      } else {
        console.log(`    - No new sections loaded`);
        sectionVisibility[section.name] = {
          triggered: false
        };
      }
    }
    
    // Also try scrolling back up slowly
    console.log('\nScrolling back to top slowly...');
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
    
    // Final wait
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await browser.close();
    
    console.log(`\n✓ Captured ${capturedSongIds.size} unique song IDs`);
    console.log(`  Song IDs: ${Array.from(capturedSongIds).join(', ')}`);
    
    // Fetch full data
    console.log('\nFetching full data for each section...');
    const fullSectionData = {};
    
    for (const songId of capturedSongIds) {
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
        console.log(`    ✓ ${fullSectionData[songId].chords.length} chords`);
      } catch (e) {
        console.log(`    ✗ Error: ${e.message}`);
      }
    }
    
    const results = {
      strategy: 'Intersection Observer Simulation',
      timestamp: new Date().toISOString(),
      url: TEST_URL,
      sectionElements: sectionElements,
      sectionVisibility: sectionVisibility,
      capturedSongIds: Array.from(capturedSongIds),
      fullSectionData,
      summary: {
        totalSections: capturedSongIds.size,
        sectionsWithChords: Object.values(fullSectionData).filter(s => s.chords.length > 0).length,
        sectionsWithNotes: Object.values(fullSectionData).filter(s => s.notes).length
      }
    };
    
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
    console.log(`\n✓ Results saved to: ${RESULTS_FILE}`);
    
    return results;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

strategy4_IntersectionObserver().catch(console.error);

