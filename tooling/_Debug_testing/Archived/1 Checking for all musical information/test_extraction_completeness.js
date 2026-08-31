/**
 * Test script to verify if extraction script successfully extracted
 * all melody and chord objects from all sections of a Hooktheory song.
 * 
 * Tests: https://www.hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag
 * Expected sections: Intro, Chorus, Bridge, Outro
 */

const puppeteer = require('puppeteer');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TEST_URL = 'https://www.hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag';
const EXPECTED_SECTIONS = ['Intro', 'Chorus', 'Bridge', 'Outro'];
const OUTPUT_DIR = path.join(__dirname);
const RESULTS_FILE = path.join(OUTPUT_DIR, 'extraction_test_results.json');

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

function parseJsonData(jsonDataString) {
  try {
    return typeof jsonDataString === 'string' 
      ? JSON.parse(jsonDataString) 
      : jsonDataString;
  } catch (e) {
    return null;
  }
}

function countNotes(notes) {
  if (!notes) return 0;
  if (Array.isArray(notes)) return notes.length;
  if (typeof notes === 'object') {
    return Object.values(notes).reduce((sum, melody) => 
      sum + (Array.isArray(melody) ? melody.length : 0), 0
    );
  }
  return 0;
}

async function discoverAllSections() {
  console.log('='.repeat(60));
  console.log('STEP 1: Discovering all sections from page');
  console.log('='.repeat(60));
  console.log(`\nLoading page: ${TEST_URL}`);
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const discoveredSections = {
    sections: {},
    allSongIds: new Set(),
    sectionSongIds: {}
  };
  
  try {
    const page = await browser.newPage();
    
    // Monitor all API calls
    page.on('response', async (response) => {
      const responseUrl = response.url();
      if (responseUrl.includes('api.hooktheory.com/v1/songs/public/')) {
        const match = responseUrl.match(/\/songs\/public\/([a-zA-Z0-9_-]+)/);
        if (match) {
          const songId = match[1];
          discoveredSections.allSongIds.add(songId);
          
          // Try to determine which section this belongs to
          // by checking the response or URL context
          try {
            const data = await response.json();
            if (data.jsonData) {
              const jsonData = parseJsonData(data.jsonData);
              if (jsonData && jsonData.sections) {
                // Check section metadata
                const sectionInfo = jsonData.sections;
                // Store with song ID as key for now
                if (!discoveredSections.sections[songId]) {
                  discoveredSections.sections[songId] = {
                    songId,
                    hasChords: !!(jsonData.chords && jsonData.chords.length > 0),
                    hasNotes: !!jsonData.notes,
                    chordCount: jsonData.chords ? jsonData.chords.length : 0,
                    noteCount: countNotes(jsonData.notes),
                    sectionMetadata: sectionInfo
                  };
                }
              }
            }
          } catch (e) {
            // Response already consumed or not JSON
          }
        }
      }
    });
    
    // Navigate to page
    await page.goto(TEST_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Slow scroll to trigger lazy loading
    console.log('\nSlowly scrolling to trigger lazy loading of all sections...');
    await page.evaluate(() => {
      return new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 50; // Small scroll increments
        const delay = 300; // Wait between scrolls
        
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
          
          window.scrollBy(0, distance);
          totalHeight += distance;
          
          // Check if we've reached the bottom
          if (currentScroll + window.innerHeight >= scrollHeight - 100) {
            clearInterval(timer);
            // Scroll back to top slowly
            setTimeout(() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setTimeout(resolve, 2000);
            }, 1000);
          }
        }, delay);
      });
    });
    
    // Wait for any additional lazy loads
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Try clicking section links to ensure all are loaded
    console.log('\nAttempting to trigger section loads by clicking section links...');
    const sectionLinks = await page.evaluate(() => {
      const links = [];
      const allLinks = Array.from(document.querySelectorAll('a, button, [role="button"]'));
      allLinks.forEach(link => {
        const text = (link.textContent || link.innerText || '').trim();
        ['Intro', 'Chorus', 'Bridge', 'Outro'].forEach(section => {
          if (text.includes(section) || link.href?.includes(section.toLowerCase())) {
            links.push({
              section,
              text: text.substring(0, 50),
              href: link.href,
              tagName: link.tagName
            });
          }
        });
      });
      return links;
    });
    
    for (const linkInfo of sectionLinks) {
      try {
        const selector = linkInfo.href 
          ? `a[href*="${linkInfo.href.split('/').pop()}"]`
          : `a:has-text("${linkInfo.section}")`;
        
        const element = await page.$(selector);
        if (element) {
          await element.click();
          await new Promise(resolve => setTimeout(resolve, 1500));
          console.log(`  ✓ Clicked ${linkInfo.section} link`);
        }
      } catch (e) {
        // Continue
      }
    }
    
    // Final wait
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await browser.close();
    
    console.log(`\n✓ Discovered ${discoveredSections.allSongIds.size} unique song IDs`);
    console.log(`  Song IDs: ${Array.from(discoveredSections.allSongIds).join(', ')}`);
    
    return discoveredSections;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function fetchAllSectionData(discoveredSections) {
  console.log('\n' + '='.repeat(60));
  console.log('STEP 2: Fetching data for all discovered sections');
  console.log('='.repeat(60));
  
  const allSectionData = {};
  
  for (const songId of discoveredSections.allSongIds) {
    console.log(`\nFetching data for song ID: ${songId}`);
    try {
      const apiData = await fetchSongData(songId);
      const jsonData = parseJsonData(apiData.jsonData);
      
      if (jsonData) {
        allSectionData[songId] = {
          songId,
          songInfo: apiData.song,
          chords: jsonData.chords || [],
          notes: jsonData.notes || null,
          chordCount: jsonData.chords ? jsonData.chords.length : 0,
          noteCount: countNotes(jsonData.notes),
          sections: jsonData.sections,
          metadata: {
            version: jsonData.version,
            keys: jsonData.keys,
            tempos: jsonData.tempos,
            meters: jsonData.meters,
            endBeat: jsonData.endBeat
          }
        };
        console.log(`  ✓ Chords: ${allSectionData[songId].chordCount}, Notes: ${allSectionData[songId].noteCount}`);
      }
    } catch (e) {
      console.log(`  ✗ Failed: ${e.message}`);
    }
  }
  
  return allSectionData;
}

function checkExtractedData() {
  console.log('\n' + '='.repeat(60));
  console.log('STEP 3: Checking what extraction script captured');
  console.log('='.repeat(60));
  
  // Check cache
  const cacheDir = path.join(__dirname, '..', '..', '.hooktheory_cache');
  const cacheKey = crypto.createHash('md5').update(TEST_URL).digest('hex');
  const cachePath = path.join(cacheDir, `${cacheKey}.json`);
  
  let extractedData = null;
  
  if (fs.existsSync(cachePath)) {
    try {
      extractedData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      console.log('\n✓ Found cached extraction data');
      console.log(`  Song ID: ${extractedData.songId}`);
      console.log(`  Chords: ${extractedData.chords.length}`);
      console.log(`  Notes: ${countNotes(extractedData.notes)}`);
    } catch (e) {
      console.log('\n✗ Cache file corrupted');
    }
  } else {
    console.log('\n✗ No cached extraction data found');
    console.log('  Run extract_hooktheory_data.js first to generate cache');
  }
  
  return extractedData;
}

function mapSectionsToSongIds(allSectionData, discoveredSections) {
  console.log('\n' + '='.repeat(60));
  console.log('STEP 4: Mapping sections to song IDs');
  console.log('='.repeat(60));
  
  const sectionMapping = {};
  const songIds = Array.from(discoveredSections.allSongIds);
  
  // Try to identify sections based on section metadata or patterns
  // This is heuristic - we'll need to check section metadata
  for (const [songId, data] of Object.entries(allSectionData)) {
    // Check if we can identify the section from metadata
    // For now, we'll need to make educated guesses or check section names
    // The main song ID is typically the Chorus
    // Intro sections are usually loaded first
    // Bridge and Outro come later
    
    // We'll store all data and let the analysis determine completeness
    if (!sectionMapping[songId]) {
      sectionMapping[songId] = {
        songId,
        data,
        identifiedSection: null // Will be determined by analysis
      };
    }
  }
  
  return sectionMapping;
}

function analyzeCompleteness(allSectionData, extractedData, sectionMapping) {
  console.log('\n' + '='.repeat(60));
  console.log('STEP 5: Analyzing extraction completeness');
  console.log('='.repeat(60));
  
  const analysis = {
    timestamp: new Date().toISOString(),
    testUrl: TEST_URL,
    expectedSections: EXPECTED_SECTIONS,
    discoveredSongIds: Array.from(new Set(Object.keys(allSectionData))),
    discoveredSectionCount: Object.keys(allSectionData).length,
    extractedSongId: extractedData?.songId || null,
    extractedChords: extractedData?.chords?.length || 0,
    extractedNotes: countNotes(extractedData?.notes || null),
    sections: {},
    completeness: {
      allSectionsDiscovered: false,
      allSectionsExtracted: false,
      missingSections: [],
      extractedSections: []
    }
  };
  
  // Analyze each discovered section
  for (const [songId, data] of Object.entries(allSectionData)) {
    analysis.sections[songId] = {
      songId,
      chordCount: data.chordCount,
      noteCount: data.noteCount,
      hasChords: data.chordCount > 0,
      hasNotes: data.noteCount > 0,
      wasExtracted: extractedData && extractedData.songId === songId
    };
  }
  
  // Check completeness
  analysis.completeness.allSectionsDiscovered = analysis.discoveredSectionCount >= EXPECTED_SECTIONS.length;
  analysis.completeness.allSectionsExtracted = extractedData && 
    analysis.discoveredSongIds.includes(extractedData.songId);
  
  // Determine which sections are missing
  if (analysis.discoveredSectionCount < EXPECTED_SECTIONS.length) {
    // We discovered fewer sections than expected
    analysis.completeness.missingSections = EXPECTED_SECTIONS.filter(section => {
      // This is a heuristic - we'd need section metadata to be sure
      return true; // For now, mark all as potentially missing
    });
  }
  
  // Summary
  console.log(`\nDiscovered ${analysis.discoveredSectionCount} sections`);
  console.log(`Expected ${EXPECTED_SECTIONS.length} sections: ${EXPECTED_SECTIONS.join(', ')}`);
  console.log(`\nExtraction script captured: ${extractedData ? '1 section' : '0 sections'}`);
  
  if (extractedData) {
    console.log(`  Song ID: ${extractedData.songId}`);
    console.log(`  Chords: ${extractedData.chords.length}`);
    console.log(`  Notes: ${countNotes(extractedData.notes)}`);
  }
  
  console.log('\nSection breakdown:');
  for (const [songId, sectionInfo] of Object.entries(analysis.sections)) {
    console.log(`  ${songId}:`);
    console.log(`    Chords: ${sectionInfo.chordCount}, Notes: ${sectionInfo.noteCount}`);
    console.log(`    Extracted: ${sectionInfo.wasExtracted ? '✓' : '✗'}`);
  }
  
  // Final verdict
  console.log('\n' + '='.repeat(60));
  console.log('VERDICT');
  console.log('='.repeat(60));
  
  if (analysis.discoveredSectionCount >= EXPECTED_SECTIONS.length && extractedData) {
    if (analysis.discoveredSongIds.length === 1 && analysis.discoveredSongIds[0] === extractedData.songId) {
      console.log('\n⚠️  WARNING: Only one section was extracted, but multiple sections exist!');
      console.log('   The extraction script needs to be updated to handle multiple sections.');
      analysis.completeness.allSectionsExtracted = false;
    } else {
      console.log('\n✓ All sections discovered');
      console.log('✗ Not all sections extracted by current script');
      analysis.completeness.allSectionsExtracted = false;
    }
  } else if (analysis.discoveredSectionCount < EXPECTED_SECTIONS.length) {
    console.log('\n✗ Not all sections were discovered');
    console.log(`   Found ${analysis.discoveredSectionCount}, expected ${EXPECTED_SECTIONS.length}`);
    analysis.completeness.allSectionsDiscovered = false;
  } else {
    console.log('\n✓ All sections discovered and extracted');
    analysis.completeness.allSectionsExtracted = true;
  }
  
  return analysis;
}

async function runTest() {
  try {
    // Step 1: Discover all sections
    const discoveredSections = await discoverAllSections();
    
    // Step 2: Fetch all section data
    const allSectionData = await fetchAllSectionData(discoveredSections);
    
    // Step 3: Check what was extracted
    const extractedData = checkExtractedData();
    
    // Step 4: Map sections
    const sectionMapping = mapSectionsToSongIds(allSectionData, discoveredSections);
    
    // Step 5: Analyze completeness
    const analysis = analyzeCompleteness(allSectionData, extractedData, sectionMapping);
    
    // Save results
    const fullResults = {
      analysis,
      discoveredSections,
      allSectionData,
      extractedData,
      sectionMapping
    };
    
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(fullResults, null, 2));
    console.log(`\n✓ Full results saved to: ${RESULTS_FILE}`);
    
    return analysis;
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTest().catch(console.error);

