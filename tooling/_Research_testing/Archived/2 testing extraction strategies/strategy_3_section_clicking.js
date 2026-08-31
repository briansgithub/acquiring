/**
 * Strategy 3: Section Link Clicking
 * Find and click each section link to trigger lazy loading
 * Monitor network requests as sections are loaded
 */

const puppeteer = require('puppeteer');
const https = require('https');
const fs = require('fs');
const path = require('path');

const TEST_URL = 'https://www.hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag';
const EXPECTED_SECTIONS = ['Intro', 'Verse', 'Chorus', 'Bridge', 'Outro'];
const OUTPUT_DIR = path.join(__dirname);
const RESULTS_FILE = path.join(OUTPUT_DIR, 'strategy_3_results.json');

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

async function strategy3_SectionClicking() {
  console.log('='.repeat(60));
  console.log('STRATEGY 3: Section Link Clicking');
  console.log('='.repeat(60));
  console.log('\nApproach: Find and click each section link to trigger loading');
  console.log('Monitor network requests as sections are activated\n');
  console.log('Timeout: 60 seconds\n');
  
  const timeout = 60000; // 1 minute
  const startTime = Date.now();
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  // Timeout handler
  const timeoutId = setTimeout(async () => {
    if (Date.now() - startTime >= timeout) {
      console.log('\n⚠ Timeout reached (60s). Ending strategy execution...');
      await browser.close();
      process.exit(0);
    }
  }, timeout);
  
  const capturedSongIds = new Set();
  const sectionToSongId = {};
  
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
    
    console.log('\nFinding section links...');
    const sectionLinks = await page.evaluate((expectedSections) => {
      const links = [];
      const allElements = Array.from(document.querySelectorAll('a, button, [role="button"], [onclick]'));
      
      allElements.forEach(element => {
        const text = (element.textContent || element.innerText || '').trim();
        const href = element.getAttribute('href') || '';
        const id = element.id || '';
        const className = element.className || '';
        
        for (const section of expectedSections) {
          const sectionLower = section.toLowerCase();
          if (text.toLowerCase().includes(sectionLower) || 
              href.toLowerCase().includes(sectionLower) ||
              id.toLowerCase().includes(sectionLower) ||
              className.toLowerCase().includes(sectionLower)) {
            links.push({
              section: section,
              text: text.substring(0, 50),
              href: href,
              id: id,
              tagName: element.tagName,
              selector: element.id ? `#${element.id}` : 
                       element.className ? `.${element.className.split(' ')[0]}` : null
            });
          }
        }
      });
      
      return links;
    }, EXPECTED_SECTIONS);
    
    console.log(`Found ${sectionLinks.length} potential section links`);
    
    // Click each section link
    console.log('\nClicking section links to trigger loading...');
    for (const linkInfo of sectionLinks) {
      try {
        // Try different selectors
        let clicked = false;
        
        if (linkInfo.id) {
          try {
            await page.click(`#${linkInfo.id}`);
            clicked = true;
            console.log(`  ✓ Clicked ${linkInfo.section} (by ID)`);
          } catch (e) {
            // Try next method
          }
        }
        
        if (!clicked && linkInfo.href) {
          try {
            await page.click(`a[href*="${linkInfo.href.split('/').pop()}"]`);
            clicked = true;
            console.log(`  ✓ Clicked ${linkInfo.section} (by href)`);
          } catch (e) {
            // Try next method
          }
        }
        
        if (!clicked) {
          // Try text-based selection
          try {
            await page.evaluate((sectionText) => {
              const elements = Array.from(document.querySelectorAll('*'));
              const element = elements.find(el => 
                el.textContent && el.textContent.includes(sectionText) &&
                (el.tagName === 'A' || el.tagName === 'BUTTON' || el.onclick)
              );
              if (element) {
                element.click();
              }
            }, linkInfo.section);
            clicked = true;
            console.log(`  ✓ Clicked ${linkInfo.section} (by text)`);
          } catch (e) {
            console.log(`  ✗ Could not click ${linkInfo.section}`);
          }
        }
        
        // Wait for section to load
        if (clicked) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (e) {
        console.log(`  ✗ Error clicking ${linkInfo.section}: ${e.message}`);
      }
    }
    
    // Also try scrolling to sections
    console.log('\nScrolling to section anchors...');
    for (const section of EXPECTED_SECTIONS) {
      try {
        await page.evaluate((sectionName) => {
          const anchors = Array.from(document.querySelectorAll('a[name]'));
          const anchor = anchors.find(a => 
            a.getAttribute('name').toLowerCase().includes(sectionName.toLowerCase())
          );
          if (anchor) {
            anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, section);
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (e) {
        // Continue
      }
    }
    
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
      strategy: 'Section Link Clicking',
      timestamp: new Date().toISOString(),
      url: TEST_URL,
      sectionLinks: sectionLinks,
      capturedSongIds: Array.from(capturedSongIds),
      fullSectionData,
      summary: {
        totalSections: capturedSongIds.size,
        sectionsWithChords: Object.values(fullSectionData).filter(s => s.chords.length > 0).length,
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

strategy3_SectionClicking().catch(console.error);

