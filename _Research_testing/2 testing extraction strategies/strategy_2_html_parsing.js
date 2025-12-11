/**
 * Strategy 2: HTML Parsing
 * Parse the HTML to find section links and hookpad IDs
 * Then fetch data for each discovered section
 */

const puppeteer = require('puppeteer');
const https = require('https');
const fs = require('fs');
const path = require('path');

const TEST_URL = 'https://www.hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag';
const OUTPUT_DIR = path.join(__dirname);
const RESULTS_FILE = path.join(OUTPUT_DIR, 'strategy_2_results.json');

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

async function strategy2_HTMLParsing() {
  console.log('='.repeat(60));
  console.log('STRATEGY 2: HTML Parsing');
  console.log('='.repeat(60));
  console.log('\nApproach: Parse HTML to find section links and hookpad IDs');
  console.log('then fetch data for each discovered section\n');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    console.log('Loading page and scrolling to load all sections...');
    await page.goto(TEST_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Slow scroll to trigger lazy loading
    await page.evaluate(() => {
      return new Promise((resolve) => {
        let position = 0;
        const scrollStep = 50;
        const delay = 400;
        
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
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('\nExtracting section information from HTML...');
    const sections = await page.evaluate(() => {
      const foundSections = [];
      
      // Method 1: Look for section anchors and h2 titles
      const anchors = Array.from(document.querySelectorAll('a[name]'));
      
      anchors.forEach(anchor => {
        const anchorName = anchor.getAttribute('name');
        const sectionNames = ['intro', 'verse', 'chorus', 'bridge', 'outro'];
        
        if (sectionNames.some(name => anchorName.toLowerCase().includes(name))) {
          // Find h2 after this anchor
          let current = anchor.nextElementSibling;
          while (current && current.tagName !== 'H2') {
            current = current.nextElementSibling;
          }
          
          const title = current ? current.textContent.trim() : anchorName;
          
          // Look for hookpad ID in nearby links
          let hookpadId = null;
          let searchElement = anchor.parentElement;
          const links = searchElement.querySelectorAll('a[href*="idOfSong"]');
          
          for (const link of links) {
            const href = link.getAttribute('href');
            const match = href.match(/idOfSong=([^"&\s]+)/);
            if (match) {
              hookpadId = match[1];
              break;
            }
          }
          
          // Also check for tab div IDs
          let tabId = null;
          const tabDivs = searchElement.querySelectorAll('div[id^="tab-"]');
          for (const div of tabDivs) {
            const id = div.getAttribute('id');
            const match = id.match(/tab-(\d+)/);
            if (match) {
              tabId = parseInt(match[1]);
              break;
            }
          }
          
          if (hookpadId || tabId) {
            foundSections.push({
              anchor: anchorName,
              title: title,
              hookpadId: hookpadId,
              tabId: tabId
            });
          }
        }
      });
      
      // Method 2: Look for JavaScript params
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const script of scripts) {
        const content = script.textContent || script.innerHTML;
        
        // Find pushToPendingTheoryTabs calls
        const tabMatches = content.matchAll(/pushToPendingTheoryTabs\("tab-(\d+)",\s*params\)/g);
        for (const match of tabMatches) {
          const tabId = parseInt(match[1]);
          
          // Look for idOfSong in nearby context
          const contextStart = Math.max(0, match.index - 1000);
          const context = content.substring(contextStart, match.index + 100);
          const hookpadMatch = context.match(/idOfSong["\']?\s*[:=]\s*["\']?([^"\'&,\s]+)/);
          
          if (hookpadMatch) {
            const hookpadId = hookpadMatch[1];
            // Check if we already have this section
            if (!foundSections.find(s => s.hookpadId === hookpadId)) {
              foundSections.push({
                anchor: `section_${tabId}`,
                title: `Section ${tabId}`,
                hookpadId: hookpadId,
                tabId: tabId
              });
            }
          }
        }
      }
      
      return foundSections;
    });
    
    console.log(`\n✓ Found ${sections.length} sections in HTML`);
    sections.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.title} (Hookpad: ${s.hookpadId || 'N/A'}, Tab: ${s.tabId || 'N/A'})`);
    });
    
    await browser.close();
    
    // Fetch data for each discovered section
    console.log('\nFetching data for each section...');
    const fullSectionData = {};
    
    for (const section of sections) {
      if (section.hookpadId) {
        console.log(`  Fetching ${section.title} (${section.hookpadId})...`);
        try {
          const apiData = await fetchSongData(section.hookpadId);
          const jsonData = parseJsonData(apiData.jsonData);
          
          fullSectionData[section.hookpadId] = {
            sectionInfo: section,
            songId: apiData.ID,
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
          console.log(`    ✓ ${fullSectionData[section.hookpadId].chords.length} chords`);
        } catch (e) {
          console.log(`    ✗ Error: ${e.message}`);
        }
      }
    }
    
    const results = {
      strategy: 'HTML Parsing',
      timestamp: new Date().toISOString(),
      url: TEST_URL,
      discoveredSections: sections,
      fullSectionData,
      summary: {
        totalSections: sections.length,
        sectionsWithData: Object.keys(fullSectionData).length,
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

strategy2_HTMLParsing().catch(console.error);

