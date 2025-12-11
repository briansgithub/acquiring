/**
 * Script to analyze Hooktheory website for lazy-loaded sections containing melody and chord data.
 * Sections: Intro, Verse, Chorus, Bridge, Outro
 * Target: https://www.hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Get URL from command line argument or use default
const URL = process.argv[2] || 'https://www.hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag';

const OUTPUT_DIR = path.join(__dirname);
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'melody_chord_structure.json');

async function analyzeWebsite() {
  console.log(`Opening URL: ${URL}`);
  
  const browser = await puppeteer.launch({
    headless: true, // Run headless for automation
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Monitor network requests to capture API calls
    const networkRequests = [];
    const songApiData = [];
    
    page.on('response', async (response) => {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';
      
      // Specifically capture Hooktheory API responses
      if (url.includes('api.hooktheory.com/v1/songs')) {
        try {
          const data = await response.json();
          songApiData.push({
            url,
            status: response.status(),
            data,
            timestamp: Date.now()
          });
          console.log(`✓ Captured Hooktheory API response: ${url}`);
        } catch (e) {
          console.log(`✗ Failed to parse API response: ${url}`, e.message);
        }
      }
      
      // Capture all JSON responses
      if (contentType.includes('application/json') || url.includes('api') || url.includes('json')) {
        try {
          const data = await response.json();
          networkRequests.push({
            url,
            status: response.status(),
            data,
            timestamp: Date.now()
          });
        } catch (e) {
          // Not JSON or failed to parse
        }
      }
    });

    // Navigate to the page
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for initial load and API call
    console.log('Waiting for initial page load...');
    await page.waitForTimeout(3000);

    // Try to find and click section links/buttons to trigger lazy loading
    const sectionNames = ['Intro', 'Verse', 'Chorus', 'Bridge', 'Outro'];
    
    // Look for section links in the page
    const sectionLinks = await page.evaluate(() => {
      const links = [];
      // Look for links containing section names
      const allLinks = Array.from(document.querySelectorAll('a, button, [role="button"]'));
      allLinks.forEach(link => {
        const text = (link.textContent || link.innerText || '').trim();
        const href = link.getAttribute('href') || '';
        const id = link.id || '';
        const className = link.className || '';
        
        ['Intro', 'Verse', 'Chorus', 'Bridge', 'Outro'].forEach(section => {
          if (text.includes(section) || href.includes(section.toLowerCase()) || 
              id.includes(section.toLowerCase()) || className.includes(section.toLowerCase())) {
            links.push({
              section,
              text: text.substring(0, 50),
              href,
              id,
              className: className.substring(0, 100),
              tagName: link.tagName
            });
          }
        });
      });
      return links;
    });

    console.log(`Found ${sectionLinks.length} potential section links`);
    
    // Try clicking section links to trigger lazy loading
    for (const linkInfo of sectionLinks) {
      try {
        const selector = linkInfo.href ? `a[href*="${linkInfo.href}"]` : 
                        linkInfo.id ? `#${linkInfo.id}` :
                        `a:has-text("${linkInfo.section}")`;
        
        const element = await page.$(selector);
        if (element) {
          await element.click();
          await page.waitForTimeout(2000); // Wait for lazy load
          console.log(`✓ Clicked section link: ${linkInfo.section}`);
        }
      } catch (e) {
        // Try alternative approach - scroll to section
        try {
          await page.evaluate((section) => {
            const elements = Array.from(document.querySelectorAll('*'));
            const sectionEl = elements.find(el => 
              el.textContent && el.textContent.includes(section)
            );
            if (sectionEl) {
              sectionEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, linkInfo.section);
          await page.waitForTimeout(1500);
        } catch (e2) {
          // Continue
        }
      }
    }

    // Scroll through page to trigger any intersection observers
    await page.evaluate(() => {
      return new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 200;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 200);
      });
    });

    // Wait for all lazy-loaded content
    await page.waitForTimeout(2000);
    
    console.log('Processing captured data...');

    // Extract data from the page itself and try to access Hookpad player data
    const pageData = await page.evaluate(() => {
      const result = {
        sections: {},
        embeddedData: [],
        windowData: {},
        hookpadData: null
      };

      // Try to access Hookpad player instance if available
      if (window.Hookpad || window.hookpad) {
        try {
          result.hookpadData = {
            available: true,
            // Try to get song data from player
            player: typeof window.Hookpad !== 'undefined' ? 'Hookpad' : 'hookpad'
          };
        } catch (e) {
          result.hookpadData = { available: false, error: e.message };
        }
      }

      // Look for script tags with JSON data
      const scripts = document.querySelectorAll('script[type="application/json"]');
      scripts.forEach((script, index) => {
        try {
          const data = JSON.parse(script.textContent);
          result.embeddedData.push({ index, data });
        } catch (e) {
          // Not valid JSON
        }
      });

      // Look for data attributes
      const dataElements = document.querySelectorAll('[data-melody], [data-chord], [data-section]');
      dataElements.forEach((el) => {
        const section = el.getAttribute('data-section') || 'unknown';
        if (!result.sections[section]) {
          result.sections[section] = [];
        }
        result.sections[section].push({
          melody: el.getAttribute('data-melody'),
          chord: el.getAttribute('data-chord'),
          innerHTML: el.innerHTML.substring(0, 200) // First 200 chars
        });
      });

      // Check window object for data
      if (window.__INITIAL_STATE__) {
        result.windowData.__INITIAL_STATE__ = window.__INITIAL_STATE__;
      }
      if (window.__NEXT_DATA__) {
        result.windowData.__NEXT_DATA__ = window.__NEXT_DATA__;
      }
      if (window.appData) {
        result.windowData.appData = window.appData;
      }

      return result;
    });

    // Parse the Hooktheory API response
    let songData = null;
    let jsonData = null;
    
    if (songApiData.length > 0) {
      songData = songApiData[0].data;
      console.log(`\n✓ Found song API data with keys:`, Object.keys(songData));
      
      // Extract jsonData which should contain section data
      if (songData.jsonData) {
        try {
          jsonData = typeof songData.jsonData === 'string' 
            ? JSON.parse(songData.jsonData) 
            : songData.jsonData;
          console.log(`✓ Parsed jsonData with keys:`, Object.keys(jsonData));
        } catch (e) {
          console.log(`✗ Failed to parse jsonData:`, e.message);
        }
      }
    }

    // Analyze network requests for melody/chord patterns
    const analyzedData = {
      url: URL,
      timestamp: new Date().toISOString(),
      songApiResponse: songData,
      jsonData: jsonData,
      sections: {
        Intro: null,
        Verse: null,
        Chorus: null,
        Bridge: null,
        Outro: null
      },
      networkRequests: networkRequests.map(req => ({
        url: req.url,
        status: req.status,
        hasMelody: JSON.stringify(req.data).toLowerCase().includes('melody'),
        hasChord: JSON.stringify(req.data).toLowerCase().includes('chord'),
        dataKeys: req.data && typeof req.data === 'object' ? Object.keys(req.data) : [],
        sampleData: req.data && typeof req.data === 'object' ? 
          JSON.stringify(req.data).substring(0, 500) : null
      })),
      pageData,
      rawNetworkData: networkRequests
    };

    // Extract section data from jsonData
    if (jsonData) {
      const extractSections = (data, path = '') => {
        if (typeof data !== 'object' || data === null) return;
        
        for (const [key, value] of Object.entries(data)) {
          const currentPath = path ? `${path}.${key}` : key;
          const keyLower = key.toLowerCase();
          
          // Check if this key matches a section name
          for (const section of sectionNames) {
            if (keyLower === section.toLowerCase() || 
                keyLower.includes(section.toLowerCase())) {
              if (!analyzedData.sections[section]) {
                analyzedData.sections[section] = [];
              }
              analyzedData.sections[section].push({
                source: 'jsonData',
                path: currentPath,
                data: value,
                dataType: typeof value,
                isArray: Array.isArray(value),
                keys: typeof value === 'object' && value !== null ? Object.keys(value) : null
              });
            }
          }
          
          // Recursively search nested objects
          if (typeof value === 'object' && value !== null) {
            extractSections(value, currentPath);
          }
        }
      };
      
      extractSections(jsonData);
    }

    // Try to extract section-specific data from network requests
    for (const req of networkRequests) {
      const dataStr = JSON.stringify(req.data).toLowerCase();
      const urlStr = req.url.toLowerCase();
      
      for (const section of sectionNames) {
        const sectionLower = section.toLowerCase();
        if (dataStr.includes(sectionLower) || urlStr.includes(sectionLower)) {
          if (!analyzedData.sections[section]) {
            analyzedData.sections[section] = [];
          }
          analyzedData.sections[section].push({
            source: 'network',
            url: req.url,
            data: req.data
          });
        }
      }
    }

    // Extract melody and chord structures from all data sources
    const structureAnalysis = {
      melodyStructure: null,
      chordStructure: null,
      examples: [],
      sectionStructures: {}
    };

    const findStructures = (obj, path = '', source = 'unknown') => {
      if (typeof obj !== 'object' || obj === null) return;
      
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        const keyLower = key.toLowerCase();
        
        // Find melody objects
        if (keyLower.includes('melody') && typeof value === 'object' && value !== null) {
          if (!structureAnalysis.melodyStructure) {
            structureAnalysis.melodyStructure = {
              path: currentPath,
              source,
              keys: Object.keys(value),
              sample: value,
              fullStructure: JSON.stringify(value, null, 2)
            };
          }
          structureAnalysis.examples.push({
            type: 'melody',
            path: currentPath,
            source,
            data: value,
            structure: JSON.stringify(value, null, 2)
          });
        }
        
        // Find chord objects
        if (keyLower.includes('chord') && typeof value === 'object' && value !== null) {
          if (!structureAnalysis.chordStructure) {
            structureAnalysis.chordStructure = {
              path: currentPath,
              source,
              keys: Object.keys(value),
              sample: value,
              fullStructure: JSON.stringify(value, null, 2)
            };
          }
          structureAnalysis.examples.push({
            type: 'chord',
            path: currentPath,
            source,
            data: value,
            structure: JSON.stringify(value, null, 2)
          });
        }
        
        // Check for section-specific structures
        for (const section of sectionNames) {
          if (keyLower === section.toLowerCase() && typeof value === 'object' && value !== null) {
            if (!structureAnalysis.sectionStructures[section]) {
              structureAnalysis.sectionStructures[section] = {
                path: currentPath,
                source,
                keys: Object.keys(value),
                hasMelody: JSON.stringify(value).toLowerCase().includes('melody'),
                hasChord: JSON.stringify(value).toLowerCase().includes('chord'),
                data: value,
                structure: JSON.stringify(value, null, 2)
              };
            }
          }
        }
        
        // Recursively search nested objects
        if (typeof value === 'object' && value !== null) {
          findStructures(value, currentPath, source);
        }
      }
    };

    // Search in API response
    if (songData) {
      findStructures(songData, '', 'songApiResponse');
    }
    
    // Search in jsonData
    if (jsonData) {
      findStructures(jsonData, '', 'jsonData');
    }
    
    // Search in network requests
    for (const req of networkRequests) {
      findStructures(req.data, '', req.url);
    }

    analyzedData.structureAnalysis = structureAnalysis;

    analyzedData.structureAnalysis = structureAnalysis;

    // Save results
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(analyzedData, null, 2));
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Analysis complete! Results saved to: ${OUTPUT_FILE}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\nFound ${networkRequests.length} network requests`);
    console.log(`Found ${songApiData.length} Hooktheory API response(s)`);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('STRUCTURE ANALYSIS');
    console.log(`${'='.repeat(60)}`);
    console.log(`\nMelody structure:`, structureAnalysis.melodyStructure ? '✓ Found' : '✗ Not found');
    if (structureAnalysis.melodyStructure) {
      console.log(`  Path: ${structureAnalysis.melodyStructure.path}`);
      console.log(`  Source: ${structureAnalysis.melodyStructure.source}`);
      console.log(`  Keys: ${structureAnalysis.melodyStructure.keys.join(', ')}`);
    }
    
    console.log(`\nChord structure:`, structureAnalysis.chordStructure ? '✓ Found' : '✗ Not found');
    if (structureAnalysis.chordStructure) {
      console.log(`  Path: ${structureAnalysis.chordStructure.path}`);
      console.log(`  Source: ${structureAnalysis.chordStructure.source}`);
      console.log(`  Keys: ${structureAnalysis.chordStructure.keys.join(', ')}`);
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('SECTION DATA SUMMARY');
    console.log(`${'='.repeat(60)}`);
    for (const [section, data] of Object.entries(analyzedData.sections)) {
      if (data && Array.isArray(data) && data.length > 0) {
        console.log(`\n${section}:`);
        data.forEach((item, idx) => {
          console.log(`  [${idx + 1}] Source: ${item.source}`);
          if (item.path) console.log(`      Path: ${item.path}`);
          if (item.keys) console.log(`      Keys: ${item.keys.join(', ')}`);
          if (item.dataType) console.log(`      Type: ${item.dataType}${item.isArray ? ' (array)' : ''}`);
        });
      } else if (data) {
        console.log(`\n${section}: Found (non-array)`);
      }
    }
    
    if (Object.keys(structureAnalysis.sectionStructures).length > 0) {
      console.log(`\n${'='.repeat(60)}`);
      console.log('SECTION-SPECIFIC STRUCTURES');
      console.log(`${'='.repeat(60)}`);
      for (const [section, struct] of Object.entries(structureAnalysis.sectionStructures)) {
        console.log(`\n${section}:`);
        console.log(`  Path: ${struct.path}`);
        console.log(`  Has Melody: ${struct.hasMelody ? '✓' : '✗'}`);
        console.log(`  Has Chord: ${struct.hasChord ? '✓' : '✗'}`);
        console.log(`  Keys: ${struct.keys.join(', ')}`);
      }
    }

  } catch (error) {
    console.error('Error during analysis:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

analyzeWebsite().catch(console.error);

