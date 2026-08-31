/**
 * Direct API fetcher for Hooktheory song data
 * Fetches data for each section to understand the structure
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Song IDs discovered from the browser
const SONG_IDS = {
  main: 'nvgy-kVrgkA',
  intro: ['ZbgOR-qQmnY', 'yvgPqBwKxYq'],
  chorus: 'nvgy-kVrgkA', // Same as main
  bridge: 'RPxenBQAob_',
  outro: null // Need to discover
};

const OUTPUT_FILE = path.join(__dirname, 'api_responses.json');

function fetchSongData(songId) {
  return new Promise((resolve, reject) => {
    const url = `https://api.hooktheory.com/v1/songs/public/${songId}?fields=ID,xmlData,song,jsonData`;
    
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    }).on('error', (e) => {
      reject(e);
    });
  });
}

async function fetchAllSections() {
  const results = {
    timestamp: new Date().toISOString(),
    sections: {}
  };
  
  console.log('Fetching main song data...');
  try {
    const mainData = await fetchSongData(SONG_IDS.main);
    results.main = mainData;
    console.log('✓ Main song data fetched');
    
    // Parse jsonData if it exists
    if (mainData.jsonData) {
      try {
        const jsonData = typeof mainData.jsonData === 'string' 
          ? JSON.parse(mainData.jsonData) 
          : mainData.jsonData;
        results.mainParsed = jsonData;
        console.log('✓ Parsed jsonData');
      } catch (e) {
        console.log('✗ Failed to parse jsonData:', e.message);
      }
    }
  } catch (e) {
    console.log('✗ Failed to fetch main:', e.message);
  }
  
  // Fetch Intro sections
  console.log('\nFetching Intro sections...');
  results.sections.Intro = [];
  for (const id of SONG_IDS.intro) {
    try {
      const data = await fetchSongData(id);
      results.sections.Intro.push({ songId: id, data });
      console.log(`✓ Intro section ${id} fetched`);
    } catch (e) {
      console.log(`✗ Failed to fetch Intro ${id}:`, e.message);
    }
  }
  
  // Fetch Bridge
  console.log('\nFetching Bridge section...');
  try {
    const bridgeData = await fetchSongData(SONG_IDS.bridge);
    results.sections.Bridge = { songId: SONG_IDS.bridge, data: bridgeData };
    console.log('✓ Bridge section fetched');
  } catch (e) {
    console.log('✗ Failed to fetch Bridge:', e.message);
  }
  
  // Analyze structures
  console.log('\nAnalyzing structures...');
  const analysis = {
    melodyStructure: null,
    chordStructure: null,
    sectionStructures: {}
  };
  
  const findStructures = (obj, path = '', source = '') => {
    if (typeof obj !== 'object' || obj === null) return;
    
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      const keyLower = key.toLowerCase();
      
      if (keyLower.includes('melody') && typeof value === 'object' && value !== null) {
        if (!analysis.melodyStructure) {
          analysis.melodyStructure = {
            path: currentPath,
            source,
            keys: Object.keys(value),
            sample: value,
            fullStructure: JSON.stringify(value, null, 2)
          };
        }
      }
      
      if (keyLower.includes('chord') && typeof value === 'object' && value !== null) {
        if (!analysis.chordStructure) {
          analysis.chordStructure = {
            path: currentPath,
            source,
            keys: Object.keys(value),
            sample: value,
            fullStructure: JSON.stringify(value, null, 2)
          };
        }
      }
      
      if (typeof value === 'object' && value !== null) {
        findStructures(value, currentPath, source);
      }
    }
  };
  
  // Analyze main data
  if (results.main) {
    findStructures(results.main, '', 'main');
  }
  if (results.mainParsed) {
    findStructures(results.mainParsed, '', 'mainParsed');
  }
  
  // Analyze section data
  for (const [section, sectionData] of Object.entries(results.sections)) {
    if (Array.isArray(sectionData)) {
      sectionData.forEach((item, idx) => {
        if (item.data) {
          findStructures(item.data, '', `${section}[${idx}]`);
        }
      });
    } else if (sectionData && sectionData.data) {
      findStructures(sectionData.data, '', section);
    }
  }
  
  results.analysis = analysis;
  
  // Save results
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\n✓ Results saved to: ${OUTPUT_FILE}`);
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('STRUCTURE SUMMARY');
  console.log('='.repeat(60));
  
  if (analysis.melodyStructure) {
    console.log('\nMelody Structure:');
    console.log(`  Path: ${analysis.melodyStructure.path}`);
    console.log(`  Source: ${analysis.melodyStructure.source}`);
    console.log(`  Keys: ${analysis.melodyStructure.keys.join(', ')}`);
  } else {
    console.log('\nMelody Structure: Not found');
  }
  
  if (analysis.chordStructure) {
    console.log('\nChord Structure:');
    console.log(`  Path: ${analysis.chordStructure.path}`);
    console.log(`  Source: ${analysis.chordStructure.source}`);
    console.log(`  Keys: ${analysis.chordStructure.keys.join(', ')}`);
  } else {
    console.log('\nChord Structure: Not found');
  }
}

fetchAllSections().catch(console.error);

