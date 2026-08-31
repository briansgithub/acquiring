/**
 * Investigate how to properly extract section names from H2 elements
 * and map them to song IDs
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const TEST_URL = 'https://www.hooktheory.com/theorytab/view/scott-joplin/maple-leaf-rag';
const OUTPUT_FILE = path.join(__dirname, 'section_name_analysis.json');

function normalizeSectionName(text) {
  const lower = text.toLowerCase().trim();
  if (lower.includes('intro')) return 'Intro';
  if (lower.includes('verse')) return 'Verse';
  if (lower.includes('chorus')) return 'Chorus';
  if (lower.includes('bridge')) return 'Bridge';
  if (lower.includes('outro')) return 'Outro';
  return null;
}

async function investigateSectionNames() {
  console.log('Launching browser to investigate H2 section elements...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    const results = {
      url: TEST_URL,
      timestamp: new Date().toISOString(),
      findings: {}
    };
    
    const capturedSongIds = new Set();
    const songIdCaptureTimes = new Map(); // Track when each song ID was captured
    
    // Monitor network requests to capture song IDs
    page.on('response', async (response) => {
      const responseUrl = response.url();
      if (responseUrl.includes('api.hooktheory.com/v1/songs/public/')) {
        const match = responseUrl.match(/\/songs\/public\/([a-zA-Z0-9_-]+)/);
        if (match) {
          const songId = match[1];
          if (!capturedSongIds.has(songId)) {
            capturedSongIds.add(songId);
            songIdCaptureTimes.set(songId, new Date().toISOString());
          }
        }
      }
    });
    
    // Navigate to the page
    console.log(`Navigating to: ${TEST_URL}`);
    await page.goto(TEST_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Find all H2 elements that contain section names
    console.log('Finding H2 section elements...');
    const h2Sections = await page.evaluate(() => {
      const h2s = Array.from(document.querySelectorAll('h2'));
      const sections = [];
      
      h2s.forEach((h2, index) => {
        const text = h2.textContent.trim();
        const rect = h2.getBoundingClientRect();
        const sectionNames = ['intro', 'verse', 'chorus', 'bridge', 'outro'];
        const textLower = text.toLowerCase();
        
        if (sectionNames.some(s => textLower.includes(s))) {
          sections.push({
            index: index,
            text: text,
            textLower: textLower,
            y: rect.y,
            height: rect.height,
            element: h2.outerHTML.substring(0, 200) // First 200 chars of HTML
          });
        }
      });
      
      return sections.sort((a, b) => a.y - b.y);
    });
    
    console.log(`Found ${h2Sections.length} H2 section elements:`);
    h2Sections.forEach((sec, i) => {
      console.log(`  ${i + 1}. "${sec.text}" (y: ${sec.y})`);
    });
    
    results.findings.h2Sections = h2Sections;
    
    // Now scroll to each H2 section one at a time and track which song IDs are loaded
    console.log('\nScrolling to each H2 section to track song ID loading...');
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const sectionToSongIdMap = [];
    
    for (let i = 0; i < h2Sections.length; i++) {
      const h2Section = h2Sections[i];
      const sectionName = normalizeSectionName(h2Section.text);
      
      if (!sectionName) {
        console.log(`  ⚠ Skipping H2 "${h2Section.text}" - not a recognized section`);
        continue;
      }
      
      const beforeSongIds = new Set(capturedSongIds);
      
      // Scroll to center the H2 in viewport
      await page.evaluate((targetY, vh) => {
        const scrollY = targetY - (vh / 2);
        window.scrollTo({
          top: Math.max(0, scrollY),
          behavior: 'smooth'
        });
      }, h2Section.y, viewportHeight);
      
      // Wait for intersection observer to trigger and API calls to complete
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check which new song IDs were captured
      const afterSongIds = new Set(capturedSongIds);
      const newSongIds = Array.from(afterSongIds).filter(id => !beforeSongIds.has(id));
      
      sectionToSongIdMap.push({
        sectionName: sectionName,
        h2Text: h2Section.text,
        h2Index: h2Section.index,
        yPosition: h2Section.y,
        songIds: newSongIds,
        songIdCount: newSongIds.length
      });
      
      if (newSongIds.length > 0) {
        console.log(`  ✓ ${sectionName}: Loaded ${newSongIds.length} song ID(s): ${newSongIds.join(', ')}`);
      } else {
        console.log(`  ⚠ ${sectionName}: No new song IDs loaded (may have been loaded earlier)`);
      }
    }
    
    results.findings.sectionToSongIdMapping = sectionToSongIdMap;
    
    // Also check if there are any song IDs that weren't mapped to H2 sections
    const allCapturedIds = Array.from(capturedSongIds);
    const mappedIds = new Set();
    sectionToSongIdMap.forEach(mapping => {
      mapping.songIds.forEach(id => mappedIds.add(id));
    });
    
    const unmappedIds = allCapturedIds.filter(id => !mappedIds.has(id));
    if (unmappedIds.length > 0) {
      console.log(`\n⚠ Found ${unmappedIds.length} unmapped song ID(s): ${unmappedIds.join(', ')}`);
      results.findings.unmappedSongIds = unmappedIds;
    }
    
    // Analyze the mapping
    console.log('\n' + '='.repeat(60));
    console.log('MAPPING ANALYSIS');
    console.log('='.repeat(60));
    
    const mappingAnalysis = {
      totalH2Sections: h2Sections.length,
      totalSongIds: allCapturedIds.length,
      mappedSongIds: mappedIds.size,
      unmappedSongIds: unmappedIds.length,
      sectionMappings: {}
    };
    
    // Build reverse mapping: song ID -> section name
    const songIdToSection = {};
    sectionToSongIdMap.forEach(mapping => {
      mapping.songIds.forEach(songId => {
        if (!songIdToSection[songId]) {
          songIdToSection[songId] = [];
        }
        songIdToSection[songId].push(mapping.sectionName);
      });
    });
    
    mappingAnalysis.songIdToSection = songIdToSection;
    
    // Check for one-to-one mappings
    const oneToOneMappings = Object.entries(songIdToSection)
      .filter(([id, sections]) => sections.length === 1)
      .map(([id, sections]) => ({ songId: id, section: sections[0] }));
    
    const multiSectionMappings = Object.entries(songIdToSection)
      .filter(([id, sections]) => sections.length > 1)
      .map(([id, sections]) => ({ songId: id, sections: sections }));
    
    console.log(`\nOne-to-one mappings (${oneToOneMappings.length}):`);
    oneToOneMappings.forEach(m => {
      console.log(`  ${m.songId} -> ${m.section}`);
    });
    
    if (multiSectionMappings.length > 0) {
      console.log(`\nMulti-section mappings (${multiSectionMappings.length}):`);
      multiSectionMappings.forEach(m => {
        console.log(`  ${m.songId} -> ${m.sections.join(', ')}`);
      });
    }
    
    if (unmappedIds.length > 0) {
      console.log(`\nUnmapped song IDs: ${unmappedIds.join(', ')}`);
    }
    
    results.findings.mappingAnalysis = mappingAnalysis;
    
    // Save results
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    console.log(`\n✓ Results saved to: ${OUTPUT_FILE}`);
    
    await browser.close();
    
    return results;
  } catch (e) {
    await browser.close();
    throw e;
  }
}

// Run investigation
if (require.main === module) {
  investigateSectionNames()
    .then(() => {
      console.log('\n✓ Investigation complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ Error:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
}

module.exports = { investigateSectionNames };

