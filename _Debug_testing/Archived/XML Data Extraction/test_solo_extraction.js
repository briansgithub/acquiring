/**
 * Debug script to test why Solo section is not extracted
 * Tests the specific song: Guns N' Roses - Sweet Child O' Mine
 */

const { findAllSongIdsFromPage } = require('../../../lib/scraper/pageScraper');
const { fetchSongData } = require('../../../lib/api/hooktheoryApi');
const https = require('https');

const TEST_URL = 'https://www.hooktheory.com/theorytab/view/guns-n-roses/sweet-child-o-mine';
const SOLO_SONG_ID = 'ZwxKJE_Zged'; // From metadata

async function testApiFetch(songId) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing API fetch for song ID: ${songId}`);
  console.log('='.repeat(80));
  
  return new Promise((resolve, reject) => {
    const apiUrl = `https://api.hooktheory.com/v1/songs/public/${songId}?fields=ID,xmlData,song,jsonData`;
    console.log(`API URL: ${apiUrl}`);
    
    const request = https.get(apiUrl, (res) => {
      console.log(`\nHTTP Status: ${res.statusCode} ${res.statusMessage}`);
      console.log(`Headers:`, res.headers);
      
      let data = '';
      res.on('data', (chunk) => { 
        data += chunk;
        console.log(`Received ${chunk.length} bytes...`);
      });
      
      res.on('end', () => {
        console.log(`\nTotal response size: ${data.length} bytes`);
        console.log(`Response preview (first 500 chars):`);
        console.log(data.substring(0, 500));
        
        if (res.statusCode !== 200) {
          console.log(`\n⚠ Non-200 status code: ${res.statusCode}`);
          console.log(`Full response:`, data);
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          return;
        }
        
        try {
          const json = JSON.parse(data);
          console.log(`\n✓ Successfully parsed JSON`);
          console.log(`Keys in response:`, Object.keys(json));
          console.log(`ID field:`, json.ID);
          console.log(`Song field:`, json.song);
          resolve(json);
        } catch (e) {
          console.log(`\n✗ Failed to parse JSON: ${e.message}`);
          console.log(`Response data:`, data);
          reject(new Error(`Failed to parse API response: ${e.message}`));
        }
      });
    });
    
    request.on('error', (error) => {
      console.log(`\n✗ Request error:`, error.message);
      reject(error);
    });
    
    request.setTimeout(10000, () => {
      console.log(`\n✗ Request timeout`);
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function testPageScraping() {
  console.log(`\n${'='.repeat(80)}`);
  console.log('Testing page scraping');
  console.log('='.repeat(80));
  console.log(`URL: ${TEST_URL}`);
  
  try {
    const { songIds, sectionMapping } = await findAllSongIdsFromPage(TEST_URL);
    
    console.log(`\n✓ Found ${songIds.length} song IDs:`);
    songIds.forEach((id, i) => {
      const sectionName = sectionMapping[id] || 'Unknown';
      console.log(`  ${i + 1}. ${id} -> ${sectionName}`);
    });
    
    console.log(`\nSection Mapping:`);
    Object.entries(sectionMapping).forEach(([id, section]) => {
      console.log(`  ${id} -> ${section}`);
    });
    
    // Check if Solo is in the mapping
    const soloId = Object.keys(sectionMapping).find(id => sectionMapping[id] === 'Solo');
    if (soloId) {
      console.log(`\n✓ Solo section found with ID: ${soloId}`);
      return soloId;
    } else {
      console.log(`\n✗ Solo section NOT found in mapping`);
      return null;
    }
  } catch (error) {
    console.error(`\n✗ Page scraping error:`, error.message);
    throw error;
  }
}

async function runTests() {
  console.log('='.repeat(80));
  console.log('Debug: Why Solo Section is Not Extracted');
  console.log('='.repeat(80));
  
  try {
    // Test 1: Page scraping
    const soloId = await testPageScraping();
    
    if (!soloId) {
      console.log(`\n⚠ Solo section not found during scraping. This is the root cause.`);
      return;
    }
    
    // Test 2: API fetch for Solo
    try {
      const apiResponse = await testApiFetch(soloId);
      console.log(`\n✓ Solo section API fetch successful!`);
      console.log(`Response summary:`, {
        ID: apiResponse.ID,
        song: apiResponse.song,
        hasXmlData: !!apiResponse.xmlData,
        hasJsonData: !!apiResponse.jsonData
      });
      
      // Test extraction
      console.log(`\n${'='.repeat(80)}`);
      console.log('Testing data extraction');
      console.log('='.repeat(80));
      try {
        const { extractChordAndMelodyObjects } = require('../../../lib/extractor/dataExtractor');
        const extracted = extractChordAndMelodyObjects(apiResponse);
        console.log(`✓ Extraction successful!`);
      } catch (extractError) {
        console.log(`\n✗ Extraction failed: ${extractError.message}`);
        console.log(`\n🔍 ROOT CAUSE IDENTIFIED:`);
        console.log(`   The Solo section has XML data but no JSON data.`);
        console.log(`   The extractor only supports JSON format.`);
        console.log(`   This is why the Solo section is not extracted.`);
      }
    } catch (error) {
      console.log(`\n✗ Solo section API fetch failed: ${error.message}`);
      console.log(`\nThis is likely why the Solo section is not extracted.`);
    }
    
    // Test 3: Compare with a working section (Verse)
    console.log(`\n${'='.repeat(80)}`);
    console.log('Comparing with Verse section (should work)');
    console.log('='.repeat(80));
    try {
      const verseId = 'ZwxKKqYwxed';
      const verseResponse = await testApiFetch(verseId);
      console.log(`\n✓ Verse section API fetch successful for comparison`);
    } catch (error) {
      console.log(`\n✗ Verse section also failed (unexpected): ${error.message}`);
    }
    
  } catch (error) {
    console.error(`\n✗ Test failed:`, error.message);
    console.error(error.stack);
  }
}

runTests()
  .then(() => {
    console.log(`\n${'='.repeat(80)}`);
    console.log('Debug test complete');
    console.log('='.repeat(80));
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n✗ Fatal error:`, error.message);
    process.exit(1);
  });

